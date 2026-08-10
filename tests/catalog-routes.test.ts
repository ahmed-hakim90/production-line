import assert from 'node:assert/strict';
import { CATALOG_ROUTES } from '../modules/catalog/routes/index.ts';

function run() {
  const board = CATALOG_ROUTES.find((route) => route.path === '/catalog');
  assert.ok(board, 'catalog board route missing');
  assert.ok(board?.component, 'catalog board component missing');
  assert.deepEqual(board?.permissionsAny, [
    'products.view',
    'materials.view',
    'catalog.categories.view',
  ]);
  assert.equal(board?.skeleton, 'dashboard');

  const categories = CATALOG_ROUTES.find((route) => route.path === '/catalog/categories');
  assert.ok(categories, 'categories route missing');

  console.log('catalog-routes.test.ts: OK');
}

run();
