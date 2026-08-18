import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import pidusage from 'pidusage';
import { ServerStatus, ServerStats } from '@warden/shared';

export interface ProcessOptions {
  serverId: string;
  serverDir: string;
  jarFile: string;
  javaPath?: string;
  minMemory?: string;
  maxMemory?: string;
  jvmArgs?: string[];
}

export class ServerProcess extends EventEmitter {
  public readonly serverId: string;
  public readonly serverDir: string;
  public readonly jarFile: string;
  public readonly javaPath: string;
  public readonly minMemory: string;
  public readonly maxMemory: string;
  public readonly jvmArgs: string[];

  private process: ChildProcess | null = null;
  private status: ServerStatus = 'offline';
  private logsRingBuffer: string[] = [];
  private readonly maxLogLines: number = 2000;
  private startTime: number = 0;
  private statsInterval: NodeJS.Timeout | null = null;
  private currentStats: ServerStats = {
    cpuPercent: 0,
    memoryBytes: 0,
    maxMemoryBytes: 0,
    onlinePlayers: 0,
    maxPlayers: 20,
    uptimeSeconds: 0,
  };
  private onlinePlayersSet = new Set<string>();

  constructor(opts: ProcessOptions) {
    super();
    this.serverId = opts.serverId;
    this.serverDir = opts.serverDir;
    this.jarFile = opts.jarFile;
    this.javaPath = opts.javaPath || 'java';
    this.minMemory = opts.minMemory || '2G';
    this.maxMemory = opts.maxMemory || '4G';
    this.jvmArgs = opts.jvmArgs || [
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
    ];
  }

  public getStatus(): ServerStatus {
    return this.status;
  }

  public isRunning(): boolean {
    return this.process !== null && !this.process.killed && this.status === 'online';
  }

  public getPid(): number | undefined {
    return this.process?.pid;
  }

  public getLogs(): string[] {
    return [...this.logsRingBuffer];
  }

  public getStats(): ServerStats {
    if (this.isRunning() && this.startTime > 0) {
      this.currentStats.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.currentStats.onlinePlayers = this.onlinePlayersSet.size;
    }
    return { ...this.currentStats };
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.process && !this.process.killed) {
        return reject(new Error('Server process is already running.'));
      }

      const jarFullPath = path.isAbsolute(this.jarFile)
        ? this.jarFile
        : path.join(this.serverDir, this.jarFile);

      if (!fs.existsSync(jarFullPath)) {
        return reject(new Error(`Server jar not found at ${jarFullPath}`));
      }

