import type { RepairSalesInvoice } from '../../repair/types';
import type { ItemCardPrintModel } from '../../inventory/components/ItemCardPrint';
import type { StockTransferPrintData } from '../../inventory/components/StockTransferPrint';
import { PRINT_PREVIEW_SAMPLE_ROW } from '../../production/lib/printPreviewSample';

export { PRINT_PREVIEW_SAMPLE_ROW, PRINT_PREVIEW_SAMPLE_ROWS } from '../../production/lib/printPreviewSample';

export const PRINT_PREVIEW_TRANSFER: StockTransferPrintData = {
  transferNo: 'TRF-DEMO-001',
  createdAt: new Date().toISOString(),
  fromWarehouseName: 'مخزن خامات',
  toWarehouseName: 'مخزن تجميع',
  createdBy: 'أحمد محمود',
  statusLabel: 'للاعتماد',
  items: [
    {
      itemName: 'وحدة تحكم RX-606',
      itemCode: 'SKU-RX606',
      unitLabel: 'كرتونة',
      quantity: 2,
      quantityPieces: 48,
      unitsPerCarton: 24,
    },
    {
      itemName: 'ملحق تغليف',
      itemCode: 'PKG-01',
      unitLabel: 'قطعة',
      quantity: 0,
      quantityPieces: 12,
    },
  ],
};

export const PRINT_PREVIEW_REPAIR_INVOICE: RepairSalesInvoice = {
  tenantId: 'preview',
  branchId: 'preview-branch',
  invoiceNo: 'INV-DEMO-001',
  customerName: 'عميل تجريبي',
  customerPhone: '01000000000',
  notes: 'ملاحظة تجريبية للطباعة',
  grossAmount: 1500,
  discountAmount: 100,
  total: 1400,
  status: 'posted',
  createdAt: new Date().toISOString(),
  createdBy: 'preview-user',
  createdByName: 'موظف المبيعات',
  lines: [
    {
      partId: 'part-1',
      partName: 'قطعة غيار A',
      materialId: 'MAT-A01',
      quantity: 2,
      unitPrice: 500,
      lineTotal: 1000,
    },
    {
      partId: 'part-2',
      partName: 'قطعة غيار B',
      materialId: 'MAT-B02',
      quantity: 1,
      unitPrice: 500,
      lineTotal: 500,
    },
  ],
};

export const PRINT_PREVIEW_ITEM_CARD: ItemCardPrintModel = {
  itemType: 'finished_good',
  itemId: 'item-demo-1',
  itemCode: 'FG-RX606',
  itemName: 'راديو RX-606',
  unit: 'قطعة',
  category: 'إلكترونيات',
  warehouseName: 'مخزن المنتج النهائي',
  balances: [
    {
      warehouseId: 'wh-1',
      warehouseName: 'مخزن المنتج النهائي',
      quantity: 120,
      availableQty: 110,
      reservedQty: 10,
      minStock: 20,
    },
    {
      warehouseId: 'wh-2',
      warehouseName: 'مخزن التجميع',
      quantity: 40,
      availableQty: 40,
      reservedQty: 0,
      minStock: 5,
    },
  ],
  bomLines: [
    { itemCode: 'CMP-01', itemName: 'لوحة تحكم', unit: 'قطعة', qtyPerUnit: 1, stockQty: 80 },
    { itemCode: 'CMP-02', itemName: 'غلاف بلاستيك', unit: 'قطعة', qtyPerUnit: 1, stockQty: 200 },
  ],
  movements: [
    {
      id: 'tx-1',
      warehouseId: 'wh-1',
      itemId: 'item-demo-1',
      itemType: 'finished_good',
      itemName: 'راديو RX-606',
      itemCode: 'FG-RX606',
      movementType: 'IN',
      quantity: 50,
      createdAt: '2026-03-15T10:00:00.000Z',
      createdBy: 'preview',
      referenceNo: 'PR-000001',
      sourceId: 'src-1',
    },
  ],
};

export const PRINT_PREVIEW_BRANCH_NAME = 'فرع المعاينة';

export const PRINT_PREVIEW_ACCOUNTING = {
  title: 'ميزان مراجعة تجريبي',
  subtitle: 'يناير 2026',
  columns: [
    { key: 'account', label: 'الحساب', align: 'right' as const },
    { key: 'debit', label: 'مدين', align: 'center' as const, mono: true },
    { key: 'credit', label: 'دائن', align: 'center' as const, mono: true },
  ],
  rows: [
    { account: 'الصندوق', debit: '12,000', credit: '—' },
    { account: 'المبيعات', debit: '—', credit: '12,000' },
  ],
};

