import assert from 'node:assert/strict';
import {
  absorbPoolCost,
  calculateFullProductionCost,
  calculatePoolRate,
  settleProductionCost,
  type ProductionCostPool,
} from '../modules/costs/lib/fullProductionCost.ts';
import { isProductionAllocationCostCenter } from '../utils/costCalculations.ts';
import type { CostCenter } from '../types.ts';
import {
  buildProductionCompletionJournal,
  buildProductionCostAbsorptionJournal,
} from '../modules/costs/lib/productionCostJournal.ts';

const result = calculateFullProductionCost({
  reportId: 'PR-1',
  quantityProduced: 100,
  goodQuantity: 95,
  normalScrapQuantity: 5,
  lines: [
    { sourceKey: 'issue-1', sourceType: 'stock_issue', category: 'material', label: 'خامة', amount: 1_000, status: 'actual' },
    { sourceKey: 'pack-1', sourceType: 'stock_issue', category: 'packaging', label: 'تعبئة', amount: 200, status: 'actual' },
    { sourceKey: 'labor-1', sourceType: 'labor_standard', category: 'direct_labor', label: 'عمالة', amount: 300, status: 'estimated' },
    { sourceKey: 'electricity-1', sourceType: 'cost_pool', category: 'factory_overhead', label: 'كهرباء', amount: 100, status: 'estimated' },
    { sourceKey: 'dep-1', sourceType: 'asset_schedule', category: 'depreciation', label: 'إهلاك', amount: 50, status: 'scheduled' },
  ],
});

assert.equal(result.materialCost, 1_000);
assert.equal(result.packagingCost, 200);
assert.equal(result.conversionCost, 450);
assert.equal(result.fullManufacturingCost, 1_650);
assert.equal(result.unitManufacturingCost, 17.37);
assert.equal(result.status, 'provisional');

const duplicate = calculateFullProductionCost({
  reportId: 'PR-2',
  quantityProduced: 10,
  lines: [
    { sourceKey: 'same', sourceType: 'stock_issue', category: 'material', label: 'A', amount: 10, status: 'actual' },
    { sourceKey: 'same', sourceType: 'stock_issue', category: 'material', label: 'A', amount: 10, status: 'actual' },
  ],
});
assert.equal(duplicate.materialCost, 10, 'identical retry must not double-load the cost');

assert.throws(() => calculateFullProductionCost({
  reportId: 'PR-3',
  quantityProduced: 10,
  lines: [
    { sourceKey: 'same', sourceType: 'stock_issue', category: 'material', label: 'A', amount: 10, status: 'actual' },
    { sourceKey: 'same', sourceType: 'stock_issue', category: 'material', label: 'A', amount: 20, status: 'actual' },
  ],
}), /مكرر بقيم مختلفة/);

const electricityPool: ProductionCostPool = {
  id: 'electricity-2026-08',
  period: '2026-08',
  costCenterId: 'factory-services',
  label: 'كهرباء المصنع',
  category: 'electricity',
  driver: 'machine_hours',
  provisionalAmount: 30_000,
  actualAmount: 33_000,
  expectedDriverQuantity: 1_500,
};
assert.equal(calculatePoolRate(electricityPool), 20);
assert.equal(absorbPoolCost(electricityPool, 8), 160);
assert.equal(calculatePoolRate(electricityPool, true), 22);

const settlement = settleProductionCost(30_000, 33_000, 1_000);
assert.equal(settlement.variance, 3_000);
assert.equal(settlement.varianceDirection, 'under_absorbed');
assert.equal(settlement.unitVariance, 3);

const center = (overrides: Partial<CostCenter>): CostCenter => ({
  id: 'cc',
  name: 'مركز',
  type: 'indirect',
  isActive: true,
  ...overrides,
});
assert.equal(isProductionAllocationCostCenter(center({})), true, 'legacy production centers remain compatible');
assert.equal(isProductionAllocationCostCenter(center({ costObjectScope: 'production', postingMode: 'driver_allocation' })), true);
assert.equal(isProductionAllocationCostCenter(center({ costObjectScope: 'repair', postingMode: 'driver_allocation' })), false);
assert.equal(isProductionAllocationCostCenter(center({ costObjectScope: 'production', postingMode: 'collect_only' })), false);
assert.equal(isProductionAllocationCostCenter(center({ accountingCategory: 'administration' })), false);

const absorption = buildProductionCostAbsorptionJournal({
  tenantId: 't1',
  reportId: 'PR-1',
  revision: 1,
  date: '2026-08-05',
  costCenterId: 'line-1',
  productId: 'p1',
  actualMaterialCost: 1_000,
  absorbedDirectLaborCost: 300,
  absorbedFactoryOverheadCost: 150,
});
assert.equal(absorption.totalDebit, 1_450);
assert.equal(absorption.totalCredit, 1_450);
assert.equal(absorption.lines.filter((line) => line.accountCode === '132001' && line.debit > 0).length, 3);
assert.match(absorption.idempotencyKey, /PR-1__r1$/);

const completion = buildProductionCompletionJournal({
  tenantId: 't1',
  reportId: 'PR-1',
  revision: 1,
  date: '2026-08-05',
  costCenterId: 'line-1',
  productId: 'p1',
  completedCost: 1_450,
});
assert.equal(completion.lines[0].accountCode, '133001');
assert.equal(completion.lines[1].accountCode, '132001');

console.log('full-production-cost.test.ts: ok');
