import { WardenServer, InstalledMod, ModrinthSearchItem, JobLog, WardenSettings, ServerLoader } from '@warden/shared';

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export class WardenApiClient {
  private baseUrl: string = '';
  private apiKey: string = '';

  public setConfig(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Warden Server URL is not configured.');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Warden-API-Key': this.apiKey,
      ...(options.headers || {}),
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status} Request failed`);
    }

    return data.data as T;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/health`, {
        headers: { 'X-Warden-API-Key': this.apiKey },
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  public async getServers(): Promise<WardenServer[]> {
    return this.request<WardenServer[]>('/api/v1/servers');
  }

  public async getServerDetails(serverId: string): Promise<WardenServer> {
    return this.request<WardenServer>(`/api/v1/servers/${serverId}`);
  }

  public async sendAction(serverId: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> {
    return this.request<boolean>(`/api/v1/servers/${serverId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  public async deleteServer(serverId: string): Promise<any> {
    return this.request<any>(`/api/v1/servers/${serverId}`, {
      method: 'DELETE',
    });
  }

  public async deleteAllMyServers(): Promise<{ deletedCount: number }> {
    return this.request<{ deletedCount: number }>('/api/v1/servers/batch/all?scope=own', {
      method: 'DELETE',
    });
  }

  public async confirmLoader(serverId: string, loader: ServerLoader, mcVersion: string): Promise<any> {
    return this.request<any>(`/api/v1/servers/${serverId}/confirm-loader`, {
      method: 'POST',
      body: JSON.stringify({ loader, mcVersion }),
    });
  }

  public async getInstalledMods(serverId: string): Promise<InstalledMod[]> {
    return this.request<InstalledMod[]>(`/api/v1/servers/${serverId}/mods`);
  }

  public async searchMods(serverId: string, query: string): Promise<ModrinthSearchItem[]> {
    return this.request<ModrinthSearchItem[]>(`/api/v1/servers/${serverId}/mods/search?q=${encodeURIComponent(query)}`);
  }

  public async installMod(serverId: string, projectId: string, versionId: string): Promise<any> {
    return this.request<any>(`/api/v1/servers/${serverId}/mods/install`, {
      method: 'POST',
      body: JSON.stringify({ projectId, versionId, includeDependencies: true }),
    });
  }

  public async deleteMod(serverId: string, filename: string): Promise<boolean> {
    return this.request<boolean>(`/api/v1/servers/${serverId}/mods/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  }

  public async triggerUpdateNow(serverId: string): Promise<JobLog> {
    return this.request<JobLog>(`/api/v1/servers/${serverId}/update-now`, {
      method: 'POST',
    });
  }

  public async getJobLogs(): Promise<JobLog[]> {
    return this.request<JobLog[]>('/api/v1/jobs');
  }

  public async getSettings(): Promise<WardenSettings> {
    return this.request<WardenSettings>('/api/v1/settings');
  }
}

export const wardenApi = new WardenApiClient();
