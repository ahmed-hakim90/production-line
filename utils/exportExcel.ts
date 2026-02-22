/**
 * Excel Export Utility
 * Uses SheetJS (xlsx) + file-saver to generate .xlsx files.
 * Arabic RTL column headers.
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ProductionReport, Product, FirestoreProduct, FirestoreEmployee } from '../types';
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
}

interface LookupFns {
  getLineName: (id: string) => string;
  getProductName: (id: string) => string;
  getEmployeeName: (id: string) => string;
}

/**
 * Transform raw reports into Arabic-labeled rows.
 */
const mapReportsToRows = (
  reports: ProductionReport[],
  lookups: LookupFns
): ReportRow[] => {
  return reports.map((r) => {
    const total = (r.quantityProduced || 0) + (r.quantityWaste || 0);
    const wasteRatio =
      total > 0
        ? (((r.quantityWaste || 0) / total) * 100).toFixed(1)
        : '0';
    return {
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

  rows.push({
    التاريخ: 'الإجمالي',
    'خط الإنتاج': '',
    المنتج: '',
    الموظف: `${rows.length} تقرير`,
    'الكمية المنتجة': totalProduced,
    الهالك: totalWaste,
    'نسبة الهالك %': `${wasteRatio}%`,
    'عدد العمال': totalWorkers,
    'ساعات العمل': totalHours,
  });
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
  lookups: LookupFns
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups));
  const date = new Date().toISOString().slice(0, 10);
  downloadExcel(rows, `تقارير ${employeeName}`, `تقارير-${employeeName}-${date}`);
};

/**
 * Export product reports to Excel.
 */
export const exportProductReports = (
  productName: string,
  reports: ProductionReport[],
  lookups: LookupFns
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups));
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
  lookups: LookupFns
) => {
  const rows = appendSummary(mapReportsToRows(reports, lookups));
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
