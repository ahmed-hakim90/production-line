import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

if (process.env.SKIP_AUTO_CHANGELOG === '1') {
  process.exit(0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getCommitMessage(messageFilePath) {
  if (!messageFilePath || !fs.existsSync(messageFilePath)) {
    return 'update';
  }

  const content = fs.readFileSync(messageFilePath, 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  return lines[0] ?? 'update';
}

function ensureChangelog() {
  if (fs.existsSync(CHANGELOG)) return;
  fs.writeFileSync(
    CHANGELOG,
    '# Changelog\n\nكل التغييرات المهمة في المشروع موثقة في هذا الملف.\n\n## [Unreleased]\n\n',
    'utf8',
  );
}

function appendRelease(version, message) {
  ensureChangelog();
  const today = new Date().toISOString().slice(0, 10);
  const header = `## [${version}] - ${today}`;
  const bullet = `- ${message}`;

  const original = fs.readFileSync(CHANGELOG, 'utf8');
  if (original.includes(`${header}\n\n${bullet}`) || original.includes(`${header}\n${bullet}`)) {
    return;
  }

  const next = `${original.trimEnd()}\n\n${header}\n\n${bullet}\n`;
  fs.writeFileSync(CHANGELOG, next, 'utf8');
}

function stageChangelog() {
  const rel = path.relative(ROOT, CHANGELOG);
  const result = spawnSync('git', ['add', rel], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Failed to stage CHANGELOG.md');
  }
}

const pkg = readJson(PACKAGE_JSON);
const commitMsgFile = process.argv[2];
const commitMessage = getCommitMessage(commitMsgFile);

appendRelease(pkg.version, commitMessage);
stageChangelog();

console.log(`[auto-changelog] updated for v${pkg.version}`);
