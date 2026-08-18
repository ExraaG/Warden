// @ts-ignore
import yauzl from 'yauzl';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { serverManager } from '../core/serverManager.js';

/**
 * Extract mod icon PNG from a local JAR file.
 * Returns a base64 data URL (data:image/png;base64,...) or null if extraction fails.
 */
export async function extractJarIcon(serverId: string, modPath: string): Promise<string | null> {
  try {
    const srvDir = serverManager.getServerDir(serverId);
    const fullPath = path.isAbsolute(modPath) ? modPath : path.join(srvDir, modPath);

    if (!fs.existsSync(fullPath)) return null;

    const jarBuffer = await fs.promises.readFile(fullPath);
    if (!jarBuffer || !isZipBuffer(jarBuffer)) return null;

    return await extractIconFromZipBuffer(jarBuffer);
  } catch (err) {
    return null;
  }
}

function isZipBuffer(buf: Buffer): boolean {
  return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

/**
 * Parse a ZIP buffer (JAR) in memory using yauzl and find the mod icon PNG.
 */
function extractIconFromZipBuffer(buffer: Buffer): Promise<string | null> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err || !zipfile) {
        resolve(null);
        return;
      }

      let iconBuffer: Buffer | null = null;
      let resolved = false;

      const finish = (result: string | null) => {
        if (!resolved) {
          resolved = true;
          try {
            zipfile.close();
          } catch {}
          resolve(result);
        }
      };

      zipfile.readEntry();

      zipfile.on('entry', (entry: any) => {
        const name = entry.fileName.toLowerCase();

        // Check for common mod icon locations
        const isIcon =
          name === 'icon.png' ||
          name === 'assets/icon.png' ||
          name === 'logo.png' ||
          (name.startsWith('assets/') && name.endsWith('/icon.png')) ||
          (name.startsWith('assets/') && name.endsWith('/logo.png'));

        if (isIcon && !iconBuffer) {
          zipfile.openReadStream(entry, (streamErr: any, stream: Readable) => {
            if (streamErr || !stream) {
              zipfile.readEntry();
              return;
            }

            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
              iconBuffer = Buffer.concat(chunks);
              const base64 = iconBuffer.toString('base64');
              finish(`data:image/png;base64,${base64}`);
            });
            stream.on('error', () => {
              zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        if (!resolved) {
          finish(null);
        }
      });

      zipfile.on('error', () => {
        finish(null);
      });
    });
  });
}
