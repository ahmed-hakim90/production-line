import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length !== 2 || args[0] !== '--project') {
  console.error('Usage: npm run deploy:firestore -- --project <firebase-project-id>');
  process.exit(1);
}

const projectId = args[1];
if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(projectId)) {
  console.error('[deploy:firestore] Invalid Firebase project ID.');
  process.exit(1);
}

console.log(`[deploy:firestore] Target project: ${projectId}`);

const compose = spawnSync(process.execPath, ['scripts/compose-firestore-rules.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

if (compose.error) {
  console.error(`[deploy:firestore] Could not compose Firestore rules: ${compose.error.message}`);
  process.exit(1);
}
if (compose.status !== 0) {
  process.exit(compose.status ?? 1);
}

const firebaseCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const deploy = spawnSync(
  firebaseCommand,
  [
    '--yes',
    'firebase-tools',
    'deploy',
    '--only',
    'firestore:rules,firestore:indexes',
    '--non-interactive',
    '--project',
    projectId,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (deploy.error) {
  console.error(`[deploy:firestore] Firebase deployment failed to start: ${deploy.error.message}`);
  process.exit(1);
}
if (deploy.status !== 0) {
  process.exit(deploy.status ?? 1);
}
