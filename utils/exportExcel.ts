/**
 * Excel Export Utility
 * Uses SheetJS (xlsx) + file-saver to generate .xlsx files.
 * Arabic RTL column headers.
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ProductionReport, Product, FirestoreProduct, FirestoreEmployee, WorkOrder, WorkOrderStatus, ProductionPlan } from '../types';
import type { ProductCostBreakdown } from './productCostBreakdown';
import { formatOperationDateTime, getReportWaste } from './calculations';
import type { FirestoreAttendanceLog, FirestoreLeaveRequest, FirestoreEmployeeLoan } from '../modules/hr/types';
import { LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS } from '../modules/hr/types';

interface ReportRow {
  'كود التقرير': string;
  التاريخ: string;
  'خط الإنتاج': string;
  المنتج: string;
  الموظف: string;
  'الكمية المنتجة': number;
  الهالك: number;
  'نسبة الهالك %': string;
  'عدد العمال': number;
  'عمالة الإنتاج'?: number;
  'عمالة التعبئة'?: number;
  'عمالة الجودة'?: number;
  'عمالة الصيانة'?: number;
  'عمالة خارجية'?: number;
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
    const wasteQuantity = getReportWaste(r);
    const total = (r.quantityProduced || 0) + wasteQuantity;
    const wasteRatio =
      total > 0
        ? ((wasteQuantity / total) * 100).toFixed(1)
        : '0';
    const row: ReportRow = {
      'كود التقرير': r.reportCode || '—',
      التاريخ: r.date,
      'خط الإنتاج': lookups.getLineName(r.lineId),
      المنتج: lookups.getProductName(r.productId),
      الموظف: lookups.getEmployeeName(r.employeeId),
      'الكمية المنتجة': r.quantityProduced || 0,
      الهالك: wasteQuantity,
      'نسبة الهالك %': `${wasteRatio}%`,
      'عدد العمال': r.workersCount || 0,
      'عمالة الإنتاج': r.workersProductionCount || 0,
      'عمالة التعبئة': r.workersPackagingCount || 0,
      'عمالة الجودة': r.workersQualityCount || 0,
      'عمالة الصيانة': r.workersMaintenanceCount || 0,
      'عمالة خارجية': r.workersExternalCount || 0,
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
  const totalWorkersProduction = rows.reduce((s, r) => s + (r['عمالة الإنتاج'] || 0), 0);
  const totalWorkersPackaging = rows.reduce((s, r) => s + (r['عمالة التعبئة'] || 0), 0);
  const totalWorkersQuality = rows.reduce((s, r) => s + (r['عمالة الجودة'] || 0), 0);
  const totalWorkersMaintenance = rows.reduce((s, r) => s + (r['عمالة الصيانة'] || 0), 0);
  const totalWorkersExternal = rows.reduce((s, r) => s + (r['عمالة خارجية'] || 0), 0);
  const totalHours = rows.reduce((s, r) => s + r['ساعات العمل'], 0);
  const total = totalProduced + totalWaste;
  const wasteRatio = total > 0 ? ((totalWaste / total) * 100).toFixed(1) : '0';

  const summaryRow: ReportRow = {
    'كود التقرير': '',
    التاريخ: 'الإجمالي',
    'خط الإنتاج': '',
    المنتج: '',
    الموظف: `${rows.length} تقرير`,
    'الكمية المنتجة': totalProduced,
    الهالك: totalWaste,
    'نسبة الهالك %': `${wasteRatio}%`,
    'عدد العمال': totalWorkers,
    'عمالة الإنتاج': totalWorkersProduction,
    'عمالة التعبئة': totalWorkersPackaging,
    'عمالة الجودة': totalWorkersQuality,
    'عمالة الصيانة': totalWorkersMaintenance,
    'عمالة خارجية': totalWorkersExternal,
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

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const formattedDateTime = formatOperationDateTime(value);
        return [key, formattedDateTime ?? value];
      }),
    ),
  );

  const ws = XLSX.utils.json_to_sheet(normalizedRows);

  // Auto-fit column widths
  const colWidths = Object.keys(normalizedRows[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...normalizedRows.map((r) => String(r[key] ?? '').length)
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

export const exportFactoryGeneralReport = (
  rows: Record<string, any>[],
  startDate: string,
  endDate: string,
) => {
  if (rows.length === 0) return;
  const label = startDate === endDate ? startDate : `${startDate}_${endDate}`;
  downloadExcel(rows, 'تقرير عام المصنع', `تقرير-عام-المصنع-${label}`);
};

/**
 * Export product summary table (from admin dashboard).
 */
