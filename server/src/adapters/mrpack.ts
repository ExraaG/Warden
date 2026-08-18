import yauzl from 'yauzl';
import fetch from 'node-fetch';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { serverManager } from '../core/serverManager.js';
import { db } from '../db/storage.js';
import { ServerLoader } from '@warden/shared';

export interface MrPackIndexFile {
  path: string;
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  env?: {
    client?: 'required' | 'optional' | 'unsupported';
    server?: 'required' | 'optional' | 'unsupported';
  };
  downloads: string[];
  fileSize?: number;
}

export interface MrPackIndex {
  formatVersion: number;
  game: string;
  versionId?: string;
  name: string;
  summary?: string;
  files: MrPackIndexFile[];
  dependencies: Record<string, string>;
}

export interface MrPackOverrideFile {
  path: string;
  buffer: Buffer;
}

export interface MrPackParsed {
  index: MrPackIndex;
  overrides: MrPackOverrideFile[];
}

export interface MrPackModItem {
  id: string;
  projectId?: string;
  path: string;
  filename: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads?: number;
  fileSize?: number;
  category: 'mods' | 'datapacks' | 'resourcepacks' | 'shaderpacks' | 'overrides';
  isServerSupported: boolean;
  isClientOnly: boolean;
  isDefaultSelected: boolean;
}

export interface MrPackPreviewResult {
  name: string;
  summary: string;
  versionId: string;
  mcVersion: string;
  loader: ServerLoader;
  totalFiles: number;
  modsCount: number;
  datapacksCount: number;
  resourcePacksCount: number;
  shaderPacksCount: number;
  overridesCount: number;
  modsList: MrPackModItem[];
}

export interface MrPackInstallOptions {
  includeMods?: boolean;
  includeDatapacks?: boolean;
  includeResourcePacks?: boolean;
  includeShaderPacks?: boolean;
  includeOverrides?: boolean;
  excludedFilePaths?: string[];
}

export interface MrPackProgressPayload {
  current: number;
  total: number;
  percent: number;
  filename: string;
  title: string;
  iconUrl?: string;
  fileSize?: number;
  stage: 'downloading' | 'uploading' | 'override' | 'complete' | 'error';
  targetDir: string;
  message: string;
}

export interface MrPackInstallResult {
  modpackName: string;
  mcVersion: string;
  loader: ServerLoader;
  totalModsInPack: number;
  installedMods: string[];
  skippedClientMods: string[];
  installedOverrides: string[];
  failedFiles: Array<{ path: string; error: string }>;
}

export class MrPackAdapter {
  /**
   * Parses an in-memory .mrpack (zip) buffer to extract modrinth.index.json and override files
   */
  public async parseMrPack(buffer: Buffer): Promise<MrPackParsed> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return reject(err || new Error('Failed to open .mrpack zip archive'));

        let indexData: MrPackIndex | null = null;
        const overrides: MrPackOverrideFile[] = [];

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const entryName = entry.fileName;

          // Check if this is modrinth.index.json
          if (entryName === 'modrinth.index.json') {
            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) return reject(streamErr || new Error('Cannot read modrinth.index.json'));

