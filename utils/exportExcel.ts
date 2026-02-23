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
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${fileName}.xlsx`);
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
}

const fmtCost = (v: number) => v > 0 ? Number(v.toFixed(2)) : 0;

export const exportAllProducts = (
  data: ProductExportData[],
  includeCosts: boolean
) => {
  const rows = data.map((d) => {
    const base: Record<string, any> = {
      'الكود': d.raw.code,
      'اسم المنتج': d.raw.name,
      'الفئة': d.raw.model || '—',
      'الرصيد الافتتاحي': d.product.openingStock,
      'إجمالي الإنتاج': d.product.totalProduction,
      'إجمالي الهالك': d.product.wasteUnits,
      'الرصيد الحالي': d.product.stockLevel,
      'حالة المخزون': d.product.stockStatus === 'available' ? 'متوفر' : d.product.stockStatus === 'low' ? 'منخفض' : 'نفذ',
    };
    if (includeCosts && d.costBreakdown) {
      base['تكلفة الوحدة الصينية'] = fmtCost(d.costBreakdown.chineseUnitCost);
      base['تكلفة المواد الخام'] = fmtCost(d.costBreakdown.rawMaterialCost);
      base['تكلفة العلبة الداخلية'] = fmtCost(d.costBreakdown.innerBoxCost);
      base['تكلفة الكرتونة'] = fmtCost(d.costBreakdown.outerCartonCost);
      base['وحدات/كرتونة'] = d.costBreakdown.unitsPerCarton;
      base['نصيب الكرتونة'] = fmtCost(d.costBreakdown.cartonShare);
      base['نصيب المصاريف الصناعية'] = fmtCost(d.costBreakdown.productionOverheadShare);
      base['إجمالي التكلفة المحسوبة'] = fmtCost(d.costBreakdown.totalCalculatedCost);
    }
    return base;
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, 'المنتجات', `المنتجات-${date}`);
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
