import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { serverManager } from './serverManager.js';
import { BUILD_INFO } from '../version.js';

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

export interface UpdateProgressState {
  status: 'idle' | 'stopping_servers' | 'pulling' | 'building' | 'restarting' | 'completed' | 'error';
  step: number;
  totalSteps: number;
  stepName: string;
  percent: number;
  details?: string;
  error?: string;
}

export class SystemUpdater {
  private static cachedStatus: { timestamp: number; data: SystemUpdateStatus } | null = null;
  private static CACHE_TTL_MS = 60 * 1000; // 1 minute cache
  private static progressState: UpdateProgressState = {
    status: 'idle',
    step: 0,
    totalSteps: 4,
    stepName: 'Ready',
    percent: 0,
  };

  public static getProgress(): UpdateProgressState {
    return this.progressState;
  }

  public static async getVersionInfo(): Promise<{ commit: string; version: string }> {
    let commit: string = BUILD_INFO.commit || 'unknown';
    let version: string = BUILD_INFO.version || '1.0.0';

    if (commit === 'unknown') {
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
              break;
            }
          } catch { }
        }
      }
    }

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

      const cur7 = currentCommit.substring(0, 7).toLowerCase();
      const lat7 = latestCommit.substring(0, 7).toLowerCase();

      let updateAvailable = false;
      if (cur7 !== 'unknown' && lat7 && lat7 !== 'unknown') {
        updateAvailable = cur7 !== lat7;
      }

      const result: SystemUpdateStatus = {
        updateAvailable,
        version,
        currentCommit: cur7,
        latestCommit: lat7,
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

    this.progressState = {
      status: 'stopping_servers',
      step: 1,
      totalSteps: 4,
      stepName: 'Flushing chunk saves and stopping active Minecraft servers...',
      percent: 20,
    };

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

    // 2. Perform git pull and rebuild in background
    setTimeout(async () => {
      try {
        SystemUpdater.progressState = {
          status: 'pulling',
          step: 2,
          totalSteps: 4,
          stepName: 'Pulling latest release from GitHub (git pull origin main)...',
          percent: 45,
        };

        const { stdout: pullOut } = await execPromise('git pull origin main', { timeout: 30000 });
        console.log('[SystemUpdater] Git pull completed:', pullOut);

        SystemUpdater.progressState = {
          status: 'building',
          step: 3,
          totalSteps: 4,
          stepName: 'Compiling packages and building production bundle (npm run build)...',
          percent: 75,
          details: 'This may take 30-60 seconds. Please keep this window open.',
        };

        await execPromise('npm run build', { timeout: 180000 });
        console.log('[SystemUpdater] Build completed successfully.');

        SystemUpdater.progressState = {
          status: 'restarting',
          step: 4,
          totalSteps: 4,
          stepName: 'Restarting Warden services and reloading application...',
          percent: 95,
        };

        setTimeout(() => {
          process.exit(0);
        }, 1500);
      } catch (err: any) {
        console.error('[SystemUpdater] Build/pull step failed:', err);
        SystemUpdater.progressState = {
          status: 'error',
          step: 4,
          totalSteps: 4,
          stepName: 'Update failed',
          percent: 100,
          error: err.message,
        };
        // Restart after failure to recover clean state
        setTimeout(() => process.exit(0), 4000);
      }
    }, 500);

    return {
      success: true,
      message: 'Update sequence started. Server worlds saved.',
    };
  }
}
