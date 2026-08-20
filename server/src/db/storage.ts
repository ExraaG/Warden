import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { DetectionState, JobLog, ScheduledTask, WardenSettings, WardenUser } from '@warden/shared';

interface StorageData {
  settings: WardenSettings;
  serverDetections: Record<string, DetectionState>;
  jobLogs: JobLog[];
  customTasks: ScheduledTask[];
  users: WardenUser[];
  authSecret?: string;
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
    this.cleanupExpiredUsers();
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
          users: Array.isArray(parsed.users) ? parsed.users : [],
          authSecret: parsed.authSecret || crypto.randomBytes(32).toString('hex'),
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
      users: [],
      authSecret: crypto.randomBytes(32).toString('hex'),
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

  public removeServerDetection(serverId: string): void {
    delete this.data.serverDetections[serverId];
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

  // ── AUTH & USER METHODS ──

  public getAuthSecret(): string {
    if (!this.data.authSecret) {
      this.data.authSecret = crypto.randomBytes(32).toString('hex');
      this.save();
    }
    return this.data.authSecret;
  }

  public getUsers(): WardenUser[] {
    this.cleanupExpiredUsers();
    return [...(this.data.users || [])];
  }

  public getHasUsers(): boolean {
    this.cleanupExpiredUsers();
    return (this.data.users || []).some((u) => u.role === 'admin');
  }

  public getUserByUsername(username: string): WardenUser | undefined {
    this.cleanupExpiredUsers();
    const cleanUsername = username.trim().toLowerCase();
    return (this.data.users || []).find(
      (u) => u.username.toLowerCase() === cleanUsername
    );
  }

  public getUserById(id: string): WardenUser | undefined {
    this.cleanupExpiredUsers();
    return (this.data.users || []).find((u) => u.id === id);
  }

  public createUser(user: WardenUser): WardenUser {
    if (!this.data.users) this.data.users = [];
    // Remove any existing user with same ID or username
    this.data.users = this.data.users.filter(
      (u) => u.id !== user.id && u.username.toLowerCase() !== user.username.toLowerCase()
    );
    this.data.users.push(user);
    this.save();
    return user;
  }

  public updateUser(id: string, partial: Partial<WardenUser>): WardenUser | undefined {
    if (!this.data.users) this.data.users = [];
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return undefined;
    this.data.users[index] = {
      ...this.data.users[index],
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.users[index];
  }

  public deleteUser(id: string): boolean {
    if (!this.data.users) return false;
    const initialLen = this.data.users.length;
    this.data.users = this.data.users.filter((u) => u.id !== id);
    if (this.data.users.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public clearAllServerDetections(): void {
    this.data.serverDetections = {};
    this.save();
  }

  public deleteAllUsers(exceptUserId?: string): number {
    if (!this.data.users) return 0;
    const initialLen = this.data.users.length;
    if (exceptUserId) {
      this.data.users = this.data.users.filter((u) => u.id === exceptUserId);
    } else {
      this.data.users = [];
    }
    const deletedCount = initialLen - this.data.users.length;
    this.save();
    return deletedCount;
  }

  public cleanupExpiredUsers(): void {
    if (!this.data.users) return;
    const now = Date.now();
    const beforeCount = this.data.users.length;
    this.data.users = this.data.users.filter((u) => {
      if (!u.expiresAt) return true;
      const exp = new Date(u.expiresAt).getTime();
      return exp > now;
    });
    if (this.data.users.length !== beforeCount) {
      this.save();
    }
  }
}

export const db = new Storage();