export const PRINT_PREVIEW_QUALITY = {
  title: 'ملخص جودة تجريبي',
  subtitle: 'فحص نهائي',
  workOrderNumber: 'WO-DEMO-01',
  summary: {
    inspectedUnits: 1000,
    passedUnits: 960,
    failedUnits: 30,
    reworkUnits: 10,
    defectRate: 3,
    firstPassYield: 96,
  },
  topDefects: [
    { reasonLabel: 'خدش سطحي', quantity: 18 },
    { reasonLabel: 'لون غير مطابق', quantity: 12 },
  ],
};

export const PRINT_PREVIEW_PAYSLIP = {
  month: '2026-03',
  departmentName: 'الإنتاج',
  record: {
    payrollMonthId: 'preview',
    employeeId: 'emp-1',
    employeeName: 'موظف تجريبي',
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    productionLineId: null,
    employmentType: 'monthly',
    baseSalary: 8000,
    overtimeHours: 4,
    overtimeAmount: 200,
    allowancesTotal: 500,
    allowancesBreakdown: [{ name: 'بدل انتقال', amount: 500 }],
    employeeAllowancesTotal: 0,
    employeeAllowancesBreakdown: [],
    workingDays: 26,
    presentDays: 24,
    absentDays: 1,
    lateDays: 1,
    absenceDeduction: 300,
    latePenalty: 50,
    loanInstallment: 0,
    otherPenalties: 0,
    transportDeduction: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    employeeDeductionsTotal: 0,
    employeeDeductionsBreakdown: [],
    grossSalary: 8700,
    totalDeductions: 350,
    netSalary: 8350,
    isLocked: true,
    calculationSnapshotVersion: 'v1',
    createdAt: null,
    updatedAt: null,
  },
} as const;

export const PRINT_PREVIEW_SUPPLIES_RECEIPT = {
  id: 'preview-sr',
  referenceNo: 'SR-DEMO-001',
  status: 'approved',
  warehouseId: 'wh-1',
  warehouseName: 'مخزن مستلزمات',
  createdAt: new Date().toISOString(),
  note: 'معاينة إذن استلام',
  groups: [],
  standaloneLines: [
    {
      itemCode: 'RM-01',
      itemName: 'خام تجريبي',
      unit: 'كجم',
      quantity: 25,
      locationCode: 'A-01',
    },
  ],
} as const;

export const PRINT_PREVIEW_REPAIR_PAYMENT_AUTH = {
  id: 'auth-demo',
  authorizationNo: 'PAY-AUTH-001',
  receiptNo: 'RJ-1001',
  jobId: 'job-1',
  status: 'approved',
  grossAmount: 1200,
  warrantyGrossAmount: 0,
  serviceGross: 400,
  partsGross: 800,
  discountAmount: 0,
  netAmount: 1200,
  paidAmount: 0,
  balanceDue: 1200,
  createdAt: new Date().toISOString(),
} as const;

export const PRINT_PREVIEW_REPAIR_SPARE_ISSUE = {
  id: 'rsi-demo',
  referenceNo: 'RSI-DEMO-001',
  status: 'issued',
  warehouseId: 'wh-spare',
  warehouseName: 'مخزن قطع غيار',
  branchName: 'فرع المعاينة',
  jobCode: 'RJ-1001',
  jobId: 'job-1',
  createdAt: new Date().toISOString(),
  lines: [
    {
      partId: 'p1',
      partName: 'قطعة تجريبية',
      quantity: 2,
      unit: 'قطعة',
      locationCode: 'S-01',
      allocations: [],
    },
  ],
} as const;

export const PRINT_PREVIEW_REPAIR_TREASURY = {
  month: '2026-03',
  summaries: [
    {
      branchId: 'b1',
      branchName: 'فرع المعاينة',
      sessionsCount: 4,
      totalOpening: 1000,
      totalIncome: 5000,
      totalExpense: 1200,
      netMovement: 3800,
      totalClosing: 4800,
    },
  ],
} as const;

export const PRINT_PREVIEW_ROUTING_EXECUTION = {
  execution: {
    id: 'route-exec-demo',
    quantity: 100,
    planVersion: 1,
    standardTotalTimeSeconds: 3600,
    actualTotalTimeSeconds: 3300,
    timeEfficiency: 1.09,
    costPerUnit: 12.5,
    totalCost: 1250,
    workerHourRateUsed: 40,
    finishedAt: new Date().toISOString(),
  },
  steps: [
    {
      orderIndex: 1,
      name: 'تجميع',
      standardDurationSeconds: 1800,
      actualDurationSeconds: 1600,
      standardWorkersCount: 2,
      actualWorkersCount: 2,
    },
  ],
  productName: 'منتج تجريبي',
  supervisorName: 'مشرف تجريبي',
} as const;
