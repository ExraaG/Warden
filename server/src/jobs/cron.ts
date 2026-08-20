import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { serverManager } from '../core/serverManager.js';
import { modrinthAdapter } from '../adapters/modrinth.js';
import { db } from '../db/storage.js';
import { loaderDetector } from '../detection/loader.js';
import { config } from '../config.js';
import { JobLog, JobStep, JobTrigger, ScheduledTask, WardenServer, ModrinthVersion } from '@warden/shared';

export class UpdateJobRunner {
  private isRunning = false;
  private cronTasks: cron.ScheduledTask[] = [];

  public initCron(): void {
    this.reloadCronSchedules();
  }

  public reloadCronSchedules(): void {
    // Cancel existing scheduled tasks
    for (const task of this.cronTasks) {
      task.stop();
    }
    this.cronTasks = [];

    const settings = db.getSettings();
    const tz = settings.timezone || config.timezone || 'UTC';

    // 1. Auto Mod Update Schedule
    const autoUpdateEnabled = settings.autoUpdateEnabled !== false;
    let cronExpr = settings.autoUpdateCron;
    if (!cronExpr) {
      const timeStr = settings.autoUpdateTime || '04:00';
      const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
      cronExpr = `${m} ${h} * * *`;
    }

    if (autoUpdateEnabled && cron.validate(cronExpr)) {
      const autoTask = cron.schedule(
        cronExpr,
        async () => {
          console.log(`[Cron] Triggering automated scheduled mod update job (${cronExpr})...`);
          await this.runUpdateJob('scheduled_4am');
        },
        { timezone: tz }
      );
      this.cronTasks.push(autoTask);
      console.log(`[Cron] Automated mod update job scheduled: '${cronExpr}' (${tz}).`);
    } else {
      console.log('[Cron] Automated mod updates are disabled.');
    }

    // 1.5 Auto Server Restart Schedule
    const autoRestartEnabled = Boolean(settings.autoRestartEnabled);
    let restartCronExpr = settings.autoRestartCron;
    if (!restartCronExpr) {
      const timeStr = settings.autoRestartTime || '05:00';
      const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
      restartCronExpr = `${m} ${h} * * *`;
    }

    if (autoRestartEnabled && cron.validate(restartCronExpr)) {
      const restartTask = cron.schedule(
        restartCronExpr,
        async () => {
          console.log(`[Cron] Triggering automated scheduled server restart (${restartCronExpr})...`);
          await this.runDailyRestartJob();
        },
        { timezone: tz }
      );
      this.cronTasks.push(restartTask);
      console.log(`[Cron] Automated server restart job scheduled: '${restartCronExpr}' (${tz}).`);
    }

    // 2. Custom User Tasks
    const customTasks = db.getCustomTasks();
    for (const task of customTasks) {
      if (!task.enabled) continue;

      if (task.triggerType === 'on_mod_update') {
        continue;
      }

      let expr = task.cronExpression;
      if (!expr && task.scheduleTime) {
        const [h, m] = task.scheduleTime.split(':').map((v) => parseInt(v, 10) || 0);
        expr = `${m} ${h} * * *`;
      }

      if (expr && cron.validate(expr)) {
        const ct = cron.schedule(
          expr,
          async () => {
            console.log(`[Cron] Executing scheduled task '${task.name}' (${expr})...`);
            await this.executeCustomTask(task);
          },
          { timezone: tz }
        );
        this.cronTasks.push(ct);
        console.log(`[Cron] Custom task '${task.name}' scheduled: '${expr}'.`);
      }
    }
  }

  public async executeCustomTask(task: ScheduledTask): Promise<boolean> {
    try {
      const servers = await serverManager.getServers();
      const targetServers = task.serverId && task.serverId !== 'all'
        ? servers.filter((s) => s.id === task.serverId)
        : servers;

      for (const server of targetServers) {
        if (task.action === 'restart_server') {
          console.log(`[Cron Task][${task.name}] Restarting server ${server.name} (${server.id})...`);
          await serverManager.restartServer(server.id);
        } else if (task.action === 'stop_server') {
          console.log(`[Cron Task][${task.name}] Stopping server ${server.name} (${server.id})...`);
          await serverManager.stopServer(server.id);
        } else if (task.action === 'start_server') {
          console.log(`[Cron Task][${task.name}] Starting server ${server.name} (${server.id})...`);
          await serverManager.startServer(server.id);
        } else if (task.action === 'run_mod_updates') {
          console.log(`[Cron Task][${task.name}] Running mod updates for ${server.name} (${server.id})...`);
          await this.runUpdateJob('scheduled_4am', server.id);
        } else if (task.action === 'console_command' && task.command) {
          console.log(`[Cron Task][${task.name}] Sending command '${task.command}' to ${server.name}...`);
          serverManager.sendCommand(server.id, task.command);
        }
      }

      db.updateCustomTask(task.id, {
        lastRun: new Date().toISOString(),
        lastStatus: 'success',
      });
      return true;
    } catch (err: any) {
      console.error(`[Cron Task] Failed executing task '${task.name}':`, err);
      db.updateCustomTask(task.id, {
        lastRun: new Date().toISOString(),
        lastStatus: 'failed',
      });
      return false;
    }
  }

