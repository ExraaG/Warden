import fetch from 'node-fetch';
import { ServerLoader } from '@warden/shared';

export interface MCVersionInfo {
  id: string;
  label: string;
  sublabel?: string;
  isStable: boolean;
}

// In-memory cache for 10 minutes per loader
const cache = new Map<string, { timestamp: number; versions: MCVersionInfo[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export class VersionFetcher {
  public static async getVersions(loader: ServerLoader = 'paper'): Promise<MCVersionInfo[]> {
    const cacheKey = `versions-${loader}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.versions;
    }

    try {
      let versions: MCVersionInfo[] = [];

      switch (loader) {
        case 'paper':
          versions = await this.fetchPaperVersions();
          break;
        case 'purpur':
          versions = await this.fetchPurpurVersions();
          break;
        case 'fabric':
          versions = await this.fetchFabricVersions();
          break;
        case 'quilt':
          versions = await this.fetchQuiltVersions();
          break;
        case 'vanilla':
        default:
          versions = await this.fetchMojangVersions();
          break;
      }

      if (versions.length > 0) {
        cache.set(cacheKey, { timestamp: Date.now(), versions });
        return versions;
      }
    } catch (err) {
      console.warn(`[VersionFetcher] Failed to fetch live versions for ${loader}:`, err);
    }

    // Fallback to Mojang or cached
    return cached?.versions || this.getFallbackVersions();
  }

  // 1. PaperMC API
  private static async fetchPaperVersions(): Promise<MCVersionInfo[]> {
    const res = await fetch('https://api.papermc.io/v2/projects/paper');
    if (!res.ok) throw new Error(`Paper API responded with ${res.status}`);
    const data: any = await res.json();
    const rawVersions: string[] = data.versions || [];
    
    // Reverse so latest is first
    return rawVersions.slice().reverse().map((v, i) => ({
      id: v,
      label: v,
      sublabel: i === 0 ? 'Latest Release' : undefined,
      isStable: !v.includes('pre') && !v.includes('rc') && !v.includes('snapshot'),
    }));
  }

  // 2. PurpurMC API
  private static async fetchPurpurVersions(): Promise<MCVersionInfo[]> {
    const res = await fetch('https://api.purpurmc.org/v2/purpur');
    if (!res.ok) throw new Error(`Purpur API responded with ${res.status}`);
    const data: any = await res.json();
    const rawVersions: string[] = data.versions || [];

    return rawVersions.slice().reverse().map((v, i) => ({
      id: v,
      label: v,
      sublabel: i === 0 ? 'Latest Release' : undefined,
      isStable: true,
    }));
  }

  // 3. Fabric Meta API
  private static async fetchFabricVersions(): Promise<MCVersionInfo[]> {
    const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
    if (!res.ok) throw new Error(`Fabric Meta API responded with ${res.status}`);
    const data: any = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid Fabric Meta payload');

    const releases = data.filter((item: any) => item.stable);
    return releases.map((item: any, i: number) => ({
      id: item.version,
      label: item.version,
      sublabel: i === 0 ? 'Latest Stable' : undefined,
      isStable: item.stable,
    }));
  }

  // 4. Quilt Meta API
  private static async fetchQuiltVersions(): Promise<MCVersionInfo[]> {
    const res = await fetch('https://meta.quiltmc.org/v3/versions/game');
    if (!res.ok) throw new Error(`Quilt Meta API responded with ${res.status}`);
    const data: any = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid Quilt Meta payload');

    const releases = data.filter((item: any) => item.stable);
    return releases.map((item: any, i: number) => ({
      id: item.version,
      label: item.version,
      sublabel: i === 0 ? 'Latest Stable' : undefined,
      isStable: item.stable,
    }));
  }

  // 5. Official Mojang Manifest
  private static async fetchMojangVersions(): Promise<MCVersionInfo[]> {
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    if (!res.ok) throw new Error(`Mojang API responded with ${res.status}`);
    const data: any = await res.json();
    const rawVersions: any[] = data.versions || [];

    const releases = rawVersions.filter((v) => v.type === 'release');
    return releases.map((v, i) => ({
      id: v.id,
      label: v.id,
      sublabel: i === 0 ? 'Latest Release' : undefined,
      isStable: true,
    }));
  }

  private static getFallbackVersions(): MCVersionInfo[] {
    return [
      { id: '1.21.1', label: '1.21.1', sublabel: 'Latest Release', isStable: true },
      { id: '1.21', label: '1.21', sublabel: 'Tricky Trials', isStable: true },
      { id: '1.20.6', label: '1.20.6', sublabel: 'Armored Paws', isStable: true },
      { id: '1.20.4', label: '1.20.4', sublabel: 'Popular Modding', isStable: true },
      { id: '1.20.2', label: '1.20.2', isStable: true },
      { id: '1.20.1', label: '1.20.1', sublabel: 'LTS Standard', isStable: true },
      { id: '1.19.4', label: '1.19.4', isStable: true },
      { id: '1.19.2', label: '1.19.2', sublabel: 'The Wild Update', isStable: true },
      { id: '1.18.2', label: '1.18.2', sublabel: 'Caves & Cliffs II', isStable: true },
      { id: '1.16.5', label: '1.16.5', sublabel: 'Nether Update', isStable: true },
      { id: '1.12.2', label: '1.12.2', isStable: true },
    ];
  }
}
