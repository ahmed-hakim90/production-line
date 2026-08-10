import assert from 'node:assert/strict';
import { buildProductionLines, calculateSmartStatus, getSmartStatusDetail } from '../utils/calculations.ts';
import {
  deriveProductionPlanAutoStatus,
  filterReportsForProductionPlan,
  planAcceptsDirectReportProduction,
  resolveProductionPlanQuantityStartDate,
} from '../modules/production/utils/productionPlanReports.ts';
import { ProductionLineStatus, type ProductionPlan, type ProductionReport } from '../types.ts';

const plan: ProductionPlan = {
  id: 'plan-1',
  productId: 'product-1',
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
  createdAt: '2026-06-01T08:00:00.000Z',
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
const otherLineReport = report({ id: 'other-line', lineId: 'line-2', quantityProduced: 12 });
const beforeCreateReport = report({
  id: 'before-create',
  date: '2026-05-31',
  quantityProduced: 99,
});
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
assert.equal(resolveProductionPlanQuantityStartDate(plan), '2026-06-01');

assert.deepEqual(
  filterReportsForProductionPlan(plan, [
    enabledReport,
    otherLineReport,
    beforeCreateReport,
    independentWorkOrderReport,
    explicitlyLinkedReport,
    packagingReport,
  ]).map((r) => r.id),
  ['enabled', 'other-line', 'linked-to-plan'],
);

assert.deepEqual(
  filterReportsForProductionPlan({ ...plan, acceptsProductionFromReports: false }, [
    enabledReport,
    explicitlyLinkedReport,
  ]),
  [],
);

assert.equal(
  deriveProductionPlanAutoStatus(plan, 0, null, '2026-06-10'),
  'planned',
);
assert.equal(
  deriveProductionPlanAutoStatus(plan, 40, '2026-06-10', '2026-06-10'),
  'in_progress',
);
assert.equal(
  deriveProductionPlanAutoStatus(plan, 40, '2026-06-08', '2026-06-10'),
  'paused',
);
assert.equal(
  deriveProductionPlanAutoStatus(plan, 100, '2026-06-01', '2026-06-10'),
  'completed',
);
assert.equal(
  deriveProductionPlanAutoStatus({ ...plan, status: 'cancelled' }, 40, '2026-06-10', '2026-06-10'),
  'cancelled',
);

assert.equal(calculateSmartStatus(50, 50, 'in_progress'), 'working');
assert.equal(calculateSmartStatus(0, 0, 'planned'), 'not_working');
assert.equal(calculateSmartStatus(40, 80, 'paused'), 'stopped');
assert.equal(calculateSmartStatus(100, 100, 'completed'), 'completed');
assert.equal(getSmartStatusDetail('paused', 5), 'مرّ يومان بدون إنتاج');
assert.equal(getSmartStatusDetail('in_progress', 12), '12 يوم متبقي');
assert.equal(getSmartStatusDetail('planned', 0), 'بانتظار أول إنتاج');

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
  [{ ...plan, lineId: 'line-1' }],
  { 'line-1_product-1': [enabledReport] },
  [],
);

assert.equal(lines[0].achievement, 40);
assert.equal(lines[0].efficiency, 40);

console.log('production-plan-reports.test.ts: ok');
