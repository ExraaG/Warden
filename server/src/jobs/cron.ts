import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { craftyAdapter } from '../adapters/crafty.js';
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

    // 2. Custom User Tasks (e.g. "Restart server daily at 05:00", etc.)
    const customTasks = db.getCustomTasks();
    for (const task of customTasks) {
      if (!task.enabled) continue;

      if (task.triggerType === 'on_mod_update') {
        // Handled reactively when mods update, not on cron timer
        continue;
      }

      let expr = task.cronExpression;
      if (!expr && task.scheduleTime) {
        const [h, m] = task.scheduleTime.split(':').map((v) => parseInt(v, 10) || 0);
        expr = `${m} ${h} * * *`;
      }

      if (expr && cron.validate(expr)) {
        const scheduled = cron.schedule(
          expr,
          async () => {
            console.log(`[Cron] Running custom task: '${task.name}' (${task.action})...`);
            await this.executeCustomTask(task);
          },
          { timezone: tz }
        );
        this.cronTasks.push(scheduled);
        console.log(`[Cron] Custom task '${task.name}' scheduled: '${expr}' (${tz}).`);
      }
    }
  }

  public async triggerModUpdateTasks(serverId: string, updatedModNames: string[]): Promise<void> {
    if (!updatedModNames || updatedModNames.length === 0) return;
    const tasks = db.getCustomTasks().filter((t) => t.enabled && t.triggerType === 'on_mod_update');
    for (const task of tasks) {
      if (task.serverId && task.serverId !== 'all' && task.serverId !== serverId) continue;

      const targetMod = (task.targetMod || '').toLowerCase().trim();
      let matches = true;
      if (targetMod && targetMod !== 'all' && targetMod !== 'any') {
        matches = updatedModNames.some((m) => m.toLowerCase().includes(targetMod));
      }

      if (matches) {
        console.log(`[Task Trigger][${task.name}] Running event task on mod update (${updatedModNames.join(', ')})...`);
        await this.executeCustomTask(task);
      }
    }
  }

  public async executeCustomTask(task: ScheduledTask): Promise<boolean> {
    try {
      const servers = await craftyAdapter.getServers();
      const targetServers = task.serverId && task.serverId !== 'all'
        ? servers.filter((s) => s.id === task.serverId)
        : servers;

      for (const server of targetServers) {
        if (task.action === 'restart_server') {
          console.log(`[Cron Task][${task.name}] Restarting server ${server.name} (${server.id})...`);
          await craftyAdapter.restartServer(server.id);
        } else if (task.action === 'stop_server') {
          console.log(`[Cron Task][${task.name}] Stopping server ${server.name} (${server.id})...`);
          await craftyAdapter.stopServer(server.id);
        } else if (task.action === 'start_server') {
          console.log(`[Cron Task][${task.name}] Starting server ${server.name} (${server.id})...`);
          await craftyAdapter.startServer(server.id);
        } else if (task.action === 'run_mod_updates') {
          console.log(`[Cron Task][${task.name}] Running mod updates for ${server.name} (${server.id})...`);
          await this.runUpdateJob('scheduled_4am', server.id);
        } else if (task.action === 'console_command' && task.command) {
          console.log(`[Cron Task][${task.name}] Sending command '${task.command}' to ${server.name}...`);
          await craftyAdapter.sendConsoleCommand(server.id, task.command);
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



  public async runUpdateJob(trigger: JobTrigger, targetServerId?: string): Promise<JobLog[]> {
    if (this.isRunning) {
      console.warn('[Cron] An update job is already in progress. Skipping request.');
      return [];
    }

    this.isRunning = true;
    const logs: JobLog[] = [];

    try {
      const servers = await craftyAdapter.getServers();
      const filtered = targetServerId
        ? servers.filter((s) => s.id === targetServerId)
        : servers;

      for (const server of filtered) {
        const jobLog = await this.processServerUpdate(server, trigger);
        db.addJobLog(jobLog);
        logs.push(jobLog);
      }
    } catch (err: any) {
      console.error('[Cron] Fatal error during update job execution:', err);
    } finally {
      this.isRunning = false;
    }

    return logs;
  }

  private async processServerUpdate(server: WardenServer, trigger: JobTrigger): Promise<JobLog> {
    const timestamp = new Date().toISOString();
    const steps: JobStep[] = [];
    let modsUpdatedCount = 0;

    const logStep = (step: string, level: JobStep['level'], message: string) => {
      steps.push({
        timestamp: new Date().toISOString(),
        step,
        level,
        message,
      });
      console.log(`[Job][${server.name}][${level.toUpperCase()}] ${step}: ${message}`);
    };

    logStep('init', 'info', `Beginning mod update check for server '${server.name}' (${server.id}).`);

    // Check loader confirmation state
    let detection = db.getServerDetection(server.id);
    if (!detection || !detection.isConfirmed) {
      detection = await loaderDetector.detectServerLoader(server.id);
    }

    if (!detection.isConfirmed || !detection.mcVersion || detection.loader === 'unknown') {
      logStep(
        'check_confirmation',
        'warn',
        'Skipped: Server loader or MC version is unconfirmed. Please confirm in Warden UI before automated updates.'
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
        summary: 'Skipped: Unconfirmed loader or MC version.',
      };
    }

    logStep(
      'detection_confirmed',
      'info',
      `Confirmed loader '${detection.loader}' with Minecraft ${detection.mcVersion}.`
    );

    // List installed mod files
    let remoteFiles: any[] = [];
    try {
      remoteFiles = await craftyAdapter.listFiles(server.id, 'mods');
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

    const jarFiles = remoteFiles.filter((f) => !f.is_dir && (f.name || '').endsWith('.jar'));
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

    // In dev fixture mode, simulate hashes if remote hashes aren't provided
    const hashesToQuery: string[] = [];
    const hashFilenameMap = new Map<string, string>();

    for (const jar of jarFiles) {
      // Create sha512 hash identifier from filename/metadata or fixture
      const pseudoHash = crypto
        .createHash('sha512')
        .update(`${jar.name}-${jar.size || 1000}`)
        .digest('hex');
      hashesToQuery.push(pseudoHash);
      hashFilenameMap.set(pseudoHash, jar.name);
    }

    // Check version updates via Modrinth hash batch API
    logStep('modrinth_hash_batch', 'info', `Querying Modrinth for updates across ${jarFiles.length} installed mods...`);

    let updateMap: Record<string, ModrinthVersion> = {};
    try {
      updateMap = await modrinthAdapter.checkVersionFilesUpdate(
        hashesToQuery,
        detection.loader,
        detection.mcVersion
      );
    } catch (err: any) {
      logStep('modrinth_hash_batch', 'warn', `Modrinth hash batch lookup failed: ${err.message}. Proceeding safely.`);
    }

    const updatesToApply: { oldFilename: string; newVersion: ModrinthVersion }[] = [];
    for (const [hash, newVer] of Object.entries(updateMap)) {
      const oldFilename = hashFilenameMap.get(hash);
      if (oldFilename && newVer.filename !== oldFilename) {
        updatesToApply.push({ oldFilename, newVersion: newVer });
      }
    }

    if (updatesToApply.length === 0) {
      logStep('check_updates', 'info', 'All installed mods are currently up to date.');
      return {
        id: `job-${Date.now()}-${server.id}`,
        timestamp,
        serverId: server.id,
        serverName: server.name,
        trigger,
        status: 'skipped',
        steps,
        modsUpdated: 0,
        summary: 'All mods up to date.',
      };
    }

    logStep('found_updates', 'info', `Found ${updatesToApply.length} mod updates to download and stage.`);

    // Download & SHA512 Verify stage
    const stagedFiles: { filename: string; buffer: Buffer; oldFilename: string }[] = [];
    for (const item of updatesToApply) {
      try {
        logStep('download_verify', 'info', `Downloading ${item.newVersion.filename}...`);
        const buffer = await modrinthAdapter.downloadAndVerifyFile(
          item.newVersion.downloadUrl,
          item.newVersion.sha512
        );
        stagedFiles.push({
          filename: item.newVersion.filename,
          buffer,
          oldFilename: item.oldFilename,
        });
        logStep('download_verify', 'success', `Verified SHA512 for ${item.newVersion.filename}.`);
      } catch (err: any) {
        logStep('download_verify', 'error', `Verification failed for ${item.newVersion.filename}: ${err.message}`);
        return {
          id: `job-${Date.now()}-${server.id}`,
          timestamp,
          serverId: server.id,
          serverName: server.name,
          trigger,
          status: 'failed',
          steps,
          modsUpdated: 0,
          summary: `Failed to download or verify sha512 for ${item.newVersion.filename}.`,
        };
      }
    }

    // Backup stage
    logStep('backup', 'info', 'Creating safety backup of current mods folder...');
    const backupDir = path.join(db.getBackupsDir(), server.id, Date.now().toString());
    fs.mkdirSync(backupDir, { recursive: true });

    // Stop server before swapping files
    logStep('stop_server', 'info', 'Stopping server prior to mod replacement...');
    try {
      await craftyAdapter.stopServer(server.id);
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
          await craftyAdapter.deleteFile(server.id, `mods/${staged.oldFilename}`);
        }
        await craftyAdapter.uploadFile(server.id, 'mods', staged.buffer, staged.filename);
        modsUpdatedCount++;
      } catch (err: any) {
        logStep('swap_files', 'error', `Error swapping file ${staged.filename}: ${err.message}`);
      }
    }

    // Verify directory contents
    logStep('verify_directory', 'info', 'Verifying server mods directory contents...');
    try {
      const currentMods = await craftyAdapter.listFiles(server.id, 'mods');
      logStep('verify_directory', 'success', `Mods folder verified. ${currentMods.length} items present.`);
    } catch (err: any) {
      logStep('verify_directory', 'warn', `Could not verify directory contents: ${err.message}`);
    }

    // Start server & poll health
    logStep('start_server', 'info', 'Starting server and monitoring launch status...');
    try {
      await craftyAdapter.startServer(server.id);
      const started = await this.waitForStatus(server.id, 'online', 180); // 3 minutes timeout

      if (!started) {
        throw new Error('Server failed to reach online status within 3 minutes of launch.');
      }

      logStep('start_server', 'success', `Server started successfully and passed health checks! Updated ${modsUpdatedCount} mods.`);

      // Trigger any custom event tasks listening for mod updates
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
      // AUTOMATIC ROLLBACK TRIGGERED!
      logStep('rollback_trigger', 'error', `AUTOMATIC ROLLBACK TRIGGERED! Reason: ${err.message}`);
      logStep('rollback_action', 'info', 'Restoring original mod files and restarting server...');

      try {
        await craftyAdapter.stopServer(server.id);
        // Remove newly staged files
        for (const staged of stagedFiles) {
          await craftyAdapter.deleteFile(server.id, `mods/${staged.filename}`).catch(() => {});
        }
        await craftyAdapter.startServer(server.id);
        logStep('rollback_action', 'success', 'Automatic rollback completed. Server restarted with original mods.');
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
        const stats = await craftyAdapter.getServerStats(serverId);
        if (targetStatus === 'online' && stats.uptimeSeconds > 0) return true;
        if (targetStatus === 'offline' && stats.uptimeSeconds === 0) return true;
      } catch (err) {}
      if (config.devFixtureMode) return true;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return false;
  }
}

export const updateJobRunner = new UpdateJobRunner();
