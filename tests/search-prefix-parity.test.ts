import assert from 'node:assert/strict';
import { buildSearchPrefixes as clientBuild } from '../lib/firestoreSearch.ts';
import { buildSearchPrefixes as serverBuild } from '../functions/src/searchPrefixes.ts';

const samples = [
  ['شركة النور الحديثة', 'CUS-١٢٣', '٠١٠٠ ٥٥٥'],
  ['أحمد مُحمد', 'EMP-42'],
  ['Injection Pump', 'PRD-۰۰۷'],
];
for (const sample of samples) assert.deepEqual(serverBuild(sample), clientBuild(sample));

console.log('search-prefix-parity.test.ts passed');
