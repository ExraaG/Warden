// @ts-ignore
import yauzl from 'yauzl';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';
import { config } from '../config.js';
import { db } from '../db/storage.js';

/**
 * Download a JAR from Crafty's HTTPS file server and extract the mod icon PNG.
 * Returns a base64 data URL (data:image/png;base64,...) or null if extraction fails.
 *
 * Crafty doesn't expose binary files via its REST API (it's text-only).
 * We stream the JAR directly from the filesystem path that Crafty exposes
 * via an internal file server on the same port (GET /files/<server_path>).
 * If that fails, we try an alternate known Crafty static-file route.
 */

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/** Try to download a JAR and extract the mod's icon PNG as a base64 data URL */
export async function extractJarIcon(serverId: string, modPath: string): Promise<string | null> {
  const jarBuffer = await downloadJarFromCrafty(serverId, modPath);
  if (!jarBuffer) return null;

  try {
    return await extractIconFromZipBuffer(jarBuffer);
  } catch (err) {
    return null;
  }
}

/**
 * Download the JAR bytes from Crafty.
 * Crafty's internal web panel serves static files under the server's path.
 * We construct the URL from the known server path exposed in the /servers list.
 */
async function downloadJarFromCrafty(serverId: string, modRelPath: string): Promise<Buffer | null> {
  const settings = db.getSettings();
  const baseUrl = (settings.craftyUrl || config.craftyUrl || 'https://localhost:8443').replace(/\/+$/, '');
  const apiKey = (settings as any).craftyApiKey || config.craftyApiKey || '';

  // Crafty 4.x serves files via: GET /api/v2/servers/{id}/files/download?path=<relative>
  // But that returns 405 for binary (UTF-8 decode error in Crafty's API layer).
  // However, Crafty's web panel has a direct static download link.
  // Try multiple known patterns:
  const urlsToTry = [
    // Pattern 1: Direct download endpoint (some Crafty builds)
    `${baseUrl}/api/v2/servers/${serverId}/files/download?path=${encodeURIComponent(modRelPath)}`,
    // Pattern 2: Crafty's panel file browser download URL
    `${baseUrl}/panel/server/files/serve?id=${serverId}&path=${encodeURIComponent(modRelPath)}`,
    // Pattern 3: Legacy Crafty download
    `${baseUrl}/files/${serverId}/${encodeURIComponent(modRelPath)}`,
  ];

  for (const url of urlsToTry) {
    try {
      const buf = await fetchBinary(url, apiKey);
      if (buf && buf.length > 100 && isZipBuffer(buf)) {
        return buf;
      }
    } catch { /* try next */ }
  }

  return null;
}

function isZipBuffer(buf: Buffer): boolean {
  // ZIP magic: PK\x03\x04
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function fetchBinary(url: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const agent = isHttps ? httpsAgent : undefined;
    const lib = isHttps ? https : http;

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/octet-stream, */*',
      },
      agent,
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Parse a JAR (ZIP) buffer and extract the mod icon PNG.
 *
 * Priority order:
 * 1. fabric.mod.json -> icon field -> extract that path from ZIP
 * 2. META-INF/mods.toml -> (Forge) logoFile field
 * 3. pack.png at root
 */
function extractIconFromZipBuffer(buffer: Buffer): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err || !zipfile) return resolve(null);

      const entries: { name: string; entry: any }[] = [];

      zipfile.on('entry', (entry: any) => {
        entries.push({ name: entry.fileName, entry });
        zipfile.readEntry();
      });

      zipfile.on('end', async () => {
        // Re-open zip for reading specific entries (yauzl is lazy)
        try {
          const result = await readIconFromEntries(buffer, entries.map((e) => e.name));
          resolve(result);
        } catch {
          resolve(null);
        }
      });

      zipfile.on('error', () => resolve(null));
      zipfile.readEntry();
    });
  });
}

async function readIconFromEntries(buffer: Buffer, entryNames: string[]): Promise<string | null> {
  // Step 1: read fabric.mod.json to find icon path
  const fabricMetaName = entryNames.find((n) => n === 'fabric.mod.json');
  if (fabricMetaName) {
    const fabricMeta = await readZipEntry(buffer, fabricMetaName);
    if (fabricMeta) {
      try {
        const meta = JSON.parse(fabricMeta.toString('utf-8'));
        const iconPath = typeof meta.icon === 'string' ? meta.icon : meta.icon?.['32'];
        if (iconPath) {
          // Normalize: fabric.mod.json icon paths start from root of JAR
          const cleanPath = iconPath.replace(/^\//, '');
          const iconEntry = entryNames.find((n) => n === cleanPath);
          if (iconEntry) {
            const iconBytes = await readZipEntry(buffer, iconEntry);
            if (iconBytes) {
              return `data:image/png;base64,${iconBytes.toString('base64')}`;
            }
          }
        }
      } catch { /* malformed json */ }
    }
  }

  // Step 2: Forge/NeoForge - META-INF/mods.toml logoFile
  const forgeMetaName = entryNames.find((n) => n === 'META-INF/mods.toml');
  if (forgeMetaName) {
    const forgeMeta = await readZipEntry(buffer, forgeMetaName);
    if (forgeMeta) {
      const logoMatch = forgeMeta.toString('utf-8').match(/logoFile\s*=\s*["']?([^"'\n\r]+)["']?/);
      if (logoMatch) {
        const logoPath = logoMatch[1].trim().replace(/^\//, '');
        const logoEntry = entryNames.find((n) => n === logoPath);
        if (logoEntry) {
          const iconBytes = await readZipEntry(buffer, logoEntry);
          if (iconBytes) return `data:image/png;base64,${iconBytes.toString('base64')}`;
        }
      }
    }
  }

  // Step 3: pack.png fallback
  const packPng = entryNames.find((n) => n === 'pack.png');
  if (packPng) {
    const iconBytes = await readZipEntry(buffer, packPng);
    if (iconBytes) return `data:image/png;base64,${iconBytes.toString('base64')}`;
  }

  return null;
}

function readZipEntry(buffer: Buffer, entryName: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err || !zipfile) return resolve(null);

      let found = false;
      zipfile.on('entry', (entry: any) => {
        if (entry.fileName === entryName) {
          found = true;
          zipfile.openReadStream(entry, (streamErr: any, readStream: any) => {
            if (streamErr || !readStream) return resolve(null);
            const chunks: Buffer[] = [];
            readStream.on('data', (c: Buffer) => chunks.push(c));
            readStream.on('end', () => resolve(Buffer.concat(chunks)));
            readStream.on('error', () => resolve(null));
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => { if (!found) resolve(null); });
      zipfile.on('error', () => resolve(null));
      zipfile.readEntry();
    });
  });
}
