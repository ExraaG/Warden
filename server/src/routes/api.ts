import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { serverManager } from '../core/serverManager.js';
import { VersionFetcher } from '../core/versionFetcher.js';
import { SystemUpdater } from '../core/systemUpdater.js';
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
  CreateUserPayload,
  UpdateUserPayload,
  ServerAccessPayload,
  WardenUserPublic,
  WardenUser,
  ServerLoader,
} from '@warden/shared';

import { AuthManager } from '../core/authManager.js';
import { extractToken } from './auth.js';

export const apiRouter = Router();

function hasServerAccess(user: any, server: WardenServer): boolean {
  if (!user || user.role === 'admin') return true;
  if (server.ownerId === user.id) return true;
  const policy = server.accessPolicy || 'specific';
  if (policy === 'all') return true;
  if (policy === 'all_except') {
    return !server.excludedUserIds?.includes(user.id);
  }
  return server.allowedUserIds?.includes(user.id) || false;
}

// Auth Middleware protecting /api/v1 routes
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // If no users have been set up yet, allow access to proceed with initial setup
  if (!db.getHasUsers()) {
    return next();
  }

  // 1. Check for valid JWT token via httpOnly cookie or Authorization Bearer header
  const token = extractToken(req);
  if (token) {
    const payload = AuthManager.verifyToken(token);
    if (payload) {
      (req as any).user = payload;

      // If user is in 15-minute Emergency Temp Recovery mode, allow read-only/status info but block modifying server operations
      if (payload.role === 'temp_recovery') {
        const isSafeRoute =
          req.method === 'GET' ||
          req.path.startsWith('/v1/auth') ||
          req.path.startsWith('/auth') ||
          req.path === '/health';

        if (!isSafeRoute) {
          return res.status(403).json({
            success: false,
            error:
              'Forbidden: Emergency recovery mode is restricted strictly to Account & Password Management. Please reset your admin password to restore full access.',
          } as ApiResponse<null>);
        }
      }

      return next();
    }
  }

  // 2. Check for configured Warden API Key (for external automation/scripts)
  const validKey = config.wardenApiKey;
  if (validKey) {
    const providedHeader = req.header('X-Warden-API-Key');
    const authHeader = req.header('Authorization');
    let key = providedHeader;
    if (!key && authHeader && authHeader.startsWith('Bearer ')) {
      key = authHeader.substring(7);
    }
    if (key && key === validKey) {
      return next();
    }
  }

  // 3. Reject unauthorized access
  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Please log in to access this resource.',
  } as ApiResponse<null>);
};

// Health Check Endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    engine: 'warden-standalone',
  });
});