export const exportProductSummary = (
  data: { name: string; code: string; qty: number; avgCost: number }[],
  includeCosts: boolean
) => {
  if (data.length === 0) return;
  const totalQty = data.reduce((s, p) => s + p.qty, 0);
  const weightedAvgCost = includeCosts && totalQty > 0
    ? data.reduce((s, p) => s + p.avgCost * p.qty, 0) / totalQty
    : 0;

  const getCostTrendLabel = (avgCost: number) => {
    if (!includeCosts || weightedAvgCost <= 0) return '—';
    const delta = avgCost - weightedAvgCost;
    const absDelta = Math.abs(delta);
    if (absDelta < 0.01) return 'مطابق للمتوسط';
    if (delta > 0) return `أعلى ${absDelta.toFixed(2)} ج.م`;
    return `أقل ${absDelta.toFixed(2)} ج.م`;
  };

  const rows = data.map((p, i) => {
    const base: Record<string, any> = {
      '#': i + 1,
      'المنتج': p.name,
      'الكود': p.code,
      'الكمية المنتجة': p.qty,
    };
    if (includeCosts) {
      base['متوسط تكلفة الوحدة'] = p.avgCost > 0 ? Number(p.avgCost.toFixed(2)) : 0;
      base['الاتجاه'] = getCostTrendLabel(p.avgCost);
    }
    return base;
  });
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
    summary['الاتجاه'] = '—';
  }
  rows.push(summary);
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'ملخص المنتجات', `ملخص-المنتجات-${date}`);
};

