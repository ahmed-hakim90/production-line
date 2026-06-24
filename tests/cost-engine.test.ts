import assert from 'node:assert/strict';
import { computeProductionCostEngine } from '../utils/costCalculations';
import type { Asset, AssetDepreciation, CostAllocation, CostCenter, CostCenterValue, ProductionReport } from '../types';

const month = '2026-05';
const workingDaysByMonth = { [month]: 20 };

function report(overrides: Partial<ProductionReport>): ProductionReport {
  return {
    id: overrides.id || `r-${Math.random()}`,
    employeeId: overrides.employeeId || 'sup-1',
    productId: overrides.productId || 'p1',
    lineId: overrides.lineId || 'line-1',
    date: overrides.date || `${month}-03`,
    quantityProduced: overrides.quantityProduced ?? 100,
    workersCount: overrides.workersCount ?? 0,
    workHours: overrides.workHours ?? 0,
    reportType: 'finished_product',
    ...overrides,
  };
}

function runEngine(args: {
  reports: ProductionReport[];
  hourlyRate?: number;
  costCenters?: CostCenter[];
  costCenterValues?: CostCenterValue[];
  costAllocations?: CostAllocation[];
  assets?: Asset[];
  assetDepreciations?: AssetDepreciation[];
  productCategoryById?: Map<string, string>;
  supervisorHourlyRates?: Map<string, number>;
}) {
  return computeProductionCostEngine({
    reports: args.reports,
    hourlyRate: args.hourlyRate ?? 0,
    costCenters: args.costCenters ?? [],
    costCenterValues: args.costCenterValues ?? [],
    costAllocations: args.costAllocations ?? [],
    options: {
      assets: args.assets,
      assetDepreciations: args.assetDepreciations,
      productCategoryById: args.productCategoryById,
      supervisorHourlyRates: args.supervisorHourlyRates,
      workingDaysByMonth,
    },
  });
}

function indirectCenter(id: string, allocationBasis: CostCenter['allocationBasis'] = 'line_percentage'): CostCenter {
  return {
    id,
    name: id,
    type: 'indirect',
    allocationBasis,
    productScope: 'all',
    isActive: true,
  };
}

function value(costCenterId: string, amount: number): CostCenterValue {
  return { costCenterId, month, amount, valueSource: 'manual' };
}

function allocation(costCenterId: string, percentage = 100): CostAllocation {
  return { costCenterId, month, allocations: [{ lineId: 'line-1', percentage }] };
}

{
  const result = runEngine({
    hourlyRate: 10,
    reports: [report({ id: 'direct', quantityProduced: 100, workersCount: 2, workHours: 5 })],
  });
  assert.equal(result.byProduct.p1.laborCost, 100);
  assert.equal(result.byProduct.p1.indirectCost, 0);
  assert.equal(result.byProduct.p1.costPerUnit, 1);
}

{
  const result = runEngine({
    hourlyRate: 10,
    reports: [report({
      id: 'absent-workers',
      quantityProduced: 100,
      workersCount: 2,
      presentAssignments: 2,
      absentAssignments: 3,
      workHours: 5,
    })],
  });
  assert.equal(result.byProduct.p1.laborCost, 100);
  assert.equal(result.byProduct.p1.costPerUnit, 1);
}

{
  const center = indirectCenter('cc-line');
  const result = runEngine({
    reports: [
      report({ id: 'hours-a', productId: 'p1', quantityProduced: 50, workHours: 2 }),
      report({ id: 'hours-b', productId: 'p2', quantityProduced: 50, workHours: 6 }),
    ],
    costCenters: [center],
    costCenterValues: [value('cc-line', 2000)],
    costAllocations: [allocation('cc-line')],
  });
  assert.equal(result.byProduct.p1.indirectCost, 25);
  assert.equal(result.byProduct.p2.indirectCost, 75);
}

{
  const center = indirectCenter('cc-fallback');
  const result = runEngine({
    reports: [
      report({ id: 'qty-a', productId: 'p1', quantityProduced: 25, workHours: 0 }),
      report({ id: 'qty-b', productId: 'p2', quantityProduced: 75, workHours: 0 }),
    ],
    costCenters: [center],
    costCenterValues: [value('cc-fallback', 2000)],
    costAllocations: [allocation('cc-fallback')],
  });
  assert.equal(result.byProduct.p1.indirectCost, 25);
  assert.equal(result.byProduct.p2.indirectCost, 75);
}

{
  const center = {
    ...indirectCenter('cc-category', 'by_qty'),
    productScope: 'category' as const,
    productCategories: ['A'],
  };
  const result = runEngine({
    reports: [
      report({ id: 'cat-a', productId: 'p1', quantityProduced: 25 }),
      report({ id: 'cat-b', productId: 'p2', quantityProduced: 75 }),
    ],
    costCenters: [center],
    costCenterValues: [value('cc-category', 2000)],
    productCategoryById: new Map([
      ['p1', 'A'],
      ['p2', 'B'],
    ]),
  });
  assert.equal(result.byProduct.p1.indirectCost, 100);
  assert.equal(result.byProduct.p2.indirectCost, 0);
}

{
  const center = indirectCenter('cc-dep');
  const result = runEngine({
    reports: [report({ id: 'dep', productId: 'p1', quantityProduced: 100, workHours: 1 })],
    costCenters: [center],
    costCenterValues: [value('cc-dep', 0)],
    costAllocations: [allocation('cc-dep')],
    assets: [{
      id: 'asset-1',
      name: 'Machine',
      code: 'M-1',
      category: 'machine',
      centerId: 'cc-dep',
      purchaseDate: '2026-01-01',
      purchaseCost: 10000,
      salvageValue: 0,
      usefulLifeMonths: 10,
      depreciationMethod: 'straight_line',
      monthlyDepreciation: 2000,
      accumulatedDepreciation: 0,
      currentValue: 10000,
      status: 'active',
    }],
    assetDepreciations: [{
      assetId: 'asset-1',
      period: month,
      depreciationAmount: 2000,
      accumulatedDepreciation: 2000,
      bookValue: 8000,
    }],
  });
  assert.equal(result.byProduct.p1.indirectCost, 100);
}

{
  const result = runEngine({
    reports: [
      report({ id: 'sup-a', productId: 'p1', employeeId: 'sup-1', quantityProduced: 25, workHours: 8 }),
      report({ id: 'sup-b', productId: 'p2', employeeId: 'sup-1', quantityProduced: 75, workHours: 6 }),
    ],
    supervisorHourlyRates: new Map([['sup-1', 50]]),
  });
  assert.equal(result.byProduct.p1.indirectCost, 100);
  assert.equal(result.byProduct.p2.indirectCost, 300);
  assert.equal(result.totalIndirectCost, 400);
}

console.log('cost engine tests passed');
