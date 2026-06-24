import assert from 'node:assert/strict';
import {
  getAvailableIndividualLineWorkerTargetProducts,
  getProductAssemblyMode,
  hasLineSpecificWorkerTarget,
  resolveReportWorkerTarget,
  resolveWorkerTarget,
} from '../modules/production/selectors/workerTargetSelector.ts';
import type { FirestoreProduct, LineProductConfig, ProductionWorkerTarget } from '../types';

const baseTarget = (overrides: Partial<ProductionWorkerTarget>): ProductionWorkerTarget => ({
  workerId: 'w1',
  productId: 'p1',
  dailyTargetQty: 100,
  unit: 'piece',
  isActive: true,
  effectiveFrom: '2026-01-01',
  ...overrides,
});

const lineConfig = (overrides: Partial<LineProductConfig>): LineProductConfig => ({
  lineId: 'l1',
  productId: 'p1',
  standardAssemblyTime: 5,
  dailyWorkerTargetQty: 50,
  ...overrides,
});

const date = '2026-06-17';

assert.deepEqual(
  resolveWorkerTarget({
    workerId: 'w1',
    productId: 'p1',
    lineId: 'l1',
    date,
    targets: [],
    lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 80 })],
  }),
  { dailyTargetQty: 80, source: 'line_product' },
);

assert.deepEqual(
  resolveWorkerTarget({
    workerId: 'w1',
    productId: 'p1',
    lineId: 'l1',
    date,
    targets: [baseTarget({ dailyTargetQty: 120, lineId: 'l1' })],
    lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 80 })],
  }),
  { dailyTargetQty: 120, source: 'worker_product_line' },
);

assert.deepEqual(
  resolveWorkerTarget({
    workerId: 'w1',
    productId: 'p1',
    lineId: 'l1',
    date,
    targets: [],
    product: { defaultWorkerTargetQty: 60 },
    lineProductConfigs: [],
  }),
  { dailyTargetQty: 60, source: 'product_default' },
);

const missing = resolveWorkerTarget({
  workerId: 'w1',
  productId: 'p1',
  lineId: 'l1',
  date,
  targets: [],
  lineProductConfigs: [],
});

assert.equal(missing.source, 'missing');
assert.equal(missing.dailyTargetQty, 0);

assert.deepEqual(
  resolveReportWorkerTarget({
    productId: 'p1',
    lineId: 'l1',
    lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 90 })],
  }),
  { dailyTargetQty: 90, source: 'line_product' },
);

const generic = resolveWorkerTarget({
  workerId: 'w1',
  productId: 'p1',
  lineId: 'l1',
  date,
  targets: [],
  product: { defaultWorkerTargetQty: 60 },
  lineProductConfigs: [],
});
const report = resolveReportWorkerTarget({
  productId: 'p1',
  lineId: 'l1',
  lineProductConfigs: [],
});

assert.equal(generic.source, 'product_default');
assert.equal(report.source, 'missing');
assert.equal(report.dailyTargetQty, 0);

assert.equal(hasLineSpecificWorkerTarget([lineConfig({ dailyWorkerTargetQty: 50 })], 'l1', 'p1'), true);
assert.equal(hasLineSpecificWorkerTarget([lineConfig({ dailyWorkerTargetQty: 0 })], 'l1', 'p1'), false);
assert.equal(getProductAssemblyMode(null), 'individual');
assert.equal(getProductAssemblyMode({ assemblyMode: 'team' }), 'team');

const targetProducts: FirestoreProduct[] = [
  {
    id: 'p1',
    name: 'منتج فردي موجود',
    model: '',
    code: 'IND-1',
    openingBalance: 0,
    assemblyMode: 'individual',
  },
  {
    id: 'p2',
    name: 'منتج جماعي',
    model: '',
    code: 'TEAM-1',
    openingBalance: 0,
    assemblyMode: 'team',
  },
  {
    id: 'p3',
    name: 'منتج فردي جديد',
    model: '',
    code: 'IND-2',
    openingBalance: 0,
    assemblyMode: 'individual',
  },
  {
    id: 'p4',
    name: 'منتج قديم بدون نمط',
    model: '',
    code: 'LEGACY',
    openingBalance: 0,
  },
];

assert.deepEqual(
  getAvailableIndividualLineWorkerTargetProducts(targetProducts, [lineConfig({ productId: 'p1' })], 'l1')
    .map((product) => product.id),
  ['p3', 'p4'],
);

console.log('worker-target-selector.test.ts: ok');
