import assert from 'node:assert/strict';
import {
  buildCategoryPath,
  buildCategoryTree,
  formatCategoryBreadcrumb,
  getDescendantIds,
  wouldCreateCycle,
} from '../modules/catalog/lib/categoryTree.ts';

const flat = [
  { id: 'a', name: 'A', parentId: null },
  { id: 'b', name: 'B', parentId: 'a' },
  { id: 'c', name: 'C', parentId: 'b' },
];

assert.deepEqual(buildCategoryPath(flat, 'c'), { path: ['a', 'b'], level: 2 });
assert.deepEqual(buildCategoryPath(flat, 'a'), { path: [], level: 0 });
assert.equal(wouldCreateCycle(flat, 'a', 'c'), true);
assert.equal(wouldCreateCycle(flat, 'b', 'a'), false);
assert.deepEqual([...getDescendantIds(flat, 'a')].sort(), ['b', 'c']);
assert.equal(formatCategoryBreadcrumb(flat, 'c'), 'A > B > C');

const tree = buildCategoryTree(flat);
assert.equal(tree.length, 1);
assert.equal(tree[0].category.id, 'a');
assert.equal(tree[0].children[0].category.id, 'b');

console.log('category-tree.test.ts: ok');
