import assert from 'node:assert/strict';
import {
  buildSearchPrefixes,
  isServerSearchReady,
  matchesFirestoreSearch,
  normalizeFirestoreSearch,
  resolveFirestoreSearchKey,
  SEARCH_PREFIX_LIMIT,
} from '../lib/firestoreSearch.ts';

assert.equal(normalizeFirestoreSearch('  أحمـد  مُحمد ١٢۳  '), 'احمد محمد 123');
assert.equal(normalizeFirestoreSearch('على'), 'علي');
assert.equal(normalizeFirestoreSearch('  مُحَمَّد   مَجْدِي  '), 'محمد مجدي');
const prefixes = buildSearchPrefixes(['شركة النور الحديثة', 'PRD-١٢٣', '0100 555']);
assert(prefixes.includes('الن'));
assert(prefixes.includes('النور الح'));
assert(prefixes.includes('prd-123'));
assert(prefixes.includes('123'));
assert(prefixes.includes('prd123'));
assert(prefixes.length <= SEARCH_PREFIX_LIMIT);

const modelName = 'SK-7033A كبه سوكانى استنالس 6.5لتر  1500وات +1ق  سلاح';
const modelPrefixes = buildSearchPrefixes([modelName, '050436']);
assert(modelPrefixes.includes('7033'));
assert(modelPrefixes.includes('7033a'));
assert(modelPrefixes.includes('sk-7033a'));
assert(modelPrefixes.includes('sk7033a'));
assert(modelPrefixes.includes('050436'));
assert(modelPrefixes.includes('كبه'));

assert.equal(resolveFirestoreSearchKey('7033'), '7033');
assert.equal(resolveFirestoreSearchKey('SK-7033A'), 'sk-7033a');
assert.equal(resolveFirestoreSearchKey('sk 7033'), '7033');
assert.equal(resolveFirestoreSearchKey('٧٠٣٣'), '7033');
assert.equal(resolveFirestoreSearchKey('sk7033a'), 'sk7033a');

for (const query of ['7033', '7033A', 'SK-7033A', 'sk7033a', 'sk 7033', '050436', '٧٠٣٣']) {
  const key = resolveFirestoreSearchKey(query);
  assert(modelPrefixes.includes(key), `missing indexed key for query "${query}" → "${key}"`);
  assert(matchesFirestoreSearch(modelName, query) || matchesFirestoreSearch('050436', query), `local match failed for "${query}"`);
}

assert.equal(isServerSearchReady('ا'), false);
assert.equal(isServerSearchReady('اح'), true);
assert.equal(isServerSearchReady(''), true);

const employeePrefixes = buildSearchPrefixes(['محمد مجدي أحمد', 'EMP-101']);
assert(employeePrefixes.includes('محمد مجدي'));
assert(matchesFirestoreSearch('مُحَمَّد مجدى أحمد', 'محمد مجدي'));

console.log('firestore-search.test.ts passed');
