import assert from 'node:assert/strict';
import {
  buildTeamPlanWorkerOutputs,
  getAvailableIndividualLineWorkerTargetProducts,
  getProductAssemblyMode,
  hasLineSpecificWorkerTarget,
  resolveReportWorkerTarget,
  resolveWorkerTarget,
  splitTeamPlanPerformance,
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

// Team plan shared performance — equal split among present workers only
const threePresent = splitTeamPlanPerformance({
  quantityProduced: 90,
  planDailyTarget: 90,
  workers: [
    { workerId: 'a', workerName: 'A', isPresent: true },
    { workerId: 'b', workerName: 'B', isPresent: true },
    { workerId: 'c', workerName: 'C', isPresent: true },
  ],
});
assert.equal(threePresent.length, 3);
threePresent.forEach((row) => {
  assert.equal(row.isPresent, true);
  assert.equal(row.outputQty, 30);
  assert.equal(row.dailyTargetQty, 30);
  assert.equal(row.achievementPercent, 100);
});
assert.equal(threePresent.reduce((sum, row) => sum + row.outputQty, 0), 90);
assert.equal(threePresent.reduce((sum, row) => sum + row.dailyTargetQty, 0), 90);

const withAbsent = splitTeamPlanPerformance({
  quantityProduced: 90,
  planDailyTarget: 90,
  workers: [
    { workerId: 'a', workerName: 'A', isPresent: true },
    { workerId: 'b', workerName: 'B', isPresent: true },
    { workerId: 'c', workerName: 'C', isPresent: true },
    { workerId: 'd', workerName: 'D', isPresent: false },
  ],
});
assert.equal(withAbsent.length, 4);
const presentRows = withAbsent.filter((row) => row.isPresent);
const absentRow = withAbsent.find((row) => row.workerId === 'd');
assert.equal(presentRows.length, 3);
presentRows.forEach((row) => {
  assert.equal(row.outputQty, 30);
  assert.equal(row.dailyTargetQty, 30);
  assert.equal(row.achievementPercent, 100);
});
assert.deepEqual(absentRow, {
  workerId: 'd',
  workerName: 'D',
  isPresent: false,
  dailyTargetQty: 0,
  outputQty: 0,
  achievementPercent: 0,
});
// Team achievement Q/T stays 100% regardless of absences
assert.equal(
  presentRows[0].achievementPercent,
  threePresent[0].achievementPercent,
);

const halfAchievement = splitTeamPlanPerformance({
  quantityProduced: 45,
  planDailyTarget: 90,
  workers: [
    { workerId: 'a', workerName: 'A' },
    { workerId: 'b', workerName: 'B', isPresent: false },
  ],
});
assert.equal(halfAchievement[0].outputQty, 45);
assert.equal(halfAchievement[0].dailyTargetQty, 90);
assert.equal(halfAchievement[0].achievementPercent, 50);
assert.equal(halfAchievement[1].outputQty, 0);
assert.equal(halfAchievement[1].dailyTargetQty, 0);
assert.equal(halfAchievement[1].achievementPercent, 0);

const built = buildTeamPlanWorkerOutputs({
  quantityProduced: 10,
  planDailyTarget: 20,
  workers: [
    {
      workerId: 'w1',
      workerName: 'Worker 1',
      isPresent: true,
      productId: 'p2',
      productName: 'Team Product',
      lineId: 'l1',
      lineName: 'Line 1',
    },
  ],
});
assert.equal(built.length, 1);
assert.equal(built[0].productId, 'p2');
assert.equal(built[0].lineId, 'l1');
assert.equal(built[0].outputQty, 10);
assert.equal(built[0].dailyTargetQty, 20);
assert.equal(built[0].achievementPercent, 50);

console.log('worker-target-selector.test.ts: ok');