      // Ensure EULA is accepted
      const eulaPath = path.join(this.serverDir, 'eula.txt');
      if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
        fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
      }

      const args = [
        `-Xms${this.minMemory}`,
        `-Xmx${this.maxMemory}`,
        ...this.jvmArgs,
        '-jar',
        jarFullPath,
        'nogui',
      ];

      this.setStatus('starting');
      this.addLog(`[Warden] Spawning Java process: ${this.javaPath} ${args.join(' ')}`);

      try {
        this.process = spawn(this.javaPath, args, {
          cwd: this.serverDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err: any) {
        this.setStatus('error');
        this.addLog(`[Warden] Failed to spawn process: ${err.message}`);
        return reject(err);
      }

      this.startTime = Date.now();

      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf8').split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleLogLine(line);
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString('utf8').split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleLogLine(`[STDERR] ${line}`);
        }
      });

      this.process.on('error', (err: Error) => {
        this.addLog(`[Warden Process Error] ${err.message}`);
        this.setStatus('error');
        this.cleanup();
        this.emit('error', err);
      });

      this.process.on('close', (code: number | null, signal: string | null) => {
        this.addLog(`[Warden] Process exited with code ${code}, signal: ${signal}`);
        this.setStatus(code === 0 ? 'offline' : 'error');
        this.cleanup();
        this.emit('exit', { code, signal });
      });

      // Start stats polling
      this.startStatsPolling();

      // Resolve initial start initiation
      resolve();
    });
  }

  public async stop(timeoutMs: number = 25000): Promise<void> {
    if (!this.process || this.process.killed) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('stopping');
    this.addLog('[Warden] Sending stop command to Minecraft server...');

    // Attempt graceful console command stop
    this.sendCommand('stop');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.addLog('[Warden] Graceful stop timed out. Sending SIGTERM...');
          this.process.kill('SIGTERM');

          const killTimer = setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.addLog('[Warden] Process still running. Force killing with SIGKILL...');
              this.process.kill('SIGKILL');
            }
            this.cleanup();
            this.setStatus('offline');
            resolve();
          }, 4000);

          this.process.once('close', () => {
            clearTimeout(killTimer);
            this.cleanup();
            this.setStatus('offline');
            resolve();
          });
        } else {
          this.cleanup();
          this.setStatus('offline');
          resolve();
        }
      }, timeoutMs);

      this.process?.once('close', () => {
        clearTimeout(timer);
        this.cleanup();
        this.setStatus('offline');
        resolve();
      });
    });
  }

  public async restart(): Promise<void> {
    await this.stop();
    await new Promise((r) => setTimeout(r, 1500));
    await this.start();
  }

  public kill(): void {
    if (this.process && !this.process.killed) {
      this.addLog('[Warden] Force killing server process...');
      this.process.kill('SIGKILL');
      this.cleanup();
      this.setStatus('offline');
    }
  }

  public sendCommand(cmd: string): boolean {
    if (!this.process || !this.process.stdin || this.process.killed) {
      return false;
    }
    const cleanCmd = cmd.trim();
    this.addLog(`> ${cleanCmd}`);
    this.process.stdin.write(`${cleanCmd}\n`);
    return true;
  }

  private handleLogLine(line: string) {
    this.addLog(line);
    this.emit('log', line);

    // Detect server ready
    if (
      line.includes('Done (') ||
      line.includes('For help, type "help"') ||
      line.includes('Ready for connections') ||
      line.includes('Server started')
    ) {
      if (this.status !== 'online') {
        this.setStatus('online');
        this.addLog('[Warden] Minecraft server is ready and ONLINE.');
      }
    }

    // Detect players joining / leaving
    const joinMatch = line.match(/([a-zA-Z0-9_]{2,16})\[.*\] logged in|([a-zA-Z0-9_]{2,16}) joined the game/i);
    if (joinMatch) {
      const name = joinMatch[1] || joinMatch[2];
      if (name) this.onlinePlayersSet.add(name);
    }

    const leaveMatch = line.match(/([a-zA-Z0-9_]{2,16}) lost connection|([a-zA-Z0-9_]{2,16}) left the game/i);
    if (leaveMatch) {
      const name = leaveMatch[1] || leaveMatch[2];
      if (name) this.onlinePlayersSet.delete(name);
    }
  }

  private addLog(line: string) {
    this.logsRingBuffer.push(line);
    if (this.logsRingBuffer.length > this.maxLogLines) {
      this.logsRingBuffer.shift();
    }
  }

  private setStatus(newStatus: ServerStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('status', newStatus);
    }
  }

  private startStatsPolling() {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = setInterval(async () => {
      if (!this.process || this.process.killed || !this.process.pid) {
        return;
      }
      try {
        const stats = await pidusage(this.process.pid);
        this.currentStats.cpuPercent = Math.round(stats.cpu * 10) / 10;
        this.currentStats.memoryBytes = stats.memory;
        this.currentStats.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        this.currentStats.onlinePlayers = this.onlinePlayersSet.size;
      } catch {
        // Process might have terminated
      }
    }, 2000);
  }

  private cleanup() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.process = null;
    this.onlinePlayersSet.clear();
    this.currentStats.cpuPercent = 0;
    this.currentStats.memoryBytes = 0;
    this.currentStats.onlinePlayers = 0;
    this.currentStats.uptimeSeconds = 0;
  }
}
