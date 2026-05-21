import assert from 'node:assert/strict';
import { normalizeCategoryName } from '../modules/catalog/lib/categoryTree.ts';

assert.equal(normalizeCategoryName('  فئة  '), normalizeCategoryName('فئة'));

const categories = [
  { id: 'cat1', name: 'إلكترونيات', parentId: null, isActive: true },
  { id: 'cat2', name: 'هواتف', parentId: 'cat1', isActive: true },
];
const byName = new Map<string, string>();
for (const c of categories) {
  const key = normalizeCategoryName(c.name);
  if (key) byName.set(key, c.id!);
}
assert.equal(byName.get(normalizeCategoryName('إلكترونيات')), 'cat1');

console.log('category-migration.test.ts: ok');