              const chunks: Buffer[] = [];
              readStream.on('data', (c) => chunks.push(c));
              readStream.on('end', () => {
                try {
                  const raw = Buffer.concat(chunks).toString('utf-8');
                  indexData = JSON.parse(raw);
                  zipfile.readEntry();
                } catch (jsonErr) {
                  reject(new Error(`Failed to parse modrinth.index.json: ${(jsonErr as Error).message}`));
                }
              });
              readStream.on('error', reject);
            });
          }
          // Check for overrides / server-overrides files
          else if (!entryName.endsWith('/') && (entryName.startsWith('overrides/') || entryName.startsWith('server-overrides/'))) {
            const cleanRelPath = entryName.startsWith('server-overrides/')
              ? entryName.replace(/^server-overrides\//, '')
              : entryName.replace(/^overrides\//, '');

            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) return reject(streamErr || new Error(`Cannot read override: ${entryName}`));

              const chunks: Buffer[] = [];
              readStream.on('data', (c) => chunks.push(c));
              readStream.on('end', () => {
                overrides.push({
                  path: cleanRelPath,
                  buffer: Buffer.concat(chunks),
                });
                zipfile.readEntry();
              });
              readStream.on('error', reject);
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          if (!indexData) {
            return reject(new Error('Invalid .mrpack: missing modrinth.index.json'));
          }
          resolve({
            index: indexData,
            overrides,
          });
        });

        zipfile.on('error', reject);
      });
    });
  }

  /**
   * Enriches parsed .mrpack files with rich metadata from Modrinth API
   */
  public async previewMrPack(buffer: Buffer): Promise<MrPackPreviewResult> {
    const parsed = await this.parseMrPack(buffer);
    const { index, overrides } = parsed;

    // Detect Loader
    let loader: ServerLoader = 'fabric';
    const deps = index.dependencies || {};
    if (deps['neoforge']) loader = 'neoforge';
    else if (deps['forge']) loader = 'forge';
    else if (deps['quilt-loader']) loader = 'quilt';
    else if (deps['fabric-loader']) loader = 'fabric';
    else if (deps['paper']) loader = 'paper';
    else if (deps['spigot']) loader = 'spigot';
    else if (deps['purpur']) loader = 'purpur';

    const mcVersion = deps['minecraft'] || '1.21.1';
    const allFiles = index.files || [];

    // Extract project IDs from download URLs
    const projectIdMap = new Map<string, string>();
    for (const f of allFiles) {
      if (f.downloads && f.downloads.length > 0) {
        const url = f.downloads[0];
        const match = url.match(/\/data\/([a-zA-Z0-9_-]+)\/versions\//);
        if (match && match[1]) {
          projectIdMap.set(f.path, match[1]);
        }
      }
    }

    // Batch query Modrinth projects
    const uniqueProjectIds = Array.from(new Set(Array.from(projectIdMap.values())));
    const projectDetailsMap = new Map<string, any>();

    for (let i = 0; i < uniqueProjectIds.length; i += 50) {
      const chunk = uniqueProjectIds.slice(i, i + 50);
      try {
        const idsParam = JSON.stringify(chunk);
        const res = await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(idsParam)}`, {
          headers: { 'User-Agent': 'Warden-Server/1.0 (Modrinth-MRPACK-Importer)' },
        });
        if (res.ok) {
          const list: any = await res.json();
          if (Array.isArray(list)) {
            for (const p of list) {
              projectDetailsMap.set(p.id, p);
              if (p.slug) projectDetailsMap.set(p.slug, p);
            }
          }
        }
      } catch (err: any) {
        console.warn('[MrPack] Error fetching batch Modrinth projects:', err.message);
      }
    }

    let modsCount = 0;
    let datapacksCount = 0;
    let resourcePacksCount = 0;
    let shaderPacksCount = 0;

    const modsList: MrPackModItem[] = [];

    for (const f of allFiles) {
      const filename = path.basename(f.path);
      const isServerUnsupported = f.env?.server === 'unsupported';
      const isClientOnly = isServerUnsupported;
      const isServerSupported = !isServerUnsupported;

      let category: MrPackModItem['category'] = 'mods';
      if (f.path.startsWith('resourcepacks/')) {
        category = 'resourcepacks';
        resourcePacksCount++;
      } else if (f.path.startsWith('shaderpacks/')) {
        category = 'shaderpacks';
        shaderPacksCount++;
      } else if (f.path.startsWith('datapacks/') || f.path.includes('/datapacks/')) {
        category = 'datapacks';
        datapacksCount++;
      } else {
        category = 'mods';
        modsCount++;
      }

      const pId = projectIdMap.get(f.path);
      const details = pId ? projectDetailsMap.get(pId) : null;

      const fallbackTitle = filename
        .replace(/\.(jar|zip)$/i, '')
        .replace(/[-_](fabric|forge|neoforge|quilt|mc[0-9.]+).*$/i, '')
        .replace(/[-_][0-9.]+.*$/i, '')
        .replace(/[-_]/g, ' ');

      modsList.push({
        id: f.path,
        projectId: pId,
        path: f.path,
        filename,
        title: details?.title || fallbackTitle.toUpperCase(),
        description: details?.description || (isClientOnly ? 'Client-side optimization / visuals' : 'Server / Gameplay modification'),
        iconUrl: details?.icon_url || undefined,
        downloads: details?.downloads || undefined,
        fileSize: f.fileSize,
        category,
        isServerSupported,
        isClientOnly,
        isDefaultSelected: isServerSupported,
      });
    }

    return {
      name: index.name || 'Modrinth Modpack',
      summary: index.summary || '',
      versionId: index.versionId || '',
      mcVersion,
      loader,
      totalFiles: allFiles.length,
      modsCount,
      datapacksCount,
      resourcePacksCount,
      shaderPacksCount,
      overridesCount: overrides.length,
      modsList,
    };
  }

  /**
   * Downloads a single file from Modrinth CDN with hash validation, timeout, and retry
   */
  public async downloadFile(url: string, hashes?: { sha1?: string; sha512?: string }, retries: number = 2): Promise<Buffer> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Warden-Server/1.0 (Modrinth-MRPACK-Importer)',
          },
          signal: controller.signal as any,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 429 && attempt < retries) {
            // Rate limit backoff
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`HTTP ${res.status} downloading ${url}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (hashes?.sha1) {
          const computedSha1 = crypto.createHash('sha1').update(buffer).digest('hex');
          if (computedSha1.toLowerCase() !== hashes.sha1.toLowerCase()) {
            console.warn(`[MrPack] Warning: SHA1 mismatch for ${url}. Expected ${hashes.sha1}, got ${computedSha1}`);
          }
        }

        return buffer;
      } catch (err: any) {
        clearTimeout(timeout);
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Failed to download ${url} after ${retries + 1} attempts`);
  }

  /**
   * Installs selected components from an .mrpack file to a Crafty Minecraft server with granular progress
   */
  public async installMrPack(
    serverId: string,
    buffer: Buffer,
    options: MrPackInstallOptions = {},
    onProgress?: (progress: MrPackProgressPayload) => void
  ): Promise<MrPackInstallResult> {
    const {
      includeMods = true,
      includeDatapacks = true,
      includeResourcePacks = false,
      includeShaderPacks = false,
      includeOverrides = true,
      excludedFilePaths = [],
    } = options;

    const excludedSet = new Set(excludedFilePaths);
    const parsed = await this.parseMrPack(buffer);
    const { index, overrides } = parsed;

    // Detect Loader
    let loader: ServerLoader = 'fabric';
    const deps = index.dependencies || {};
    if (deps['neoforge']) loader = 'neoforge';
    else if (deps['forge']) loader = 'forge';
    else if (deps['quilt-loader']) loader = 'quilt';
    else if (deps['fabric-loader']) loader = 'fabric';
    else if (deps['paper']) loader = 'paper';
    else if (deps['spigot']) loader = 'spigot';
    else if (deps['purpur']) loader = 'purpur';

    const mcVersion = deps['minecraft'] || '1.21.1';

    // Pre-create standard Minecraft server directories natively
    const srvDir = serverManager.getServerDir(serverId);
    await fs.promises.mkdir(path.join(srvDir, 'mods'), { recursive: true }).catch(() => {});
    if (includeDatapacks) {
      await fs.promises.mkdir(path.join(srvDir, 'world', 'datapacks'), { recursive: true }).catch(() => {});
      await fs.promises.mkdir(path.join(srvDir, 'datapacks'), { recursive: true }).catch(() => {});
    }
    if (includeResourcePacks) {
      await fs.promises.mkdir(path.join(srvDir, 'resourcepacks'), { recursive: true }).catch(() => {});
    }
    if (includeShaderPacks) {
      await fs.promises.mkdir(path.join(srvDir, 'shaderpacks'), { recursive: true }).catch(() => {});
    }

    // Filter eligible files based on user category checkboxes and excluded mod list
    const allFiles = index.files || [];
    const filesToInstall: Array<{ file: MrPackIndexFile; targetDir: string; filename: string }> = [];
    const skippedClientMods: string[] = [];

    for (const f of allFiles) {
      if (excludedSet.has(f.path) || excludedSet.has(path.basename(f.path))) {
        continue;
      }

      const isServerUnsupported = f.env?.server === 'unsupported';
      if (isServerUnsupported) {
        skippedClientMods.push(f.path);
        continue;
      }

      const filename = path.basename(f.path);

      if (f.path.startsWith('resourcepacks/')) {
        if (!includeResourcePacks) continue;
        filesToInstall.push({ file: f, targetDir: 'resourcepacks', filename });
      } else if (f.path.startsWith('shaderpacks/')) {
        if (!includeShaderPacks) continue;
        filesToInstall.push({ file: f, targetDir: 'shaderpacks', filename });
      } else if (f.path.startsWith('datapacks/') || f.path.includes('/datapacks/')) {
        if (!includeDatapacks) continue;
        filesToInstall.push({ file: f, targetDir: 'world/datapacks', filename });
      } else {
        if (!includeMods) continue;
        const isPluginLoader = ['paper', 'spigot', 'bukkit', 'purpur'].includes(loader.toLowerCase());
        const modFolder = isPluginLoader ? 'plugins' : 'mods';
        filesToInstall.push({ file: f, targetDir: modFolder, filename });
      }
    }

    const overridesToInstall = includeOverrides
      ? overrides.filter((o) => !excludedSet.has(o.path) && !excludedSet.has(path.basename(o.path)))
      : [];

    const totalSteps = filesToInstall.length + overridesToInstall.length;
    let completedSteps = 0;

    const installedMods: string[] = [];
    const installedOverrides: string[] = [];
    const failedFiles: Array<{ path: string; error: string }> = [];
    // Extract project IDs from download URLs for rich progress display
    const projectIdMap = new Map<string, string>();
    for (const f of allFiles) {
      if (f.downloads && f.downloads.length > 0) {
        const url = f.downloads[0];
        const match = url.match(/\/data\/([a-zA-Z0-9_-]+)\/versions\//);
        if (match && match[1]) {
          projectIdMap.set(f.path, match[1]);
        }
      }
    }

    const uniqueProjectIds = Array.from(new Set(Array.from(projectIdMap.values())));
    const projectDetailsMap = new Map<string, any>();

    for (let i = 0; i < uniqueProjectIds.length; i += 50) {
      const chunk = uniqueProjectIds.slice(i, i + 50);
      try {
        const idsParam = JSON.stringify(chunk);
        const res = await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(idsParam)}`, {
          headers: { 'User-Agent': 'Warden-Server/1.0 (Modrinth-MRPACK-Importer)' },
        });
        if (res.ok) {
          const list: any = await res.json();
          if (Array.isArray(list)) {
            for (const p of list) {
              projectDetailsMap.set(p.id, p);
              if (p.slug) projectDetailsMap.set(p.slug, p);
            }
          }
        }
      } catch {}
    }

    // 1. Download & Upload Filtered Mod Files with rich progress reporting
    for (const item of filesToInstall) {
      const { file, targetDir, filename } = item;

      // Extract friendly project name & icon
      const pId = projectIdMap.get(file.path);
      const details = pId ? projectDetailsMap.get(pId) : null;

      const fallbackTitle = filename
        .replace(/\.(jar|zip)$/i, '')
        .replace(/[-_](fabric|forge|neoforge|quilt|mc[0-9.]+).*$/i, '')
        .replace(/[-_][0-9.]+.*$/i, '')
        .replace(/[-_]/g, ' ');

      const modTitle = details?.title || fallbackTitle.toUpperCase();
      const modIconUrl = details?.icon_url || undefined;

      try {
        if (!file.downloads || file.downloads.length === 0) {
          throw new Error('No download URL available in mrpack index');
        }

        const downloadUrl = file.downloads[0];
        const stepNum = completedSteps + 1;
        const percent = Math.round((stepNum / totalSteps) * 100);

        if (onProgress) {
          onProgress({
            current: stepNum,
            total: totalSteps,
            percent,
            filename,
            title: modTitle,
            iconUrl: modIconUrl,
            fileSize: file.fileSize,
            stage: 'downloading',
            targetDir,
            message: `Downloading ${modTitle} (${stepNum} of ${totalSteps})...`,
          });
        }

        let fileBuffer: Buffer | null = null;
        let lastDownloadErr = '';
        for (const dlUrl of file.downloads) {
          try {
            fileBuffer = await this.downloadFile(dlUrl, file.hashes);
            if (fileBuffer) break;
          } catch (e: any) {
            lastDownloadErr = e.message;
          }
        }

        if (!fileBuffer) {
          throw new Error(lastDownloadErr || 'Download failed');
        }

        if (onProgress) {
          onProgress({
            current: stepNum,
            total: totalSteps,
            percent,
            filename,
            title: modTitle,
            iconUrl: modIconUrl,
            fileSize: file.fileSize,
            stage: 'uploading',
            targetDir,
            message: `Deploying ${filename} to ${targetDir}/ (${stepNum} of ${totalSteps})...`,
          });
        }

        const srvDir = serverManager.getServerDir(serverId);
        const destinationDir = path.join(srvDir, targetDir);
        await fs.promises.mkdir(destinationDir, { recursive: true });
        await fs.promises.writeFile(path.join(destinationDir, filename), fileBuffer);

        if (targetDir === 'world/datapacks') {
          const altDatapacksDir = path.join(srvDir, 'datapacks');
          await fs.promises.mkdir(altDatapacksDir, { recursive: true });
          await fs.promises.writeFile(path.join(altDatapacksDir, filename), fileBuffer).catch(() => {});
        }

        installedMods.push(filename);
        await new Promise((r) => setTimeout(r, 10));
      } catch (err: any) {
        console.error(`[MrPack] Failed to install ${file.path}:`, err.message);
        failedFiles.push({ path: file.path, error: err.message });
        if (onProgress) {
          onProgress({
            current: completedSteps + 1,
            total: totalSteps,
            percent: Math.round(((completedSteps + 1) / totalSteps) * 100),
            filename,
            title: modTitle,
            iconUrl: modIconUrl,
            stage: 'error',
            targetDir,
            message: `⚠️ Skipped ${filename}: ${err.message}`,
          });
        }
      }

      completedSteps++;
    }

    // 2. Upload Overrides with rich progress reporting
    for (const override of overridesToInstall) {
      const filename = path.basename(override.path);
      const targetDir = path.dirname(override.path) === '.' ? '' : path.dirname(override.path);
      const stepNum = completedSteps + 1;
      const percent = Math.round((stepNum / totalSteps) * 100);

      try {
        if (onProgress) {
          onProgress({
            current: stepNum,
            total: totalSteps,
            percent,
            filename,
            title: override.path,
            fileSize: override.buffer.length,
            stage: 'override',
            targetDir: targetDir || 'root',
            message: `Installing config override ${override.path} (${stepNum} of ${totalSteps})...`,
          });
        }

        const srvDir = serverManager.getServerDir(serverId);
        const destinationDir = targetDir ? path.join(srvDir, targetDir) : srvDir;
        await fs.promises.mkdir(destinationDir, { recursive: true });
        await fs.promises.writeFile(path.join(destinationDir, filename), override.buffer);

        installedOverrides.push(override.path);
      } catch (err: any) {
        console.error(`[MrPack] Failed to install override ${override.path}:`, err.message);
        failedFiles.push({ path: override.path, error: err.message });
      }

      completedSteps++;
    }

    // 3. Update Server Detection State with Modpack Metadata
    db.setServerDetection(serverId, {
      loader,
      mcVersion,
      isConfirmed: true,
      source: 'manual_override',
      detectedAt: new Date().toISOString(),
    });

    // 4. Log to Audit History
    db.addJobLog({
      id: `job-mrpack-${Date.now()}`,
      timestamp: new Date().toISOString(),
      serverId,
      serverName: `Server ${serverId}`,
      trigger: 'manual',
      status: failedFiles.length === 0 || installedMods.length > 0 ? 'success' : 'failed',
      modsUpdated: installedMods.length,
      summary: `Imported ${installedMods.length} files and ${installedOverrides.length} overrides from ${index.name || 'modpack'}`,
      steps: [
        {
          timestamp: new Date().toISOString(),
          step: 'mrpack_parse',
          level: 'info',
          message: `Parsed .mrpack index for ${index.name || 'Modpack'} (${mcVersion}, ${loader})`,
        },
        ...installedMods.map((m) => ({
          timestamp: new Date().toISOString(),
          step: 'mod_install',
          level: 'success' as const,
          message: `Installed file: ${m}`,
        })),
        ...failedFiles.map((f) => ({
          timestamp: new Date().toISOString(),
          step: 'mod_error',
          level: 'error' as const,
          message: `Failed to install ${f.path}: ${f.error}`,
        })),
      ],
    });

    if (installedMods.length === 0 && filesToInstall.length > 0) {
      const firstErr = failedFiles[0]?.error || 'Target directory does not exist or upload was rejected by Crafty';
      throw new Error(`Failed to install mods: ${firstErr}. If this is a Vanilla server, please switch your server jar to Fabric/Forge in Crafty first.`);
    }

    if (onProgress) {
      onProgress({
        current: totalSteps,
        total: totalSteps,
        percent: 100,
        filename: 'Done',
        title: 'Complete',
        stage: 'complete',
        targetDir: 'mods/',
        message: `Successfully installed ${installedMods.length} files!`,
      });
    }

    return {
      modpackName: index.name || 'Unnamed Modpack',
      mcVersion,
      loader,
      totalModsInPack: allFiles.length,
      installedMods,
      skippedClientMods,
      installedOverrides,
      failedFiles,
    };
  }
}

export const mrPackAdapter = new MrPackAdapter();
