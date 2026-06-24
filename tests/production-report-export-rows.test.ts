import assert from 'node:assert/strict';
import { buildProductionReportExportRows } from '../modules/production/utils/productionReportExportRows.ts';
import type { ProductionReport } from '../types.ts';

const reports = [
  {
    id: 'report-1',
    reportCode: 'PR-001',
    date: '2026-06-24',
    lineId: 'line-1',
    productId: 'product-1',
    employeeId: 'sup-1',
    quantityProduced: 120,
    workersCount: 2,
    workersProductionCount: 1,
    workersPackagingCount: 1,
    workersQualityCount: 0,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
    workHours: 8,
    workerOutputs: [
      {
        workerId: 'worker-1',
        workerName: 'عامل 1',
        productId: 'product-1',
        productName: 'منتج 1',
        lineId: 'line-1',
        lineName: 'خط 1',
        dailyTargetQty: 100,
        outputQty: 120,
        achievementPercent: 120,
        isPresent: true,
      },
      {
        workerId: 'worker-2',
        workerName: 'عامل 2',
        productId: 'product-1',
        productName: 'منتج 1',
        lineId: 'line-1',
        lineName: 'خط 1',
        dailyTargetQty: 100,
        outputQty: 0,
        achievementPercent: 0,
        isPresent: false,
      },
    ],
    componentScrapItems: [
      { materialId: 'mat-1', materialName: 'Scrap', quantity: 5 },
    ],
    workOrderId: 'wo-1',
  },
] satisfies ProductionReport[];

const rows = buildProductionReportExportRows(
  reports,
  {
    getLineName: (id) => ({ 'line-1': 'خط 1' }[id] || id),
    getProductName: (id) => ({ 'product-1': 'منتج 1' }[id] || id),
    getEmployeeName: (id) => ({ 'sup-1': 'مشرف 1' }[id] || id),
    getWorkOrder: (id) => ({ 'wo-1': { workOrderNumber: 'WO-001', quantity: 200, maxWorkers: 4 } }[id] as any),
  },
  new Map([['report-1', 12.345]]),
);

assert.equal(rows.length, 1);
assert.deepEqual(
  {
    code: rows[0]['كود التقرير'],
    line: rows[0]['خط الإنتاج'],
    product: rows[0]['المنتج'],
    supervisor: rows[0]['الموظف'],
    produced: rows[0]['الكمية المنتجة'],
    waste: rows[0]['الهالك'],
    present: rows[0]['أيام حضور'],
    absent: rows[0]['أيام غياب'],
    unitCost: rows[0]['تكلفة الوحدة'],
    workOrder: rows[0]['أمر الشغل'],
  },
  {
    code: 'PR-001',
    line: 'خط 1',
    product: 'منتج 1',
    supervisor: 'مشرف 1',
    produced: 120,
    waste: 5,
    present: 1,
    absent: 1,
    unitCost: 12.35,
    workOrder: 'WO-001',
  },
);

console.log('production-report-export-rows.test.ts: ok');
