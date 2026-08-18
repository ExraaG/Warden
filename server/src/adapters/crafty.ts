import fetch, { RequestInit } from 'node-fetch';
import https from 'https';
import FormData from 'form-data';
import path from 'path';
import { config } from '../config.js';
import { db } from '../db/storage.js';
import { loaderDetector } from '../detection/loader.js';
import { WardenServer, ServerStats } from '@warden/shared';

export interface CraftySchemaFieldNames {
  fileListPathField: string;
  uploadTypeField: string;
  uploadServerIdField: string;
  uploadPathField: string;
  uploadFileField: string;
}

const DEFAULT_SCHEMA_FIELDS: CraftySchemaFieldNames = {
  fileListPathField: 'path',
  uploadTypeField: 'type',
  uploadServerIdField: 'server_id',
  uploadPathField: 'path',
  uploadFileField: 'file',
};

const SHARED_HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 30,
});

export class CraftyAdapter {
  private schemaFields: CraftySchemaFieldNames = DEFAULT_SCHEMA_FIELDS;
  private schemaValidated = false;

  constructor() {
    this.validateOpenApiSchema().catch(() => {
      // Silent — expected when Crafty schema endpoint isn't exposed
    });
  }

  /**
   * Rejects path traversal: null bytes, absolute paths, ../ components
   */
  public sanitizePath(inputPath: string): string {
    if (inputPath.includes('\0')) throw new Error('Invalid path: null bytes');
    const normalized = path.normalize(inputPath).replace(/^(\.\.[\\/\\\\])+/, '');
    if (normalized.startsWith('/') || normalized.startsWith('\\')) return normalized.substring(1);
    return normalized;
  }

