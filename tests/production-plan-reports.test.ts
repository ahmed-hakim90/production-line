import assert from 'node:assert/strict';
import { buildProductionLines } from '../utils/calculations.ts';
import {
  filterReportsForProductionPlan,
  planAcceptsDirectReportProduction,
} from '../modules/production/utils/productionPlanReports.ts';
import { ProductionLineStatus, type ProductionPlan, type ProductionReport } from '../types.ts';

const plan: ProductionPlan = {
  id: 'plan-1',
  productId: 'product-1',
  lineId: 'line-1',
  plannedQuantity: 100,
  producedQuantity: 0,
  startDate: '2026-06-01',
  plannedStartDate: '2026-06-01',
  plannedEndDate: '2026-06-10',
  estimatedDurationDays: 10,
  avgDailyTarget: 10,
  priority: 'medium',
  estimatedCost: 0,
  actualCost: 0,
  planType: 'finished_product',
  status: 'in_progress',
  createdBy: 'user-1',
};

const report = (overrides: Partial<ProductionReport>): ProductionReport => ({
  id: 'report-1',
  employeeId: 'employee-1',
  productId: 'product-1',
  lineId: 'line-1',
  date: '2026-06-02',
  quantityProduced: 10,
  workersCount: 1,
  workHours: 8,
  reportType: 'finished_product',
  ...overrides,
});

const enabledReport = report({ id: 'enabled', quantityProduced: 40 });
const legacyReport = report({ id: 'legacy', quantityProduced: 15 });
const independentWorkOrderReport = report({
  id: 'independent-work-order',
  quantityProduced: 25,
  workOrderId: 'wo-independent',
});
const explicitlyLinkedReport = report({
  id: 'linked-to-plan',
  quantityProduced: 30,
  workOrderId: 'wo-linked',
  productionPlanId: 'plan-1',
});
const packagingReport = report({
  id: 'packaging',
  quantityProduced: 100,
  reportType: 'packaging',
});

assert.equal(planAcceptsDirectReportProduction(plan), true);
assert.equal(planAcceptsDirectReportProduction({ ...plan, acceptsProductionFromReports: false }), false);

assert.deepEqual(
  filterReportsForProductionPlan(plan, [
    enabledReport,
    independentWorkOrderReport,
    legacyReport,
    explicitlyLinkedReport,
    packagingReport,
  ]).map((r) => r.id),
  ['enabled', 'legacy', 'linked-to-plan'],
);

assert.deepEqual(
  filterReportsForProductionPlan({ ...plan, acceptsProductionFromReports: false }, [
    enabledReport,
    explicitlyLinkedReport,
  ]),
  [],
);

const lines = buildProductionLines(
  [{
    id: 'line-1',
    name: 'Line 1',
    dailyWorkingHours: 8,
    maxWorkers: 5,
    status: ProductionLineStatus.ACTIVE,
  }],
  [{
    id: 'product-1',
    name: 'Product 1',
    model: 'Model',
    code: 'P-1',
    openingBalance: 0,
  }],
  [{ id: 'employee-1', name: 'Supervisor', departmentId: 'd', jobPositionId: 'j', level: 2, employmentType: 'full_time', baseSalary: 0, hourlyRate: 0, hasSystemAccess: false, isActive: true }],
  [independentWorkOrderReport],
  [],
  [],
  [plan],
  { 'line-1_product-1': [enabledReport] },
  [],
);

assert.equal(lines[0].achievement, 40);
assert.equal(lines[0].efficiency, 40);

console.log('production-plan-reports.test.ts: ok');
