import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FirestoreEmployee, ProductionReport, WorkOrder } from '../types.ts';
import {
  filterActiveWorkOrdersForReporter,
  firstTwoSupervisorNames,
  indexTodayReportStateByWorkOrder,
  reportWasEnteredByActor,
  sortWorkOrdersByTodayReportState,
} from '../modules/dashboards/lib/supervisorReportingAccess.ts';
import {
  buildProductionReportFastUniqueKey,
  validateProductionReportAssignment,
} from '../functions/src/productionReportFastCore.ts';

const employee = (id: string, name: string): FirestoreEmployee => ({
  id,
  name,
  departmentId: 'production',
  jobPositionId: 'supervisor',
  level: 2,
  employmentType: 'full_time',
  baseSalary: 0,
  hourlyRate: 0,
  hasSystemAccess: true,
  isActive: true,
});

const workOrder = (id: string, supervisorId: string, status: WorkOrder['status'] = 'in_progress'): WorkOrder => ({
  id,
  workOrderNumber: id.toUpperCase(),
  productId: 'product-1',
  lineId: 'line-1',
  supervisorId,
  quantity: 100,
  producedQuantity: 0,
  maxWorkers: 10,
  targetDate: '2026-08-31',
  estimatedCost: 0,
  actualCost: 0,
  status,
  createdBy: 'admin',
  workOrderType: 'finished_product',
});

const hall = employee('hall-1', 'مشرف الصالة');
const supervisorA = employee('sup-1', 'أحمد محمد علي الطويل');
const supervisorB = employee('sup-2', 'محمود إبراهيم حسن');
const orders = [
  workOrder('wo-1', supervisorA.id!),
  workOrder('wo-2', supervisorB.id!, 'pending'),
  workOrder('wo-3', supervisorB.id!, 'completed'),
];

assert.deepEqual(
  filterActiveWorkOrdersForReporter(orders, hall, true).map((row) => row.id),
  ['wo-1', 'wo-2'],
  'Hall Supervisor must see every active work order.',
);
assert.deepEqual(
  filterActiveWorkOrdersForReporter(orders, supervisorA, false).map((row) => row.id),
  ['wo-1'],
  'Line supervisor must remain scoped to assigned work orders.',
);

const delegatedReport: ProductionReport = {
  id: 'report-1',
  employeeId: supervisorA.id!,
  createdByUid: 'hall-uid',
  entryMode: 'hall_supervisor_delegate',
  productId: 'product-1',
  lineId: 'line-1',
  workOrderId: 'wo-1',
  date: '2026-08-11',
  quantityProduced: 25,
  workersCount: 6,
  workHours: 8,
};
assert.equal(delegatedReport.employeeId, supervisorA.id, 'Report ownership stays on the work-order supervisor.');
assert.equal(reportWasEnteredByActor(delegatedReport, 'hall-uid', hall.id, true), true);
assert.equal(reportWasEnteredByActor(delegatedReport, 'another-uid', supervisorA.id, false), true);
assert.equal(reportWasEnteredByActor({ ...delegatedReport, createdByUid: undefined }, 'hall-uid', hall.id, true), false);
assert.equal(firstTwoSupervisorNames('أحمد محمد علي الطويل جداً'), 'أحمد محمد');

const reportStateByWorkOrder = indexTodayReportStateByWorkOrder([
  { ...delegatedReport, id: 'local-1', clientSaveState: 'saving' },
  { ...delegatedReport, id: 'report-confirmed' },
  { ...delegatedReport, id: 'local-2', workOrderId: 'wo-2', clientSaveState: 'failed' },
]);
assert.deepEqual(reportStateByWorkOrder.get('wo-1'), { state: 'saved', reportId: 'report-confirmed' });
assert.deepEqual(reportStateByWorkOrder.get('wo-2'), { state: 'failed', reportId: 'local-2' });
assert.deepEqual(
  sortWorkOrdersByTodayReportState(orders.slice(0, 2), reportStateByWorkOrder).map((row) => row.id),
  ['wo-2', 'wo-1'],
  'orders without a confirmed daily report stay above completed report orders',
);

