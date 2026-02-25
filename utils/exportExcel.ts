/**
 * Excel Export Utility
 * Uses SheetJS (xlsx) + file-saver to generate .xlsx files.
 * Arabic RTL column headers.
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ProductionReport, Product, FirestoreProduct, FirestoreEmployee, WorkOrder } from '../types';
import type { ProductCostBreakdown } from './productCostBreakdown';

interface ReportRow {
  التاريخ: string;
  'خط الإنتاج': string;
  المنتج: string;
  الموظف: string;
  'الكمية المنتجة': number;
  الهالك: number;
  'نسبة الهالك %': string;
  'عدد العمال': number;
  'ساعات العمل': number;
  'تكلفة الوحدة'?: number | string;
  'أمر الشغل'?: string;
  'كمية أمر الشغل'?: number | string;
  'عمالة أمر الشغل'?: number | string;
}

interface LookupFns {
  getLineName: (id: string) => string;
  getProductName: (id: string) => string;
  getEmployeeName: (id: string) => string;
  getWorkOrder?: (id: string) => WorkOrder | undefined;
}

/**
 * Transform raw reports into Arabic-labeled rows.
 */
const mapReportsToRows = (
  reports: ProductionReport[],
  lookups: LookupFns,
  costMap?: Map<string, number>
): ReportRow[] => {
  const hasWO = lookups.getWorkOrder && reports.some((r) => r.workOrderId);
  const hasCosts = costMap && costMap.size > 0;
  return reports.map((r) => {
    const total = (r.quantityProduced || 0) + (r.quantityWaste || 0);
    const wasteRatio =
      total > 0
        ? (((r.quantityWaste || 0) / total) * 100).toFixed(1)
        : '0';
    const row: ReportRow = {
      التاريخ: r.date,
      'خط الإنتاج': lookups.getLineName(r.lineId),
      المنتج: lookups.getProductName(r.productId),
      الموظف: lookups.getEmployeeName(r.employeeId),
      'الكمية المنتجة': r.quantityProduced || 0,
      الهالك: r.quantityWaste || 0,
      'نسبة الهالك %': `${wasteRatio}%`,
      'عدد العمال': r.workersCount || 0,
      'ساعات العمل': r.workHours || 0,
    };
    if (hasCosts) {
      const cost = r.id ? costMap.get(r.id) : undefined;
      row['تكلفة الوحدة'] = cost != null && cost > 0 ? Number(cost.toFixed(2)) : '—';
    }
    if (hasWO) {
      const wo = r.workOrderId && lookups.getWorkOrder ? lookups.getWorkOrder(r.workOrderId) : undefined;
      row['أمر الشغل'] = wo ? wo.workOrderNumber : '—';
      row['كمية أمر الشغل'] = wo ? wo.quantity : '—';
      row['عمالة أمر الشغل'] = wo ? wo.maxWorkers : '—';
    }
    return row;
  });
};

/**
 * Add a summary row at the bottom of the sheet.
 */
const appendSummary = (rows: ReportRow[]): ReportRow[] => {
  if (rows.length === 0) return rows;
  const totalProduced = rows.reduce((s, r) => s + r['الكمية المنتجة'], 0);
  const totalWaste = rows.reduce((s, r) => s + r['الهالك'], 0);
  const totalWorkers = rows.reduce((s, r) => s + r['عدد العمال'], 0);
  const totalHours = rows.reduce((s, r) => s + r['ساعات العمل'], 0);
  const total = totalProduced + totalWaste;
  const wasteRatio = total > 0 ? ((totalWaste / total) * 100).toFixed(1) : '0';

  const summaryRow: ReportRow = {
    التاريخ: 'الإجمالي',
    'خط الإنتاج': '',
    المنتج: '',
    الموظف: `${rows.length} تقرير`,
    'الكمية المنتجة': totalProduced,
    الهالك: totalWaste,
    'نسبة الهالك %': `${wasteRatio}%`,
    'عدد العمال': totalWorkers,
    'ساعات العمل': totalHours,
  };
  if (rows[0]?.['تكلفة الوحدة'] !== undefined) {
    const costValues = rows
      .map((r) => r['تكلفة الوحدة'])
      .filter((v): v is number => typeof v === 'number' && v > 0);
    summaryRow['تكلفة الوحدة'] = costValues.length > 0
      ? Number((costValues.reduce((s, v) => s + v, 0) / costValues.length).toFixed(2))
      : '—';
  }
  if (rows[0]?.['أمر الشغل'] !== undefined) {
    summaryRow['أمر الشغل'] = '';
    summaryRow['كمية أمر الشغل'] = '';
    summaryRow['عمالة أمر الشغل'] = '';
  }
  rows.push(summaryRow);
  return rows;
};

