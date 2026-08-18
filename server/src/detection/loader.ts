import { craftyAdapter } from '../adapters/crafty.js';
import { db } from '../db/storage.js';
import { DetectionState, ServerLoader } from '@warden/shared';

export class LoaderDetector {
  /**
   * Helper to extract a Minecraft version string from filenames, URLs, or text.
   * Matches standard versions (1.21.1, 1.20), snapshot/dev versions (26.2, 25.1), and weekly snapshots (25w06a).
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

    // 4. Check for snapshot/dev 2-part versions preceded or followed by separator: -26.2-, +26.2, 26.2-server
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

    // Priority 2: Check Crafty server details (executable_update_url, executable, server_name, execution_command)
    try {
      const details = await craftyAdapter.getServerDetails(serverId);
      if (details) {
        const updateUrl = details.executable_update_url || '';
        const exec = executableFilename || details.executable || details.server_jar || details.server_executable || '';
        const cmd = details.execution_command || '';
        const serverName = details.server_name || '';

        // Check update URL first (very high fidelity, e.g. https://jars.arcadiatech.org/fabric/26.2/fabric.jar)
        if (updateUrl) {
          const urlLoader = this.detectLoaderFromText(updateUrl);
          const urlVer = this.extractMcVersion(updateUrl);
          if (urlLoader !== 'unknown') detectedLoader = urlLoader;
          if (urlVer) detectedVersion = urlVer;
          if (urlLoader !== 'unknown' || urlVer) detectionSource = 'executable_filename';
        }

        // Corroborate with executable / execution command / server name
        if (detectedLoader === 'unknown') {
          const execLoader = this.detectLoaderFromText(`${exec} ${cmd} ${serverName}`);
          if (execLoader !== 'unknown') {
            detectedLoader = execLoader;
            detectionSource = 'executable_filename';
          }
        }

        if (!detectedVersion) {
          const ver = this.extractMcVersion(`${exec} ${cmd} ${serverName}`);
          if (ver) detectedVersion = ver;
        }
      }
    } catch (err) {
      // Crafty not reachable or endpoint error
    }

    // Priority 3: Check .fabric/server directory or root files
    try {
      // Check .fabric/server directory for fabric servers
      if (detectedLoader === 'fabric' || detectedLoader === 'unknown') {
        try {
          const fabricFiles = await craftyAdapter.listFiles(serverId, '.fabric/server');
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

      // Check root directory files
      const rootFiles = await craftyAdapter.listFiles(serverId, '');
      const rootNames = rootFiles.map((f) => (f.name || '').toLowerCase());

      if (detectedLoader === 'unknown') {
        if (rootNames.some((n) => n.includes('fabric-server-launcher') || n.includes('fabric-server-launch') || n === '.fabric')) {
          detectedLoader = 'fabric';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n) => n.includes('neoforge') || n.includes('neoforged'))) {
          detectedLoader = 'neoforge';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n) => n.includes('forge') || n.includes('minecraftforge'))) {
          detectedLoader = 'forge';
          detectionSource = 'loader_config';
        } else if (rootNames.some((n) => n.includes('quilt'))) {
          detectedLoader = 'quilt';
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
    } catch (err) {
      // root files list failed
    }

    // Priority 4: Corroborate from mods folder files (frequency voting)
    try {
      const modFiles = await craftyAdapter.listFiles(serverId, 'mods');
      const jarFiles = modFiles.filter((f) => !f.is_dir && (f.name || '').toLowerCase().endsWith('.jar'));

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

        // Pick the most frequent version found in mods
        const sortedVersions = Object.entries(versionVotes).sort((a, b) => b[1] - a[1]);
        if (sortedVersions.length > 0) {
          const topVersion = sortedVersions[0][0];
          // If no version yet, or mod evidence is strong (>= 3 mods agree)
          if (!detectedVersion || sortedVersions[0][1] >= 3) {
            detectedVersion = topVersion;
            detectionSource = 'mod_metadata';
          }
        }
      }
    } catch (err) {
      // mods files list failed
    }

    // Final State construction
    const state: DetectionState = {
      loader: detectedLoader,
      mcVersion: detectedVersion,
      isConfirmed: false,
      source: detectionSource,
      detectedAt: new Date().toISOString(),
    };

    db.setServerDetection(serverId, state);
    return state;
  }

  public detectFromText(text: string): { loader: ServerLoader; mcVersion: string | null } {
    const loader = this.detectLoaderFromText(text);
    const mcVersion = this.extractMcVersion(text);
    return { loader, mcVersion };
  }
}

export const loaderDetector = new LoaderDetector();

