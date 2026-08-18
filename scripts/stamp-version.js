#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'latest';
  }
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const serverDir = path.resolve(rootDir, 'server');
  const rootVersionJson = path.resolve(rootDir, 'version.json');
  const serverVersionJson = path.resolve(serverDir, 'version.json');
  const tsVersionPath = path.resolve(serverDir, 'src', 'version.ts');

  const isBump = process.argv.includes('--bump') || process.env.AUTO_BUMP === 'true';
  const gitHash = getGitShortHash();

  let versionNumber = 2;
  let releaseTitle = 'Warden Release';
  let releaseDate = new Date().toISOString();

  // Read existing version.json if present
  if (fs.existsSync(rootVersionJson)) {
    try {
      const raw = JSON.parse(fs.readFileSync(rootVersionJson, 'utf8'));
      if (typeof raw.versionNumber === 'number') {
        versionNumber = raw.versionNumber;
      } else if (raw.version) {
        const match = String(raw.version).match(/v(\d+)/i);
        if (match) versionNumber = parseInt(match[1], 10);
      }
      if (raw.releaseTitle) releaseTitle = raw.releaseTitle;
    } catch {}
  }

  if (isBump) {
    versionNumber += 1;
    releaseTitle = `v${versionNumber} (${gitHash})`;
    releaseDate = new Date().toISOString();
  }

  // Format: v3-74d8db4
  const version = `v${versionNumber}-${gitHash}`;

  const versionData = {
    version,
    versionNumber,
    gitHash,
    releaseTitle,
    releaseDate,
  };

  const jsonStr = JSON.stringify(versionData, null, 2) + '\n';
  try {
    fs.writeFileSync(rootVersionJson, jsonStr, 'utf8');
    fs.writeFileSync(serverVersionJson, jsonStr, 'utf8');
    console.log(`[stamp-version] Synced version.json -> ${version} (Number: ${versionNumber}, Commit: ${gitHash})`);
  } catch (err) {
    console.warn('[stamp-version] Could not sync version.json:', err.message);
  }

  const tsContent = `// Auto-generated hardcoded version: v${versionNumber}-${gitHash}
export const WARDEN_VERSION = '${version}';
export const WARDEN_VERSION_NUMBER = ${versionNumber};
export const WARDEN_GIT_HASH = '${gitHash}';
export const WARDEN_RELEASE_TITLE = ${JSON.stringify(releaseTitle)};
export const WARDEN_BUILD_TIME = '${releaseDate}';
`;

  try {
    let existingTs = '';
    if (fs.existsSync(tsVersionPath)) {
      existingTs = fs.readFileSync(tsVersionPath, 'utf8');
    }
    if (existingTs !== tsContent) {
      fs.writeFileSync(tsVersionPath, tsContent, 'utf8');
      console.log(`[stamp-version] Baked version constant into ${tsVersionPath} -> ${version}`);
    }
  } catch (err) {
    console.warn(`[stamp-version] Could not write ${tsVersionPath}:`, err.message);
  }
}

main();

