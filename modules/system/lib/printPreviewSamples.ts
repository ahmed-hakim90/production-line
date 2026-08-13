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

export const PRINT_PREVIEW_SPARE_PARTS_COUNT = {
  branchName: 'مركز العاشر',
  warehouseName: 'مخزن مركز العاشر',
  rows: [
    {
      part: {
        id: 'sp-1',
        tenantId: 'preview',
        branchId: 'preview-branch',
        code: 'SP-2477',
        name: 'قاعدة ماكينة SK-391',
        category: 'قطع',
        unit: 'قطعة',
        minStock: 0,
        materialId: 'mat-1',
        createdAt: new Date().toISOString(),
      },
      quantity: 5,
    },
    {
      part: {
        id: 'sp-2',
        tenantId: 'preview',
        branchId: 'preview-branch',
        code: 'SP-2478',
        name: 'سلاح ماكينة SK-392',
        category: 'قطع',
        unit: 'قطعة',
        minStock: 0,
        materialId: 'mat-2',
        createdAt: new Date().toISOString(),
      },
      quantity: 4,
    },
    {
      part: {
        id: 'sp-3',
        tenantId: 'preview',
        branchId: 'preview-branch',
        code: 'SP-2479',
        name: 'بودي كامل ميكروويف SK-438',
        category: 'قطع',
        unit: 'قطعة',
        minStock: 0,
        materialId: 'mat-3',
        createdAt: new Date().toISOString(),
      },
      quantity: 3,
    },
  ],
  locationByItemId: new Map([
    ['mat-1', 'SP-7-A-1-1'],
    ['mat-2', 'SP-7-A-1-1'],
    ['mat-3', 'SP-7-A-1-1'],
  ]),
} as const;

export const PRINT_PREVIEW_WAREHOUSE_COUNT = {
  warehouseName: 'مخزن قطع الغيار المركزي',
  warehouseRoleLabel: 'قطع غيار (مركزي)',
  rows: [
    { id: 'w-1', code: 'SP-2477', name: 'قاعدة ماكينة SK-391', quantity: 42, location: 'SP-1-A-1-1' },
    { id: 'w-2', code: 'SP-2478', name: 'سلاح ماكينة SK-392', quantity: 18, location: 'SP-1-A-1-2' },
    { id: 'w-3', code: 'RM-110', name: 'بلاستيك ABS أسود', quantity: 250, location: 'RM-2-B-1-1' },
  ],
} as const;

export const PRINT_PREVIEW_WORK_ORDER = {
  workOrderNumber: 'WO-DEMO-1001',
  productName: 'راديو RX-606',
  lineName: 'خط التجميع 1',
  supervisorName: 'مشرف تجريبي',
  quantity: 500,
  producedQuantity: 320,
  maxWorkers: 8,
  targetDate: '2026-08-20',
  status: 'in_progress',
  statusLabel: 'قيد التنفيذ',
  estimatedCost: 12500,
  actualCost: 9800,
  notes: 'معاينة أمر شغل من محرك الطباعة',
  showCosts: true,
} as const;

export const PRINT_PREVIEW_WORKER_REPORT = {
  title: 'تقرير عامل إنتاج',
  subtitle: 'مارس 2026',
  columns: ['العامل', 'الكمية', 'الهالك', 'الساعات'],
  rows: [
    { العامل: 'عامل تجريبي', الكمية: 120, الهالك: 3, الساعات: 8 },
    { العامل: 'عامل ثانٍ', الكمية: 95, الهالك: 1, الساعات: 7.5 },
  ],
} as const;

export const PRINT_PREVIEW_CATALOG_PRODUCT = {
  productId: 'prod-demo',
  productName: 'راديو RX-606',
  productCode: 'FG-RX606',
  category: 'إلكترونيات',
  periodLabel: 'مارس 2026',
  kpis: [
    { label: 'إجمالي الكمية', value: 1200, unit: 'وحدة' },
    { label: 'الهالك', value: 24, unit: 'وحدة' },
  ],
  rows: [
    {
      date: '2026-03-10',
      line: 'خط 1',
      employee: 'مشرف أ',
      quantity: 400,
      waste: 8,
      workers: 6,
      hours: 8,
    },
    {
      date: '2026-03-11',
      line: 'خط 1',
      employee: 'مشرف أ',
      quantity: 380,
      waste: 6,
      workers: 6,
      hours: 8,
    },
  ],
} as const;

export const PRINT_PREVIEW_REPAIR_JOB = {
  tenantId: 'preview',
  receiptNo: 'RCP-DEMO-001',
  branchId: 'preview-branch',
  customerName: 'عميل تجريبي',
  customerPhone: '01000000000',
  customerAddress: 'القاهرة',
  deviceType: 'ميكروويف',
  deviceBrand: 'Sokany',
  deviceModel: 'SK-438',
  problemDescription: 'لا يسخن',
  status: 'received',
  warranty: 'none' as const,
  partsUsed: [] as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  jobProducts: [
    {
      itemId: 'jp-1',
      productId: 'p-1',
      productName: 'ميكروويف SK-438',
      quantity: 1,
      serialNo: 'SN-001',
      accessories: 'كابل + صينية',
      diagnosis: 'لا يسخن',
      inWarranty: false,
      finalCost: 350,
    },
  ],
} as const;

