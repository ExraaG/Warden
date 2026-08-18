import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { craftyAdapter } from '../adapters/crafty.js';
import { modrinthAdapter } from '../adapters/modrinth.js';
import { mrPackAdapter } from '../adapters/mrpack.js';
import { loaderDetector } from '../detection/loader.js';
import { updateJobRunner } from '../jobs/cron.js';
import { db } from '../db/storage.js';
import { config } from '../config.js';
import {
  ApiResponse,
  WardenServer,
  InstalledMod,
  ManualConfirmationPayload,
  InstallModPayload,
  ServerLoader,
} from '@warden/shared';

export const apiRouter = Router();

// Auth Middleware protecting all /api/v1 routes
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const settings = db.getSettings();
  const validKey = config.wardenApiKey || 'warden_secret_key_change_me';

  const providedHeader = req.header('X-Warden-API-Key');
  const authHeader = req.header('Authorization');

  let key = providedHeader;
  if (!key && authHeader && authHeader.startsWith('Bearer ')) {
    key = authHeader.substring(7);
  }

  // Always allow web browser requests from the frontend UI or dev fixture mode
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

// Health Check Endpoint (Docker & Thin Client)
apiRouter.get('/health', (_req: Request, res: Response) => {
  const settings = db.getSettings();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    schemaValidated: settings.schemaValidated,
  });
});

// List Servers — fetches stats in parallel to get real running status
apiRouter.get('/v1/servers', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const servers = await craftyAdapter.getServers();
    // Fetch stats in parallel to populate real status (running/stopped/crashed)
    await Promise.allSettled(
      servers.map(async (server) => {
        try {
          const stats = await craftyAdapter.getServerStats(server.id);
          server.stats = stats;
          server.status = (stats as any).running === true ? 'online'
            : server.status === 'error' ? 'error'
            : 'offline';
          // Enrich detection with MC version from stats if not already set
          if (!server.detection.mcVersion && (stats as any).version) {
            server.detection.mcVersion = (stats as any).version;
            db.setServerDetection(server.id, server.detection);
          }
        } catch { /* leave status as offline */ }
      })
    );
    res.json({ success: true, data: servers } as ApiResponse<WardenServer[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});


// Get Single Server Details — always fetches live stats
apiRouter.get('/v1/servers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const servers = await craftyAdapter.getServers();
    let server = servers.find((s) => s.id === req.params.id);
    if (!server && servers.length > 0) {
      server = servers[0];
    }
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' } as ApiResponse<null>);
    }
    const stats = await craftyAdapter.getServerStats(server.id).catch(() => ({
      cpuPercent: 0,
      memoryBytes: 0,
      maxMemoryBytes: 0,
      onlinePlayers: 0,
      maxPlayers: 20,
      uptimeSeconds: 0,
      running: false,
    }));
    server.stats = stats;
    // Propagate real running status from stats
    server.status = (stats as any).running === true ? 'online'
      : (stats as any).running === false && (server.status as string) === 'error' ? 'error'
      : (stats as any).running === false ? 'offline'
      : server.status;
    // Enrich MC version from stats response if missing
    if (!server.detection.mcVersion && (stats as any).version) {
      server.detection.mcVersion = (stats as any).version;
      db.setServerDetection(server.id, server.detection);
    }
    res.json({ success: true, data: server } as ApiResponse<WardenServer>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});


