import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { serverManager } from './serverManager.js';
import { WARDEN_VERSION, WARDEN_VERSION_NUMBER, WARDEN_RELEASE_TITLE } from '../version.js';

const execPromise = util.promisify(exec);

export interface SystemUpdateStatus {
  updateAvailable: boolean;
  version: string;
  currentCommit: string;
  latestCommit: string;
  currentVersionNumber?: number;
  latestVersionNumber?: number;
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

  public static async getVersionInfo(): Promise<{ version: string; versionNumber: number; releaseTitle: string; commit: string }> {
    return {
      version: WARDEN_VERSION,
      versionNumber: WARDEN_VERSION_NUMBER,
      releaseTitle: WARDEN_RELEASE_TITLE,
      commit: WARDEN_VERSION,
    };
  }

  public static async getCurrentCommit(): Promise<string> {
    return WARDEN_VERSION;
  }

  public static async checkUpdate(force = false): Promise<SystemUpdateStatus> {
    if (!force && this.cachedStatus && Date.now() - this.cachedStatus.timestamp < this.CACHE_TTL_MS) {
      return this.cachedStatus.data;
    }

    const currentVer = WARDEN_VERSION;
    const currentVerNum = WARDEN_VERSION_NUMBER;

    try {
      // Fetch latest version metadata directly from GitHub repository raw source
      const res = await fetch(`https://raw.githubusercontent.com/ExraaG/Warden/main/version.json?t=${Date.now()}`, {
        headers: {
          'User-Agent': 'Warden-Server-Update-Checker',
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub version.json returned HTTP ${res.status}`);
      }

      const remoteData: any = await res.json();
      const latestVer = remoteData.version || 'v1';
      const latestVerNum = typeof remoteData.versionNumber === 'number' 
        ? remoteData.versionNumber 
        : parseInt(String(latestVer).replace(/\D/g, ''), 10) || 1;
      const releaseTitle = remoteData.releaseTitle || `Warden ${latestVer} Release`;
      const releaseDate = remoteData.releaseDate || new Date().toISOString();

      // Simple, deterministic numeric comparison: update available only if remote version > installed version
      const updateAvailable = latestVerNum > currentVerNum;

      const result: SystemUpdateStatus = {
        updateAvailable,
        version: currentVer,
        currentCommit: currentVer,
        latestCommit: latestVer,
        currentVersionNumber: currentVerNum,
        latestVersionNumber: latestVerNum,
        commitMessage: releaseTitle,
        commitDate: releaseDate,
        author: 'Warden Team',
      };

      this.cachedStatus = { timestamp: Date.now(), data: result };
      return result;
    } catch (err: any) {
      console.warn('[SystemUpdater] Failed to check for updates from GitHub:', err.message);
      const fallback: SystemUpdateStatus = {
        updateAvailable: false,
        version: currentVer,
        currentCommit: currentVer,
        latestCommit: currentVer,
        currentVersionNumber: currentVerNum,
        latestVersionNumber: currentVerNum,
        error: err.message,
      };
      return fallback;
    }
  }

  private static isUpdating = false;

  public static async performSelfUpdate(): Promise<{ success: boolean; message: string }> {
    if (this.isUpdating) {
      return { success: true, message: 'Update already in progress' };
    }
    this.isUpdating = true;
    console.log('[SystemUpdater] Initiating system update sequence in background...');

    this.progressState = {
      status: 'stopping_servers',
      step: 1,
      totalSteps: 4,
      stepName: 'Flushing chunk saves & stopping Minecraft servers...',
      percent: 20,
      details: 'Preserving world directories, player data, and configurations.',
    };

    // Run update sequence asynchronously so HTTP response returns immediately
    setImmediate(async () => {
      try {
        // 1. Gracefully stop all active Minecraft servers to flush world saves
        try {
          const servers = await serverManager.getServers();
          for (const s of servers) {
            if (s.status !== 'offline') {
              console.log(`[SystemUpdater] Stopping server '${s.name}' (${s.id}) to preserve world data...`);
              await Promise.race([
                serverManager.stopServer(s.id),
                new Promise((resolve) => setTimeout(resolve, 10000)),
              ]).catch(() => {});
            }
          }
        } catch (err: any) {
          console.warn('[SystemUpdater] Server stop warning:', err.message);
        }

        // 2. Pull or download latest release from GitHub
        this.progressState = {
          status: 'pulling',
          step: 2,
          totalSteps: 4,
          stepName: 'Pulling latest release from GitHub (main)...',
          percent: 50,
          details: 'Fetching updated source code and version metadata.',
        };

        const rootDir = path.resolve(process.cwd());
        const hasGit = fs.existsSync(path.join(rootDir, '.git')) || fs.existsSync(path.join(rootDir, '..', '.git'));

        if (hasGit) {
          console.log('[SystemUpdater] Running git pull origin main...');
          await execPromise('git pull origin main', { timeout: 45000 });
        } else {
          console.log('[SystemUpdater] Running in container/archive mode. Fetching latest release...');
          try {
            await execPromise(
              'git clone --depth 1 https://github.com/ExraaG/Warden.git /tmp/warden-update && cp -r /tmp/warden-update/* ./ && rm -rf /tmp/warden-update',
              { timeout: 60000 }
            );
          } catch {
            await execPromise(
              'curl -sL https://github.com/ExraaG/Warden/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && cp -r /tmp/Warden-main/* ./ && rm -rf /tmp/Warden-main',
              { timeout: 60000 }
            );
          }
        }

        // 3. Fast build
        this.progressState = {
          status: 'building',
          step: 3,
          totalSteps: 4,
          stepName: 'Compiling packages and building production bundle...',
          percent: 80,
          details: 'Building optimized Next.js bundle and TypeScript backend...',
        };

        console.log('[SystemUpdater] Building updated application...');
        await execPromise('cd server && NEXT_TELEMETRY_DISABLED=1 npx next build --no-lint && npm run build:server', {
          timeout: 180000,
        }).catch(async () => {
          await execPromise('npm run build:fast || npm run build', { timeout: 180000 });
        });

        // 4. Restarting
        this.progressState = {
          status: 'restarting',
          step: 4,
          totalSteps: 4,
          stepName: 'Restarting Warden services and reloading application...',
          percent: 100,
          details: 'Application restarted successfully. Reconnecting...',
        };

        console.log('[SystemUpdater] Update built successfully. Restarting process in 2 seconds...');
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } catch (err: any) {
        console.error('[SystemUpdater] Self-update failed:', err);
        this.isUpdating = false;
        this.progressState = {
          status: 'error',
          step: 4,
          totalSteps: 4,
          stepName: 'Update failed: ' + (err.message || 'Unknown error'),
          percent: 100,
          error: err.message,
        };
      }
    });

    return {
      success: true,
      message: 'Update sequence started in background. Servers are being saved.',
    };
  }
}

