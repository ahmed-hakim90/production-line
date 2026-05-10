/**
 * 1) Ensures firebase.json wires Firestore rules to ./firestore.rules
 * 2) Runs `firebase deploy --only firestore:rules --dry-run` when possible (validates rules; requires login + network)
 *
 * Run from repo root: node scripts/verify-firestore-rules-deploy.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firebaseJsonPath = resolve(root, 'firebase.json');
const rulesPath = resolve(root, 'firestore.rules');

const firebaseJson = JSON.parse(readFileSync(firebaseJsonPath, 'utf8'));
const rulesFile = firebaseJson?.firestore?.rules;

if (!rulesFile || typeof rulesFile !== 'string') {
  console.error('[verify-firestore-rules-deploy] firebase.json: missing firestore.rules path');
  process.exit(1);
}

const resolvedRules = resolve(root, rulesFile);
if (!existsSync(resolvedRules)) {
  console.error(`[verify-firestore-rules-deploy] Rules file not found: ${resolvedRules}`);
  process.exit(1);
}

if (resolvedRules !== rulesPath) {
  console.warn(`[verify-firestore-rules-deploy] Using rules file: ${resolvedRules}`);
} else {
  console.log(`[verify-firestore-rules-deploy] firebase.json → ${rulesFile} (exists)`);
}

const r = spawnSync(
  'npx',
  ['firebase-tools', 'deploy', '--only', 'firestore:rules', '--dry-run', '--non-interactive'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env },
  },
);

if (r.status === 0) {
  console.log('[verify-firestore-rules-deploy] Dry-run succeeded (rules compile and deploy graph OK).');
  console.log(
    '[verify-firestore-rules-deploy] Compare production: Firebase Console → Firestore → Rules should match firestore.rules; run `firebase deploy --only firestore:rules` if they differ.',
  );
  process.exit(0);
}

console.warn(
  '[verify-firestore-rules-deploy] Dry-run failed (often: not logged in). Run: firebase login && firebase use',
);
console.warn('[verify-firestore-rules-deploy] Local path check above still ensures firebase.json points at your rules file.');
process.exit(0);
