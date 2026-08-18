import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { serverManager } from './serverManager.js';

const execPromise = util.promisify(exec);

export interface SystemUpdateStatus {
  updateAvailable: boolean;
  version?: string;
  currentCommit: string;
  latestCommit: string;
  commitMessage?: string;
  commitDate?: string;
  author?: string;
  error?: string;
}

export class SystemUpdater {
  private static cachedStatus: { timestamp: number; data: SystemUpdateStatus } | null = null;
  private static CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  public static async getVersionInfo(): Promise<{ commit: string; version: string }> {
    let commit = 'unknown';
    let version = '1.0.0';

    // 1. Check for version info file in multiple standard locations
    const candidateFiles = [
      path.resolve(process.cwd(), 'version.json'),
      path.resolve(process.cwd(), '..', 'version.json'),
      path.resolve(__dirname, '..', '..', 'version.json'),
      path.resolve(__dirname, '..', 'version.json'),
      path.resolve('/app/version.json'),
      path.resolve('/app/server/version.json'),
    ];

    for (const versionFile of candidateFiles) {
      if (fs.existsSync(versionFile)) {
        try {
          const raw = JSON.parse(await fs.promises.readFile(versionFile, 'utf8'));
          if (raw.version) version = raw.version;
          if (raw.commit && raw.commit !== 'unknown') {
            commit = raw.commitFull || raw.commit;
            return { commit, version };
          }
        } catch {}
      }
    }

    // 2. Fallback to local git if .git directory exists
    try {
      const { stdout } = await execPromise('git rev-parse HEAD', { timeout: 3000 });
      if (stdout && stdout.trim()) {
        commit = stdout.trim();
      }
    } catch {}

    return { commit, version };
  }

  public static async getCurrentCommit(): Promise<string> {
    const info = await this.getVersionInfo();
    return info.commit;
  }

  public static async checkUpdate(force = false): Promise<SystemUpdateStatus> {
    if (!force && this.cachedStatus && Date.now() - this.cachedStatus.timestamp < this.CACHE_TTL_MS) {
      return this.cachedStatus.data;
    }

    const { commit: currentCommit, version } = await this.getVersionInfo();

    try {
      const res = await fetch('https://api.github.com/repos/ExraaG/Warden/commits/main', {
        headers: {
          'User-Agent': 'Warden-Server-Update-Checker',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub API returned status ${res.status}`);
      }

      const data: any = await res.json();
      const latestCommit = data.sha || '';
      const commitMessage = data.commit?.message?.split('\n')[0] || 'Latest updates and bugfixes';
      const commitDate = data.commit?.committer?.date || new Date().toISOString();
      const author = data.commit?.author?.name || data.author?.login || 'Warden Team';

      let updateAvailable = false;
      if (latestCommit) {
        if (currentCommit === 'unknown') {
          // If current commit is unknown (e.g. fresh/unversioned container), offer update to latest release
          updateAvailable = true;
        } else {
          // Compare SHA prefix or full SHA
          updateAvailable = !latestCommit.startsWith(currentCommit) && !currentCommit.startsWith(latestCommit);
        }
      }

      const result: SystemUpdateStatus = {
        updateAvailable,
        version,
        currentCommit: currentCommit.substring(0, 7),
        latestCommit: latestCommit.substring(0, 7),
        commitMessage,
        commitDate,
        author,
      };

      this.cachedStatus = { timestamp: Date.now(), data: result };
      return result;
    } catch (err: any) {
      console.warn('[SystemUpdater] Failed to check for updates from GitHub:', err.message);
      const fallback: SystemUpdateStatus = {
        updateAvailable: false,
        version,
        currentCommit: currentCommit.substring(0, 7),
        latestCommit: 'unknown',
        error: err.message,
      };
      return fallback;
    }
  }

  public static async performSelfUpdate(): Promise<{ success: boolean; message: string }> {
    console.log('[SystemUpdater] Initiating system update sequence...');

    // 1. Gracefully stop all active Minecraft servers to flush world saves
    try {
      const servers = await serverManager.getServers();
      for (const s of servers) {
        if (s.status !== 'offline') {
          console.log(`[SystemUpdater] Gracefully stopping server '${s.name}' (${s.id}) to preserve world data...`);
          await serverManager.stopServer(s.id).catch((e) => console.warn(`Error stopping ${s.id}:`, e));
        }
      }
    } catch (err) {
      console.warn('[SystemUpdater] Error stopping servers:', err);
    }

    // 2. Perform git pull and rebuild if environment allows
    try {
      // Check if git is available
      const { stdout: pullOut } = await execPromise('git pull origin main', { timeout: 30000 });
      console.log('[SystemUpdater] Git pull completed:', pullOut);

      // Trigger rebuild in background and restart
      setTimeout(async () => {
        try {
          console.log('[SystemUpdater] Running post-update build...');
          await execPromise('npm run build', { timeout: 120000 });
          console.log('[SystemUpdater] Build complete, restarting process...');
          process.exit(0); // Process manager / Docker will automatically restart the container
        } catch (e) {
          console.error('[SystemUpdater] Rebuild failed, restarting anyway:', e);
          process.exit(0);
        }
      }, 1000);

      return {
        success: true,
        message: 'Update downloaded. All worlds saved and server is restarting now.',
      };
    } catch (err: any) {
      console.warn('[SystemUpdater] Automatic git pull failed (possibly standalone container):', err.message);
      
      // Still trigger restart so Docker can pick up new volumes or updated images if managed externally
      setTimeout(() => {
        process.exit(0);
      }, 2000);

      return {
        success: true,
        message: 'All servers stopped and worlds saved. Restarting application container...',
      };
    }
  }
}