export const PRINT_PREVIEW_REPAIR_BRANCH = {
  id: 'preview-branch',
  name: 'فرع المعاينة',
  phone: '02-1234567',
  address: 'مدينة العبور',
} as const;

export const PRINT_PREVIEW_MISSING_COMPONENTS = {
  title: 'تقرير المكونات الناقصة',
  subtitle: 'خطة إنتاج تجريبية',
  warehouseName: 'مخزن المستلزمات',
  sections: [
    {
      productId: 'prod-1',
      productName: 'راديو RX-606',
      productCode: 'FG-RX606',
      kind: 'partial' as const,
      remaining: 100,
      maxAssemblable: 40,
      lines: [
        {
          materialName: 'لوحة تحكم',
          materialCode: 'CMP-01',
          requiredForTarget: 100,
          availableQty: 40,
          shortageQty: 60,
        },
      ],
    },
  ],
} as const;

export const PRINT_PREVIEW_SUPERVISOR_PERFORMANCE = {
  supervisorName: 'مشرف تجريبي',
  supervisorCode: 'SUP-01',
  departmentName: 'الإنتاج',
  jobTitle: 'مشرف خط',
  statusLabel: 'نشط',
  periodLabel: 'مارس 2026',
  performanceScore: 88,
  totalProduced: 4200,
  totalWaste: 65,
  wasteRatio: 1.5,
  reportsCount: 22,
  workDays: 20,
  todayProduced: 180,
  weekProduced: 900,
  linesCount: 2,
  avgWorkers: 6,
  requiredQty: 4500,
  achievedQty: 4200,
  performanceRatio: 93.3,
  costStatusLabel: 'ضمن الميزانية',
  costStatusHigh: false,
  lineUtilizationRatio: 86,
  lineUtilizationHigh: true,
  appreciationTitle: 'أداء جيد',
  appreciationBody: 'المحافظة على نسبة الهالك المنخفضة ومتابعة خطوط التجميع.',
  recommendations: ['رفع إنتاجية الخط 2 بنسبة 5%', 'مراجعة تزويد المكونات أسبوعيًا'],
  productRows: [
    {
      productName: 'راديو RX-606',
      reportsCount: 12,
      requiredQty: 2500,
      achievedQty: 2400,
      performanceRatio: 96,
    },
  ],
  lineRows: [
    {
      lineName: 'خط التجميع 1',
      reportsCount: 12,
      produced: 2400,
      waste: 30,
      wasteRatio: 1.2,
      avgWorkers: 6,
      totalHours: 96,
    },
  ],
} as const;

export const PRINT_PREVIEW_PRODUCT_BOM_COUNT = {
  cards: [
    {
      productId: 'prod-1',
      productCode: 'FG-RX606',
      productName: 'راديو RX-606',
      category: 'إلكترونيات',
      warehouseId: 'wh-1',
      warehouseName: 'مخزن المستلزمات',
      lines: [
        {
          itemCode: 'CMP-01',
          itemName: 'لوحة تحكم',
          unit: 'قطعة',
          qtyPerUnit: 1,
          locationCode: 'A1-1',
          stockQty: 80,
          availableQty: 70,
        },
        {
          itemCode: 'CMP-02',
          itemName: 'غلاف بلاستيك',
          unit: 'قطعة',
          qtyPerUnit: 1,
          locationCode: 'A1-2',
          stockQty: 200,
          availableQty: 200,
        },
      ],
    },
  ],
} as const;

export const PRINT_PREVIEW_PRODUCTION_ISSUE = {
  referenceNo: 'PI-DEMO-001',
  sourceType: 'work_order' as const,
  workOrderId: 'WO-DEMO-001',
  productId: 'prod-1',
  productName: 'راديو RX-606',
  productCode: 'FG-RX606',
  quantity: 100,
  sourceWarehouseId: 'wh-1',
  sourceWarehouseName: 'مخزن المستلزمات',
  status: 'issued' as const,
  createdBy: 'مشرف تجريبي',
  createdAt: new Date().toISOString(),
  note: 'معاينة إذن صرف إنتاج',
  lines: [
    {
      materialId: 'mat-1',
      itemType: 'material' as const,
      itemId: 'mat-1',
      itemName: 'لوحة تحكم',
      itemCode: 'CMP-01',
      unit: 'قطعة',
      qtyPerUnit: 1,
      baseRequiredQty: 100,
      wastePercent: 5,
      plannedWasteQty: 5,
      requiredQty: 105,
      availableQty: 200,
      shortageQty: 0,
      allocations: [
        {
          locationId: 'loc-1',
          locationCode: 'A1-1',
          rack: 'A',
          shelf: '1',
          quantity: 105,
        },
      ],
    },
  ],
};
