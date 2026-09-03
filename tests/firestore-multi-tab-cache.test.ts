import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const firebaseSourcePath = fileURLToPath(
  new URL('../modules/auth/services/firebase.ts', import.meta.url),
);
const source = readFileSync(firebaseSourcePath, 'utf8');

assert.match(
  source,
  /localCache:\s*memoryLocalCache\(\)/,
  'Firestore must use a tab-isolated memory cache',
);
assert.doesNotMatch(
  source,
  /persistent(?:Single|Multiple)TabManager/,
  'Firestore tab managers reintroduce cross-tab persistence ownership',
);
assert.doesNotMatch(
  source,
  /persistentLocalCache/,
  'Persistent cache must stay disabled until the Firebase multi-tab assertion is resolved',
);

console.log('✓ Firestore uses a tab-isolated cache for safe multi-tab operation');
