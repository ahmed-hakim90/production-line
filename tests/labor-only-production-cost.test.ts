import assert from 'node:assert/strict';
import { calculateLaborOnlyProductionCost } from '../utils/laborOnlyProductionCost.ts';
import { buildProductionReportCostSnapshotPatch, computeProductionCostEngine } from '../utils/costCalculations.ts';
import type { CostAllocation, CostCenter, CostCenterValue, ProductionReport } from '../types.ts';

const calculated = calculateLaborOnlyProductionCost({
  hourlyRate: 50,
  workersCount: 10,
  workHours: 8,
  quantityProduced: 2_000,
});
assert.equal(calculated.totalCost, 4_000);
assert.equal(calculated.unitCost, 2);
assert.equal(calculated.hourlyRateApplied, 50);

const report: ProductionReport = {
  id: 'labor-only-report',
  employeeId: 'supervisor-1',
  productId: 'product-1',
  lineId: 'line-1',
  date: '2026-09-05',
  quantityProduced: 2_000,
  workersCount: 10,
  workHours: 8,
  supervisorIndirectCost: 99_999,
  reportType: 'finished_product',
};
const center: CostCenter = {
  id: 'center-1',
  name: 'مصروفات قديمة',
  type: 'indirect',
  allocationBasis: 'line_percentage',
  isActive: true,
};
const value: CostCenterValue = {
  costCenterId: 'center-1',
  month: '2026-09',
  amount: 1_000_000,
};
const allocation: CostAllocation = {
  costCenterId: 'center-1',
  month: '2026-09',
  allocations: [{ lineId: 'line-1', percentage: 100 }],
};
const engine = computeProductionCostEngine({
  reports: [report],
  hourlyRate: 50,
  costCenters: [center],
  costCenterValues: [value],
  costAllocations: [allocation],
  options: { supervisorHourlyRates: new Map([['supervisor-1', 10_000]]) },
});
assert.equal(engine.byProduct['product-1'].laborCost, 4_000);
assert.equal(engine.byProduct['product-1'].indirectCost, 0);
assert.equal(engine.byProduct['product-1'].totalCost, 4_000);

const packaging = computeProductionCostEngine({
  reports: [{ ...report, id: 'packaging', reportType: 'packaging' }],
  hourlyRate: 50,
  costCenters: [],
  costCenterValues: [],
  costAllocations: [],
});
assert.equal(packaging.totalCost, 0);

const snapshot = buildProductionReportCostSnapshotPatch(report, [report], {
  hourlyRate: 50,
  costCenters: [center],
  costCenterValues: [value],
  costAllocations: [allocation],
  supervisorHourlyRates: new Map([['supervisor-1', 10_000]]),
});
assert.equal(snapshot?.laborHourlyRateApplied, 50);
assert.equal(snapshot?.laborCostSnapshot, 4_000);
assert.equal(snapshot?.unitCostSnapshot, 2);
assert.equal(snapshot?.supervisorIndirectSnapshot, 0);
assert.equal(snapshot?.lineIndirectShareSnapshot, 0);
assert.deepEqual(snapshot?.indirectByCenterSnapshot, {});

console.log('labor-only-production-cost.test.ts: ok');
