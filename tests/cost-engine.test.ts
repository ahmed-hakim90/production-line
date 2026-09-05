import assert from 'node:assert/strict';
import { computeProductionCostEngine } from '../utils/costCalculations.ts';
import type { CostAllocation, CostCenter, CostCenterValue, ProductionReport } from '../types.ts';

const report = (overrides: Partial<ProductionReport> = {}): ProductionReport => ({
  id: 'r1', employeeId: 'supervisor-1', productId: 'p1', lineId: 'line-1', date: '2026-09-05',
  quantityProduced: 2_000, workersCount: 10, workHours: 8, reportType: 'finished_product', ...overrides,
});
const center: CostCenter = {
  id: 'cc1', name: 'قديم', type: 'indirect', isActive: true, allocationBasis: 'line_percentage',
};
const value: CostCenterValue = { costCenterId: 'cc1', month: '2026-09', amount: 1_000_000 };
const allocation: CostAllocation = {
  costCenterId: 'cc1', month: '2026-09', allocations: [{ lineId: 'line-1', percentage: 100 }],
};

const result = computeProductionCostEngine({
  reports: [report({ supervisorIndirectCost: 500_000 })], hourlyRate: 50,
  costCenters: [center], costCenterValues: [value], costAllocations: [allocation],
  options: {
    supervisorHourlyRates: new Map([['supervisor-1', 100_000]]),
    costingPolicy: { includeSupervisor: true, includeIndirectCenters: true, includeDepreciation: true },
  },
});
assert.equal(result.totalLaborCost, 4_000);
assert.equal(result.totalIndirectCost, 0);
assert.equal(result.totalCost, 4_000);
assert.equal(result.byProduct.p1.costPerUnit, 2);
assert.equal(result.reportUnitCost.get('r1'), 2);
assert.deepEqual(result.centerSnapshots, []);

const excluded = computeProductionCostEngine({
  reports: [report({ id: 'packaging', reportType: 'packaging' }), report({ id: 'waste', reportType: 'component_waste' })],
  hourlyRate: 50, costCenters: [], costCenterValues: [], costAllocations: [],
});
assert.equal(excluded.totalProduction, 0);
assert.equal(excluded.totalCost, 0);

console.log('cost-engine.test.ts: ok');