/**
 * Generate and download an Excel file.
 */
const downloadExcel = (rows: Record<string, any>[], sheetName: string, fileName: string) => {
  const safeSheetName = (() => {
    const cleaned = (sheetName || 'Sheet1').replace(/[\[\]\:\*\?\/\\]/g, ' ').trim();
    const compact = cleaned.replace(/\s+/g, ' ');
    return (compact || 'Sheet1').slice(0, 31);
  })();
  const safeFileName = (() => {
    const cleaned = (fileName || 'export')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'export';
  })();

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-fit column widths
  const colWidths = Object.keys(rows[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => String(r[key] ?? '').length)
    );
    return { wch: Math.min(maxLen + 4, 30) };
  });
  ws['!cols'] = colWidths;

  // RTL sheet view
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${safeFileName}.xlsx`);
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Export employee reports to Excel.
 */
export const exportSupervisorReports = (
  employeeName: string,
  reports: ProductionReport[],
  lookups: LookupFns,
  costMap?: Map<string, number>
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups, costMap));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, `تقارير ${employeeName}`, `تقارير-${employeeName}-${date}`);
};

/**
 * Export product reports to Excel.
 */
export const exportProductReports = (
  productName: string,
  reports: ProductionReport[],
  lookups: LookupFns,
  costMap?: Map<string, number>
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups, costMap));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, `تقارير ${productName}`, `تقارير-${productName}-${date}`);
};

/**
 * Export general reports (date range) to Excel.
 */
export const exportReportsByDateRange = (
  reports: ProductionReport[],
  startDate: string,
  endDate: string,
  lookups: LookupFns,
  costMap?: Map<string, number>
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups, costMap));
  const label = startDate === endDate ? startDate : `${startDate}_${endDate}`;
  downloadExcel(rows, 'تقارير الإنتاج', `تقارير-الإنتاج-${label}`);
};

/**
 * Generic HR data export — accepts any array of Arabic-labeled rows.
 */
export const exportHRData = (
  rows: Record<string, any>[],
  sheetName: string,
  fileName: string,
) => {
  if (rows.length === 0) return;
  downloadExcel(rows, sheetName, fileName);
};

/**
 * Export product summary table (from admin dashboard).
 */
export const exportProductSummary = (
  data: { name: string; code: string; qty: number; avgCost: number }[],
  includeCosts: boolean
) => {
  if (data.length === 0) return;
  const rows = data.map((p, i) => {
    const base: Record<string, any> = {
      '#': i + 1,
      'المنتج': p.name,
      'الكود': p.code,
      'الكمية المنتجة': p.qty,
    };
    if (includeCosts) {
      base['متوسط تكلفة الوحدة'] = p.avgCost > 0 ? Number(p.avgCost.toFixed(2)) : 0;
    }
    return base;
  });
  const totalQty = data.reduce((s, p) => s + p.qty, 0);
  const summary: Record<string, any> = {
    '#': '',
    'المنتج': 'الإجمالي',
    'الكود': `${data.length} منتج`,
    'الكمية المنتجة': totalQty,
  };
  if (includeCosts) {
    summary['متوسط تكلفة الوحدة'] = totalQty > 0
      ? Number((data.reduce((s, p) => s + p.avgCost * p.qty, 0) / totalQty).toFixed(2))
      : 0;
  }
  rows.push(summary);
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'ملخص المنتجات', `ملخص-المنتجات-${date}`);
};

// ─── Products Export ─────────────────────────────────────────────────────────

interface ProductExportData {
  product: Product;
  raw: FirestoreProduct;
  costBreakdown?: ProductCostBreakdown | null;
  rawMaterialsDetails?: string;
}

const fmtCost = (v: number) => v > 0 ? Number(v.toFixed(2)) : 0;

export interface ProductExportOptions {
  stock: boolean;
  productCosts: boolean;
  manufacturingCosts: boolean;
  sellingPrice: boolean;
  profitMargin: boolean;
  chinesePriceCny: boolean;
}

export const PRODUCT_EXPORT_DEFAULTS: ProductExportOptions = {
  stock: true,
  productCosts: true,
  manufacturingCosts: true,
  sellingPrice: true,
  profitMargin: true,
  chinesePriceCny: false,
};

export const exportAllProducts = (
  data: ProductExportData[],
  includeCosts: boolean,
  options: ProductExportOptions = PRODUCT_EXPORT_DEFAULTS,
  cnyToEgpRate: number = 0,
  columnOrder?: string[]
) => {
  const rows = data.map((d) => {
    const base: Record<string, any> = {
      'الكود': d.raw.code,
      'اسم المنتج': d.raw.name,
      'الفئة': d.raw.model || '—',
    };
    if (options.stock) {
      base['الرصيد الافتتاحي'] = d.product.openingStock;
      base['إجمالي الإنتاج'] = d.product.totalProduction;
      base['إجمالي الهالك'] = d.product.wasteUnits;
      base['الرصيد الحالي'] = d.product.stockLevel;
      base['حالة المخزون'] = d.product.stockStatus === 'available' ? 'متوفر' : d.product.stockStatus === 'low' ? 'منخفض' : 'نفذ';
    }
    if (includeCosts && d.costBreakdown && options.productCosts) {
      base['تكلفة الوحدة الصينية'] = fmtCost(d.costBreakdown.chineseUnitCost);
      if (options.chinesePriceCny && cnyToEgpRate > 0) {
        base['السعر باليوان'] = fmtCost(d.costBreakdown.chineseUnitCost / cnyToEgpRate);
      }
      base['تكلفة المواد الخام'] = fmtCost(d.costBreakdown.rawMaterialCost);
      base['تفاصيل المواد الخام'] = d.rawMaterialsDetails || '—';
      base['تكلفة العلبة الداخلية'] = fmtCost(d.costBreakdown.innerBoxCost);
      base['تكلفة الكرتونة'] = fmtCost(d.costBreakdown.outerCartonCost);
      base['وحدات/كرتونة'] = d.costBreakdown.unitsPerCarton;
      base['نصيب الكرتونة'] = fmtCost(d.costBreakdown.cartonShare);
    }
    if (includeCosts && d.costBreakdown && options.manufacturingCosts) {
      base['نصيب المصاريف الصناعية (م. وغ.م)'] = fmtCost(d.costBreakdown.productionOverheadShare);
    }
    if (includeCosts && d.costBreakdown && (options.productCosts || options.manufacturingCosts)) {
      base['إجمالي التكلفة المحسوبة'] = fmtCost(d.costBreakdown.totalCalculatedCost);
    }
    if (options.sellingPrice) {
      base['سعر البيع'] = d.raw.sellingPrice ? fmtCost(d.raw.sellingPrice) : 0;
    }
    if (options.profitMargin && includeCosts && d.costBreakdown) {
      const sp = d.raw.sellingPrice ?? 0;
      const tc = d.costBreakdown.totalCalculatedCost;
      const profit = sp - tc;
      const margin = sp > 0 ? (profit / sp) * 100 : 0;
      base['هامش الربح (ج.م)'] = sp > 0 ? fmtCost(profit) : '—';
      base['نسبة هامش الربح %'] = sp > 0 ? `${margin.toFixed(1)}%` : '—';
    }
    if (!columnOrder || columnOrder.length === 0) return base;
    return columnOrder.reduce<Record<string, any>>((acc, key) => {
      if (key in base) acc[key] = base[key];
      return acc;
    }, {});
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'المنتجات', `المنتجات-${date}`);
};

// ─── Single Product Export ────────────────────────────────────────────────────

function buildSheet(rows: Record<string, any>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = Object.keys(rows[0] || {}).map((key) => {
    const maxLen = Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length));
    return { wch: Math.min(maxLen + 4, 35) };
  });
  ws['!cols'] = colWidths;
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
  return ws;
}

export interface SingleProductExportData {
  raw: FirestoreProduct;
  stockLevel: number;
  totalProduction: number;
  totalWaste: number;
  wasteRatio: string;
  avgDailyProduction: number;
  costBreakdown: ProductCostBreakdown | null;
  monthlyAvgCost: number | null;
  previousMonthAvgCost: number | null;
  materials: { name: string; qty: number; unitCost: number; total: number }[];
  historicalAvgCost: number | null;
  costByLine: { lineName: string; costPerUnit: number; totalCost: number; qty: number }[];
}

export const exportSingleProduct = (data: SingleProductExportData, includeCosts: boolean) => {
  const wb = XLSX.utils.book_new();
  const pName = data.raw.name;

  // Sheet 1: Product Info
  const infoRows: Record<string, any>[] = [{
    'الكود': data.raw.code,
    'اسم المنتج': data.raw.name,
    'الفئة': data.raw.model || '—',
    'الرصيد الافتتاحي': data.raw.openingBalance,
    'إجمالي الإنتاج': data.totalProduction,
    'إجمالي الهالك': data.totalWaste,
    'نسبة الهالك': data.wasteRatio,
    'الرصيد الحالي': data.stockLevel,
    'متوسط الإنتاج اليومي': data.avgDailyProduction,
    ...(data.raw.sellingPrice ? { 'سعر البيع': fmtCost(data.raw.sellingPrice) } : {}),
  }];
  XLSX.utils.book_append_sheet(wb, buildSheet(infoRows), 'بيانات المنتج');

  // Sheet 2: Cost Breakdown (if allowed)
  if (includeCosts && data.costBreakdown) {
    const cb = data.costBreakdown;
    const sp = data.raw.sellingPrice ?? 0;
    const profit = sp > 0 ? sp - cb.totalCalculatedCost : 0;
    const margin = sp > 0 ? (profit / sp) * 100 : 0;
    const costRows: Record<string, any>[] = [
      { 'عنصر التكلفة': 'تكلفة الوحدة الصينية', 'النوع': 'تكاليف المنتج', 'القيمة (ج.م)': fmtCost(cb.chineseUnitCost) },
      { 'عنصر التكلفة': 'تكلفة المواد الخام', 'النوع': 'تكاليف المنتج', 'القيمة (ج.م)': fmtCost(cb.rawMaterialCost) },
      { 'عنصر التكلفة': 'تكلفة العلبة الداخلية', 'النوع': 'تكاليف المنتج', 'القيمة (ج.م)': fmtCost(cb.innerBoxCost) },
      { 'عنصر التكلفة': 'تكلفة الكرتونة الخارجية', 'النوع': 'تكاليف المنتج', 'القيمة (ج.م)': fmtCost(cb.outerCartonCost) },
      { 'عنصر التكلفة': 'وحدات في الكرتونة', 'النوع': '—', 'القيمة (ج.م)': cb.unitsPerCarton },
      { 'عنصر التكلفة': 'نصيب الكرتونة', 'النوع': 'تكاليف المنتج', 'القيمة (ج.م)': fmtCost(cb.cartonShare) },
      { 'عنصر التكلفة': 'نصيب المصاريف الصناعية (م. وغ.م)', 'النوع': 'تكاليف صناعية', 'القيمة (ج.م)': fmtCost(cb.productionOverheadShare) },
      { 'عنصر التكلفة': '═ إجمالي التكلفة المحسوبة', 'النوع': '', 'القيمة (ج.م)': fmtCost(cb.totalCalculatedCost) },
    ];
    if (sp > 0) {
      costRows.push(
        { 'عنصر التكلفة': 'سعر البيع', 'النوع': '', 'القيمة (ج.م)': fmtCost(sp) },
        { 'عنصر التكلفة': 'هامش الربح', 'النوع': `${margin.toFixed(1)}%`, 'القيمة (ج.م)': fmtCost(profit) },
      );
    }
    if (data.monthlyAvgCost != null && data.monthlyAvgCost > 0) {
      costRows.push({ 'عنصر التكلفة': 'متوسط تكلفة الإنتاج الشهري', 'النوع': 'تقارير الإنتاج', 'القيمة (ج.م)': fmtCost(data.monthlyAvgCost) });
    }
    if (data.historicalAvgCost != null && data.historicalAvgCost > 0) {
      costRows.push({ 'عنصر التكلفة': 'متوسط التكلفة التاريخي', 'النوع': 'تقارير الإنتاج', 'القيمة (ج.م)': fmtCost(data.historicalAvgCost) });
    }
    XLSX.utils.book_append_sheet(wb, buildSheet(costRows), 'تفصيل التكاليف');
  }

  // Sheet 3: Materials (if any)
  if (includeCosts && data.materials.length > 0) {
    const matRows = data.materials.map((m) => ({
      'المادة': m.name,
      'الكمية المستخدمة': m.qty,
      'تكلفة الوحدة (ج.م)': fmtCost(m.unitCost),
      'الإجمالي (ج.م)': fmtCost(m.total),
    }));
    const totalMat = data.materials.reduce((s, m) => s + m.total, 0);
    matRows.push({ 'المادة': 'الإجمالي', 'الكمية المستخدمة': 0 as any, 'تكلفة الوحدة (ج.م)': '' as any, 'الإجمالي (ج.م)': fmtCost(totalMat) });
    XLSX.utils.book_append_sheet(wb, buildSheet(matRows), 'المواد الخام');
  }

  // Sheet 4: Cost by Line (if any)
  if (includeCosts && data.costByLine.length > 0) {
    const lineRows = data.costByLine.map((l) => ({
      'خط الإنتاج': l.lineName,
      'الكمية المنتجة': l.qty,
      'تكلفة الوحدة (ج.م)': fmtCost(l.costPerUnit),
      'إجمالي التكلفة (ج.م)': fmtCost(l.totalCost),
    }));
    XLSX.utils.book_append_sheet(wb, buildSheet(lineRows), 'التكلفة حسب الخط');
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const date = new Date().toISOString().slice(0, 10);
  saveAs(blob, `تفاصيل-${pName}-${date}.xlsx`);
};

// ─── Employees Export ────────────────────────────────────────────────────────

const EMPLOYMENT_TYPE_AR: Record<string, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'عقد',
  daily: 'يومي',
};

export const exportAllEmployees = (
  employees: FirestoreEmployee[],
  getDeptName: (id: string) => string,
  getJobTitle: (id: string) => string,
  getShiftName: (id: string) => string
) => {
  const rows = employees.map((e) => ({
    'الكود': e.code || '—',
    'الاسم': e.name,
    'القسم': getDeptName(e.departmentId),
    'الوظيفة': getJobTitle(e.jobPositionId),
    'نوع التوظيف': EMPLOYMENT_TYPE_AR[e.employmentType] || e.employmentType,
    'المستوى': e.level,
    'الراتب الأساسي': e.baseSalary,
    'سعر الساعة': e.hourlyRate,
    'الوردية': e.shiftId ? getShiftName(e.shiftId) : '—',
    'البريد الإلكتروني': e.email || '—',
    'الحالة': e.isActive ? 'نشط' : 'غير نشط',
    'صلاحية النظام': e.hasSystemAccess ? 'نعم' : 'لا',
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'الموظفين', `الموظفين-${date}`);
};

// ─── Work Orders Export ──────────────────────────────────────────────────────

const WO_STATUS_AR: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

interface WOExportLookups {
  getProductName: (id: string) => string;
  getLineName: (id: string) => string;
  getSupervisorName: (id: string) => string;
}

export const exportWorkOrders = (
  workOrders: WorkOrder[],
  lookups: WOExportLookups
) => {
  if (workOrders.length === 0) return;
  const rows = workOrders.map((wo) => ({
    'رقم أمر الشغل': wo.workOrderNumber,
    'المنتج': lookups.getProductName(wo.productId),
    'خط الإنتاج': lookups.getLineName(wo.lineId),
    'المشرف': lookups.getSupervisorName(wo.supervisorId),
    'الكمية المطلوبة': wo.quantity,
    'الكمية المنتجة': wo.producedQuantity,
    'الكمية المتبقية': Math.max(0, wo.quantity - wo.producedQuantity),
    'عدد العمالة (أقصى)': wo.maxWorkers,
    'التاريخ المستهدف': wo.targetDate,
    'التكلفة المقدرة': wo.estimatedCost > 0 ? Number(wo.estimatedCost.toFixed(2)) : 0,
    'التكلفة الفعلية': wo.actualCost > 0 ? Number(wo.actualCost.toFixed(2)) : 0,
    'الحالة': WO_STATUS_AR[wo.status] || wo.status,
    'ملاحظات': wo.notes || '',
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'أوامر الشغل', `أوامر-الشغل-${date}`);
};