const validAssignment = {
  actorTenantId: 'tenant-1',
  actorEmployeeId: hall.id!,
  actorEmployeeLevel: 2,
  canCreateForAnySupervisor: true,
  targetEmployeeId: supervisorA.id!,
  targetEmployeeExists: true,
  targetEmployeeTenantId: 'tenant-1',
  targetEmployeeActive: true,
  reportLineId: 'line-1',
  reportProductId: 'product-1',
  workOrderId: 'wo-1',
  workOrder: {
    tenantId: 'tenant-1',
    supervisorId: supervisorA.id!,
    lineId: 'line-1',
    productId: 'product-1',
    status: 'in_progress',
  },
};
assert.equal(validateProductionReportAssignment(validAssignment), null);
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  actorEmployeeLevel: 1,
}), null, 'hall delegation is permission-based and must not depend on employee level');
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  targetEmployeeId: supervisorB.id!,
})?.message, 'المشرف أو المنتج لا يطابق أمر الشغل.');
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  reportLineId: 'line-moved',
}), null, 'line move must not block explicit WO assignment when product+supervisor match');
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  canCreateForAnySupervisor: false,
})?.code, 'permission-denied');
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  workOrder: { ...validAssignment.workOrder, tenantId: 'tenant-2' },
})?.message, 'أمر الشغل غير موجود أو غير نشط.');
assert.equal(validateProductionReportAssignment({
  ...validAssignment,
  workOrder: { ...validAssignment.workOrder, supervisorId: '' },
})?.message, 'لا يمكن إنشاء تقرير لأمر شغل بلا مشرف.');

const duplicateBasis = {
  date: '2026-08-11',
  lineId: 'line-1',
  employeeId: supervisorA.id,
  productId: 'product-1',
  reportType: 'finished_product',
};
const wo1Key = buildProductionReportFastUniqueKey({ ...duplicateBasis, workOrderId: 'wo-1' });
const wo2Key = buildProductionReportFastUniqueKey({ ...duplicateBasis, workOrderId: 'wo-2' });
assert.notEqual(wo1Key, wo2Key, 'Similar reports for different work orders must be allowed.');
assert.equal(wo1Key, buildProductionReportFastUniqueKey({ ...duplicateBasis, workOrderId: 'wo-1' }));

const reportServiceSource = readFileSync(new URL('../modules/production/services/reportService.ts', import.meta.url), 'utf8');
assert.match(reportServiceSource, /parts\.push\(`wo_\$\{normalizeKeyPart\(workOrderId\)\}`\)/);
assert.match(reportServiceSource, /workOrderId: String\(data\.workOrderId \|\| ''\)\.trim\(\)/);

const fastFunctionSource = readFileSync(new URL('../functions/src/productionReportFast.ts', import.meta.url), 'utf8');
assert.match(fastFunctionSource, /reports\.createForAnySupervisor/);
assert.match(fastFunctionSource, /validateProductionReportAssignment/);
assert.match(fastFunctionSource, /processingState: 'pending'/);
assert.match(fastFunctionSource, /createdByUid: actor\.uid/);

const backgroundSource = readFileSync(new URL('../functions/src/productionReportBackground.ts', import.meta.url), 'utf8');
assert.match(backgroundSource, /processingState: 'processing'/);
assert.match(backgroundSource, /processingState: 'completed'/);
assert.match(backgroundSource, /processingState: 'failed'/);
assert.match(backgroundSource, /applyProductionReportInventoryInternal/);

const quickDialogSource = readFileSync(new URL('../modules/dashboards/components/SupervisorWorkOrderQuickReportDialog.tsx', import.meta.url), 'utf8');
assert.match(quickDialogSource, /queueReportCreate\(payload/);
assert.match(quickDialogSource, /تمت إضافة التقرير للجدول وجارٍ تأكيد حفظه/);
assert.doesNotMatch(quickDialogSource, /await createReport\(payload/);

const dailyPanelSource = readFileSync(new URL('../modules/dashboards/components/SupervisorDailyReportsPanel.tsx', import.meta.url), 'utf8');
assert.match(dailyPanelSource, /clientSaveState === 'failed'/);
assert.match(dailyPanelSource, /retryQueuedReportCreate/);
assert.match(dailyPanelSource, /confirmedRows/);

console.log('hall-supervisor-reporting.test.ts: ok');