// Server Control Actions (Start/Stop/Restart)
apiRouter.post('/v1/servers/:id/action', authMiddleware, async (req: Request, res: Response) => {
  const { action } = req.body;
  const { id } = req.params;

  try {
    let ok = false;
    if (action === 'start') ok = await craftyAdapter.startServer(id);
    else if (action === 'stop') ok = await craftyAdapter.stopServer(id);
    else if (action === 'restart') ok = await craftyAdapter.restartServer(id);
    else {
      return res.status(400).json({ success: false, error: 'Invalid action' } as ApiResponse<null>);
    }

    res.json({ success: ok } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Manual Confirm Server Loader & MC Version
apiRouter.post('/v1/servers/:id/confirm-loader', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { loader, mcVersion }: ManualConfirmationPayload = req.body;

  const targetLoader = loader || 'fabric';
  const targetVersion = mcVersion || '1.21.1';

  const newState = {
    loader: targetLoader,
    mcVersion: targetVersion,
    isConfirmed: true,
    source: 'manual_override' as const,
    detectedAt: new Date().toISOString(),
  };

  db.setServerDetection(id, newState);
  res.json({ success: true, data: newState } as ApiResponse<any>);
});

// Installed Mods for Server (Scans mods/ folder & dynamically matches Modrinth API)
apiRouter.get('/v1/servers/:id/mods', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    let files: any[] = [];
    let modFolder = 'mods';
    try {
      files = await craftyAdapter.listFiles(id, 'mods');
    } catch {
      files = [];
    }

    if (files.length === 0) {
      try {
        const pluginFiles = await craftyAdapter.listFiles(id, 'plugins');
        if (pluginFiles.length > 0) {
          files = pluginFiles;
          modFolder = 'plugins';
        }
      } catch {}
    }

    const jarFiles = files.filter((f) => !f.is_dir && (f.name || '').toLowerCase().endsWith('.jar'));
    if (jarFiles.length === 0) {
      return res.json({ success: true, data: [] } as ApiResponse<any[]>);
    }

    const detection = db.getServerDetection(id) || (await loaderDetector.detectServerLoader(id));

    /**
     * Build a clean search query from a JAR filename.
     *
     * Strategy:
     * 1. Strip .jar extension
     * 2. Strip known loader/version suffixes: -fabric-26.2-2.11.0, _1.21.1, +26.2 etc
     * 3. Convert CamelCase to spaces (FarmersDelight -> farmers delight)
     * 4. Replace remaining hyphens/underscores with spaces
     * 5. Apply alias overrides for mods with common naming mismatches
     */
    const JAR_ALIASES: Record<string, string> = {
      // key = lowercase stem after stripping, value = search query to use instead
      voicechat: 'simple voice chat',
      'simple-voice-chat': 'simple voice chat',
      simplevoicechat: 'simple voice chat',
      farmersdelight: "farmer's delight",
      'farmers-delight': "farmer's delight",
      'farmers-delight-refabricated': "farmer's delight refabricated",
      carryon: 'carry on',
      'carry-on': 'carry on',
      jei: 'just enough items',
      rei: 'roughly enough items',
      'fabric-language-kotlin': 'fabric language kotlin',
      fabriclanguagekotlin: 'fabric language kotlin',
      fabricapi: 'fabric api',
      'fabric-api': 'fabric api',
      vanish: 'vanish',
      veinminer: 'vein miner',
      fallingtree: 'falling tree',
      'falling-tree': 'falling tree',
      effortlessbuilding: 'effortless building',
      'effortless-building': 'effortless building',
      betterbuildingripes: 'better building recipes',
      'better-building-recipes': 'better building recipes',
      betterbuilding: 'better building recipes',
      grindenchantments: 'grind enchantments',
      discordsrv: 'discordsrv',
      'discord-srv': 'discordsrv',
      invseeplusplus: 'invsee',
      'invsee++': 'invsee',
      skinsrestorer: 'skinsrestorer',
      stringdupersreturn: 'string dupers return',
      treecutter: 'tree cutter',
      nametaghider: 'nametag hider',
      borderexpand: 'border expand',
      waystones: 'waystones',
      fabulouslyoptimized: 'fabulously optimized',
      sodium: 'sodium',
      iris: 'iris',
      lithium: 'lithium',
    };

    const stemFromFilename = (filename: string): { stem: string; searchQuery: string } => {
      let stem = filename
        .replace(/\.jar$/i, '')
        .replace(/\(\d+\)/g, '')
        .replace(/[-_](build|release|snapshot|v|ver)[-_+]?\d+.*/i, '')
        // Strip common loader suffix patterns: -fabric-26.2-2.11.0, +26.2, _1.21.1
        .replace(/[-_](fabric|forge|neoforge|quilt|paper|spigot|bukkit|purpur)[-_+]?.*/i, '')
        // Strip pure version suffixes: -26.2-2.11.0, _0.5.11, +1.21.1
        .replace(/[-_+]\d+[.\-+].*/i, '')
        .replace(/[-_+]\d+$/i, '')
        // Strip mc-version-only suffixes like -mc1.21, -1.21.1
        .replace(/[-_](mc|minecraft)?1\.\d+[\.\d]*/i, '')
        .trim();

      // Split CamelCase into words: FarmersDelight -> Farmers Delight
      const camelSplit = stem
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim();

      const normalized = camelSplit.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

      // Check alias table
      const aliasKey = normalized.replace(/\s+/g, '').toLowerCase();
      const aliasKey2 = normalized.replace(/\s+/g, '-').toLowerCase();
      const searchQuery = JAR_ALIASES[normalized] || JAR_ALIASES[aliasKey] || JAR_ALIASES[aliasKey2] || normalized;

      return { stem: camelSplit, searchQuery };
    };

    const resolveWithTimeout = async (f: any): Promise<any> => {
      const { stem, searchQuery } = stemFromFilename(f.name);

      let matched: any = null;

      if (searchQuery.length >= 2) {
        try {
          // KEY FIX: Do NOT pass mcVersion to Modrinth search.
          // These mods are for a Minecraft snapshot (26.2 internal version) which Modrinth
          // doesn't index under standard 1.x.x version strings. Filtering by version would
          // exclude all valid matches. Use loader-only facet for filtering.
          const loaderForSearch = detection.loader !== 'unknown' ? detection.loader : undefined;
          let searchResults = await modrinthAdapter.searchMods(searchQuery, loaderForSearch, undefined);
          if ((!searchResults || searchResults.length === 0) && loaderForSearch) {
            // Fall back to unconstrained search in case the project is published under multiple/generic categories on Modrinth
            searchResults = await modrinthAdapter.searchMods(searchQuery, undefined, undefined);
          }

          if (searchResults && searchResults.length > 0) {
            const qLower = searchQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
            // Score and rank matches: exact slug > slug starts with > title match > first result
            const scored = searchResults.map((m) => {
              const slug = (m.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const title = (m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              let score = 0;
              if (slug === qLower) score = 100;
              else if (title === qLower) score = 90;
              else if (slug.startsWith(qLower) || qLower.startsWith(slug)) score = 70;
              else if (title.startsWith(qLower) || qLower.startsWith(title)) score = 60;
              else if (slug.includes(qLower) || qLower.includes(slug)) score = 40;
              else if (title.includes(qLower) || qLower.includes(title)) score = 30;
              else score = 1;
              return { ...m, _score: score };
            });

            scored.sort((a, b) => b._score - a._score);
            // Only match if score is reasonable (avoid completely wrong matches)
            if (scored[0]._score >= 30) {
              matched = scored[0];
            }
          }
        } catch (err: any) {
          // Modrinth search failed — treat as local/custom mod
        }
      }

      // Build human-readable title from stem if no Modrinth match
      const displayTitle = matched
        ? matched.title
        : stem.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim();

      return {
        filename: f.name,
        size: f.size || 0,
        sha512: '',
        hasUpdate: false,
        modifiedAt: f.mod_time || new Date().toISOString(),
        title: displayTitle,
        iconUrl: matched ? matched.iconUrl : undefined,
        modrinthId: matched ? matched.id : undefined,
        modrinthSlug: matched ? matched.slug : undefined,
        description: matched ? matched.description : undefined,
        downloads: matched ? matched.downloads : undefined,
        isCustomMod: !matched,
        // JAR icon will be fetched separately via /mods/:filename/icon endpoint
        hasJarIcon: !matched, // hint to frontend: fetch jar icon for unmatched mods
      };
    };

    // Process in batches of 4 to stay well within Modrinth rate limits
    const results: any[] = [];
    for (let i = 0; i < jarFiles.length; i += 4) {
      const batch = jarFiles.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map(resolveWithTimeout));
      results.push(...batchResults);
      // Small delay between batches to be polite to Modrinth
      if (i + 4 < jarFiles.length) await new Promise((r) => setTimeout(r, 300));
    }

    res.json({ success: true, data: results } as ApiResponse<any[]>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Extract icon from a specific mod JAR file
apiRouter.get('/v1/servers/:id/mods/:filename/icon', authMiddleware, async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const { extractJarIcon } = await import('../utils/jarIcon.js');

  // Sanitize filename - must end in .jar, no path traversal
  const safeFilename = filename.replace(/[^a-zA-Z0-9._+\-]/g, '_');
  if (!safeFilename.endsWith('.jar')) {
    return res.status(400).json({ success: false, error: 'Not a jar file' });
  }

  try {
    const detection = db.getServerDetection(id);
    const isPluginLoader = ['paper', 'spigot', 'bukkit', 'purpur'].includes((detection?.loader || '').toLowerCase());
    const folder = isPluginLoader ? 'plugins' : 'mods';

    let iconDataUrl = await extractJarIcon(id, `${folder}/${safeFilename}`);
    if (!iconDataUrl && folder === 'mods') {
      iconDataUrl = await extractJarIcon(id, `plugins/${safeFilename}`);
    }

    if (iconDataUrl) {
      // Strip "data:image/png;base64," prefix and send raw PNG
      const base64Data = iconDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
    return res.status(404).json({ success: false, error: 'No icon found in JAR' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});



// Search Modrinth Mods (supports loader & mcVersion overrides for Dev Mode)
apiRouter.get('/v1/servers/:id/mods/search', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const query = (req.query.q as string) || '';

  const detection = db.getServerDetection(id);
  // Allow explicit query param overrides from Dev Mode
  const customLoader = (req.query.loader as ServerLoader) || (detection?.loader !== 'unknown' ? detection?.loader : undefined);
  const customVersion = req.query.mcVersion !== undefined ? (req.query.mcVersion ? (req.query.mcVersion as string) : undefined) : (detection?.mcVersion || undefined);

  try {
    const results = await modrinthAdapter.searchMods(
      query,
      customLoader,
      customVersion
    );
    res.json({ success: true, data: results } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Get Project Versions (supports loader & mcVersion overrides for Dev Mode)
apiRouter.get('/v1/servers/:id/mods/versions', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const projectId = req.query.projectId as string;

  if (!projectId) {
    return res.status(400).json({ success: false, error: 'Missing projectId query param' } as ApiResponse<null>);
  }

  const detection = db.getServerDetection(id);
  const customLoader = (req.query.loader as ServerLoader) || (detection?.loader !== 'unknown' ? detection?.loader : undefined);
  const customVersion = req.query.mcVersion !== undefined ? (req.query.mcVersion ? (req.query.mcVersion as string) : undefined) : (detection?.mcVersion || undefined);

  try {
    const versions = await modrinthAdapter.getProjectVersions(
      projectId,
      customLoader,
      customVersion
    );
    res.json({ success: true, data: versions } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Install Mod & Resolve Dependencies (supports Dev Mode custom target)
apiRouter.post('/v1/servers/:id/mods/install', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { projectId, versionId, includeDependencies = true, loader: overrideLoader, mcVersion: overrideVersion }: any = req.body;

  const detection = db.getServerDetection(id);
  const effectiveLoader = overrideLoader || detection?.loader || 'fabric';
  const effectiveVersion = overrideVersion !== undefined ? overrideVersion : (detection?.mcVersion || undefined);

  try {
    const versions = await modrinthAdapter.getProjectVersions(projectId, effectiveLoader, effectiveVersion);
    const targetVersion = versionId
      ? versions.find((v) => v.id === versionId) || (await modrinthAdapter.getProjectVersions(projectId)).find((v) => v.id === versionId)
      : versions[0];

    if (!targetVersion) {
      return res.status(404).json({ success: false, error: 'No compatible version found for specified loader/version' } as ApiResponse<null>);
    }

    const versionsToInstall = [targetVersion];

    if (includeDependencies) {
      const deps = await modrinthAdapter.resolveRequiredDependencies(
        targetVersion,
        effectiveLoader,
        effectiveVersion || ''
      );
      versionsToInstall.push(...deps);
    }

    // Determine target folder: Paper / Spigot / Bukkit use plugins/; Fabric / Forge use mods/
    const isPluginLoader = ['paper', 'spigot', 'bukkit', 'purpur'].includes((detection?.loader || '').toLowerCase());
    const targetFolder = isPluginLoader ? 'plugins' : 'mods';

    let installedCount = 0;
    for (const ver of versionsToInstall) {
      const buffer = await modrinthAdapter.downloadAndVerifyFile(ver.downloadUrl, ver.sha512);
      await craftyAdapter.uploadFile(id, targetFolder, buffer, ver.filename);
      installedCount++;
    }

    // Trigger any on_mod_update custom tasks
    updateJobRunner.triggerModUpdateTasks(id, versionsToInstall.map((v) => v.filename)).catch((err) => {
      console.error('[API] Error triggering mod update tasks:', err);
    });

    res.json({ success: true, data: { installedCount, installed: versionsToInstall.map((v) => v.filename) } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }

});

// Delete Mod File
apiRouter.delete('/v1/servers/:id/mods/:filename', authMiddleware, async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const detection = db.getServerDetection(id);
  const isPluginLoader = ['paper', 'spigot', 'bukkit', 'purpur'].includes((detection?.loader || '').toLowerCase());
  const targetFolder = isPluginLoader ? 'plugins' : 'mods';

  try {
    let ok = await craftyAdapter.deleteFile(id, `${targetFolder}/${filename}`);
    if (!ok && targetFolder === 'mods') {
      ok = await craftyAdapter.deleteFile(id, `plugins/${filename}`);
    }
    res.json({ success: ok } as ApiResponse<null>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Preview Modrinth .mrpack Archive
apiRouter.post('/v1/servers/:id/preview-mrpack', authMiddleware, async (req: Request, res: Response) => {
  const { data, url } = req.body;

  try {
    let buffer: Buffer;
    if (url) {
      buffer = await mrPackAdapter.downloadFile(url);
    } else if (data) {
      const base64Data = data.includes('base64,') ? data.split('base64,')[1] : data;
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'No .mrpack file data or URL provided' } as ApiResponse<null>);
    }

    const preview = await mrPackAdapter.previewMrPack(buffer);
    res.json({ success: true, data: preview } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Import & Deploy Modrinth .mrpack Archive with Streaming Progress
apiRouter.post('/v1/servers/:id/import-mrpack', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, url, options } = req.body;

  // Set SSE Headers for real-time progress streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (obj: any) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {}
  };

  try {
    let buffer: Buffer;
    if (url) {
      sendEvent({ type: 'progress', data: { percent: 1, message: 'Downloading .mrpack archive from URL...' } });
      buffer = await mrPackAdapter.downloadFile(url);
    } else if (data) {
      sendEvent({ type: 'progress', data: { percent: 1, message: 'Decoding uploaded .mrpack file...' } });
      const base64Data = data.includes('base64,') ? data.split('base64,')[1] : data;
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      sendEvent({ type: 'error', error: 'No .mrpack file data or URL provided' });
      return res.end();
    }

    const result = await mrPackAdapter.installMrPack(id, buffer, options || {}, (progress) => {
      sendEvent({ type: 'progress', data: progress });
    });

    sendEvent({ type: 'complete', data: result });
    res.end();
  } catch (err: any) {
    sendEvent({ type: 'error', error: err.message || 'Unknown error occurred while installing modpack' });
    res.end();
  }
});

// Trigger Manual Update Now
apiRouter.post('/v1/servers/:id/update-now', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const logs = await updateJobRunner.runUpdateJob('manual', id);
    res.json({ success: true, data: logs[0] } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Job Logs History
apiRouter.get('/v1/jobs', authMiddleware, (_req: Request, res: Response) => {
  const logs = db.getJobLogs();
  res.json({ success: true, data: logs } as ApiResponse<any>);
});

// Get Settings
apiRouter.get('/v1/settings', authMiddleware, (_req: Request, res: Response) => {
  const settings = db.getSettings();
  res.json({ success: true, data: settings } as ApiResponse<any>);
});

// Update Settings
apiRouter.post('/v1/settings', authMiddleware, (req: Request, res: Response) => {
  const { craftyUrl, craftyApiKey, wardenApiKey, timezone, autoUpdateEnabled, autoUpdateTime, autoUpdateCron, customTasks } = req.body;

  const partial: any = {};
  if (craftyUrl !== undefined) {
    config.craftyUrl = craftyUrl;
    partial.craftyUrl = craftyUrl;
  }
  if (craftyApiKey !== undefined) {
    config.craftyApiKey = craftyApiKey;
    partial.craftyApiKeySet = Boolean(craftyApiKey);
  }
  if (wardenApiKey !== undefined) {
    config.wardenApiKey = wardenApiKey;
    partial.wardenApiKeySet = Boolean(wardenApiKey);
  }
  if (timezone !== undefined) {
    partial.timezone = timezone;
  }
  if (autoUpdateEnabled !== undefined) {
    partial.autoUpdateEnabled = Boolean(autoUpdateEnabled);
  }
  if (autoUpdateTime !== undefined) {
    partial.autoUpdateTime = autoUpdateTime;
  }
  if (autoUpdateCron !== undefined) {
    partial.autoUpdateCron = autoUpdateCron;
  }
  if (customTasks !== undefined && Array.isArray(customTasks)) {
    partial.customTasks = customTasks;
  }

  const updated = db.updateSettings(partial);
  // Reload dynamic cron schedules with new settings
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: updated } as ApiResponse<any>);
});

// Task Management Endpoints
apiRouter.get('/v1/tasks', authMiddleware, (_req: Request, res: Response) => {
  res.json({ success: true, data: db.getCustomTasks() } as ApiResponse<any>);
});

apiRouter.post('/v1/tasks', authMiddleware, (req: Request, res: Response) => {
  const {
    name,
    action,
    serverId = 'all',
    triggerType = 'schedule',
    targetMod = '',
    scheduleTime = '05:00',
    cronExpression,
    command,
    enabled = true,
  } = req.body;

  if (!name || !action) {
    return res.status(400).json({ success: false, error: 'Missing name or action for task' } as ApiResponse<null>);
  }

  const newTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    action,
    serverId,
    triggerType,
    targetMod,
    scheduleTime,
    cronExpression: cronExpression || '',
    command,
    enabled,
  };

  const tasks = db.addCustomTask(newTask);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: tasks } as ApiResponse<any>);
});


apiRouter.put('/v1/tasks/:taskId', authMiddleware, (req: Request, res: Response) => {
  const { taskId } = req.params;
  const tasks = db.updateCustomTask(taskId, req.body);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: tasks } as ApiResponse<any>);
});

apiRouter.delete('/v1/tasks/:taskId', authMiddleware, (req: Request, res: Response) => {
  const { taskId } = req.params;
  const tasks = db.deleteCustomTask(taskId);
  updateJobRunner.reloadCronSchedules();
  res.json({ success: true, data: tasks } as ApiResponse<any>);
});

apiRouter.post('/v1/tasks/:taskId/run', authMiddleware, async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const tasks = db.getCustomTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse<null>);
  }

  const ok = await updateJobRunner.executeCustomTask(task);
  res.json({ success: ok, data: { taskId, status: ok ? 'success' : 'failed' } } as ApiResponse<any>);
});

apiRouter.get('/v1/servers/:id/files', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const relPath = (req.query.path as string) || '';

  try {
    const files = await craftyAdapter.listFiles(id, relPath);
    res.json({ success: true, data: files } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Read Server File Content
apiRouter.get('/v1/servers/:id/files/content', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const relPath = req.query.path as string;

  if (!relPath) {
    return res.status(400).json({ success: false, error: 'Missing path query parameter' } as ApiResponse<null>);
  }

  try {
    const content = await craftyAdapter.getFileContent(id, relPath);
    res.json({ success: true, data: { path: relPath, content } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Save Server File Content
apiRouter.post('/v1/servers/:id/files/content', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: relPath, content } = req.body;

  if (!relPath || content === undefined) {
    return res.status(400).json({ success: false, error: 'Missing path or content in body' } as ApiResponse<null>);
  }

  try {
    const ok = await craftyAdapter.saveFileContent(id, relPath, content);
    res.json({ success: ok, data: { path: relPath } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Delete Server File
apiRouter.delete('/v1/servers/:id/files', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: relPath } = req.body;

  if (!relPath) {
    return res.status(400).json({ success: false, error: 'Missing path in request body' } as ApiResponse<null>);
  }

  try {
    const ok = await craftyAdapter.deleteFile(id, relPath);
    res.json({ success: ok, data: { path: relPath } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Server Live Console Logs
apiRouter.get('/v1/servers/:id/console', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const logs = await craftyAdapter.getConsoleLogs(id);
    res.json({ success: true, data: logs } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Send Command to Server Console
apiRouter.post('/v1/servers/:id/console', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: 'Missing command in request body' } as ApiResponse<null>);
  }

  try {
    const ok = await craftyAdapter.sendConsoleCommand(id, command);
    res.json({ success: ok, data: { command } } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// ─── PLAYERS MANAGEMENT ───────────────────────────────────────────────────

// Helper to safely parse JSON file from server folder
async function safeReadJsonFile<T>(serverId: string, filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await craftyAdapter.getFileContent(serverId, filePath);
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Get All Players for Server (Aternos style)
apiRouter.get('/v1/servers/:id/players', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // 1. Fetch usercache.json, whitelist.json, ops.json, banned-players.json, banned-ips.json concurrently
    const [userCache, whitelist, ops, bannedPlayers, bannedIps, stats] = await Promise.all([
      safeReadJsonFile<any[]>(id, 'usercache.json', []),
      safeReadJsonFile<any[]>(id, 'whitelist.json', []),
      safeReadJsonFile<any[]>(id, 'ops.json', []),
      safeReadJsonFile<any[]>(id, 'banned-players.json', []),
      safeReadJsonFile<any[]>(id, 'banned-ips.json', []),
      craftyAdapter.getServerStats(id).catch(() => null),
    ]);

    const playerMap = new Map<string, any>();

    const getOrCreatePlayer = (name: string, uuid: string = '', isLatest: boolean = false) => {
      const cleanName = name.trim();
      const cleanUuid = uuid.trim().toLowerCase();

      let existing: any = null;
      if (cleanUuid && playerMap.has(cleanUuid)) {
        existing = playerMap.get(cleanUuid);
      } else if (cleanName && playerMap.has(cleanName.toLowerCase())) {
        existing = playerMap.get(cleanName.toLowerCase());
      }

      if (existing) {
        if (cleanName) {
          if (existing.name && existing.name.toLowerCase() !== cleanName.toLowerCase()) {
            if (!existing.previousNames) existing.previousNames = [];
            if (isLatest) {
              if (!existing.previousNames.includes(existing.name)) {
                existing.previousNames.push(existing.name);
              }
              existing.name = cleanName;
            } else if (!existing.previousNames.includes(cleanName)) {
              existing.previousNames.push(cleanName);
            }
          }
        }
        if (cleanUuid && !existing.uuid) {
          existing.uuid = cleanUuid;
          playerMap.set(cleanUuid, existing);
        }
        return existing;
      }

      const newPlayer = {
        name: cleanName,
        uuid: cleanUuid,
        previousNames: [] as string[],
        isOnline: false,
        isWhitelisted: false,
        isOp: false,
        isBanned: false,
        isIpBanned: false,
      };

      if (cleanUuid) playerMap.set(cleanUuid, newPlayer);
      if (cleanName) playerMap.set(cleanName.toLowerCase(), newPlayer);
      return newPlayer;
    };

    // 1. Populate from usercache.json first (authoritative latest IGN & UUID mapping)
    if (Array.isArray(userCache)) {
      for (const entry of userCache) {
        if (!entry || !entry.name) continue;
        const p = getOrCreatePlayer(entry.name, entry.uuid, true);
        if (entry.expiresOn) p.lastSeen = entry.expiresOn;
      }
    }

    // 2. Mark whitelisted players
    if (Array.isArray(whitelist)) {
      for (const entry of whitelist) {
        if (!entry || !entry.name) continue;
        const p = getOrCreatePlayer(entry.name, entry.uuid);
        p.isWhitelisted = true;
      }
    }

    // 3. Mark Operators (OP)
    if (Array.isArray(ops)) {
      for (const entry of ops) {
        if (!entry || !entry.name) continue;
        const p = getOrCreatePlayer(entry.name, entry.uuid);
        p.isOp = true;
        p.opLevel = entry.level || 4;
      }
    }

    // 4. Mark Banned Players
    if (Array.isArray(bannedPlayers)) {
      for (const entry of bannedPlayers) {
        if (!entry || !entry.name) continue;
        const p = getOrCreatePlayer(entry.name, entry.uuid);
        p.isBanned = true;
        p.banReason = entry.reason || 'Banned by an operator.';
        p.banSource = entry.source || 'Server Admin';
        p.banExpires = entry.expires || 'forever';
      }
    }

    // 5. Detect Currently Online / Active Players from Console logs and Live stats
    try {
      const logs = await craftyAdapter.getConsoleLogs(id).catch(() => []);
      const onlineSet = new Set<string>();
      // Parse logs in chronological order to track connects/disconnects & active player chat/actions
      for (const rawLine of logs) {
        // Decode HTML entities (e.g. &lt; -> <, &gt; -> >)
        const line = rawLine
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');

        // Connects: "Exrsh joined the game", "Exrsh[/192.168.1.1:58010] logged in", "UUID of player Exrsh is"
        const joinMatch = line.match(/(?:\[Server thread\/INFO\]|:\s+)\s*([a-zA-Z0-9_]{2,16})\s+joined the game/i) ||
                          line.match(/:\s*([a-zA-Z0-9_]{2,16})\[.*?\]\s+logged in/i) ||
                          line.match(/UUID of player\s+([a-zA-Z0-9_]{2,16})\s+is/i);
        if (joinMatch) {
          const pName = joinMatch[1].trim();
          onlineSet.add(pName.toLowerCase());
          if (!playerMap.has(pName.toLowerCase())) {
            playerMap.set(pName.toLowerCase(), {
              name: pName,
              uuid: '',
              isOnline: true,
              isWhitelisted: false,
              isOp: false,
              isBanned: false,
              isIpBanned: false,
            });
          }
        }

        // Player Chat: <Player> Message
        const chatMatch = line.match(/<([a-zA-Z0-9_]{2,16})>/);
        if (chatMatch) {
          const pName = chatMatch[1].trim();
          onlineSet.add(pName.toLowerCase());
          if (!playerMap.has(pName.toLowerCase())) {
            playerMap.set(pName.toLowerCase(), {
              name: pName,
              uuid: '',
              isOnline: true,
              isWhitelisted: false,
              isOp: false,
              isBanned: false,
              isIpBanned: false,
            });
          }
        }

        // Disconnects: "Exrsh left the game", "Exrsh lost connection", "Disconnecting client Exrsh", "Kicking Exrsh"
        const leaveMatch = line.match(/(?:\[Server thread\/INFO\]|:\s+)\s*([a-zA-Z0-9_]{2,16})\s+(?:left the game|lost connection)/i) ||
                           line.match(/Disconnecting client\s+([a-zA-Z0-9_]{2,16})/i) ||
                           line.match(/Kicked\s+([a-zA-Z0-9_]{2,16})/i);
        if (leaveMatch) {
          onlineSet.delete(leaveMatch[1].toLowerCase());
        }
      }

      playerMap.forEach((player) => {
        if (onlineSet.has(player.name.toLowerCase())) {
          player.isOnline = true;
        } else {
          player.isOnline = false;
        }
      });
    } catch {}

    // 6. Match IP Bans if available
    const bannedIpList = Array.isArray(bannedIps) ? bannedIps.map((b) => b.ip || b).filter(Boolean) : [];

    // Deduplicate unique player objects
    const uniquePlayers = Array.from(new Set(playerMap.values()));

    const playersList = uniquePlayers.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (a.isOp !== b.isOp) return a.isOp ? -1 : 1;
      if (a.isBanned !== b.isBanned) return a.isBanned ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      data: {
        players: playersList,
        bannedIps: bannedIpList,
        stats: {
          totalKnown: playersList.length,
          whitelistedCount: playersList.filter((p) => p.isWhitelisted).length,
          opsCount: playersList.filter((p) => p.isOp).length,
          bannedCount: playersList.filter((p) => p.isBanned).length,
          onlineCount: stats?.onlinePlayers || 0,
        },
      },
    } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Execute Player Moderation Action (Aternos style)
apiRouter.post('/v1/servers/:id/players/action', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, action, reason, ip } = req.body;

  if (!name && !ip) {
    return res.status(400).json({ success: false, error: 'Player name or IP required' } as ApiResponse<null>);
  }

  try {
    let command = '';
    const cleanName = (name || '').replace(/[^a-zA-Z0-9_]/g, '');

    switch (action) {
      case 'whitelist_add':
        command = `whitelist add ${cleanName}`;
        break;
      case 'whitelist_remove':
        command = `whitelist remove ${cleanName}`;
        break;
      case 'op':
        command = `op ${cleanName}`;
        break;
      case 'deop':
        command = `deop ${cleanName}`;
        break;
      case 'kick':
        command = reason ? `kick ${cleanName} ${reason}` : `kick ${cleanName} Kicked by server administrator`;
        break;
      case 'ban':
        command = reason ? `ban ${cleanName} ${reason}` : `ban ${cleanName}`;
        break;
      case 'pardon':
        command = `pardon ${cleanName}`;
        break;
      case 'ban_ip':
        command = ip ? `ban-ip ${ip}` : `ban-ip ${cleanName}`;
        break;
      case 'pardon_ip':
        command = ip ? `pardon-ip ${ip}` : `pardon-ip ${cleanName}`;
        break;
      default:
        return res.status(400).json({ success: false, error: `Unsupported player action: ${action}` } as ApiResponse<null>);
    }

    // 1. Try sending command to console via Crafty stdin (if server is online)
    craftyAdapter.sendConsoleCommand(id, command).catch(() => {});

    // 2. Also directly update corresponding JSON configuration files in the server folder
    // This guarantees immediate persistence whether the server is online or offline
    try {
      if (action === 'whitelist_add') {
        const list = await safeReadJsonFile<any[]>(id, 'whitelist.json', []);
        if (!list.some((p) => p.name?.toLowerCase() === cleanName.toLowerCase())) {
          list.push({ name: cleanName, uuid: '' });
          await craftyAdapter.saveFileContent(id, 'whitelist.json', JSON.stringify(list, null, 2));
        }
      } else if (action === 'whitelist_remove') {
        const list = await safeReadJsonFile<any[]>(id, 'whitelist.json', []);
        const filtered = list.filter((p) => p.name?.toLowerCase() !== cleanName.toLowerCase());
        await craftyAdapter.saveFileContent(id, 'whitelist.json', JSON.stringify(filtered, null, 2));
      } else if (action === 'op') {
        const list = await safeReadJsonFile<any[]>(id, 'ops.json', []);
        if (!list.some((p) => p.name?.toLowerCase() === cleanName.toLowerCase())) {
          list.push({ name: cleanName, uuid: '', level: 4, bypassesPlayerLimit: false });
          await craftyAdapter.saveFileContent(id, 'ops.json', JSON.stringify(list, null, 2));
        }
      } else if (action === 'deop') {
        const list = await safeReadJsonFile<any[]>(id, 'ops.json', []);
        const filtered = list.filter((p) => p.name?.toLowerCase() !== cleanName.toLowerCase());
        await craftyAdapter.saveFileContent(id, 'ops.json', JSON.stringify(filtered, null, 2));
      } else if (action === 'ban') {
        const list = await safeReadJsonFile<any[]>(id, 'banned-players.json', []);
        if (!list.some((p) => p.name?.toLowerCase() === cleanName.toLowerCase())) {
          list.push({
            name: cleanName,
            uuid: '',
            created: new Date().toISOString(),
            source: 'Warden Admin',
            expires: 'forever',
            reason: reason || 'Banned by operator',
          });
          await craftyAdapter.saveFileContent(id, 'banned-players.json', JSON.stringify(list, null, 2));
        }
      } else if (action === 'pardon') {
        const list = await safeReadJsonFile<any[]>(id, 'banned-players.json', []);
        const filtered = list.filter((p) => p.name?.toLowerCase() !== cleanName.toLowerCase());
        await craftyAdapter.saveFileContent(id, 'banned-players.json', JSON.stringify(filtered, null, 2));
      } else if (action === 'ban_ip') {
        const list = await safeReadJsonFile<any[]>(id, 'banned-ips.json', []);
        const targetIp = ip || cleanName;
        if (!list.some((b) => (b.ip || b) === targetIp)) {
          list.push({
            ip: targetIp,
            created: new Date().toISOString(),
            source: 'Warden Admin',
            expires: 'forever',
            reason: 'Banned by operator',
          });
          await craftyAdapter.saveFileContent(id, 'banned-ips.json', JSON.stringify(list, null, 2));
        }
      } else if (action === 'pardon_ip') {
        const list = await safeReadJsonFile<any[]>(id, 'banned-ips.json', []);
        const targetIp = ip || cleanName;
        const filtered = list.filter((b) => (b.ip || b) !== targetIp);
        await craftyAdapter.saveFileContent(id, 'banned-ips.json', JSON.stringify(filtered, null, 2));
      }

      // Also ensure player is recorded in usercache.json if not present
      if (cleanName) {
        const cache = await safeReadJsonFile<any[]>(id, 'usercache.json', []);
        if (!cache.some((p) => p.name?.toLowerCase() === cleanName.toLowerCase())) {
          cache.push({ name: cleanName, uuid: '', expiresOn: new Date(Date.now() + 30 * 86400000).toISOString() });
          await craftyAdapter.saveFileContent(id, 'usercache.json', JSON.stringify(cache, null, 2)).catch(() => {});
        }
      }
    } catch (fileErr: any) {
      console.warn('[PlayerAction] File sync warning:', fileErr.message);
    }

    res.json({
      success: true,
      data: { command, action, name: cleanName },
    } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// ─── SERVER PROPERTIES ────────────────────────────────────────────────────

// Parse and format server.properties
function parseServerProperties(raw: string): Record<string, string> {
  const props: Record<string, string> = {};
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      props[key] = val;
    }
  }
  return props;
}

function serializeServerProperties(existingRaw: string, updatedProps: Record<string, string>): string {
  const lines = existingRaw ? existingRaw.split('\n') : [];
  const handledKeys = new Set<string>();
  const outputLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) {
      outputLines.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      if (key in updatedProps) {
        outputLines.push(`${key}=${updatedProps[key]}`);
        handledKeys.add(key);
      } else {
        outputLines.push(line);
      }
    } else {
      outputLines.push(line);
    }
  }

  // Append any newly introduced keys
  for (const [k, v] of Object.entries(updatedProps)) {
    if (!handledKeys.has(k) && v !== undefined) {
      outputLines.push(`${k}=${v}`);
    }
  }

  return outputLines.join('\n');
}

// Get Server Properties
apiRouter.get('/v1/servers/:id/properties', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const raw = await craftyAdapter.getFileContent(id, 'server.properties');
    const properties = parseServerProperties(raw);
    res.json({
      success: true,
      data: { properties, raw },
    } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

// Update Server Properties
apiRouter.post('/v1/servers/:id/properties', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { properties } = req.body;

  if (!properties || typeof properties !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing properties object in request body' } as ApiResponse<null>);
  }

  try {
    const existingRaw = await craftyAdapter.getFileContent(id, 'server.properties');
    const newContent = serializeServerProperties(existingRaw, properties);
    const ok = await craftyAdapter.saveFileContent(id, 'server.properties', newContent);

    res.json({
      success: ok,
      data: { properties: parseServerProperties(newContent) },
    } as ApiResponse<any>);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message } as ApiResponse<null>);
  }
});

