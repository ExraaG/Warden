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

  const targets = [
    path.resolve(rootDir, 'version.json'),
    path.resolve(serverDir, 'version.json'),
  ];

  for (const target of targets) {
    try {
      let existingCommit = 'unknown';
      let existingCommitFull = 'unknown';
      if (fs.existsSync(target)) {
        try {
          const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
          if (raw.commit && raw.commit !== 'unknown') existingCommit = raw.commit;
          if (raw.commitFull && raw.commitFull !== 'unknown') existingCommitFull = raw.commitFull;
        } catch {}
      }

      const finalCommit = gitInfo.commit !== 'unknown' ? gitInfo.commit : existingCommit;
      const finalCommitFull = gitInfo.commitFull !== 'unknown' ? gitInfo.commitFull : existingCommitFull;

      const versionData = {
        version,
        commit: finalCommit,
        commitFull: finalCommitFull,
        branch: gitInfo.branch,
        buildTime: new Date().toISOString(),
      };

      fs.writeFileSync(target, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
      console.log(`[stamp-version] Stamped ${target} -> commit ${finalCommit}`);
    } catch (err) {
      console.warn(`[stamp-version] Could not write ${target}:`, err.message);
    }
  }
}

main();
