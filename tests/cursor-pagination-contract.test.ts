import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync('hooks/useCursorPagination.ts', 'utf8');
assert.match(hook, /pagesRef/);
assert.match(hook, /const cached = pagesRef\.current\[nextIndex\]/);
assert.match(hook, /pagesRef\.current = \[\]/);
assert.match(hook, /queryKey/);
assert.match(hook, /keepPreviousData/);
assert.match(hook, /if \(!keepPreviousData\)/);
assert.match(hook, /initialLoading: loading && !hasLoadedOnce/);
assert.match(hook, /refreshing: loading && hasLoadedOnce/);

for (const file of [
  'modules/production/services/productService.ts',
  'modules/manufacturing/services/materialService.ts',
  'modules/customers/services/customerService.ts',
  'modules/hr/employeeService.ts',
]) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /pageSize \+ 1/, `${file} must use a one-row lookahead`);
  assert.match(source, /orderBy\(documentId\(\)\)/, `${file} must end ordering with document id`);
  assert.match(source, /startAfter\(/, `${file} must use a cursor, not offset`);
  assert.doesNotMatch(source, /\boffset\(/, `${file} must not use Firestore offset`);
}

const equalSortRows = [
  { id: 'a', value: 1 },
  { id: 'b', value: 1 },
  { id: 'c', value: 1 },
  { id: 'd', value: 2 },
  { id: 'e', value: 2 },
];
const ordered = equalSortRows.sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
const pages = [ordered.slice(0, 2), ordered.slice(2, 4), ordered.slice(4)];
assert.deepEqual(pages.flat().map((row) => row.id), ['a', 'b', 'c', 'd', 'e']);
assert.equal(new Set(pages.flat().map((row) => row.id)).size, equalSortRows.length);

console.log('cursor-pagination-contract.test.ts passed');
