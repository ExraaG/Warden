#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const serverDir = path.resolve(rootDir, 'server');
  const rootVersionJson = path.resolve(rootDir, 'version.json');
  const serverVersionJson = path.resolve(serverDir, 'version.json');
  const tsVersionPath = path.resolve(serverDir, 'src', 'version.ts');

  let version = 'v1';
  let versionNumber = 1;
  let releaseTitle = 'v1 - Initial Release';
  let releaseDate = new Date().toISOString();

  // Read existing version.json if present
  if (fs.existsSync(rootVersionJson)) {
    try {
      const raw = JSON.parse(fs.readFileSync(rootVersionJson, 'utf8'));
      if (raw.version) version = raw.version;
      if (raw.versionNumber) versionNumber = raw.versionNumber;
      if (raw.releaseTitle) releaseTitle = raw.releaseTitle;
      if (raw.releaseDate) releaseDate = raw.releaseDate;
    } catch {}
  }

  const versionData = {
    version,
    versionNumber,
    releaseTitle,
    releaseDate,
  };

  const jsonStr = JSON.stringify(versionData, null, 2) + '\n';
  try {
    fs.writeFileSync(rootVersionJson, jsonStr, 'utf8');
    fs.writeFileSync(serverVersionJson, jsonStr, 'utf8');
    console.log(`[stamp-version] Synced version.json -> ${version} (#${versionNumber})`);
  } catch (err) {
    console.warn('[stamp-version] Could not sync version.json:', err.message);
  }

  const tsContent = `// Hardcoded application version (v1, v2, v3, ...)
export const WARDEN_VERSION = '${version}';
export const WARDEN_VERSION_NUMBER = ${versionNumber};
export const WARDEN_RELEASE_TITLE = ${JSON.stringify(releaseTitle)};
export const WARDEN_BUILD_TIME = '${new Date().toISOString()}';
`;

  try {
    fs.writeFileSync(tsVersionPath, tsContent, 'utf8');
    console.log(`[stamp-version] Baked version constant into ${tsVersionPath} -> ${version}`);
  } catch (err) {
    console.warn(`[stamp-version] Could not write ${tsVersionPath}:`, err.message);
  }
}

main();

