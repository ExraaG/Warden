import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ServerProcess } from './serverProcess.js';
import { ServerInstaller } from './serverInstaller.js';
import { db } from '../db/storage.js';
import { config } from '../config.js';
import { modrinthAdapter } from '../adapters/modrinth.js';
import {
  WardenServer,
  ServerStats,
  ServerProperties,
  InstalledMod,
  CreateServerPayload,
  ServerLoader,
} from '@warden/shared';

export interface ServerMeta {
  id: string;
  name: string;
  jarFile: string;
  loader: ServerLoader;
  mcVersion: string;
  minMemory?: string;
  maxMemory?: string;
  javaPath?: string;
  createdAt: string;
  updatedAt: string;
}

export class ServerManager {
  private processes = new Map<string, ServerProcess>();
  private readonly serversDir: string;

  constructor() {
    this.serversDir = path.join(config.dataDir, 'servers');
    if (!fs.existsSync(this.serversDir)) {
      fs.mkdirSync(this.serversDir, { recursive: true });
    }
  }

  /**
   * Resolve the correct Java binary path for a given Minecraft version.
   * MC 26.x snapshots require Java 25, MC 1.20.5+ requires Java 21, older versions use Java 17.
   */
  private resolveJavaPath(mcVersion?: string): string {
    if (!mcVersion) return 'java';

    // MC 26.x snapshots (class file version 69 = Java 25)
    if (/^26\b/.test(mcVersion)) {
      const java25 = '/usr/lib/jvm/java-25-openjdk/bin/java';
      if (fs.existsSync(java25)) return java25;
    }

    // MC 1.20.5+ requires Java 21
    if (/^1\.2[1-9]/.test(mcVersion) || /^1\.20\.([5-9]|[1-9]\d)/.test(mcVersion)) {
      const java21 = '/usr/lib/jvm/java-21-openjdk/bin/java';
      if (fs.existsSync(java21)) return java21;
    }

    // MC 1.16.5–1.20.4 uses Java 17
    const java17 = '/usr/lib/jvm/java-17-openjdk/bin/java';
    if (fs.existsSync(java17)) return java17;

    // Fallback to system default
    return 'java';
  }

  public getServersDir(): string {
    return this.serversDir;
  }

  public getServerDir(serverId: string): string {
    return path.join(this.serversDir, serverId);
  }

  // 1. Discover and list all Minecraft servers
  public async getServers(): Promise<WardenServer[]> {
    const folders = await fs.promises.readdir(this.serversDir, { withFileTypes: true });
    const serverList: WardenServer[] = [];

    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      const serverId = folder.name;
      const s = await this.getServer(serverId);
      if (s) {
        serverList.push(s);
      }
    }

