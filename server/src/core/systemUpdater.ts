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

    // 2. Perform git pull and fast rebuild in background
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
          stepName: 'Compiling packages and building production bundle...',
          percent: 75,
          details: 'Building with fast optimization. Please wait...',
        };

        // Fast build skipping unnecessary linter/telemetry steps
        await execPromise('npm run build:fast || npm run build', { timeout: 180000 });
        console.log('[SystemUpdater] Fast build completed successfully.');

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