  private getHeaders(): Record<string, string> {
    const settings = db.getSettings();
    const apiKey = (settings as any).craftyApiKey || config.craftyApiKey || '';
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'Warden-Server-Adapter/1.0',
    };
  }

  private getBaseUrl(): string {
    const settings = db.getSettings();
    const url = settings.craftyUrl || config.craftyUrl || 'https://localhost:8443';
    return url.replace(/\/+$/, '');
  }

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const doFetch = async (url: string): Promise<T> => {
      const response = await fetch(url, {
        ...options,
        agent: url.startsWith('https') ? SHARED_HTTPS_AGENT as any : undefined,
        headers: {
          ...this.getHeaders(),
          ...(options.headers as Record<string, string> || {}),
        },
        signal: controller.signal as any,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Crafty API ${response.status}: ${text.substring(0, 300)}`);
      }
      return response.json() as Promise<T>;
    };

    const url = `${baseUrl}${endpoint}`;
    try {
      const result = await doFetch(url);
      clearTimeout(timeout);
      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error(`Crafty request timed out: ${url}`);
      throw err;
    }
  }

  /**
   * Attempt to fetch Crafty's own OpenAPI schema to validate field names.
   * Falls back to defaults silently — the real field names are now known from direct API testing.
   */
  public async validateOpenApiSchema(): Promise<boolean> {
    const baseUrl = this.getBaseUrl();
    for (const ep of ['/openapi.json', '/api/v2/openapi.json']) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${baseUrl}${ep}`, {
          headers: this.getHeaders(),
          agent: SHARED_HTTPS_AGENT as any,
          signal: controller.signal as any,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const schema: any = await res.json();
          if (schema && schema.paths) {
            this.schemaValidated = true;
            db.updateSettings({ schemaValidated: true, schemaLastSync: new Date().toISOString() });
            return true;
          }
        }
      } catch { /* try next */ }
    }
    db.updateSettings({ schemaValidated: false });
    return false;
  }

  // ─── SERVERS ─────────────────────────────────────────────────────────────

  public async getServers(): Promise<WardenServer[]> {
    const res = await this.request<{ status: string; data: any[] }>('/api/v2/servers');
    if (!res?.data || !Array.isArray(res.data)) return [];

    return res.data.map((srv) => {
      const id = String(srv.server_id);
      const executable = srv.executable || srv.server_executable || '';
      const execCmd = srv.execution_command || '';

      let detection = db.getServerDetection(id);
      if (!detection || detection.loader === 'unknown' || !detection.mcVersion) {
        const textToCheck = `${srv.executable_update_url || ''} ${executable} ${execCmd} ${srv.server_name || srv.name || ''}`;
        const detected = loaderDetector.detectFromText(textToCheck);

        detection = {
          loader: detected.loader !== 'unknown' ? detected.loader : (detection?.loader || 'unknown'),
          mcVersion: detected.mcVersion || detection?.mcVersion || null,
          isConfirmed: Boolean(detection?.isConfirmed),
          source: detected.loader !== 'unknown' ? 'executable_filename' : 'unconfirmed',
          detectedAt: new Date().toISOString(),
        };
        db.setServerDetection(id, detection);
      }


      // Status is determined from the /stats endpoint — /servers list doesn't include it
      // We store it separately via getServerStats(). Default to unknown and let stats fill it.
      const storedStatus = (db as any)._serverStatusCache?.[id] || 'offline';

      return {
        id,
        name: srv.server_name || srv.name || `Server ${id}`,
        craftyServerId: id,
        status: storedStatus as any,
        detection,
        createdAt: srv.created || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  public async getServerDetails(serverId: string): Promise<any | null> {
    try {
      const res = await this.request<{ status: string; data: any }>(`/api/v2/servers/${serverId}`);
      return res?.data || null;
    } catch { return null; }
  }

  /**
   * GET /stats — returns running status + real-time metrics.
   * Crafty response: { running, cpu, mem (bytes float), mem_percent, online, max, version, crashed }
   */
  public async getServerStats(serverId: string): Promise<ServerStats & { running: boolean; version?: string }> {
    const res = await this.request<{ status: string; data: any }>(`/api/v2/servers/${serverId}/stats`);
    const d = res?.data || {};

    // Cache running status so getServers() can reflect it
    if (!(db as any)._serverStatusCache) (db as any)._serverStatusCache = {};
    const status = d.running === true ? 'online'
      : d.crashed === true ? 'error'
      : d.waiting_start === true ? 'starting'
      : 'offline';
    (db as any)._serverStatusCache[serverId] = status;

    const rawVersion: string = d.version || '';
    const validMcVersion = rawVersion ? loaderDetector.extractMcVersion(rawVersion) || rawVersion : undefined;


    return {
      cpuPercent: parseFloat(d.cpu) || 0,
      // mem is already raw bytes (float) from Crafty
      memoryBytes: typeof d.mem === 'number' ? Math.round(d.mem) : 0,
      maxMemoryBytes: 0, // Crafty doesn't expose max_mem directly in stats
      onlinePlayers: parseInt(d.online) || 0,
      maxPlayers: parseInt(d.max) || 20,
      // Crafty "uptime" is in the started field — compute from that
      uptimeSeconds: d.started ? Math.round((Date.now() - new Date(d.started).getTime()) / 1000) : 0,
      running: Boolean(d.running),
      version: validMcVersion,
    };
  }

  // ─── SERVER ACTIONS ───────────────────────────────────────────────────────

  public async startServer(serverId: string): Promise<boolean> {
    const res = await this.request<{ status: string }>(`/api/v2/servers/${serverId}/action/start_server`, { method: 'POST' });
    return res?.status === 'ok' || res?.status === 'OK';
  }

  public async stopServer(serverId: string): Promise<boolean> {
    const res = await this.request<{ status: string }>(`/api/v2/servers/${serverId}/action/stop_server`, { method: 'POST' });
    return res?.status === 'ok' || res?.status === 'OK';
  }

  public async restartServer(serverId: string): Promise<boolean> {
    const res = await this.request<{ status: string }>(`/api/v2/servers/${serverId}/action/restart_server`, { method: 'POST' });
    return res?.status === 'ok' || res?.status === 'OK';
  }

  // ─── FILES ────────────────────────────────────────────────────────────────

  /**
   * List files in a server directory.
   *
   * Crafty v4 real response (confirmed via direct API testing):
   * - Method: POST /api/v2/servers/{id}/files with body { "path": "relative/path" }
   * - GET returns METHOD_NOT_ALLOWED
   * - Response.data is a DICT keyed by filename, NOT an array
   * - Special key "root_path" contains directory metadata, not a file
   * - Each file entry: { path: "mods/file.jar", dir: false/true, size: "3.1KB", modified: "2026/..." }
   */
  public async listFiles(serverId: string, relativePath: string = ''): Promise<any[]> {
    const cleanPath = this.sanitizePath(relativePath);

    const res = await this.request<{ status: string; data: any }>(
      `/api/v2/servers/${serverId}/files`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath }),
      }
    );

    if (!res?.data || typeof res.data !== 'object') return [];

    const entries: any[] = [];
    for (const [key, val] of Object.entries(res.data as Record<string, any>)) {
      // Skip the special root_path metadata entry
      if (key === 'root_path') continue;
      if (!val || typeof val !== 'object') continue;

      // Name is the dict key itself; path field contains the full relative path
      const name = key;
      const isDir = Boolean(val.dir);

      // Parse size string: "3.1KB", "512.5KB", "2.4MB", "7.7MB"
      const sizeStr = String(val.size || '0');
      let sizeBytes = 0;
      const sizeMatch = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB|B)?$/i);
      if (sizeMatch) {
        const num = parseFloat(sizeMatch[1]);
        const unit = (sizeMatch[2] || 'B').toUpperCase();
        if (unit === 'GB') sizeBytes = Math.round(num * 1024 * 1024 * 1024);
        else if (unit === 'MB') sizeBytes = Math.round(num * 1024 * 1024);
        else if (unit === 'KB') sizeBytes = Math.round(num * 1024);
        else sizeBytes = Math.round(num);
      }

      entries.push({
        name,
        is_dir: isDir,
        size: sizeBytes,
        mod_time: val.modified || new Date().toISOString(),
        path: val.path || (cleanPath ? `${cleanPath}/${name}` : name),
      });
    }

    return entries;
  }

  public async deleteFile(serverId: string, relativePath: string): Promise<boolean> {
    const cleanPath = this.sanitizePath(relativePath);

    // Method 1: Crafty Controller v4 standard DELETE /api/v2/servers/{id}/files endpoint
    try {
      const res = await this.request<{ status: string }>(
        `/api/v2/servers/${serverId}/files`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_system_objects: [{ filename: cleanPath }],
          }),
        }
      );
      if (res?.status === 'ok' || res?.status === 'OK') return true;
    } catch (err: any) {
      console.warn(`[CraftyAdapter] DELETE /files failed for ${cleanPath}:`, err.message);
    }

    // Method 2: Fallback to action/delete_file
    try {
      const res = await this.request<{ status: string }>(
        `/api/v2/servers/${serverId}/action/delete_file`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cleanPath }),
        }
      );
      return res?.status === 'ok' || res?.status === 'OK';
    } catch (err: any) {
      console.warn(`[CraftyAdapter] action/delete_file error for ${cleanPath}:`, err.message);
      return false;
    }
  }

  private ensuredDirCache = new Set<string>();

  public async ensureDirectory(serverId: string, relativePath: string): Promise<boolean> {
    const cleanPath = this.sanitizePath(relativePath);
    if (!cleanPath || cleanPath === '.' || cleanPath === '/') return true;

    const cacheKey = `${serverId}:${cleanPath}`;
    if (this.ensuredDirCache.has(cacheKey)) return true;

    const settings = db.getSettings();
    const apiKey = (settings as any).craftyApiKey || config.craftyApiKey || '';
    const baseUrl = this.getBaseUrl();
    const httpsAgent = SHARED_HTTPS_AGENT;

    const segments = cleanPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const segment of segments) {
      const parent = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const segKey = `${serverId}:${currentPath}`;
      if (this.ensuredDirCache.has(segKey)) continue;

      const candidates = [
        {
          url: `${baseUrl}/api/v2/servers/${serverId}/files/folder`,
          body: { path: parent, name: segment, folder_name: segment, location: parent },
        },
        {
          url: `${baseUrl}/api/v2/servers/${serverId}/action/new_dir`,
          body: { path: parent, name: segment, new_dir: segment, folder_name: segment },
        },
        {
          url: `${baseUrl}/api/v2/servers/${serverId}/files/mkdir`,
          body: { path: currentPath, name: segment },
        },
      ];

      for (const cand of candidates) {
        try {
          const res = await fetch(cand.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(cand.body),
            agent: baseUrl.startsWith('https') ? (httpsAgent as any) : undefined,
          });
          if (res.ok) break;
        } catch {
          // Continue to next candidate
        }
      }
      this.ensuredDirCache.add(segKey);
    }

    this.ensuredDirCache.add(cacheKey);
    return true;
  }

  public async uploadFile(serverId: string, relativePath: string, buffer: Buffer, filename: string): Promise<boolean> {
    const cleanPath = this.sanitizePath(relativePath);
    const settings = db.getSettings();
    const apiKey = (settings as any).craftyApiKey || config.craftyApiKey || '';
    const baseUrl = this.getBaseUrl();
    const httpsAgent = SHARED_HTTPS_AGENT;

    // Ensure target directory exists on server (e.g. mods, resourcepacks, world/datapacks)
    if (cleanPath) {
      await this.ensureDirectory(serverId, cleanPath).catch(() => {});
    }

    // Method 1: Crafty Controller v4 official /api/v2/servers/{id}/files/upload endpoint
    // Crafty's ApiServerFilesUpload handler expects raw binary stream with custom headers
    try {
      const fileId = `warden-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${baseUrl}/api/v2/servers/${serverId}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'fileName': filename,
          'location': cleanPath,
          'fileId': fileId,
          'fileSize': String(buffer.length),
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buffer.length),
        },
        body: buffer,
        agent: baseUrl.startsWith('https') ? (httpsAgent as any) : undefined,
        signal: controller.signal as any,
      });
      clearTimeout(timeout);

      if (res.ok) {
        return true;
      }
      const text = await res.text().catch(() => '');
      console.warn(`[CraftyAdapter] files/upload failed (${res.status}): ${text.substring(0, 120)}`);
      if (text.includes('FileNotFoundError') || text.includes('No such file or directory')) {
        throw new Error(`Folder '${cleanPath}' does not exist on this server. If this server is Vanilla, switch your server jar to Fabric/Forge in Crafty first so Crafty creates the mods folder.`);
      }
      throw new Error(`Upload failed (${res.status}): ${text.substring(0, 100) || 'Unknown Crafty error'}`);
    } catch (err: any) {
      console.warn(`[CraftyAdapter] files/upload error for ${cleanPath}/${filename}:`, err.message);
      throw err;
    }
  }

  public async getFileContent(serverId: string, relativePath: string): Promise<string> {
    const cleanPath = this.sanitizePath(relativePath);

    try {
      const res = await this.request<{ status: string; data: any }>(
        `/api/v2/servers/${serverId}/files/read`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cleanPath }),
        }
      );

      if (res?.data) {
        if (typeof res.data.content === 'string') {
          return res.data.content;
        }
        if (typeof res.data === 'string') {
          return res.data;
        }
      }
    } catch (err: any) {
      console.warn(`[CraftyAdapter] Failed reading file ${cleanPath}:`, err.message);
    }

    return '';
  }

  public async saveFileContent(serverId: string, relativePath: string, content: string): Promise<boolean> {
    const cleanPath = this.sanitizePath(relativePath);

    // Method 1: Crafty v4 official PATCH /api/v2/servers/{id}/files endpoint (contents, overwrite: true)
    try {
      const res = await this.request<{ status: string }>(
        `/api/v2/servers/${serverId}/files`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: cleanPath,
            contents: content,
            overwrite: true,
          }),
        }
      );
      if (res?.status === 'ok' || res?.status === 'OK') {
        return true;
      }
    } catch (patchErr: any) {
      console.warn(`[CraftyAdapter] PATCH /files failed for ${cleanPath}, trying POST /files/write:`, patchErr.message);
    }

    // Method 2: Crafty v4 POST /api/v2/servers/{id}/files/write (page field)
    try {
      const res = await this.request<{ status: string }>(
        `/api/v2/servers/${serverId}/files/write`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: cleanPath,
            page: content,
          }),
        }
      );
      if (res?.status === 'ok' || res?.status === 'OK') {
        return true;
      }
    } catch (writeErr: any) {
      console.warn(`[CraftyAdapter] /files/write failed for ${cleanPath}, trying uploadFile:`, writeErr.message);
    }

    // Method 3: Raw octet stream / uploadFile fallback
    const buffer = Buffer.from(content, 'utf-8');
    const filename = path.basename(cleanPath);
    const dir = path.dirname(cleanPath);
    return this.uploadFile(serverId, dir === '.' ? '' : dir, buffer, filename);
  }


  // ─── CONSOLE ──────────────────────────────────────────────────────────────

  public async getConsoleLogs(serverId: string): Promise<string[]> {
    const res = await this.request<{ status: string; data: string[] | string }>(
      `/api/v2/servers/${serverId}/logs`
    );
    if (!res?.data) return [];
    if (Array.isArray(res.data)) return res.data;
    if (typeof res.data === 'string') return res.data.split('\n').filter(Boolean);
    return [];
  }

  public async sendConsoleCommand(serverId: string, command: string): Promise<boolean> {
    const cleanCmd = (command || '').trim();
    if (!cleanCmd) return false;

    const baseUrl = this.getBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    // Method 1: Send raw command string as text/plain
    try {
      const res = await fetch(`${baseUrl}/api/v2/servers/${serverId}/stdin`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'text/plain',
        },
        body: cleanCmd,
        agent: baseUrl.startsWith('https') ? (httpsAgent as any) : undefined,
        signal: controller.signal as any,
      });

      if (res.ok) {
        clearTimeout(timeout);
        return true;
      }
    } catch {}

    // Method 2: Standard JSON request fallback
    try {
      const res = await this.request<{ status: string }>(
        `/api/v2/servers/${serverId}/stdin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanCmd),
        }
      );
      clearTimeout(timeout);
      return res?.status === 'ok' || res?.status === 'OK';
    } catch (err: any) {
      clearTimeout(timeout);
      console.warn(`[CraftyAdapter] Failed sending command "${cleanCmd}":`, err.message);
      return false;
    }
  }
}

export const craftyAdapter = new CraftyAdapter();