    return serverList;
  }

  // 2. Get Single Server with live status and stats
  public async getServer(serverId: string): Promise<WardenServer | null> {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) {
      return null;
    }

    const savedDetection = db.getServerDetection(serverId);
    const proc = this.processes.get(serverId);
    const status = proc ? proc.getStatus() : 'offline';
    const stats = proc ? proc.getStats() : {
      cpuPercent: 0,
      memoryBytes: 0,
      maxMemoryBytes: 0,
      onlinePlayers: 0,
      maxPlayers: 20,
      uptimeSeconds: 0,
    };

    // Determine server name & metadata from warden.json or server.properties
    let name = serverId;
    const metaPath = path.join(dir, 'warden.json');
    let savedMeta: any = null;
    if (fs.existsSync(metaPath)) {
      try {
        savedMeta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        if (savedMeta.name) name = savedMeta.name;
      } catch {}
    }

    if (!savedMeta) {
      const props = await this.getServerProperties(serverId);
      if (props['motd']) {
        name = props['motd']
          .replace(/\\u00a7[0-9a-fk-or]/gi, '')
          .replace(/§[0-9a-fk-or]/gi, '')
          .split('|')[0]?.trim() || serverId;
      }
    }

    // Detect server jar if not explicitly saved
    let jarName = savedMeta?.jarFile || 'server.jar';
    const files = await fs.promises.readdir(dir).catch(() => []);
    const foundJar = files.find(f => f.endsWith('.jar') && !f.startsWith('installer'));
    if (foundJar) jarName = foundJar;

    let detectedLoader: ServerLoader = savedMeta?.loader || 'vanilla';
    if (!savedMeta) {
      if (jarName.includes('fabric')) detectedLoader = 'fabric';
      else if (jarName.includes('paper')) detectedLoader = 'paper';
      else if (jarName.includes('purpur')) detectedLoader = 'purpur';
      else if (jarName.includes('quilt')) detectedLoader = 'quilt';
      else if (jarName.includes('forge') || jarName.includes('neoforge')) detectedLoader = 'forge';
    }

    const detection = savedDetection || {
      loader: detectedLoader,
      mcVersion: savedMeta?.mcVersion || '1.21.1',
      isConfirmed: true,
      source: 'executable_filename',
      detectedAt: new Date().toISOString(),
    };

    const statInfo = await fs.promises.stat(dir).catch(() => null);

    return {
      id: serverId,
      craftyServerId: serverId,
      name,
      status,
      detection,
      stats,
      createdAt: statInfo?.birthtime?.toISOString() || new Date().toISOString(),
      updatedAt: statInfo?.mtime?.toISOString() || new Date().toISOString(),
    };
  }

  // 3. Create a new server
  public async createServer(payload: CreateServerPayload): Promise<WardenServer> {
    const serverId = `server-${Date.now()}`;
    const targetDir = this.getServerDir(serverId);

    const installResult = await ServerInstaller.installServer(targetDir, payload);

    // Save persistent metadata
    const meta = {
      id: serverId,
      name: payload.name,
      loader: installResult.loader,
      mcVersion: installResult.mcVersion,
      jarFile: installResult.jarFileName,
      port: payload.port || 25565,
      minMemory: payload.minMemory || '2G',
      maxMemory: payload.maxMemory || '4G',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(path.join(targetDir, 'warden.json'), JSON.stringify(meta, null, 2), 'utf8');

    // Save initial detection state
    db.setServerDetection(serverId, {
      loader: installResult.loader,
      mcVersion: installResult.mcVersion,
      isConfirmed: true,
      source: 'manual_override',
      detectedAt: new Date().toISOString(),
    });

    if (payload.autoStart) {
      await this.startServer(serverId, {
        minMemory: payload.minMemory || '2G',
        maxMemory: payload.maxMemory || '4G',
        jarFile: installResult.jarFileName,
      });
    }

    const created = await this.getServer(serverId);
    if (!created) throw new Error('Failed to retrieve newly created server');
    return created;
  }

  // 4. Server Process Lifecycle Controls
  public async startServer(
    serverId: string,
    options?: { minMemory?: string; maxMemory?: string; jarFile?: string }
  ): Promise<void> {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Server directory ${serverId} does not exist`);
    }

    let minMemory = options?.minMemory;
    let maxMemory = options?.maxMemory;
    let jarName = options?.jarFile;
    let mcVersion: string | undefined;

    const metaPath = path.join(dir, 'warden.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        if (!minMemory && meta.minMemory) minMemory = meta.minMemory;
        if (!maxMemory && meta.maxMemory) maxMemory = meta.maxMemory;
        if (!jarName && meta.jarFile) jarName = meta.jarFile;
        if (meta.mcVersion) mcVersion = meta.mcVersion;
      } catch {}
    }

    // Also check stored detection for mcVersion
    if (!mcVersion) {
      const detection = db.getServerDetection(serverId);
      if (detection?.mcVersion) mcVersion = detection.mcVersion;
    }

    const javaPath = this.resolveJavaPath(mcVersion);

    let proc = this.processes.get(serverId);
    if (!proc) {
      if (!jarName) {
        const files = await fs.promises.readdir(dir).catch(() => []);
        const foundJar = files.find(f => f.endsWith('.jar') && !f.startsWith('installer'));
        jarName = foundJar || 'server.jar';
      }

      proc = new ServerProcess({
        serverId,
        serverDir: dir,
        jarFile: jarName,
        javaPath,
        minMemory: minMemory || '2G',
        maxMemory: maxMemory || '4G',
      });
      this.processes.set(serverId, proc);
    }

    await proc.start();
  }

  public async stopServer(serverId: string): Promise<void> {
    const proc = this.processes.get(serverId);
    if (proc) {
      await proc.stop();
    }
  }

  public async restartServer(serverId: string): Promise<void> {
    const proc = this.processes.get(serverId);
    if (proc) {
      await proc.restart();
    } else {
      await this.startServer(serverId);
    }
  }

  public killServer(serverId: string): void {
    const proc = this.processes.get(serverId);
    if (proc) {
      proc.kill();
    }
  }

  public async deleteServer(serverId: string): Promise<void> {
    const proc = this.processes.get(serverId);
    if (proc) {
      try {
        proc.kill();
      } catch {}
      this.processes.delete(serverId);
    }

    const dir = this.getServerDir(serverId);
    if (fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }

    // Clean up stored detection
    db.removeServerDetection(serverId);
  }

  public async changeLoader(
    serverId: string,
    loader: ServerLoader,
    mcVersion: string,
    name?: string
  ): Promise<WardenServer> {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Server directory ${serverId} does not exist`);
    }

    // Stop process if currently running
    const proc = this.processes.get(serverId);
    if (proc && proc.getStatus() !== 'offline') {
      await proc.stop();
    }
    this.processes.delete(serverId);

    // Read existing meta
    let currentMeta: any = {};
    const metaPath = path.join(dir, 'warden.json');
    if (fs.existsSync(metaPath)) {
      try {
        currentMeta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
      } catch {}
    }

    // Preserve existing clean server name
    let preservedName = name || currentMeta.name;
    if (!preservedName || preservedName === serverId) {
      const currentServer = await this.getServer(serverId);
      if (currentServer && currentServer.name && currentServer.name !== serverId) {
        preservedName = currentServer.name;
      }
    }
    if (!preservedName) preservedName = serverId;

    // Install new server JAR
    const installPayload: CreateServerPayload = {
      name: preservedName,
      loader,
      mcVersion,
      port: currentMeta.port || 25565,
      minMemory: currentMeta.minMemory || '2G',
      maxMemory: currentMeta.maxMemory || '4G',
    };

    const installResult = await ServerInstaller.installServer(dir, installPayload);

    // Update warden.json
    const updatedMeta = {
      ...currentMeta,
      id: serverId,
      name: preservedName,
      loader: installResult.loader,
      mcVersion: installResult.mcVersion,
      jarFile: installResult.jarFileName,
      port: installPayload.port,
      minMemory: installPayload.minMemory,
      maxMemory: installPayload.maxMemory,
      updatedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), 'utf8');

    // Update detection
    db.setServerDetection(serverId, {
      loader: installResult.loader,
      mcVersion: installResult.mcVersion,
      isConfirmed: true,
      source: 'manual_override',
      detectedAt: new Date().toISOString(),
    });

    const updated = await this.getServer(serverId);
    if (!updated) throw new Error('Failed to retrieve server after loader switch');
    return updated;
  }

  public sendCommand(serverId: string, command: string): boolean {
    const proc = this.processes.get(serverId);
    if (proc) {
      return proc.sendCommand(command);
    }
    return false;
  }

  public getLogs(serverId: string): string[] {
    const proc = this.processes.get(serverId);
    return proc ? proc.getLogs() : [];
  }

  public getServerProcess(serverId: string): ServerProcess | undefined {
    return this.processes.get(serverId);
  }

  public getServerStats(serverId: string): ServerStats {
    const proc = this.processes.get(serverId);
    return proc ? proc.getStats() : {
      cpuPercent: 0,
      memoryBytes: 0,
      maxMemoryBytes: 0,
      onlinePlayers: 0,
      maxPlayers: 20,
      uptimeSeconds: 0,
    };
  }

  // 5. Native Filesystem Operations
  public async listFiles(serverId: string, subPath: string = ''): Promise<any[]> {
    const rootDir = this.getServerDir(serverId);
    const targetDir = path.normalize(path.join(rootDir, subPath));

    if (!targetDir.startsWith(rootDir)) {
      throw new Error('Access denied: Path traversal attempted.');
    }

    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const stat = await fs.promises.stat(targetDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return [];
    }

    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(targetDir, entry.name);
        const stats = await fs.promises.stat(fullPath).catch(() => null);
        const isDirectory = entry.isDirectory();
        return {
          name: entry.name,
          path: path.relative(rootDir, fullPath),
          is_dir: isDirectory,
          isDir: isDirectory,
          size: isDirectory ? 0 : (stats?.size || 0),
          modified: stats?.mtime?.toISOString() || new Date().toISOString(),
        };
      })
    );
  }

  public async readFile(serverId: string, filePath: string): Promise<string> {
    const rootDir = this.getServerDir(serverId);
    const fullPath = path.normalize(path.join(rootDir, filePath));

    if (!fullPath.startsWith(rootDir)) {
      throw new Error('Access denied: Path traversal attempted.');
    }

    return fs.promises.readFile(fullPath, 'utf8');
  }

  public async writeFile(serverId: string, filePath: string, content: string): Promise<void> {
    const rootDir = this.getServerDir(serverId);
    const fullPath = path.normalize(path.join(rootDir, filePath));

    if (!fullPath.startsWith(rootDir)) {
      throw new Error('Access denied: Path traversal attempted.');
    }

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf8');
  }

  public async deleteFile(serverId: string, filePath: string): Promise<void> {
    const rootDir = this.getServerDir(serverId);
    const fullPath = path.normalize(path.join(rootDir, filePath));

    if (!fullPath.startsWith(rootDir)) {
      throw new Error('Access denied: Path traversal attempted.');
    }

    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(fullPath);
    }
  }

  // 6. Server Properties Read/Write
  public async getServerProperties(serverId: string): Promise<ServerProperties> {
    const propsPath = path.join(this.getServerDir(serverId), 'server.properties');
    if (!fs.existsSync(propsPath)) {
      return {};
    }

    const content = await fs.promises.readFile(propsPath, 'utf8');
    const result: ServerProperties = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        result[key] = value;
      }
    }

    return result;
  }

  public async saveServerProperties(serverId: string, properties: Partial<ServerProperties>): Promise<void> {
    const propsPath = path.join(this.getServerDir(serverId), 'server.properties');
    const current = await this.getServerProperties(serverId);
    const merged = { ...current, ...properties };

    const lines: string[] = ['# Minecraft server properties updated by Warden'];
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined) {
        lines.push(`${key}=${value}`);
      }
    }

    await fs.promises.writeFile(propsPath, `${lines.join('\n')}\n`, 'utf8');
  }

  // 7. Mod Management & SHA-512 scanning
  public async getInstalledMods(serverId: string): Promise<InstalledMod[]> {
    const modsDir = path.join(this.getServerDir(serverId), 'mods');
    if (!fs.existsSync(modsDir)) {
      return [];
    }

    const files = await fs.promises.readdir(modsDir);
    const jarFiles = files.filter(f => f.endsWith('.jar') && !f.endsWith('.disabled'));
    const installedMods: InstalledMod[] = [];
    const shaToModMap = new Map<string, { filename: string; size: number; mtime: string }>();

    for (const filename of jarFiles) {
      const fullPath = path.join(modsDir, filename);
      const stat = await fs.promises.stat(fullPath);
      const buffer = await fs.promises.readFile(fullPath);
      const sha512 = crypto.createHash('sha512').update(buffer).digest('hex');

      shaToModMap.set(sha512, {
        filename,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }

    if (shaToModMap.size === 0) {
      return [];
    }

    const hashes = Array.from(shaToModMap.keys());
    const versionMap = await modrinthAdapter.getVersionFiles(hashes);

    const projectIds = Array.from(
      new Set(
        Object.values(versionMap)
          .map((v: any) => v?.project_id)
          .filter(Boolean)
      )
    );
    const projectMap = await modrinthAdapter.getProjects(projectIds);

    const s = await this.getServer(serverId);
    const loader = s?.detection.loader || 'fabric';
    const mcVersion = s?.detection.mcVersion || '1.21.1';

    const updatesMap = await modrinthAdapter.checkVersionUpdates(hashes, [loader], [mcVersion]);

    for (const [sha512, modInfo] of Array.from(shaToModMap.entries())) {
      const versionData = versionMap[sha512];
      const projectId = versionData?.project_id;
      const project = projectId ? projectMap[projectId] : null;
      const updateData = updatesMap[sha512];

      installedMods.push({
        filename: modInfo.filename,
        size: modInfo.size,
        sha512,
        projectId,
        projectSlug: project?.slug,
        title: project?.title || modInfo.filename.replace(/\.jar$/i, ''),
        iconUrl: project?.icon_url || undefined,
        currentVersion: versionData?.versionNumber || versionData?.version_number,
        latestVersion: updateData?.versionNumber,
        hasUpdate: Boolean(updateData && updateData.id !== versionData?.id),
        updateVersionId: updateData?.id,
        updateDownloadUrl: updateData?.downloadUrl,
        modifiedAt: modInfo.mtime,
      });
    }

    return installedMods;
  }
}

export const serverManager = new ServerManager();
