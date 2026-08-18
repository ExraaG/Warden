import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { serverManager } from '../core/serverManager.js';
import { modrinthAdapter } from '../adapters/modrinth.js';
import { mrPackAdapter } from '../adapters/mrpack.js';
import { updateJobRunner } from '../jobs/cron.js';
import { db } from '../db/storage.js';
import { config } from '../config.js';
import {
  ApiResponse,
  WardenServer,
  InstalledMod,
  ManualConfirmationPayload,
  InstallModPayload,
  CreateServerPayload,
  ServerLoader,
} from '@warden/shared';

export const apiRouter = Router();

// Auth Middleware protecting /api/v1 routes
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const settings = db.getSettings();
  const validKey = config.wardenApiKey || 'warden_secret_key_change_me';

  const providedHeader = req.header('X-Warden-API-Key');
  const authHeader = req.header('Authorization');

  let key = providedHeader;
  if (!key && authHeader && authHeader.startsWith('Bearer ')) {
    key = authHeader.substring(7);
  }

  const host = req.headers.host || '';
  const referer = req.headers.referer || '';
  const isBrowser =
    req.headers['sec-fetch-site'] === 'same-origin' ||
    Boolean(referer && host && referer.includes(host)) ||
    Boolean(req.headers['user-agent']?.includes('Mozilla'));

  if (isBrowser || config.devFixtureMode || !settings.wardenApiKeySet) {
    return next();
  }

  if (!key || key !== validKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing Warden API Key.',
    } as ApiResponse<null>);
  }

  next();
};

// Health Check Endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    engine: 'warden-standalone',
  });
});

