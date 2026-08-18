import fetch, { RequestInit } from 'node-fetch';
import crypto from 'crypto';
import {
  ModrinthSearchItem,
  ModrinthVersion,
  ModrinthDependency,
  ServerLoader,
} from '@warden/shared';

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Warden-Server-ModManager/1.0 (contact@warden.home)';

export class ModrinthAdapter {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${MODRINTH_API_BASE}${endpoint}`;

    let retries = 3;
    let delayMs = 1000;

    while (retries > 0) {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const waitTime = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : delayMs;
        console.warn(`[ModrinthAdapter] Rate limited (429). Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delayMs *= 2;
        retries--;
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Modrinth API error (${response.status}): ${text.substring(0, 200)}`);
      }

      return (await response.json()) as T;
    }

    throw new Error(`Modrinth API request failed after retries: ${url}`);
  }

  /**
   * Search mods on Modrinth with loader and game version facets
   */
  public async searchMods(
    query: string,
    loader?: ServerLoader,
    mcVersion?: string
  ): Promise<ModrinthSearchItem[]> {
    const facets: string[][] = [['project_type:mod', 'project_type:plugin']];

    if (loader && loader !== 'unknown' && loader !== 'vanilla') {
      const loaderCategory = loader === 'spigot' || loader === 'bukkit' || loader === 'purpur' ? 'paper' : loader;
      facets.push([`categories:${loaderCategory}`]);
    }
    if (mcVersion) {
      facets.push([`versions:${mcVersion}`]);
    }

    const params = new URLSearchParams({
      query: query || '',
      facets: JSON.stringify(facets),
      limit: '20',
    });

    const res = await this.request<{ hits: any[] }>(`/search?${params.toString()}`);
    if (!res || !Array.isArray(res.hits)) return [];

    return res.hits.map((hit) => ({
      id: hit.project_id || hit.id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description || '',
      author: hit.author || hit.members?.[0]?.name || 'Unknown',
      // Modrinth raw API: icon_url (snake_case) → our shared type: iconUrl (camelCase)
      iconUrl: hit.icon_url || null,
      downloads: hit.downloads || 0,
      categories: hit.categories || [],
      latestVersion: hit.latest_version,
    }));
  }

  /**
   * Get versions for a specific project filtered by loader and game version
   */
  public async getProjectVersions(
    projectIdOrSlug: string,
    loader?: ServerLoader,
    mcVersion?: string
  ): Promise<ModrinthVersion[]> {
    const params = new URLSearchParams();
    if (loader && loader !== 'unknown' && loader !== 'vanilla') {
      const targetLoaders = loader === 'spigot' || loader === 'bukkit' || loader === 'purpur' || loader === 'paper' ? ['paper', 'spigot', 'bukkit', 'purpur'] : [loader];
      params.append('loaders', JSON.stringify(targetLoaders));
    }
    if (mcVersion) {
      params.append('game_versions', JSON.stringify([mcVersion]));
    }

    const endpoint = `/project/${projectIdOrSlug}/version?${params.toString()}`;
    const rawVersions = await this.request<any[]>(endpoint);

    if (!Array.isArray(rawVersions)) return [];

    return rawVersions.map((v) => {
      const primaryFile = v.files.find((f: any) => f.primary) || v.files[0] || {};
      const dependencies: ModrinthDependency[] = (v.dependencies || []).map((dep: any) => ({
        projectId: dep.project_id || null,
        versionId: dep.version_id || null,
        dependencyType: dep.dependency_type || 'required',
      }));

      return {
        id: v.id,
        projectId: v.project_id,
        name: v.name,
        versionNumber: v.version_number,
        downloadUrl: primaryFile.url || '',
        filename: primaryFile.filename || `${v.name}.jar`,
        sha512: primaryFile.hashes?.sha512 || '',
        dependencies,
      };
    });
  }

  /**
   * Recursively resolve required dependencies for a given version
   */
  public async resolveRequiredDependencies(
    initialVersion: ModrinthVersion,
    loader: ServerLoader,
    mcVersion: string,
    resolvedMap: Map<string, ModrinthVersion> = new Map()
  ): Promise<ModrinthVersion[]> {
    for (const dep of initialVersion.dependencies) {
      if (dep.dependencyType === 'required' && dep.projectId) {
        if (resolvedMap.has(dep.projectId)) continue;

        try {
          const versions = await this.getProjectVersions(dep.projectId, loader, mcVersion);
          if (versions.length > 0) {
            const targetVersion = dep.versionId
              ? versions.find((v) => v.id === dep.versionId) || versions[0]
              : versions[0];

            resolvedMap.set(dep.projectId, targetVersion);
            await this.resolveRequiredDependencies(targetVersion, loader, mcVersion, resolvedMap);
          }
        } catch (err) {
          console.warn(`[ModrinthAdapter] Could not resolve required dependency ${dep.projectId}:`, err);
        }
      }
    }

    return Array.from(resolvedMap.values());
  }

  /**
   * Daily 4am Hash-Batch update check via POST /v2/version_files/update
   */
  public async checkVersionFilesUpdate(
    hashes: string[],
    loader: ServerLoader,
    mcVersion: string
  ): Promise<Record<string, ModrinthVersion>> {
    if (hashes.length === 0) return {};

    const payload = {
      hashes,
      algorithm: 'sha512',
      loaders: loader !== 'unknown' ? [loader] : [],
      game_versions: mcVersion ? [mcVersion] : [],
    };

    const res = await this.request<Record<string, any>>('/version_files/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resultMap: Record<string, ModrinthVersion> = {};

    for (const [hash, v] of Object.entries(res)) {
      if (!v || !v.files) continue;
      const primaryFile = v.files.find((f: any) => f.primary) || v.files[0] || {};
      const dependencies: ModrinthDependency[] = (v.dependencies || []).map((dep: any) => ({
        projectId: dep.project_id || null,
        versionId: dep.version_id || null,
        dependencyType: dep.dependency_type || 'required',
      }));

      resultMap[hash] = {
        id: v.id,
        projectId: v.project_id,
        name: v.name,
        versionNumber: v.version_number,
        downloadUrl: primaryFile.url || '',
        filename: primaryFile.filename || `${v.name}.jar`,
        sha512: primaryFile.hashes?.sha512 || '',
        dependencies,
      };
    }

    return resultMap;
  }

  /**
   * Download a mod file and verify its sha512 hash before writing to server
   */
  public async downloadAndVerifyFile(downloadUrl: string, expectedSha512: string): Promise<Buffer> {
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) {
      throw new Error(`Failed to download mod file from ${downloadUrl}: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (expectedSha512) {
      const calculatedHash = crypto.createHash('sha512').update(buffer).digest('hex');
      if (calculatedHash.toLowerCase() !== expectedSha512.toLowerCase()) {
        throw new Error(
          `SHA512 checksum mismatch! Expected ${expectedSha512}, but got ${calculatedHash}`
        );
      }
    }

    return buffer;
  }
}

export const modrinthAdapter = new ModrinthAdapter();