// Meta: Live Minecraft Versions per loader
apiRouter.get('/v1/meta/versions', async (req: Request, res: Response) => {
  const loader = (req.query.loader as ServerLoader) || 'paper';
  try {
    const versions = await VersionFetcher.getVersions(loader);
    res.json({ success: true, data: versions } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 1. List Servers
apiRouter.get('/v1/servers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const allServers = await serverManager.getServers();
    if (!user || user.role === 'admin') {
      return res.json({ success: true, data: allServers } as ApiResponse<WardenServer[]>);
    }
    const filtered = allServers.filter((s) => hasServerAccess(user, s));
    res.json({ success: true, data: filtered } as ApiResponse<WardenServer[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 2. Create a New Minecraft Server (1-Click Install)
apiRouter.post('/v1/servers/create', authMiddleware, async (req: Request, res: Response) => {
  const payload: CreateServerPayload = req.body;
  const user = (req as any).user;
  if (!payload || !payload.name || !payload.loader || !payload.mcVersion) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: name, loader, mcVersion',
    } as ApiResponse<null>);
  }

  try {
    console.log(`[Warden API] Creating new server '${payload.name}' (${payload.loader} ${payload.mcVersion})...`);
    const server = await serverManager.createServer(payload, user?.id);
    res.json({ success: true, data: server } as ApiResponse<WardenServer>);
  } catch (err: any) {
    console.error('[Warden API] Server creation failed:', err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 3. Get Single Server Details
apiRouter.get('/v1/servers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const server = await serverManager.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' } as ApiResponse<null>);
    }
    if (!hasServerAccess(user, server)) {
      return res.status(403).json({ success: false, error: 'Access denied to this server' } as ApiResponse<null>);
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
    // Return specific error code for EULA so frontend can show the popup
    if (err.message === 'EULA_NOT_ACCEPTED') {
      return res.status(403).json({ success: false, error: 'EULA_NOT_ACCEPTED' } as ApiResponse<null>);
    }
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 4.0.1 EULA Status Check & Accept
apiRouter.get('/v1/servers/:id/eula', authMiddleware, async (req: Request, res: Response) => {
  try {
    const accepted = serverManager.isEulaAccepted(req.params.id);
    res.json({ success: true, data: { accepted } } as ApiResponse<{ accepted: boolean }>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

apiRouter.post('/v1/servers/:id/eula', authMiddleware, async (req: Request, res: Response) => {
  try {
    serverManager.acceptEula(req.params.id);
    res.json({ success: true, data: { accepted: true } } as ApiResponse<{ accepted: boolean }>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 4.1 Delete Server Permanently
apiRouter.delete('/v1/servers/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  try {
    const server = await serverManager.getServer(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' } as ApiResponse<null>);
    }
    if (user && user.role !== 'admin' && server.ownerId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the server owner or an administrator can delete this server.',
      } as ApiResponse<null>);
    }

    console.log(`[Warden API] Permanently deleting server '${id}'...`);
    await serverManager.deleteServer(id);
    res.json({ success: true, data: { deletedId: id } } as ApiResponse<any>);
  } catch (err: any) {
    console.error(`[Warden API] Failed to delete server '${id}':`, err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 4.2 Change Server Modloader / Software
apiRouter.post('/v1/servers/:id/change-loader', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { loader, mcVersion, name } = req.body;

  if (!loader || !mcVersion) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: loader, mcVersion',
    } as ApiResponse<null>);
  }

  try {
    console.log(`[Warden API] Changing loader for '${id}' to ${loader} (${mcVersion})...`);
    const updated = await serverManager.changeLoader(id, loader, mcVersion, name);
    res.json({ success: true, data: updated } as ApiResponse<WardenServer>);
  } catch (err: any) {
    console.error(`[Warden API] Failed to change loader for '${id}':`, err);
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

// 7. Modrinth Search (Global & Server-Scoped)
apiRouter.get('/v1/mods/search', authMiddleware, async (req: Request, res: Response) => {
  const query = (req.query.query as string) || (req.query.q as string) || '';
  const loader = req.query.loader as string;
  const mcVersion = (req.query.version as string) || (req.query.mcVersion as string);

  try {
    const results = await modrinthAdapter.searchMods(query, loader as ServerLoader, mcVersion);
    res.json({ success: true, data: results } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

apiRouter.get('/v1/servers/:id/mods/search', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const query = (req.query.query as string) || (req.query.q as string) || '';
  let loader = req.query.loader as string;
  let mcVersion = (req.query.version as string) || (req.query.mcVersion as string);

  try {
    const srv = await serverManager.getServer(id);
    if (!loader && srv?.detection?.loader && srv.detection.loader !== 'unknown') {
      loader = srv.detection.loader;
    }
    if (!mcVersion && srv?.detection?.mcVersion && srv.detection.mcVersion !== 'unknown') {
      mcVersion = srv.detection.mcVersion;
    }

    const results = await modrinthAdapter.searchMods(query, loader as ServerLoader, mcVersion);
    res.json({ success: true, data: results } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 8. Modrinth Versions (Global & Server-Scoped)
apiRouter.get('/v1/mods/:projectId/versions', authMiddleware, async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const loader = req.query.loader as ServerLoader;
  const mcVersion = (req.query.version as string) || (req.query.mcVersion as string);

  try {
    const versions = await modrinthAdapter.getProjectVersions(projectId, loader, mcVersion);
    res.json({ success: true, data: versions } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

apiRouter.get('/v1/servers/:id/mods/versions', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const projectId = (req.query.projectId as string) || (req.query.id as string);
  let loader = req.query.loader as ServerLoader;
  let mcVersion = (req.query.version as string) || (req.query.mcVersion as string);

  if (!projectId) {
    return res.status(400).json({ success: false, error: 'projectId is required' } as ApiResponse<null>);
  }

  try {
    const srv = await serverManager.getServer(id);
    if (!loader && srv?.detection?.loader && srv.detection.loader !== 'unknown') {
      loader = srv.detection.loader;
    }
    if (!mcVersion && srv?.detection?.mcVersion && srv.detection.mcVersion !== 'unknown') {
      mcVersion = srv.detection.mcVersion;
    }

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
const handleWriteFile = async (req: Request, res: Response) => {
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
};
apiRouter.put('/v1/servers/:id/files/content', authMiddleware, handleWriteFile);
apiRouter.post('/v1/servers/:id/files/content', authMiddleware, handleWriteFile);

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

// 24. System Self-Update & GitHub Release Check
apiRouter.get('/v1/system/update-status', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true' || req.query.force === '1';
    const status = await SystemUpdater.checkUpdate(force);
    res.json({ success: true, data: status } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

apiRouter.get('/v1/system/update-progress', async (_req: Request, res: Response) => {
  const progress = SystemUpdater.getProgress();
  res.json({ success: true, data: progress } as ApiResponse<any>);
});

apiRouter.post('/v1/system/self-update', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await SystemUpdater.performSelfUpdate();
    res.json({ success: true, data: result } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 25. Export Server as ZIP Archive
apiRouter.get('/v1/servers/:id/export', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { buffer, filename } = await serverManager.exportServerZip(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    console.error(`[Warden API] Server export failed for ${id}:`, err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 26. Import Server from ZIP Archive (Crafty Controller / Generic / Warden Backups)
apiRouter.post('/v1/servers/import', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const name = req.query.name as string | undefined;
    const minMemory = req.query.minMemory as string | undefined;
    const maxMemory = req.query.maxMemory as string | undefined;
    const autoStart = req.query.autoStart === 'true';

    const tempZipPath = path.join(
      config.dataDir,
      `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.zip`
    );
    const fileWriteStream = fs.createWriteStream(tempZipPath);

    await new Promise<void>((resolve, reject) => {
      req.pipe(fileWriteStream);
      fileWriteStream.on('finish', () => resolve());
      fileWriteStream.on('error', (err) => reject(err));
      req.on('error', (err) => reject(err));
    });

    console.log(`[Warden API] Importing server from uploaded zip: ${tempZipPath}...`);
    const server = await serverManager.importServerFromZip(
      tempZipPath,
      {
        name,
        minMemory,
        maxMemory,
        autoStart,
      },
      user?.id
    );

    res.json({ success: true, data: server } as ApiResponse<WardenServer>);
  } catch (err: any) {
    console.error('[Warden API] Server import failed:', err);
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 27. List All Users (for Collaborators & Admin Management)
apiRouter.get('/v1/users', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const users = db.getUsers().map((u) => AuthManager.toPublicUser(u));
    res.json({ success: true, data: users } as ApiResponse<WardenUserPublic[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 28. Create User Account (Admin Only)
apiRouter.post('/v1/users', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Only administrators can create user accounts.' } as ApiResponse<null>);
  }

  const { username, password, role } = req.body as CreateUserPayload;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' } as ApiResponse<null>);
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Username must be at least 2 characters long.' } as ApiResponse<null>);
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' } as ApiResponse<null>);
  }

  const existing = db.getUserByUsername(username.trim());
  if (existing) {
    return res.status(400).json({ success: false, error: `User '${username.trim()}' already exists.` } as ApiResponse<null>);
  }

  try {
    const passwordHash = await AuthManager.hashPassword(password);
    const newUser: WardenUser = {
      id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      username: username.trim(),
      passwordHash,
      role: role === 'admin' ? 'admin' : 'user',
      totpEnabled: false,
      recoveryCodes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.createUser(newUser);
    res.json({ success: true, data: AuthManager.toPublicUser(newUser) } as ApiResponse<WardenUserPublic>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 29. Update User Role or Password (Admin Only)
apiRouter.patch('/v1/users/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Only administrators can update user accounts.' } as ApiResponse<null>);
  }

  const targetUser = db.getUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found.' } as ApiResponse<null>);
  }

  const { role, newPassword } = req.body as UpdateUserPayload;
  const updates: Partial<WardenUser> = {};

  if (role && (role === 'admin' || role === 'user')) {
    // If demoting an admin, ensure they are not the last admin
    if (targetUser.role === 'admin' && role === 'user') {
      const allAdmins = db.getUsers().filter((u) => u.role === 'admin');
      if (allAdmins.length <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot demote the last remaining administrator account.' } as ApiResponse<null>);
      }
    }
    updates.role = role;
  }

  if (newPassword) {
    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' } as ApiResponse<null>);
    }
    updates.passwordHash = await AuthManager.hashPassword(newPassword);
  }

  try {
    const updated = db.updateUser(id, updates);
    if (!updated) return res.status(404).json({ success: false, error: 'User not found.' } as ApiResponse<null>);
    res.json({ success: true, data: AuthManager.toPublicUser(updated) } as ApiResponse<WardenUserPublic>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 30. Delete User Account (Admin Only)
apiRouter.delete('/v1/users/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Only administrators can delete user accounts.' } as ApiResponse<null>);
  }

  if (user.id === id) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own active administrator account.' } as ApiResponse<null>);
  }

  const targetUser = db.getUserById(id);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found.' } as ApiResponse<null>);
  }

  if (targetUser.role === 'admin') {
    const allAdmins = db.getUsers().filter((u) => u.role === 'admin');
    if (allAdmins.length <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last remaining administrator account.' } as ApiResponse<null>);
    }
  }

  try {
    db.deleteUser(id);
    res.json({ success: true, data: { deletedId: id } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// 31. Manage Server Access & Permissions (Owner or Admin Only)
apiRouter.post('/v1/servers/:id/access', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { accessPolicy, allowedUserIds, excludedUserIds } = req.body as ServerAccessPayload;
  const user = (req as any).user;

  try {
    const server = await serverManager.getServer(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found.' } as ApiResponse<null>);
    }

    if (user && user.role !== 'admin' && server.ownerId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only the server owner or an administrator can manage server access.',
      } as ApiResponse<null>);
    }

    const updated = await serverManager.updateServerAccess(id, {
      accessPolicy,
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : undefined,
      excludedUserIds: Array.isArray(excludedUserIds) ? excludedUserIds : undefined,
    });
    res.json({ success: true, data: updated } as ApiResponse<WardenServer>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