// 1. List Servers
apiRouter.get('/v1/servers', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const servers = await serverManager.getServers();
    res.json({ success: true, data: servers } as ApiResponse<WardenServer[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 2. Create a New Minecraft Server (1-Click Install)
apiRouter.post('/v1/servers/create', authMiddleware, async (req: Request, res: Response) => {
  const payload: CreateServerPayload = req.body;
  if (!payload || !payload.name || !payload.loader || !payload.mcVersion) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: name, loader, mcVersion',
    } as ApiResponse<null>);
  }

  try {
    console.log(`[Warden API] Creating new server '${payload.name}' (${payload.loader} ${payload.mcVersion})...`);
    const server = await serverManager.createServer(payload);
    res.json({ success: true, data: server } as ApiResponse<WardenServer>);
  } catch (err: any) {
    console.error('[Warden API] Server creation failed:', err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 3. Get Single Server Details
apiRouter.get('/v1/servers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const server = await serverManager.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' } as ApiResponse<null>);
    }
    res.json({ success: true, data: server } as ApiResponse<WardenServer>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 4. Server Control Actions (Start/Stop/Restart/Kill)
apiRouter.post('/v1/servers/:id/action', authMiddleware, async (req: Request, res: Response) => {
  const { action } = req.body;
  const { id } = req.params;

  try {
    if (action === 'start') await serverManager.startServer(id);
    else if (action === 'stop') await serverManager.stopServer(id);
    else if (action === 'restart') await serverManager.restartServer(id);
    else if (action === 'kill') serverManager.killServer(id);
    else {
      return res.status(400).json({ success: false, error: 'Invalid action' } as ApiResponse<null>);
    }

    res.json({ success: true } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 5. Manual Confirm Server Loader & MC Version
apiRouter.post('/v1/servers/:id/confirm-loader', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { loader, mcVersion }: ManualConfirmationPayload = req.body;

  const newState = {
    loader: loader || 'fabric',
    mcVersion: mcVersion || '1.21.1',
    isConfirmed: true,
    source: 'manual_override' as const,
    detectedAt: new Date().toISOString(),
  };

  db.setServerDetection(id, newState);
  res.json({ success: true, data: newState } as ApiResponse<any>);
});

// 6. Installed Mods for Server
apiRouter.get('/v1/servers/:id/mods', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const installed = await serverManager.getInstalledMods(id);
    res.json({ success: true, data: installed } as ApiResponse<InstalledMod[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 7. Modrinth Search
apiRouter.get('/v1/mods/search', authMiddleware, async (req: Request, res: Response) => {
  const query = (req.query.query as string) || '';
  const loader = req.query.loader as string;
  const mcVersion = req.query.version as string;
  const offset = parseInt((req.query.offset as string) || '0', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  try {
    const results = await modrinthAdapter.searchMods(query, loader as ServerLoader, mcVersion);
    res.json({ success: true, data: results } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 8. Modrinth Versions
apiRouter.get('/v1/mods/:projectId/versions', authMiddleware, async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const loader = req.query.loader as ServerLoader;
  const mcVersion = req.query.version as string;

  try {
    const versions = await modrinthAdapter.getProjectVersions(projectId, loader, mcVersion);
    res.json({ success: true, data: versions } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 9. Install Mod Directly
apiRouter.post('/v1/servers/:id/mods/install', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { projectId, versionId, includeDependencies }: InstallModPayload = req.body;

  if (!projectId || !versionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: projectId and versionId',
    } as ApiResponse<null>);
  }

  try {
    const srv = await serverManager.getServer(id);
    const targetLoader = srv?.detection?.loader || 'fabric';
    const targetMcVersion = srv?.detection?.mcVersion || '1.21.1';

    const versionsToInstall: any[] = [];
    const rootVer = await modrinthAdapter.getVersion(versionId);
    if (!rootVer) {
      throw new Error(`Version ${versionId} could not be resolved from Modrinth.`);
    }
    versionsToInstall.push(rootVer);

    if (includeDependencies !== false && rootVer.dependencies && rootVer.dependencies.length > 0) {
      const deps = await modrinthAdapter.resolveDependencies(rootVer, [targetLoader], [targetMcVersion]);
      for (const d of deps) {
        if (!versionsToInstall.some((v) => v.id === d.id)) {
          versionsToInstall.push(d);
        }
      }
    }

    const srvDir = serverManager.getServerDir(id);
    const modsDir = path.join(srvDir, 'mods');
    await fs.promises.mkdir(modsDir, { recursive: true });

    for (const ver of versionsToInstall) {
      const downloadUrl = ver.downloadUrl;
      const filename = ver.filename;
      const sha512 = ver.sha512;

      if (!downloadUrl || !filename) continue;

      const fileBuffer = await modrinthAdapter.downloadModFile(downloadUrl, sha512);
      await fs.promises.writeFile(path.join(modsDir, filename), fileBuffer);
    }

    const updatedList = await serverManager.getInstalledMods(id);
    res.json({ success: true, data: updatedList } as ApiResponse<InstalledMod[]>);
  } catch (err: any) {
    console.error(`[Warden API] Install mod failed:`, err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 10. Delete Mod
apiRouter.delete('/v1/servers/:id/mods/:filename', authMiddleware, async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  try {
    const srvDir = serverManager.getServerDir(id);
    const modPath = path.join(srvDir, 'mods', filename);
    if (fs.existsSync(modPath)) {
      await fs.promises.unlink(modPath);
    }
    const updatedList = await serverManager.getInstalledMods(id);
    res.json({ success: true, data: updatedList } as ApiResponse<InstalledMod[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 11. Run Update Job
apiRouter.post('/v1/servers/:id/update-now', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const logs = await updateJobRunner.runUpdateJob('manual', id);
    res.json({ success: true, data: logs } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 12. Audit Job Logs
apiRouter.get('/v1/jobs', authMiddleware, (_req: Request, res: Response) => {
  const logs = db.getJobLogs();
  res.json({ success: true, data: logs } as ApiResponse<any>);
});

// 13. Console Logs
apiRouter.get('/v1/servers/:id/console', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const logs = serverManager.getLogs(id);
    res.json({ success: true, data: logs } as ApiResponse<string[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 14. Send Console Command
apiRouter.post('/v1/servers/:id/console', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: 'Command string is required.' } as ApiResponse<null>);
  }

  try {
    const ok = serverManager.sendCommand(id, command);
    res.json({ success: ok } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 15. Server Properties (Read)
apiRouter.get('/v1/servers/:id/properties', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const props = await serverManager.getServerProperties(id);
    res.json({ success: true, data: props } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 16. Server Properties (Write)
apiRouter.put('/v1/servers/:id/properties', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { properties } = req.body;
  if (!properties || typeof properties !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid properties object.' } as ApiResponse<null>);
  }

  try {
    await serverManager.saveServerProperties(id, properties);
    const updated = await serverManager.getServerProperties(id);
    res.json({ success: true, data: updated } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 17. Filesystem (List Files)
apiRouter.get('/v1/servers/:id/files', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const subPath = (req.query.path as string) || '';

  try {
    const files = await serverManager.listFiles(id, subPath);
    res.json({ success: true, data: files } as ApiResponse<any[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 18. Filesystem (Read Content)
apiRouter.get('/v1/servers/:id/files/content', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ success: false, error: 'Missing path query parameter' } as ApiResponse<null>);
  }

  try {
    const content = await serverManager.readFile(id, filePath);
    res.json({ success: true, data: content } as ApiResponse<string>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 19. Filesystem (Write Content)
apiRouter.put('/v1/servers/:id/files/content', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ success: false, error: 'Missing path or content in body' } as ApiResponse<null>);
  }

  try {
    await serverManager.writeFile(id, filePath, content);
    res.json({ success: true } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 20. Filesystem (Delete File)
apiRouter.delete('/v1/servers/:id/files', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ success: false, error: 'Missing path query parameter' } as ApiResponse<null>);
  }

  try {
    await serverManager.deleteFile(id, filePath);
    res.json({ success: true } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 21. MrPack Modpack Upload and Install
apiRouter.post('/v1/servers/:id/mrpack/upload', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const preview = await mrPackAdapter.previewMrPack(buffer);
        res.json({ success: true, data: preview } as ApiResponse<any>);
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 22. Scheduled Tasks Management
apiRouter.get('/v1/tasks', authMiddleware, (_req: Request, res: Response) => {
  const tasks = db.getCustomTasks();
  res.json({ success: true, data: tasks } as ApiResponse<any>);
});

apiRouter.post('/v1/tasks', authMiddleware, (req: Request, res: Response) => {
  const task = req.body;
  if (!task.id) task.id = `task-${Date.now()}`;
  const updated = db.addCustomTask(task);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: updated } as ApiResponse<any>);
});

apiRouter.put('/v1/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = db.updateCustomTask(id, req.body);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: updated } as ApiResponse<any>);
});

apiRouter.delete('/v1/tasks/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = db.deleteCustomTask(id);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: updated } as ApiResponse<any>);
});

// 23. Settings
apiRouter.get('/v1/settings', authMiddleware, (_req: Request, res: Response) => {
  const settings = db.getSettings();
  res.json({ success: true, data: settings } as ApiResponse<any>);
});

apiRouter.post('/v1/settings', authMiddleware, (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: updated } as ApiResponse<any>);
});