export const exportProductionPlanShortages = (
  data: { productName: string; componentName: string; shortageQty: number; note?: string }[],
) => {
  if (data.length === 0) return;
  const rows = data.map((row, index) => ({
    '#': index + 1,
    'المنتج': row.productName || '—',
    'المكون': row.componentName || '—',
    'الكمية': Number(row.shortageQty || 0),
    'الملحوظة': String(row.note || '').trim(),
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'نواقص المكونات', `نواقص-المكونات-${date}`);
};

// ─── Products Export ─────────────────────────────────────────────────────────

interface ProductExportData {
  product: Product;
  raw: FirestoreProduct;
  costBreakdown?: ProductCostBreakdown | null;
  rawMaterialsDetails?: string;
  warehouseName?: string;
  warehouseStock?: number;
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
    if (d.warehouseName) {
      base['المخزن'] = d.warehouseName;
      base['رصيد المخزن'] = Number(d.warehouseStock || 0);
    }
    if (options.stock) {
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
    'رقم الهاتف': e.phone || '—',
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

export interface WorkOrderExportRow {
  workOrderNumber: string;
  productName: string;
  lineName: string;
  supervisorName: string;
  status: WorkOrderStatus;
  storedStatus?: WorkOrderStatus;
  quantity: number;
  producedQuantity: number;
  remainingQuantity: number;
  progressPct: number;
  reportCount: number;
  startDate: string;
  estimatedDays: number;
  expectedEnd: string;
  targetDate: string;
  dailyAverage: number;
  deviationPct: number;
  estimatedCost: number;
  actualCost: number;
  costDiff: number;
  notes?: string;
}

interface WorkOrderExportOptions {
  detailedRows?: WorkOrderExportRow[];
}

const getStatusLabel = (status: string): string => WO_STATUS_AR[status] || status || '—';

export const exportWorkOrders = (
  workOrders: WorkOrder[],
  lookups: WOExportLookups,
  options?: WorkOrderExportOptions,
) => {
  const detailedRows = options?.detailedRows || [];
  if (workOrders.length === 0 && detailedRows.length === 0) return;

  const normalizedRows: WorkOrderExportRow[] = detailedRows.length > 0
    ? detailedRows
    : workOrders.map((wo) => {
      const quantity = Number(wo.quantity || 0);
      const producedQuantity = Number(wo.producedQuantity || 0);
      const remainingQuantity = Math.max(0, quantity - producedQuantity);
      const progressPct = quantity > 0 ? (producedQuantity / quantity) * 100 : 0;
      const estimatedCost = Number(wo.estimatedCost || 0);
      const actualCost = Number(wo.actualCost || 0);
      return {
        workOrderNumber: wo.workOrderNumber,
        productName: lookups.getProductName(wo.productId),
        lineName: lookups.getLineName(wo.lineId),
        supervisorName: lookups.getSupervisorName(wo.supervisorId),
        status: wo.status,
        storedStatus: wo.status,
        quantity,
        producedQuantity,
        remainingQuantity,
        progressPct,
        reportCount: 0,
        startDate: String((wo as any).startedAt || ''),
        estimatedDays: Number((wo as any).estimatedDays ?? (wo as any).estimatedDurationDays ?? 0),
        expectedEnd: String((wo as any).expectedEnd || wo.targetDate || ''),
        targetDate: wo.targetDate,
        dailyAverage: Number((wo as any).dailyAverage || 0),
        deviationPct: Number((wo as any).executionDeviationPct ?? 0),
        estimatedCost,
        actualCost,
        costDiff: actualCost - estimatedCost,
        notes: wo.notes || '',
      };
    });

  const rows = normalizedRows.map((row) => ({
    'رقم أمر الشغل': row.workOrderNumber || '—',
    'المنتج': row.productName || '—',
    'خط الإنتاج': row.lineName || '—',
    'المشرف': row.supervisorName || '—',
    'الحالة الفعالة': getStatusLabel(row.status),
    'الحالة المسجلة': getStatusLabel(row.storedStatus || row.status),
    'بداية التنفيذ (أول تقرير)': row.startDate || '—',
    'النهاية المتوقعة': row.expectedEnd || '—',
    'التاريخ المستهدف': row.targetDate || '—',
    'المدة المقدرة (يوم)': Math.max(0, Number(row.estimatedDays || 0)),
    'متوسط الإنتاج/يوم': Math.max(0, Number(row.dailyAverage || 0)),
    'عدد التقارير': Math.max(0, Number(row.reportCount || 0)),
    'الكمية المطلوبة': Math.max(0, Number(row.quantity || 0)),
    'الكمية المنتجة': Math.max(0, Number(row.producedQuantity || 0)),
    'الكمية المتبقية': Math.max(0, Number(row.remainingQuantity || 0)),
    'نسبة الإنجاز %': Number(Math.max(0, Number(row.progressPct || 0)).toFixed(1)),
    'الانحراف %': Number(Number(row.deviationPct || 0).toFixed(1)),
    'التكلفة المقدرة': Number(Number(row.estimatedCost || 0).toFixed(2)),
    'التكلفة الفعلية': Number(Number(row.actualCost || 0).toFixed(2)),
    'فرق التكلفة': Number(Number(row.costDiff || 0).toFixed(2)),
    'ملاحظات': String(row.notes || '').trim(),
  }));

  const totalQuantity = normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0);
  const totalProduced = normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.producedQuantity || 0)), 0);
  const totalRemaining = normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.remainingQuantity || 0)), 0);
  const totalEstimatedCost = normalizedRows.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0);
  const totalActualCost = normalizedRows.reduce((sum, row) => sum + Number(row.actualCost || 0), 0);
  const totalDiffCost = normalizedRows.reduce((sum, row) => sum + Number(row.costDiff || 0), 0);
  const totalReports = normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.reportCount || 0)), 0);
  const avgDaily = normalizedRows.length > 0
    ? normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.dailyAverage || 0)), 0) / normalizedRows.length
    : 0;
  const avgProgress = totalQuantity > 0 ? (totalProduced / totalQuantity) * 100 : 0;
  const avgDeviation = normalizedRows.length > 0
    ? normalizedRows.reduce((sum, row) => sum + Number(row.deviationPct || 0), 0) / normalizedRows.length
    : 0;
  const avgEstimatedDays = normalizedRows.length > 0
    ? normalizedRows.reduce((sum, row) => sum + Math.max(0, Number(row.estimatedDays || 0)), 0) / normalizedRows.length
    : 0;

  rows.push({
    'رقم أمر الشغل': '',
    'المنتج': 'الإجمالي',
    'خط الإنتاج': '',
    'المشرف': `${normalizedRows.length} أمر`,
    'الحالة الفعالة': '',
    'الحالة المسجلة': '',
    'بداية التنفيذ (أول تقرير)': '',
    'النهاية المتوقعة': '',
    'التاريخ المستهدف': '',
    'المدة المقدرة (يوم)': Number(avgEstimatedDays.toFixed(1)),
    'متوسط الإنتاج/يوم': Number(avgDaily.toFixed(2)),
    'عدد التقارير': totalReports,
    'الكمية المطلوبة': totalQuantity,
    'الكمية المنتجة': totalProduced,
    'الكمية المتبقية': totalRemaining,
    'نسبة الإنجاز %': Number(avgProgress.toFixed(1)),
    'الانحراف %': Number(avgDeviation.toFixed(1)),
    'التكلفة المقدرة': Number(totalEstimatedCost.toFixed(2)),
    'التكلفة الفعلية': Number(totalActualCost.toFixed(2)),
    'فرق التكلفة': Number(totalDiffCost.toFixed(2)),
    'ملاحظات': '',
  });

  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'أوامر الشغل', `أوامر-الشغل-${date}`);
};

