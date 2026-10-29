import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = '/tmp/pl-quality-security-emu';
const firestorePort = 8096;
const storagePort = 9198;
mkdirSync(dir, { recursive: true });

const firebase = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
firebase.emulators.singleProjectMode = true;
firebase.emulators.firestore.port = firestorePort;
firebase.emulators.storage = { port: storagePort };
writeFileSync(resolve(dir, 'firebase.json'), JSON.stringify(firebase, null, 2));
for (const file of ['firestore.rules', 'firestore.indexes.json', 'storage.rules', '.firebaserc']) {
  cpSync(resolve(root, file), resolve(dir, file));
}

console.log(`[quality-security] Firestore emulator port ${firestorePort}; Storage emulator port ${storagePort}`);
const result = spawnSync(
  'npx',
  ['--yes', 'firebase-tools', 'emulators:exec', '--only', 'firestore,storage', `node ${resolve(root, 'tests/quality-security.rules.test.mjs')}`],
  { cwd: dir, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
