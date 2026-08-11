import assert from 'node:assert/strict';
import {
  buildSearchPrefixes,
  isServerSearchReady,
  normalizeFirestoreSearch,
  SEARCH_PREFIX_LIMIT,
} from '../lib/firestoreSearch.ts';

assert.equal(normalizeFirestoreSearch('  أحمـد  مُحمد ١٢۳  '), 'احمد محمد 123');
assert.equal(normalizeFirestoreSearch('على'), 'علي');
const prefixes = buildSearchPrefixes(['شركة النور الحديثة', 'PRD-١٢٣', '0100 555']);
assert(prefixes.includes('الن'));
assert(prefixes.includes('النور الح'));
assert(prefixes.includes('prd-123'));
assert(prefixes.length <= SEARCH_PREFIX_LIMIT);
assert.equal(isServerSearchReady('ا'), false);
assert.equal(isServerSearchReady('اح'), true);
assert.equal(isServerSearchReady(''), true);

console.log('firestore-search.test.ts passed');
