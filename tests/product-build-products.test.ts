import assert from 'node:assert/strict';
import { buildProducts } from '../utils/calculations.ts';
import { effectivePlanningAssemblyMinutes } from '../utils/routingStandardAssembly.ts';
import type { FirestoreProduct } from '../types.ts';

const baseProduct = (overrides: Partial<FirestoreProduct>): FirestoreProduct => ({
  id: 'p1',
  name: 'منتج اختبار',
  model: 'فئة اختبار',
  code: 'PRD-001',
  openingBalance: 0,
  ...overrides,
});

const products = buildProducts(
  [
    baseProduct({ id: 'p1', assemblyMode: 'team' }),
    baseProduct({ id: 'p2', code: 'PRD-002' }),
  ],
  [],
  [],
);

assert.equal(products.find((product) => product.id === 'p1')?.assemblyMode, 'team');
assert.equal(products.find((product) => product.id === 'p2')?.assemblyMode, 'individual');

assert.equal(
  effectivePlanningAssemblyMinutes(
    'p1',
    undefined,
    { p1: 600 },
    { p1: 10 },
  ),
  10,
);
assert.equal(
  effectivePlanningAssemblyMinutes(
    'p2',
    7,
    {},
    { p2: 120 },
  ),
  2,
);

console.log('product-build-products.test.ts: ok');
