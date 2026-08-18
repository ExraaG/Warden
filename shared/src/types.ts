export type ServerLoader =
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'quilt'
  | 'paper'
  | 'spigot'
  | 'bukkit'
  | 'purpur'
  | 'vanilla'
  | 'unknown';

export type DetectionSource =
  | 'manual_override'
  | 'executable_filename'
  | 'loader_config'
  | 'mod_metadata'
  | 'unconfirmed';

export interface DetectionState {
  loader: ServerLoader;
  mcVersion: string | null;
  isConfirmed: boolean;
  source: DetectionSource;
  warning?: string;
  detectedAt?: string;
}

export type ServerStatus =
  | 'online'
  | 'offline'
  | 'starting'
  | 'stopping'
  | 'updating'
  | 'error';

export interface ServerStats {
  cpuPercent: number;
  memoryBytes: number;
  maxMemoryBytes: number;
  onlinePlayers: number;
  maxPlayers: number;
  uptimeSeconds: number;
}

export interface WardenServer {
  id: string;
  name: string;
  craftyServerId: string;
  status: ServerStatus;
  detection: DetectionState;
  stats?: ServerStats;
  lastBackupPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledMod {
  filename: string;
  size: number;
  sha512: string;
  projectId?: string;
  projectSlug?: string;
  title?: string;
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate: boolean;
  updateVersionId?: string;
  updateDownloadUrl?: string;
  modifiedAt: string;
}

export interface ModrinthSearchItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
  latestVersion?: string;
}

export interface ModrinthDependency {
  projectId: string | null;
  versionId: string | null;
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  downloadUrl: string;
  filename: string;
  sha512: string;
  dependencies: ModrinthDependency[];
}

export type JobTrigger = 'scheduled_4am' | 'manual';
export type JobStatus = 'running' | 'success' | 'rolled_back' | 'skipped' | 'failed';
export type StepLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface JobStep {
  timestamp: string;
  step: string;
  level: StepLogLevel;
  message: string;
}

export interface JobLog {
  id: string;
  timestamp: string;
  serverId: string;
  serverName: string;
  trigger: JobTrigger;
  status: JobStatus;
  steps: JobStep[];
  modsUpdated: number;
  summary: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  serverId?: string; // 'all' or specific server ID
  triggerType?: 'schedule' | 'on_mod_update'; // 'schedule' (time/cron) or 'on_mod_update'
  targetMod?: string; // empty for 'any mod', or specific mod slug/filename e.g. 'simple-voice-chat' or 'fabric-api'
  action: 'restart_server' | 'run_mod_updates' | 'console_command' | 'stop_server' | 'start_server';
  command?: string; // for console_command
  scheduleTime?: string; // e.g. "04:00" (HH:MM daily) or custom cron expression
  cronExpression?: string; // e.g. "0 4 * * *"
  lastRun?: string;
  lastStatus?: 'success' | 'failed';
}


export interface WardenSettings {
  craftyUrl: string;
  craftyApiKeySet: boolean;
  wardenApiKeySet: boolean;
  timezone: string;
  autoUpdateEnabled?: boolean;
  autoUpdateTime?: string; // e.g. "04:00"
  autoUpdateCron?: string; // e.g. "0 4 * * *"
  schemaValidated: boolean;
  schemaLastSync?: string;
  customTasks?: ScheduledTask[];
  schemaFieldNames?: {
    fileListPathField: string;
    uploadTypeField: string;
    uploadServerIdField: string;
    uploadPathField: string;
    uploadFileField: string;
  };
}

export interface MinecraftPlayer {
  name: string;
  uuid?: string;
  isOnline: boolean;
  isWhitelisted: boolean;
  isOp: boolean;
  opLevel?: number;
  isBanned: boolean;
  banReason?: string;
  banSource?: string;
  banExpires?: string;
  isIpBanned: boolean;
  ip?: string;
  lastSeen?: string;
}

export type PlayerActionType =
  | 'whitelist_add'
  | 'whitelist_remove'
  | 'op'
  | 'deop'
  | 'kick'
  | 'ban'
  | 'pardon'
  | 'ban_ip'
  | 'pardon_ip';

export interface PlayerActionPayload {
  name: string;
  action: PlayerActionType;
  reason?: string;
  ip?: string;
}

export interface ServerProperties {
  'server-port'?: string;
  'gamemode'?: string;
  'difficulty'?: string;
  'pvp'?: string;
  'hardcore'?: string;
  'white-list'?: string;
  'enforce-whitelist'?: string;
  'online-mode'?: string;
  'max-players'?: string;
  'view-distance'?: string;
  'simulation-distance'?: string;
  'spawn-protection'?: string;
  'motd'?: string;
  'allow-flight'?: string;
  'allow-nether'?: string;
  'spawn-animals'?: string;
  'spawn-monsters'?: string;
  'spawn-npcs'?: string;
  'level-name'?: string;
  'level-seed'?: string;
  'level-type'?: string;
  'enable-command-block'?: string;
  'resource-pack'?: string;
  'require-resource-pack'?: string;
  [key: string]: string | undefined;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ManualConfirmationPayload {
  loader: ServerLoader;
  mcVersion: string;
}

export interface InstallModPayload {
  projectId: string;
  versionId: string;
  includeDependencies?: boolean;
}


