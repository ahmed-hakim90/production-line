import assert from 'node:assert/strict';
import {
  binaryFilterItems,
  binarySearchExact,
  binarySearchLowerBound,
  binarySearchPrefixRange,
  binarySearchUpperBound,
  buildBinarySearchIndex,
  compareStrings,
} from '../utils/binarySearch.ts';

assert.equal(compareStrings('a', 'b'), -1);
assert.equal(compareStrings('b', 'a'), 1);
assert.equal(compareStrings('a', 'a'), 0);

const codes = ['A-01', 'A-02', 'B-10', 'C-01'].map((code) => ({ code }));
assert.equal(binarySearchExact(codes, 'B-10', (i) => i.code), 2);
assert.equal(binarySearchExact(codes, 'Z-99', (i) => i.code), -1);
assert.equal(binarySearchLowerBound(codes, 'A-02', (i) => i.code), 1);
assert.equal(binarySearchUpperBound(codes, 'A-02', (i) => i.code), 2);

const prefixHits = binarySearchPrefixRange(codes, 'A-', (i) => i.code);
assert.deepEqual(
  prefixHits.map((i) => i.code),
  ['A-01', 'A-02'],
);

const items = [
  { label: 'عمال الإنتاج', group: 'إنتاج', path: '/production/workers' },
  { label: 'المنتجات', group: 'إنتاج', path: '/production/products' },
  { label: 'الموظفون', group: 'موارد بشرية', path: '/hr/employees' },
];

const index = buildBinarySearchIndex(items, (i) => [i.label, i.group, i.path]);
assert.ok(index.length >= items.length);

const byToken = binaryFilterItems(items, 'الإنتاج', (i) => [i.label, i.group, i.path], { index });
assert.equal(byToken.length, 1);
assert.equal(byToken[0].label, 'عمال الإنتاج');

const byStem = binaryFilterItems(items, 'إنتاج', (i) => [i.label, i.group, i.path], { index });
assert.ok(byStem.some((i) => i.label === 'عمال الإنتاج'));
assert.ok(byStem.some((i) => i.group === 'إنتاج'));

const byPrefix = binaryFilterItems(items, 'المنت', (i) => [i.label, i.group, i.path], { index });
assert.equal(byPrefix.length, 1);
assert.equal(byPrefix[0].label, 'المنتجات');

const byPath = binaryFilterItems(items, '/hr/', (i) => [i.label, i.group, i.path], { index });
assert.equal(byPath.length, 1);
assert.equal(byPath[0].path, '/hr/employees');

const empty = binaryFilterItems(items, '', (i) => [i.label], { limit: 2 });
assert.equal(empty.length, 2);

const limited = binaryFilterItems(items, 'إ', (i) => [i.label, i.group], { index, limit: 1 });
assert.equal(limited.length, 1);

console.log('binary-search: all assertions passed');