  public async triggerModUpdateTasks(serverId: string, updatedModFilenames: string[]): Promise<void> {
    const customTasks = db.getCustomTasks().filter((t) => t.enabled && t.triggerType === 'on_mod_update');
    for (const task of customTasks) {
      if (task.serverId && task.serverId !== 'all' && task.serverId !== serverId) {
        continue;
      }
      if (task.targetMod) {
        const matchesMod = updatedModFilenames.some((fn) =>
          fn.toLowerCase().includes(task.targetMod!.toLowerCase())
        );
        if (!matchesMod) continue;
      }
      console.log(`[Event Trigger] Mod update event fired for task '${task.name}' on server ${serverId}...`);
      await this.executeCustomTask(task);
    }
  }

  public async runDailyRestartJob(): Promise<void> {
    try {
      const servers = await serverManager.getServers();
      const onlineServers = servers.filter((s) => s.status === 'online');
      for (const server of onlineServers) {
        console.log(`[Cron] Executing scheduled daily restart for server '${server.name}' (${server.id})...`);
        await serverManager.restartServer(server.id);
      }
    } catch (err: any) {
      console.error('[Cron] Error during scheduled daily restart:', err);
    }
  }

  public async runUpdateJob(trigger: JobTrigger, targetServerId?: string): Promise<JobLog[]> {
    if (this.isRunning) {
      console.log('[Cron] Update job is already running, skipping trigger.');
      return [];
    }

    this.isRunning = true;
    const logs: JobLog[] = [];

    try {
      const servers = await serverManager.getServers();
      const candidates = targetServerId
        ? servers.filter((s) => s.id === targetServerId)
        : servers;

      for (const server of candidates) {
        const log = await this.updateServerMods(server, trigger);
        logs.push(log);
        db.addJobLog(log);
      }
    } catch (err: any) {
      console.error('[Cron] Fatal error running update job:', err);
    } finally {
      this.isRunning = false;
    }

    return logs;
  }

  private async updateServerMods(server: WardenServer, trigger: JobTrigger): Promise<JobLog> {
    const timestamp = new Date().toISOString();
    const steps: JobStep[] = [];
    let modsUpdatedCount = 0;

    const logStep = (step: string, level: JobStep['level'], message: string) => {
      steps.push({ timestamp: new Date().toISOString(), step, level, message });
      console.log(`[Job][${server.name}][${step}] ${message}`);
    };

    logStep('start', 'info', `Beginning update job (${trigger}) for server ${server.name}...`);

    // Verify Loader and MC Version confirmation
    const detection = db.getServerDetection(server.id) || server.detection;
    if (!detection || !detection.isConfirmed || !detection.mcVersion) {
      logStep(
        'detection_check',
        'warn',
        `Server loader/MC version not confirmed. Skipping automated update.`
      );
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'skipped',
        steps,
        modsUpdated: 0,
        summary: 'Skipped: Loader / Minecraft version unconfirmed by operator.',
      };
    }

    logStep(
      'detection_check',
      'info',
      `Confirmed loader '${detection.loader}' with Minecraft ${detection.mcVersion}.`
    );

