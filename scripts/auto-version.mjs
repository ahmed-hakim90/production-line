import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const PACKAGE_LOCK = path.join(ROOT, 'package-lock.json');
const README = path.join(ROOT, 'README.md');

if (process.env.SKIP_AUTO_VERSION === '1') {
  process.exit(0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid SemVer version: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

function updateReadmeBadge(version) {
  if (!fs.existsSync(README)) return false;

  const original = fs.readFileSync(README, 'utf8');
  const updated = original.replace(
    /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]+-green\)/,
    `![Version](https://img.shields.io/badge/version-${version}-green)`,
  );

  if (updated !== original) {
    fs.writeFileSync(README, updated, 'utf8');
    return true;
  }

  return false;
}

function stageFiles(files) {
  const existing = files.filter((f) => fs.existsSync(f));
  if (!existing.length) return;

  const rel = existing.map((f) => path.relative(ROOT, f));
  const result = spawnSync('git', ['add', ...rel], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Failed to stage auto-version files');
  }
}

const pkg = readJson(PACKAGE_JSON);
const nextVersion = bumpPatch(pkg.version);
pkg.version = nextVersion;
writeJson(PACKAGE_JSON, pkg);

if (fs.existsSync(PACKAGE_LOCK)) {
  const lock = readJson(PACKAGE_LOCK);
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  writeJson(PACKAGE_LOCK, lock);
}

updateReadmeBadge(nextVersion);
stageFiles([PACKAGE_JSON, PACKAGE_LOCK, README]);

console.log(`[auto-version] bumped to ${nextVersion}`);