// ─── Production Plans Export ────────────────────────────────────────────────

const PLAN_PRIORITY_AR: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

const PLAN_STATUS_AR: Record<string, string> = {
  planned: 'مخطط',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  paused: 'متوقف',
  cancelled: 'ملغي',
};

interface PlanExportLookups {
  getProductName: (id: string) => string;
  getProductCode: (id: string) => string;
  getLineName: (id: string) => string;
}

export const exportProductionPlans = (
  plans: ProductionPlan[],
  lookups: PlanExportLookups
) => {
  if (plans.length === 0) return;
  const rows = plans.map((plan) => ({
    'اسم المنتج': lookups.getProductName(plan.productId),
    'كود المنتج': lookups.getProductCode(plan.productId),
    'خط الإنتاج': lookups.getLineName(plan.lineId),
    'الكمية المخططة': plan.plannedQuantity,
    'الكمية المنتجة': plan.producedQuantity ?? 0,
    'تاريخ البدء': plan.plannedStartDate || plan.startDate,
    'تاريخ الانتهاء المتوقع': plan.plannedEndDate || '',
    'المدة المقدرة (يوم)': plan.estimatedDurationDays || 0,
    'الهدف اليومي': plan.avgDailyTarget || 0,
    'الأولوية': PLAN_PRIORITY_AR[plan.priority] || plan.priority,
    'الحالة': PLAN_STATUS_AR[plan.status] || plan.status,
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'خطط الإنتاج', `خطط-الإنتاج-${date}`);
};

export function exportAttendanceLogs(
  logs: FirestoreAttendanceLog[],
  employeeMap: Map<string, { name: string; code?: string }>,
  dateRange: string,
) {
  const rows = logs.map((log) => {
    const emp = employeeMap.get(log.employeeId);
    const checkIn = log.checkIn?.toDate?.() ?? (log.checkIn ? new Date(log.checkIn) : null);
    const checkOut = log.checkOut?.toDate?.() ?? (log.checkOut ? new Date(log.checkOut) : null);
    return {
      'اسم الموظف': emp?.name ?? log.employeeId,
      'كود الموظف': emp?.code ?? '',
      'التاريخ': log.date,
      'وقت الدخول': checkIn ? checkIn.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—',
      'وقت الخروج': checkOut ? checkOut.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—',
      'ساعات العمل': log.totalHours ?? 0,
      'التأخير (دقيقة)': log.lateMinutes ?? 0,
      'المغادرة المبكرة (دقيقة)': log.earlyLeaveMinutes ?? 0,
      'الحالة': log.isAbsent ? 'غائب' : log.isWeeklyOff ? 'إجازة أسبوعية' : log.isIncomplete ? 'ناقص' : 'حاضر',
    };
  });
  downloadExcel(rows, 'سجل الحضور', `حضور-${dateRange}`);
}

export function exportLeaveRequests(
  requests: FirestoreLeaveRequest[],
  employeeMap: Map<string, { name: string }>,
) {
  const rows = requests.map((r) => ({
    'اسم الموظف': employeeMap.get(r.employeeId)?.name ?? r.employeeId,
    'نوع الإجازة': LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType,
    'من تاريخ': r.startDate,
    'إلى تاريخ': r.endDate,
    'عدد الأيام': r.totalDays,
    'الحالة': r.status,
    'تاريخ الطلب': r.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') ?? '',
    'ملاحظات': r.reason ?? '',
  }));
  downloadExcel(rows, 'طلبات الإجازة', `إجازات-${new Date().toISOString().slice(0, 7)}`);
}

export function exportLoanRequestsMultiSheet(
  monthlyAdvance: FirestoreEmployeeLoan[],
  installment: FirestoreEmployeeLoan[],
  employeeMap: Map<string, { name?: string; code?: string }>,
  fileName = `السلف-${new Date().toISOString().slice(0, 10)}`,
) {
  const wb = XLSX.utils.book_new();
  const buildRows = (items: FirestoreEmployeeLoan[]) => items.map((l) => {
    const emp = employeeMap.get(l.employeeId);
    return {
      'كود الموظف': l.employeeCode || emp?.code || '—',
      'اسم الموظف': l.employeeName || emp?.name || l.employeeId,
      'النوع': LOAN_TYPE_LABELS[l.loanType],
      'المبلغ': l.loanAmount,
      'القسط الشهري': l.installmentAmount,
      'إجمالي الأقساط': l.totalInstallments,
      'المتبقي': l.remainingInstallments,
      'الحالة': l.status,
      'تم الصرف': l.disbursed ? 'نعم' : 'لا',
      'السبب': l.reason || '',
    };
  });

  const monthlyRows = buildRows(monthlyAdvance);
  monthlyRows.push({
    'كود الموظف': '',
    'اسم الموظف': 'الإجمالي',
    'النوع': LOAN_TYPE_LABELS.monthly_advance,
    'المبلغ': monthlyAdvance.reduce((sum, l) => sum + Number(l.loanAmount || 0), 0),
    'القسط الشهري': monthlyAdvance.reduce((sum, l) => sum + Number(l.installmentAmount || 0), 0),
    'إجمالي الأقساط': monthlyAdvance.reduce((sum, l) => sum + Number(l.totalInstallments || 0), 0),
    'المتبقي': monthlyAdvance.reduce((sum, l) => sum + Number(l.remainingInstallments || 0), 0),
    'الحالة': '',
    'تم الصرف': '',
    'السبب': '',
  });

  const installmentRows = buildRows(installment);
  installmentRows.push({
    'كود الموظف': '',
    'اسم الموظف': 'الإجمالي',
    'النوع': LOAN_TYPE_LABELS.installment,
    'المبلغ': installment.reduce((sum, l) => sum + Number(l.loanAmount || 0), 0),
    'القسط الشهري': installment.reduce((sum, l) => sum + Number(l.installmentAmount || 0), 0),
    'إجمالي الأقساط': installment.reduce((sum, l) => sum + Number(l.totalInstallments || 0), 0),
    'المتبقي': installment.reduce((sum, l) => sum + Number(l.remainingInstallments || 0), 0),
    'الحالة': '',
    'تم الصرف': '',
    'السبب': '',
  });

  const monthlySheet = XLSX.utils.json_to_sheet(monthlyRows);
  const installmentSheet = XLSX.utils.json_to_sheet(installmentRows);
  XLSX.utils.book_append_sheet(wb, monthlySheet, 'سلف شهرية');
  XLSX.utils.book_append_sheet(wb, installmentSheet, 'سلف مقسطة');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${fileName}.xlsx`);
}
