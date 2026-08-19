import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
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
  ServerAccessPolicy,
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
   * Dynamically scans /usr/lib/jvm/ for available installations.
   * MC 26.x snapshots require Java 25+, MC 1.20.5+ requires Java 21+, older versions use Java 17+.
   * If version is unknown, defaults to the HIGHEST available Java runtime.
   */
  private resolveJavaPath(mcVersion?: string): string {
    // 1. Check explicit environment variables
    if (mcVersion && (/^26(\b|\.)/i.test(mcVersion) || /mc\.26/i.test(mcVersion))) {
      if (process.env.JAVA_26_PATH && fs.existsSync(process.env.JAVA_26_PATH)) return process.env.JAVA_26_PATH;
      if (process.env.JAVA_25_PATH && fs.existsSync(process.env.JAVA_25_PATH)) return process.env.JAVA_25_PATH;
    }
    if (mcVersion && (/^1\.2[1-9]/.test(mcVersion) || /^1\.20\.([5-9]|[1-9]\d)/.test(mcVersion))) {
      if (process.env.JAVA_21_PATH && fs.existsSync(process.env.JAVA_21_PATH)) return process.env.JAVA_21_PATH;
    }
    if (mcVersion && /^1\.(1[6-9]|20\.[0-4]\b)/.test(mcVersion)) {
      if (process.env.JAVA_17_PATH && fs.existsSync(process.env.JAVA_17_PATH)) return process.env.JAVA_17_PATH;
    }

    // Discover all available Java installations by scanning standard JVM locations
    const searchDirs = [
      path.join(config.dataDir, 'java'),
      '/data/java',
      '/usr/lib/jvm',
      '/usr/lib64/jvm',
      '/usr/java',
      '/opt/jvm',
    ];
    const availableJavas: { version: number; path: string }[] = [];

    for (const jvmDir of searchDirs) {
      try {
        if (fs.existsSync(jvmDir)) {
          const entries = fs.readdirSync(jvmDir);
          for (const entry of entries) {
            const match = entry.match(/(?:java|openjdk)[-_]?(\d+)/i);
            if (match) {
              const javaPath = path.join(jvmDir, entry, 'bin', 'java');
              if (fs.existsSync(javaPath)) {
                availableJavas.push({ version: parseInt(match[1], 10), path: javaPath });
              }
            }
          }
        }
      } catch {}
    }

    // Add env vars to available pool if present
    if (process.env.JAVA_26_PATH && fs.existsSync(process.env.JAVA_26_PATH)) availableJavas.push({ version: 26, path: process.env.JAVA_26_PATH });
    if (process.env.JAVA_25_PATH && fs.existsSync(process.env.JAVA_25_PATH)) availableJavas.push({ version: 25, path: process.env.JAVA_25_PATH });
    if (process.env.JAVA_21_PATH && fs.existsSync(process.env.JAVA_21_PATH)) availableJavas.push({ version: 21, path: process.env.JAVA_21_PATH });
    if (process.env.JAVA_17_PATH && fs.existsSync(process.env.JAVA_17_PATH)) availableJavas.push({ version: 17, path: process.env.JAVA_17_PATH });

    availableJavas.sort((a, b) => b.version - a.version); // Highest first

    // Helper: find the best Java >= minVersion
    const findJava = (minVersion: number): string | null => {
      const exact = availableJavas.find(j => j.version === minVersion);
      if (exact) return exact.path;
      const compatible = availableJavas.find(j => j.version >= minVersion);
      if (compatible) return compatible.path;
      return null;
    };

    // MC 26.x snapshots (class file version 69 = Java 25+)
    if (mcVersion && (/^26(\b|\.)/i.test(mcVersion) || /mc\.26/i.test(mcVersion))) {
      const found = findJava(25);
      if (found) {
        console.log(`[Warden] Resolved Java for MC ${mcVersion} (>=25): ${found}`);
        return found;
      }
    }

    // MC 1.20.5+ / 1.21+ requires Java 21+
    if (mcVersion && (/^1\.2[1-9]/.test(mcVersion) || /^1\.20\.([5-9]|[1-9]\d)/.test(mcVersion))) {
      const found = findJava(21);
      if (found) {
        console.log(`[Warden] Resolved Java for MC ${mcVersion} (>=21): ${found}`);
        return found;
      }
    }

    // MC 1.16.5–1.20.4 uses Java 17+
    if (mcVersion && /^1\.(1[6-9]|20\.[0-4]\b)/.test(mcVersion)) {
      const found = findJava(17);
      if (found) {
        console.log(`[Warden] Resolved Java for MC ${mcVersion} (>=17): ${found}`);
        return found;
      }
    }

    // Default / fallback: use the highest Java available or system default
    if (availableJavas.length > 0) {
      console.log(`[Warden] Defaulting to highest available Java (${availableJavas[0].version}): ${availableJavas[0].path}`);
      return availableJavas[0].path;
    }

    if (process.env.JAVA_PATH) return process.env.JAVA_PATH;

    console.log(`[Warden] No JVM found in /usr/lib/jvm, falling back to system 'java'`);
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
    const primaryAdmin = db.getUsers().find(u => u.role === 'admin')?.id || 'admin';
    const ownerId = savedMeta?.ownerId || primaryAdmin;
    const accessPolicy: ServerAccessPolicy = savedMeta?.accessPolicy || 'specific';
    const allowedUserIds: string[] = Array.isArray(savedMeta?.allowedUserIds) ? savedMeta.allowedUserIds : [];
    const excludedUserIds: string[] = Array.isArray(savedMeta?.excludedUserIds) ? savedMeta.excludedUserIds : [];

    return {
      id: serverId,
      craftyServerId: serverId,
      name,
      status,
      detection,
      stats,
      ownerId,
      accessPolicy,
      allowedUserIds,
      excludedUserIds,
      createdAt: statInfo?.birthtime?.toISOString() || new Date().toISOString(),
      updatedAt: statInfo?.mtime?.toISOString() || new Date().toISOString(),
    };
  }

  // 3. Create a new server
  public async createServer(payload: CreateServerPayload, ownerId?: string): Promise<WardenServer> {
    const serverId = `server-${Date.now()}`;
    const targetDir = this.getServerDir(serverId);

    const installResult = await ServerInstaller.installServer(targetDir, payload);
    const primaryAdmin = db.getUsers().find(u => u.role === 'admin')?.id || 'admin';
    const serverOwnerId = payload.ownerId || ownerId || primaryAdmin;

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
      ownerId: serverOwnerId,
      allowedUserIds: [],
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

    // Don't auto-start — frontend will handle EULA acceptance before first start
    // The user must accept the EULA via the UI popup, then click Start

    const created = await this.getServer(serverId);
    if (!created) throw new Error('Failed to retrieve newly created server');
    return created;
  }

  // 4. Server Process Lifecycle Controls
  public async startServer(
    serverId: string,
    options?: { minMemory?: string; maxMemory?: string; jarFile?: string; javaPath?: string }
  ): Promise<void> {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Server directory ${serverId} does not exist`);
    }

    let minMemory = options?.minMemory;
    let maxMemory = options?.maxMemory;
    let jarName = options?.jarFile;
    let userJavaPath = options?.javaPath;
    let mcVersion: string | undefined;

    const metaPath = path.join(dir, 'warden.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        if (!minMemory && meta.minMemory) minMemory = meta.minMemory;
        if (!maxMemory && meta.maxMemory) maxMemory = meta.maxMemory;
        if (!jarName && meta.jarFile) jarName = meta.jarFile;
        if (!userJavaPath && meta.javaPath) userJavaPath = meta.javaPath;
        if (meta.mcVersion) mcVersion = meta.mcVersion;
      } catch {}
    }

    // Resolve jar name if not provided
    if (!jarName) {
      const files = await fs.promises.readdir(dir).catch(() => []);
      const foundJar = files.find(f => f.endsWith('.jar') && !f.startsWith('installer'));
      jarName = foundJar || 'server.jar';
    }

    // Extract mcVersion from jarName if still missing
    if (!mcVersion && jarName) {
      const match = jarName.match(/(?:mc[.-]|minecraft[.-]|v)?(26\.\d+|1\.\d+(\.\d+)?)/i);
      if (match) {
        mcVersion = match[1];
        console.log(`[Warden] Extracted MC version '${mcVersion}' from jar '${jarName}'`);
      }
    }

    const javaPath = userJavaPath || this.resolveJavaPath(mcVersion);

    let proc = this.processes.get(serverId);
    if (!proc) {
      proc = new ServerProcess({
        serverId,
        serverDir: dir,
        jarFile: jarName,
        javaPath,
        minMemory: minMemory || '2G',
        maxMemory: maxMemory || '4G',
      });
      this.processes.set(serverId, proc);
    } else {
      // Always update runtime options before starting
      proc.setJavaPath(javaPath);
      proc.setJarFile(jarName);
      proc.setMemory(minMemory || '2G', maxMemory || '4G');
    }

    await proc.start();
  }

  // EULA Management
  public isEulaAccepted(serverId: string): boolean {
    const dir = this.getServerDir(serverId);
    const eulaPath = path.join(dir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) return false;
    return fs.readFileSync(eulaPath, 'utf8').includes('eula=true');
  }

  public acceptEula(serverId: string): void {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) throw new Error(`Server directory ${serverId} does not exist`);
    const eulaPath = path.join(dir, 'eula.txt');
    fs.writeFileSync(eulaPath, '#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n', 'utf8');
    console.log(`[Warden] EULA accepted for server ${serverId}`);
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

  /**
   * Export a complete server instance as a .zip archive buffer and filename.
   * Automatically flushes chunks via save-all if server is online.
   */
  public async exportServerZip(serverId: string): Promise<{ buffer: Buffer; filename: string }> {
    const serverDir = this.getServerDir(serverId);
    if (!fs.existsSync(serverDir)) {
      throw new Error(`Server directory not found for ${serverId}`);
    }

    const server = await this.getServer(serverId);
    const serverName = server?.name || serverId;
    const safeName = serverName.replace(/[^a-zA-Z0-9_\-\.]/g, '_').toLowerCase();
    const filename = `warden-server-${safeName}-${new Date().toISOString().slice(0, 10)}.zip`;

    // If server is online, flush chunks before archiving
    const proc = this.processes.get(serverId);
    if (proc && proc.getStatus() === 'online') {
      try {
        proc.sendCommand('save-all flush');
        await new Promise((r) => setTimeout(r, 600));
      } catch {}
    }

    const zip = new AdmZip();
    zip.addLocalFolder(serverDir);
    const buffer = zip.toBuffer();

    return { buffer, filename };
  }

  /**
   * Import a server instance from an uploaded .zip archive (Crafty backup, Warden export, or generic zip).
   */
  public async importServerFromZip(
    zipPath: string,
    options: {
      name?: string;
      minMemory?: string;
      maxMemory?: string;
      autoStart?: boolean;
    } = {},
    ownerId?: string
  ): Promise<WardenServer> {
    const serverId = `server-${Date.now()}`;
    const targetDir = this.getServerDir(serverId);
    await fs.promises.mkdir(targetDir, { recursive: true });

    try {
      // 1. Extract zip to targetDir
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(targetDir, true);

      // 2. Detect nested folder wrappers (common in Crafty Controller or folder zips)
      let files = await fs.promises.readdir(targetDir);
      const isNestedSingleFolder =
        files.length === 1 &&
        (await fs.promises.stat(path.join(targetDir, files[0]))).isDirectory();

      if (isNestedSingleFolder) {
        const nestedDir = path.join(targetDir, files[0]);
        const innerFiles = await fs.promises.readdir(nestedDir);
        for (const f of innerFiles) {
          const src = path.join(nestedDir, f);
          const dest = path.join(targetDir, f);
          await fs.promises.rename(src, dest);
        }
        await fs.promises.rmdir(nestedDir).catch(() => {});
        files = await fs.promises.readdir(targetDir);
      } else {
        // If there are only a few directories and no server.properties / jar in root, check subdirectories
        const hasRootJarOrProps = files.some(
          (f) => f.endsWith('.jar') || f === 'server.properties' || f === 'warden.json'
        );
        if (!hasRootJarOrProps) {
          for (const item of files) {
            const subPath = path.join(targetDir, item);
            const isDir = (await fs.promises.stat(subPath).catch(() => null))?.isDirectory();
            if (isDir) {
              const subFiles: string[] = await fs.promises.readdir(subPath).catch(() => [] as string[]);
              if (subFiles.includes('server.properties') || subFiles.some((f) => f.endsWith('.jar'))) {
                for (const sf of subFiles) {
                  await fs.promises.rename(path.join(subPath, sf), path.join(targetDir, sf));
                }
                await fs.promises.rmdir(subPath).catch(() => {});
                files = await fs.promises.readdir(targetDir);
                break;
              }
            }
          }
        }
      }

      // 2. Read existing warden.json if present
      let existingWardenJson: any = null;
      const wardenJsonPath = path.join(targetDir, 'warden.json');
      if (fs.existsSync(wardenJsonPath)) {
        try {
          existingWardenJson = JSON.parse(await fs.promises.readFile(wardenJsonPath, 'utf8'));
        } catch {}
      }

      // 3. Read server.properties if present
      const props = await this.getServerProperties(serverId);
      const motdName = props['motd']
        ? props['motd']
            .replace(/\\u00a7[0-9a-fk-or]/gi, '')
            .replace(/§[0-9a-fk-or]/gi, '')
            .split('|')[0]
            ?.trim()
        : null;

      files = await fs.promises.readdir(targetDir);
      const serverName =
        options.name ||
        existingWardenJson?.name ||
        motdName ||
        `Imported Server`;

      // 4. Detect Executable Server JAR
      const allJars = files.filter((f) => f.endsWith('.jar') && !f.toLowerCase().includes('installer'));
      let chosenJar = existingWardenJson?.jarFile || '';
      if (!chosenJar || !fs.existsSync(path.join(targetDir, chosenJar))) {
        // Priority order for executable server jar
        const priorityOrder = [
          (f: string) => /fabric-server-mc/i.test(f),
          (f: string) => /paper/i.test(f),
          (f: string) => /purpur/i.test(f),
          (f: string) => /neoforge/i.test(f) || /forge/i.test(f),
          (f: string) => /spigot/i.test(f),
          (f: string) => /craftbukkit/i.test(f),
          (f: string) => /^server\.jar$/i.test(f),
          (f: string) => /server/i.test(f),
        ];

        for (const test of priorityOrder) {
          const match = allJars.find(test);
          if (match) {
            chosenJar = match;
            break;
          }
        }
        if (!chosenJar && allJars.length > 0) {
          chosenJar = allJars[0];
        }
        if (!chosenJar) {
          chosenJar = 'server.jar';
        }
      }

      // 5. Detect Loader & MC Version
      let loader: ServerLoader = existingWardenJson?.loader || 'vanilla';
      const jarLower = chosenJar.toLowerCase();
      if (jarLower.includes('fabric')) loader = 'fabric';
      else if (jarLower.includes('paper')) loader = 'paper';
      else if (jarLower.includes('purpur')) loader = 'purpur';
      else if (jarLower.includes('quilt')) loader = 'quilt';
      else if (jarLower.includes('neoforge') || jarLower.includes('forge')) loader = 'forge';
      else if (jarLower.includes('spigot') || jarLower.includes('craftbukkit')) loader = 'spigot';

      let mcVersion = existingWardenJson?.mcVersion || '';
      if (!mcVersion) {
        // Extract version from jar filename (e.g. paper-1.21.1-123.jar, fabric-server-mc.1.20.4-loader.jar)
        const verMatch = chosenJar.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (verMatch) {
          mcVersion = verMatch[1];
        } else {
          mcVersion = '1.21.1';
        }
      }

      // 6. Manage Server Port (prevent conflicts with existing servers)
      const existingServers = await this.getServers();
      const usedPorts = new Set<number>();
      for (const s of existingServers) {
        if (s.id === serverId) continue;
        try {
          const p = await this.getServerProperties(s.id);
          if (p['server-port']) {
            usedPorts.add(parseInt(p['server-port'], 10));
          }
        } catch {}
      }

      let port = parseInt(props['server-port'] || '25565', 10);
      if (usedPorts.has(port)) {
        let nextPort = 25565;
        while (usedPorts.has(nextPort)) {
          nextPort++;
        }
        port = nextPort;
        await this.saveServerProperties(serverId, { 'server-port': String(port) } as any);
      }

      const primaryAdmin = db.getUsers().find(u => u.role === 'admin')?.id || 'admin';
      const serverOwnerId = ownerId || existingWardenJson?.ownerId || primaryAdmin;
      const allowedUserIds: string[] = Array.isArray(existingWardenJson?.allowedUserIds) ? existingWardenJson.allowedUserIds : [];

      // 7. Write/Update warden.json
      const meta = {
        id: serverId,
        name: serverName,
        loader,
        mcVersion,
        jarFile: chosenJar,
        port,
        minMemory: options.minMemory || existingWardenJson?.minMemory || '2G',
        maxMemory: options.maxMemory || existingWardenJson?.maxMemory || '4G',
        javaPath: existingWardenJson?.javaPath,
        ownerId: serverOwnerId,
        allowedUserIds,
        createdAt: existingWardenJson?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fs.promises.writeFile(
        path.join(targetDir, 'warden.json'),
        JSON.stringify(meta, null, 2),
        'utf8'
      );

      // Save confirmed detection in db
      db.setServerDetection(serverId, {
        loader,
        mcVersion,
        isConfirmed: true,
        source: 'manual_override',
        detectedAt: new Date().toISOString(),
      });

      // Cleanup temp zip
      try {
        if (fs.existsSync(zipPath)) {
          await fs.promises.unlink(zipPath);
        }
      } catch {}

      // If autoStart requested, start the server
      if (options.autoStart) {
        await this.startServer(serverId).catch((err) =>
          console.warn(`[Warden Import] Auto-start failed:`, err)
        );
      }

      return (await this.getServer(serverId))!;
    } catch (err: any) {
      try {
        if (fs.existsSync(targetDir)) {
          await fs.promises.rm(targetDir, { recursive: true, force: true });
        }
      } catch {}
      try {
        if (fs.existsSync(zipPath)) {
          await fs.promises.unlink(zipPath);
        }
      } catch {}
      throw new Error(`Failed to import server: ${err.message}`);
    }
  }

  /**
   * Update allowed/excluded user IDs and access policy for a server
   */
  public async updateServerAccess(
    serverId: string,
    payload:
      | {
          accessPolicy?: ServerAccessPolicy;
          allowedUserIds?: string[];
          excludedUserIds?: string[];
        }
      | string[]
  ): Promise<WardenServer> {
    const dir = this.getServerDir(serverId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Server directory ${serverId} does not exist`);
    }
    const metaPath = path.join(dir, 'warden.json');
    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
      } catch {}
    }
    if (Array.isArray(payload)) {
      meta.allowedUserIds = payload;
    } else {
      if (payload.accessPolicy !== undefined) meta.accessPolicy = payload.accessPolicy;
      if (payload.allowedUserIds !== undefined) meta.allowedUserIds = payload.allowedUserIds;
      if (payload.excludedUserIds !== undefined) meta.excludedUserIds = payload.excludedUserIds;
    }
    meta.updatedAt = new Date().toISOString();
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    const updated = await this.getServer(serverId);
    if (!updated) throw new Error('Server not found after updating access');
    return updated;
  }
}

export const serverManager = new ServerManager();
