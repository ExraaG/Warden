#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitInfo() {
  try {
    const commitFull = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const commit = commitFull.substring(0, 7);
    let branch = 'main';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {}
    return { commit, commitFull, branch };
  } catch (err) {
    return { commit: 'unknown', commitFull: 'unknown', branch: 'main' };
  }
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const serverDir = path.resolve(rootDir, 'server');
  const packageJsonPath = path.resolve(serverDir, 'package.json');

  let version = '1.0.0';
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.version) version = pkg.version;
    } catch {}
  }

  const gitInfo = getGitInfo();
  const versionData = {
    version,
    commit: gitInfo.commit,
    commitFull: gitInfo.commitFull,
    branch: gitInfo.branch,
    buildTime: new Date().toISOString(),
  };

  const targets = [
    path.resolve(rootDir, 'version.json'),
    path.resolve(serverDir, 'version.json'),
  ];

  for (const target of targets) {
    try {
      fs.writeFileSync(target, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
      console.log(`[stamp-version] Updated ${target} -> commit ${gitInfo.commit}`);
    } catch (err) {
      console.warn(`[stamp-version] Could not write ${target}:`, err.message);
    }
  }
}

main();
