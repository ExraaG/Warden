import { serverManager } from '../core/serverManager.js';
import { db } from '../db/storage.js';
import { DetectionState, ServerLoader } from '@warden/shared';

export class LoaderDetector {
  /**
   * Helper to extract a Minecraft version string from filenames, URLs, or text.
   */
  public extractMcVersion(text: string): string | null {
    if (!text) return null;
    const s = text.toLowerCase();

    // 1. Check for explicit minecraft-X or mc-X patterns: e.g. minecraft-26.2, mc1.21.1, +26.2
    const explicitMatch = s.match(/(?:minecraft|mc)[-_+]?v?(\d{1,2}\.\d+(?:\.\d+)?|\d{2}w\d{2}[a-z])/i);
    if (explicitMatch) return explicitMatch[1];

    // 2. Check for URLs or path segments like /fabric/26.2/ or /1.21.1/
    const urlMatch = s.match(/\/(?:fabric|forge|neoforge|quilt|paper|server)\/(\d{1,2}\.\d+(?:\.\d+)?|\d{2}w\d{2}[a-z])\//i);
    if (urlMatch) return urlMatch[1];

    // 3. Check for standard 1.x.x versions
    const standardMatch = s.match(/\b(1\.\d{1,2}(?:\.\d{1,2})?)\b/);
    if (standardMatch) return standardMatch[1];

    // 4. Check for snapshot/dev 2-part versions: -26.2-, +26.2
    const snapshotMatch = s.match(/(?:^|[-_+/])(\d{2}\.\d+)(?:[-_+/.]|$)/);
    if (snapshotMatch) return snapshotMatch[1];

    return null;
  }

  /**
   * Helper to detect loader from text.
   */
  public detectLoaderFromText(text: string): ServerLoader {
    const s = (text || '').toLowerCase();
    if (s.includes('fabric')) return 'fabric';
    if (s.includes('neoforge') || s.includes('neoforged')) return 'neoforge';
    if (s.includes('forge') || s.includes('minecraftforge')) return 'forge';
    if (s.includes('quilt')) return 'quilt';
    if (s.includes('paper') || s.includes('purpur') || s.includes('spigot') || s.includes('bukkit')) return 'paper';
    if (s.includes('vanilla')) return 'vanilla';
    return 'unknown';
  }

  /**
   * Run detection priority order for a server and save/update the result in local DB
   */
  public async detectServerLoader(serverId: string, executableFilename?: string): Promise<DetectionState> {
    // Priority 1: Operator-confirmed manual override in DB
    const existing = db.getServerDetection(serverId);
    if (existing && existing.isConfirmed && existing.source === 'manual_override') {
      return existing;
    }

    let detectedLoader: ServerLoader = 'unknown';
    let detectedVersion: string | null = null;
    let detectionSource: DetectionState['source'] = 'unconfirmed';

    // Priority 2: Configured executable filename
    if (executableFilename) {
      const lowerExe = executableFilename.toLowerCase();
      detectedLoader = this.detectLoaderFromText(lowerExe);
      detectedVersion = this.extractMcVersion(lowerExe);
      if (detectedLoader !== 'unknown') {
        detectionSource = 'executable_filename';
      }
    }

    // Priority 3: Root files / config files on disk
    try {
      if (detectedLoader === 'fabric' || detectedLoader === 'unknown') {
        try {
          const fabricFiles = await serverManager.listFiles(serverId, '.fabric/server');
          for (const f of fabricFiles) {
            const fname = f.name || '';
            const ver = this.extractMcVersion(fname);
            if (ver) {
              detectedVersion = ver;
              detectedLoader = 'fabric';
              detectionSource = 'loader_config';
              break;
            }
          }
        } catch {}
      }

      const rootFiles = await serverManager.listFiles(serverId, '');
      const rootNames = rootFiles.map((f: any) => (f.name || '').toLowerCase());

      if (detectedLoader === 'unknown') {
        if (rootNames.some((n: string) => n.includes('fabric-server-launcher') || n.includes('fabric-server-launch') || n === '.fabric')) {
          detectedLoader = 'fabric';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n: string) => n.includes('neoforge') || n.includes('neoforged'))) {
          detectedLoader = 'neoforge';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n: string) => n.includes('forge') || n.includes('minecraftforge'))) {
          detectedLoader = 'forge';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n: string) => n.includes('quilt'))) {
          detectedLoader = 'quilt';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n: string) => n.includes('paper'))) {
          detectedLoader = 'paper';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n: string) => n.includes('purpur'))) {
          detectedLoader = 'purpur';
          detectionSource = 'loader_config';
        }
      }

      if (!detectedVersion) {
        for (const fname of rootNames) {
          const ver = this.extractMcVersion(fname);
          if (ver) {
            detectedVersion = ver;
            break;
          }
        }
      }
    } catch {
      // root files list failed
    }

    // Priority 4: Corroborate from mods folder files (frequency voting)
    try {
      const modFiles = await serverManager.listFiles(serverId, 'mods');
      const jarFiles = modFiles.filter((f: any) => !f.isDir && (f.name || '').toLowerCase().endsWith('.jar'));

      if (jarFiles.length > 0) {
        let fabricVotes = 0;
        let forgeVotes = 0;
        let neoforgeVotes = 0;
        const versionVotes: Record<string, number> = {};

        for (const jar of jarFiles) {
          const fname = (jar.name || '').toLowerCase();
          if (fname.includes('fabric')) fabricVotes++;
          if (fname.includes('neoforge')) neoforgeVotes++;
          else if (fname.includes('forge')) forgeVotes++;

          const ver = this.extractMcVersion(fname);
          if (ver) {
            versionVotes[ver] = (versionVotes[ver] || 0) + 1;
          }
        }

        if (detectedLoader === 'unknown') {
          if (fabricVotes > forgeVotes && fabricVotes > neoforgeVotes) detectedLoader = 'fabric';
          else if (neoforgeVotes > forgeVotes && neoforgeVotes > fabricVotes) detectedLoader = 'neoforge';
          else if (forgeVotes > 0) detectedLoader = 'forge';
          if (detectedLoader !== 'unknown') detectionSource = 'mod_metadata';
        }

        const sortedVersions = Object.entries(versionVotes).sort((a, b) => b[1] - a[1]);
        if (!detectedVersion && sortedVersions.length > 0) {
          detectedVersion = sortedVersions[0][0];
          if (detectionSource === 'unconfirmed') detectionSource = 'mod_metadata';
        }
      }
    } catch {
      // mods folder scan failed
    }

    // Fallback if version still missing
    if (!detectedVersion) {
      detectedVersion = '1.21.1';
    }

    const state: DetectionState = {
      loader: detectedLoader,
      mcVersion: detectedVersion,
      isConfirmed: Boolean(existing?.isConfirmed || (detectedLoader !== 'unknown' && detectedVersion)),
      source: existing?.isConfirmed ? existing.source : detectionSource,
      detectedAt: new Date().toISOString(),
    };

    db.setServerDetection(serverId, state);
    return state;
  }
}

export const loaderDetector = new LoaderDetector();