    // List installed mod files
    let remoteFiles: any[] = [];
    try {
      remoteFiles = await serverManager.listFiles(server.id, 'mods');
    } catch (err: any) {
      logStep('list_mods', 'error', `Failed to list mods folder: ${err.message}`);
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'failed',
        steps,
        modsUpdated: 0,
        summary: 'Failed to list mods folder.',
      };
    }

    const jarFiles = remoteFiles.filter((f) => !f.isDir && (f.name || '').endsWith('.jar'));
    if (jarFiles.length === 0) {
      logStep('hash_batch', 'info', 'Skipped: No .jar mod files found in server mods folder.');
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'skipped',
        steps,
        modsUpdated: 0,
        summary: 'No mods installed on server.',
      };
    }

    const srvDir = serverManager.getServerDir(server.id);
    const modsDir = path.join(srvDir, 'mods');
    const hashesToQuery: string[] = [];
    const hashToFileMap = new Map<string, string>();

    for (const f of jarFiles) {
      const fullPath = path.join(modsDir, f.name);
      try {
        const buf = await fs.promises.readFile(fullPath);
        const hash = crypto.createHash('sha512').update(buf).digest('hex');
        hashesToQuery.push(hash);
        hashToFileMap.set(hash, f.name);
      } catch (err: any) {
        logStep('hash_compute', 'warn', `Failed to compute hash for ${f.name}: ${err.message}`);
      }
    }

    if (hashesToQuery.length === 0) {
      logStep('hash_batch', 'warn', 'No mod hashes computed. Skipping update.');
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'skipped',
        steps,
        modsUpdated: 0,
        summary: 'No valid mod files could be hashed.',
      };
    }

    logStep('modrinth_hash_batch', 'info', `Querying Modrinth for ${hashesToQuery.length} installed mod hashes...`);
    let updateMap: Record<string, ModrinthVersion> = {};
    try {
      updateMap = await modrinthAdapter.checkVersionUpdates(
        hashesToQuery,
        [detection.loader],
        [detection.mcVersion]
      );
    } catch (err: any) {
      logStep('modrinth_hash_batch', 'error', `Modrinth API query failed: ${err.message}`);
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'failed',
        steps,
        modsUpdated: 0,
        summary: `Modrinth update query failed: ${err.message}`,
      };
    }

    const pendingUpdates: Array<{ oldFilename: string; newVersion: ModrinthVersion }> = [];
    for (const [hash, newVer] of Object.entries(updateMap)) {
      const oldFilename = hashToFileMap.get(hash);
      if (oldFilename && newVer) {
        pendingUpdates.push({ oldFilename, newVersion: newVer });
      }
    }

    if (pendingUpdates.length === 0) {
      logStep('modrinth_hash_batch', 'info', 'All installed mods are up to date! Nothing to update.');
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'skipped',
        steps,
        modsUpdated: 0,
        summary: 'All mods are currently up to date.',
      };
    }

    logStep('modrinth_hash_batch', 'info', `Found ${pendingUpdates.length} mod updates available.`);

    // Download & verify stage
    const stagedFiles: Array<{ filename: string; buffer: Buffer; oldFilename?: string }> = [];
    for (const update of pendingUpdates) {
      const fileInfo =
        update.newVersion.dependencies && update.newVersion.downloadUrl
          ? { url: update.newVersion.downloadUrl, filename: update.newVersion.filename, sha512: update.newVersion.sha512 }
          : null;

      if (!fileInfo || !fileInfo.url) {
        logStep('download_verify', 'warn', `No download URL for version ${update.newVersion.name}, skipping.`);
        continue;
      }

      logStep('download_verify', 'info', `Downloading ${fileInfo.filename}...`);
      try {
        const buf = await modrinthAdapter.downloadModFile(fileInfo.url, fileInfo.sha512);
        stagedFiles.push({ filename: fileInfo.filename, buffer: buf, oldFilename: update.oldFilename });
        logStep('download_verify', 'success', `Verified checksum for ${fileInfo.filename}.`);
      } catch (err: any) {
        logStep('download_verify', 'error', `Failed download/verification of ${fileInfo.filename}: ${err.message}`);
      }
    }

    if (stagedFiles.length === 0) {
      logStep('download_verify', 'warn', 'No files could be downloaded and verified. Aborting update.');
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'failed',
        steps,
        modsUpdated: 0,
        summary: 'All mod downloads failed checksum verification.',
      };
    }

    // Safety backup of mods folder
    logStep('backup', 'info', 'Creating safety backup of current mods folder...');
    const backupDir = path.join(db.getBackupsDir(), server.id, Date.now().toString());
    await fs.promises.mkdir(backupDir, { recursive: true });

    try {
      const existingMods = await fs.promises.readdir(modsDir);
      for (const m of existingMods) {
        await fs.promises.copyFile(path.join(modsDir, m), path.join(backupDir, m));
      }
      logStep('backup', 'success', `Backup complete in ${backupDir}.`);
    } catch (err: any) {
      logStep('backup', 'warn', `Backup warning: ${err.message}`);
    }

    // Stop server before swapping files
    logStep('stop_server', 'info', 'Stopping server prior to mod replacement...');
    try {
      await serverManager.stopServer(server.id);
      await this.waitForStatus(server.id, 'offline', 30);
      logStep('stop_server', 'success', 'Server stopped successfully.');
    } catch (err: any) {
      logStep('stop_server', 'error', `Failed to stop server cleanly: ${err.message}`);
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'failed',
        steps,
        modsUpdated: 0,
        summary: 'Failed to stop server prior to update.',
      };
    }

    // Swap files stage
    logStep('swap_files', 'info', 'Swapping old mod jars for new verified versions...');
    for (const staged of stagedFiles) {
      try {
        if (staged.oldFilename) {
          const oldPath = path.join(modsDir, staged.oldFilename);
          if (fs.existsSync(oldPath)) await fs.promises.unlink(oldPath);
        }
        await fs.promises.writeFile(path.join(modsDir, staged.filename), staged.buffer);
        modsUpdatedCount++;
      } catch (err: any) {
        logStep('swap_files', 'error', `Error swapping file ${staged.filename}: ${err.message}`);
      }
    }

    // Verify directory contents
    logStep('verify_directory', 'info', 'Verifying server mods directory contents...');
    try {
      const currentMods = await serverManager.listFiles(server.id, 'mods');
      logStep('verify_directory', 'success', `Mods folder verified. ${currentMods.length} items present.`);
    } catch (err: any) {
      logStep('verify_directory', 'warn', `Could not verify directory contents: ${err.message}`);
    }

    // Start server & poll health
    logStep('start_server', 'info', 'Starting server and monitoring launch status...');
    try {
      await serverManager.startServer(server.id);
      const started = await this.waitForStatus(server.id, 'online', 180);

      if (!started) {
        throw new Error('Server failed to reach online status within 3 minutes of launch.');
      }

      logStep('start_server', 'success', `Server started successfully and passed health checks! Updated ${modsUpdatedCount} mods.`);

      this.triggerModUpdateTasks(server.id, stagedFiles.map((s) => s.filename)).catch((err) => {
        console.error('[Cron] Error executing mod update tasks:', err);
      });

      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'success',
        steps,
        modsUpdated: modsUpdatedCount,
        summary: `Successfully updated ${modsUpdatedCount} mods and verified server health.`,
      };

    } catch (err: any) {
      // AUTOMATIC ROLLBACK TRIGGERED
      logStep('rollback_trigger', 'error', `AUTOMATIC ROLLBACK TRIGGERED! Reason: ${err.message}`);
      logStep('rollback_action', 'info', 'Restoring original mod files and restarting server...');

      try {
        await serverManager.stopServer(server.id);
        // Remove newly staged files
        for (const staged of stagedFiles) {
          const p = path.join(modsDir, staged.filename);
          if (fs.existsSync(p)) await fs.promises.unlink(p);
        }
        // Restore from backup
        const backupFiles = await fs.promises.readdir(backupDir);
        for (const bf of backupFiles) {
          await fs.promises.copyFile(path.join(backupDir, bf), path.join(modsDir, bf));
        }
        await serverManager.startServer(server.id);
        logStep('rollback_action', 'success', 'Automatic rollback completed. Server restored with original mods.');
      } catch (rollbackErr: any) {
        logStep('rollback_action', 'error', `Critical error during rollback: ${rollbackErr.message}`);
      }

      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'rolled_back',
        steps,
        modsUpdated: 0,
        summary: `Update failed (${err.message}). Automatic rollback performed.`,
      };
    }
  }

  private async waitForStatus(serverId: string, targetStatus: 'online' | 'offline', timeoutSec: number): Promise<boolean> {
    const start = Date.now();
    while ((Date.now() - start) / 1000 < timeoutSec) {
      try {
        const stats = serverManager.getServerStats(serverId);
        if (targetStatus === 'online' && stats.uptimeSeconds > 0) return true;
        if (targetStatus === 'offline' && stats.uptimeSeconds === 0) return true;
      } catch (err) {}
      if (config.devFixtureMode) return true;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return false;
  }
}

export const updateJobRunner = new UpdateJobRunner();
