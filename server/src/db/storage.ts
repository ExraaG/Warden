import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { DetectionState, JobLog, ScheduledTask, WardenSettings } from '@warden/shared';

interface StorageData {
  settings: WardenSettings;
  serverDetections: Record<string, DetectionState>;
  jobLogs: JobLog[];
  customTasks: ScheduledTask[];
}

const DEFAULT_SETTINGS: WardenSettings = {
  craftyUrl: '',
  craftyApiKeySet: false,
  wardenApiKeySet: Boolean(config.wardenApiKey),
  timezone: config.timezone,
  autoUpdateEnabled: true,
  autoUpdateTime: '04:00',
  autoUpdateCron: '0 4 * * *',
  schemaValidated: true,
  customTasks: [],
};

export class Storage {
  private dataDir: string;
  private filePath: string;
  private data: StorageData;

  constructor() {
    this.dataDir = config.dataDir;
    this.filePath = path.join(this.dataDir, 'warden_storage.json');
    this.ensureDirs();
    this.data = this.load();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const stagedDir = path.join(this.dataDir, 'staged');
    const backupsDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(stagedDir)) fs.mkdirSync(stagedDir, { recursive: true });
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  }

  private load(): StorageData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const loadedSettings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        return {
          settings: loadedSettings,
          serverDetections: parsed.serverDetections || {},
          jobLogs: parsed.jobLogs || [],
          customTasks: parsed.customTasks || loadedSettings.customTasks || [],
        };
      }
    } catch (error) {
      console.error('[Storage] Error loading storage file, using defaults:', error);
    }
    return {
      settings: DEFAULT_SETTINGS,
      serverDetections: {},
      jobLogs: [],
      customTasks: [],
    };
  }

  private save(): void {
    try {
      this.ensureDirs();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Storage] Error saving storage file:', error);
    }
  }

  public getSettings(): WardenSettings {
    return {
      ...this.data.settings,
      customTasks: this.getCustomTasks(),
    };
  }

  public updateSettings(partial: Partial<WardenSettings>): WardenSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    if (partial.customTasks) {
      this.data.customTasks = [...partial.customTasks];
    }
    this.save();
    return this.getSettings();
  }

  public getServerDetection(serverId: string): DetectionState | undefined {
    return this.data.serverDetections[serverId];
  }

  public setServerDetection(serverId: string, state: DetectionState): void {
    this.data.serverDetections[serverId] = state;
    this.save();
  }

  public getAllServerDetections(): Record<string, DetectionState> {
    return { ...this.data.serverDetections };
  }

  public getJobLogs(): JobLog[] {
    return [...this.data.jobLogs];
  }

  public addJobLog(log: JobLog): void {
    this.data.jobLogs.unshift(log);
    // Keep max 100 job logs
    if (this.data.jobLogs.length > 100) {
      this.data.jobLogs = this.data.jobLogs.slice(0, 100);
    }
    this.save();
  }

  public getCustomTasks(): ScheduledTask[] {
    return [...(this.data.customTasks || [])];
  }

  public addCustomTask(task: ScheduledTask): ScheduledTask[] {
    if (!this.data.customTasks) this.data.customTasks = [];
    this.data.customTasks.push(task);
    this.save();
    return this.getCustomTasks();
  }

  public updateCustomTask(id: string, partial: Partial<ScheduledTask>): ScheduledTask[] {
    if (!this.data.customTasks) this.data.customTasks = [];
    this.data.customTasks = this.data.customTasks.map((t) => (t.id === id ? { ...t, ...partial } : t));
    this.save();
    return this.getCustomTasks();
  }

  public deleteCustomTask(id: string): ScheduledTask[] {
    if (!this.data.customTasks) this.data.customTasks = [];
    this.data.customTasks = this.data.customTasks.filter((t) => t.id !== id);
    this.save();
    return this.getCustomTasks();
  }

  public getStagedDir(): string {
    return path.join(this.dataDir, 'staged');
  }

  public getBackupsDir(): string {
    return path.join(this.dataDir, 'backups');
  }
}

export const db = new Storage();

