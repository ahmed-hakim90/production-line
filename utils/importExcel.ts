/**
 * Excel Import Utility — parse .xlsx/.xls files into ProductionReport data.
 * Resolves Arabic column headers and maps names/codes → IDs using lookup arrays.
 * Supports fuzzy matching and duplicate detection.
 */
import * as XLSX from 'xlsx';
import type { ProductionReport, FirestoreProduct, FirestoreProductionLine, FirestoreEmployee } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedReportRow {
  rowIndex: number;
  date: string;
  lineName: string;
  lineId: string;
  productName: string;
  productId: string;
  employeeName: string;
  employeeCode: string;
  employeeId: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

export interface ImportResult {
  rows: ParsedReportRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
}

export interface ParsedReportDateUpdateRow {
  rowIndex: number;
  reportCode: string;
  date?: string;
  quantityProduced?: number;
  quantityWaste?: number;
  workersCount?: number;
  workHours?: number;
  updatedFieldsCount: number;
  errors: string[];
}

export interface ReportDateUpdateImportResult {
  rows: ParsedReportDateUpdateRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  detectedTemplate: boolean;
}

interface Lookups {
  products: FirestoreProduct[];
  lines: FirestoreProductionLine[];
  employees: FirestoreEmployee[];
  existingReports?: ProductionReport[];
}

// ─── Header mapping (Arabic → field) ────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'التاريخ': 'date',
  'تاريخ': 'date',
  'date': 'date',
  'خط الإنتاج': 'lineName',
  'خط الانتاج': 'lineName',
  'الخط': 'lineName',
  'line': 'lineName',
  'المنتج': 'productName',
  'منتج': 'productName',
  'product': 'productName',
  'المشرف': 'employeeName',
  'مشرف': 'employeeName',
  'الموظف': 'employeeName',
  'موظف': 'employeeName',
  'اسم المشرف': 'employeeName',
  'supervisor': 'employeeName',
  'employee': 'employeeName',
  'كود المشرف': 'employeeCode',
  'كود الموظف': 'employeeCode',
  'الكود': 'employeeCode',
  'رمز الموظف': 'employeeCode',
  'code': 'employeeCode',
  'الكمية المنتجة': 'quantityProduced',
  'كمية الانتاج': 'quantityProduced',
  'كمية الإنتاج': 'quantityProduced',
  'الكمية': 'quantityProduced',
  'الانتاج': 'quantityProduced',
  'الإنتاج': 'quantityProduced',
  'quantity': 'quantityProduced',
  'الهالك': 'quantityWaste',
  'هالك': 'quantityWaste',
  'waste': 'quantityWaste',
  'عدد العمال': 'workersCount',
  'العمال': 'workersCount',
  'عمال': 'workersCount',
  'workers': 'workersCount',
  'ساعات العمل': 'workHours',
  'ساعات': 'workHours',
  'hours': 'workHours',
};

const DATE_UPDATE_HEADER_MAP: Record<string, string> = {
  'كود التقرير': 'reportCode',
  'الكود': 'reportCode',
  'report code': 'reportCode',
  'reportcode': 'reportCode',
  'report_code': 'reportCode',
  'تاريخ جديد': 'date',
  'التاريخ الجديد': 'date',
  'التاريخ': 'date',
  'تاريخ': 'date',
  'new date': 'date',
  'date': 'date',
  'الكمية المنتجة': 'quantityProduced',
  'كمية منتجة': 'quantityProduced',
  'كمية جديدة': 'quantityProduced',
  'الهالك': 'quantityWaste',
  'هالك': 'quantityWaste',
  'هالك جديد': 'quantityWaste',
  'عدد العمال': 'workersCount',
  'عمال': 'workersCount',
  'عدد العمال الجديد': 'workersCount',
  'ساعات العمل': 'workHours',
  'ساعات': 'workHours',
  'ساعات جديدة': 'workHours',
  'produced quantity': 'quantityProduced',
  'waste quantity': 'quantityWaste',
  'workers count': 'workersCount',
  'work hours': 'workHours',
};

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, ' ');
}

function normalizeHeaderForMap(h: string): string {
  return normalizeHeader(h).toLowerCase();
}

// ─── Text normalization for fuzzy matching ──────────────────────────────────

function normalizeArabic(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')  // strip tashkeel/diacritics
    .replace(/[أإآٱ]/g, 'ا')                // normalize alef variants
    .replace(/ة/g, 'ه')                     // taa marbuta → haa
    .replace(/ى/g, 'ي')                     // alef maqsura → ya
    .replace(/\s+/g, ' ');
}

// ─── Name/Code → ID resolvers ───────────────────────────────────────────────

function findByNameFuzzy<T extends { id?: string; name: string }>(
  items: T[],
  name: string,
): { item: T; exact: boolean } | undefined {
  const n = name.trim().toLowerCase();
  const nNorm = normalizeArabic(name);

  // 1. Exact match
  const exact = items.find((i) => i.name.trim().toLowerCase() === n);
  if (exact) return { item: exact, exact: true };

  // 2. Normalized match (diacritics/alef variants removed)
  const normalized = items.find((i) => normalizeArabic(i.name) === nNorm);
  if (normalized) return { item: normalized, exact: false };

  // 3. Contains match (input is substring of item or vice versa)
  const contains = items.find(
    (i) => normalizeArabic(i.name).includes(nNorm) || nNorm.includes(normalizeArabic(i.name))
  );
  if (contains) return { item: contains, exact: false };

  return undefined;
}

function findEmployeeByCode(
  employees: FirestoreEmployee[],
  code: string,
): FirestoreEmployee | undefined {
  const c = code.trim().toLowerCase();
  return employees.find((e) => e.code?.trim().toLowerCase() === c);
}

// ─── Date normalization ─────────────────────────────────────────────────────

function normalizeDate(raw: any): string {
  if (!raw) return '';

  // Excel number date
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      const yyyy = String(d.y).padStart(4, '0');
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const s = String(raw).trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD first (الأهم يتحط فوق)
  const ymdMatch = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return '';
}

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

// ─── Main parse function ────────────────────────────────────────────────────

export function parseExcelFile(
  file: File,
  lookups: Lookups,
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });

        // Find the data sheet — prefer "تقارير الإنتاج", fall back to first sheet
        const targetSheet = wb.SheetNames.find(
          (n) => n === 'تقارير الإنتاج' || n === 'Sheet1'
        ) ?? wb.SheetNames[0];
        const ws = wb.Sheets[targetSheet];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (jsonRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0, duplicateCount: 0 });
          return;
        }

        // Map headers
        const rawHeaders = Object.keys(jsonRows[0]);
        const headerMapping: Record<string, string> = {};
        for (const rawH of rawHeaders) {
          const norm = normalizeHeader(rawH);
          const mapped = HEADER_MAP[norm];
          if (mapped) headerMapping[rawH] = mapped;
        }

        // Build existing reports index for duplicate detection
        const existingIndex = new Set<string>();
        if (lookups.existingReports) {
          for (const r of lookups.existingReports) {
            existingIndex.add(`${r.date}|${r.lineId}|${r.productId}`);
          }
        }

        // Track duplicates within the file itself
        const fileIndex = new Map<string, number>();

        const rows: ParsedReportRow[] = jsonRows
          .filter((row) => {
            const dateKey = rawHeaders.find((h) => headerMapping[h] === 'date') ?? '';
            const dateVal = String(row[dateKey] ?? '').trim();
            return dateVal !== '' && dateVal !== 'الإجمالي' && dateVal !== 'الاجمالي' && dateVal !== 'إجمالي';
          })
          .map((row, idx) => {
            const errors: string[] = [];
            const warnings: string[] = [];

            const getValue = (field: string): any => {
              const key = rawHeaders.find((h) => headerMapping[h] === field);
              return key ? row[key] : undefined;
            };

            // ── Date
            const date = normalizeDate(getValue('date'));
            if (!date) errors.push('التاريخ مفقود');
            else if (!isValidDate(date)) errors.push(`تاريخ غير صالح: ${date}`);

            // ── Line
            const lineName = String(getValue('lineName') ?? '').trim();
            let lineId = '';
            if (lineName) {
              const lineMatch = findByNameFuzzy(lookups.lines, lineName);
              if (lineMatch) {
                lineId = lineMatch.item.id ?? '';
                if (!lineMatch.exact) warnings.push(`تم مطابقة الخط "${lineName}" → "${lineMatch.item.name}"`);
              } else {
                errors.push(`خط "${lineName}" غير موجود`);
              }
            } else {
              errors.push('خط الإنتاج مفقود');
            }

            // ── Product
            const productName = String(getValue('productName') ?? '').trim();
            let productId = '';
            if (productName) {
              const productMatch = findByNameFuzzy(lookups.products, productName);
              if (productMatch) {
                productId = productMatch.item.id ?? '';
                if (!productMatch.exact) warnings.push(`تم مطابقة المنتج "${productName}" → "${productMatch.item.name}"`);
              } else {
                errors.push(`المنتج "${productName}" غير موجود`);
              }
            } else {
              errors.push('المنتج مفقود');
            }

            // ── Employee: try code first, then name
            const employeeCode = String(getValue('employeeCode') ?? '').trim();
            const employeeName = String(getValue('employeeName') ?? '').trim();
            let employeeId = '';
            let resolvedName = employeeName;

            if (employeeCode) {
              const byCode = findEmployeeByCode(lookups.employees, employeeCode);
              if (byCode) {
                employeeId = byCode.id ?? '';
                resolvedName = byCode.name;
                if (employeeName && byCode.name.trim().toLowerCase() !== employeeName.trim().toLowerCase()) {
                  warnings.push(`الكود "${employeeCode}" يخص "${byCode.name}" (مختلف عن "${employeeName}")`);
                }
              } else {
                errors.push(`كود الموظف "${employeeCode}" غير موجود`);
              }
            } else if (employeeName) {
              const nameMatch = findByNameFuzzy(lookups.employees, employeeName);
              if (nameMatch) {
                employeeId = nameMatch.item.id ?? '';
                resolvedName = nameMatch.item.name;
                if (!nameMatch.exact) warnings.push(`تم مطابقة المشرف "${employeeName}" → "${nameMatch.item.name}"`);
              } else {
                errors.push(`المشرف "${employeeName}" غير موجود`);
              }
            } else {
              errors.push('المشرف مفقود (أدخل الاسم أو الكود)');
            }

            // ── Numeric fields
            const quantityProduced = Number(getValue('quantityProduced')) || 0;
            if (quantityProduced <= 0) errors.push('الكمية المنتجة يجب أن تكون أكبر من 0');

            const quantityWaste = Number(getValue('quantityWaste')) || 0;
            if (quantityWaste < 0) errors.push('الهالك لا يمكن أن يكون سالب');

            const workersCount = Number(getValue('workersCount')) || 0;
            if (workersCount <= 0) errors.push('عدد العمال مفقود');

            const workHours = Number(getValue('workHours')) || 0;
            if (workHours <= 0) errors.push('ساعات العمل مفقودة');

            // ── Waste ratio warning
            if (quantityProduced > 0 && quantityWaste > 0) {
              const wasteRatio = quantityWaste / (quantityProduced + quantityWaste);
              if (wasteRatio > 0.2) warnings.push(`نسبة الهالك مرتفعة (${(wasteRatio * 100).toFixed(1)}%)`);
            }

            // ── Duplicate detection
            let isDuplicate = false;
            const dupeKey = `${date}|${lineId}|${productId}`;
            if (date && lineId && productId) {
              if (existingIndex.has(dupeKey)) {
                isDuplicate = true;
                warnings.push('تقرير مكرر — يوجد تقرير بنفس التاريخ والخط والمنتج');
              }
              const prevRow = fileIndex.get(dupeKey);
              if (prevRow !== undefined) {
                isDuplicate = true;
                warnings.push(`مكرر مع الصف ${prevRow} في نفس الملف`);
              }
              fileIndex.set(dupeKey, idx + 2);
            }

            return {
              rowIndex: idx + 2,
              date,
              lineName: lineName || resolvedName ? lineName : '',
              lineId,
              productName,
              productId,
              employeeName: resolvedName || employeeName,
              employeeCode,
              employeeId,
              quantityProduced,
              quantityWaste,
              workersCount,
              workHours,
              errors,
              warnings,
              isDuplicate,
            };
          });

        const validCount = rows.filter((r) => r.errors.length === 0).length;
        const warningCount = rows.filter((r) => r.warnings.length > 0).length;
        const duplicateCount = rows.filter((r) => r.isDuplicate).length;

        resolve({
          rows,
          totalRows: rows.length,
          validCount,
          errorCount: rows.length - validCount,
          warningCount,
          duplicateCount,
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a lightweight update file with: reportCode + new date.
 */
export function parseReportDateUpdateExcelFile(
  file: File,
): Promise<ReportDateUpdateImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (jsonRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, detectedTemplate: false });
          return;
        }

        const rawHeaders = Object.keys(jsonRows[0]);
        const reportCodeKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'reportCode'
        );
        const dateKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'date'
        );
        const producedKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'quantityProduced'
        );
        const wasteKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'quantityWaste'
        );
        const workersKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'workersCount'
        );
        const hoursKey = rawHeaders.find(
          (h) => DATE_UPDATE_HEADER_MAP[normalizeHeaderForMap(h)] === 'workHours'
        );

        const hasAnyUpdateColumn = !!dateKey || !!producedKey || !!wasteKey || !!workersKey || !!hoursKey;
        const detectedTemplate = !!reportCodeKey && hasAnyUpdateColumn;
        if (!detectedTemplate) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, detectedTemplate: false });
          return;
        }

        const rows: ParsedReportDateUpdateRow[] = jsonRows
          .map((row, idx) => {
            const errors: string[] = [];
            const reportCode = String(row[reportCodeKey!] ?? '').trim();
            const date = dateKey ? normalizeDate(row[dateKey]) : '';

            const toNum = (value: any): number | undefined => {
              if (value === null || value === undefined) return undefined;
              const s = String(value).trim();
              if (!s) return undefined;
              const n = Number(s);
              return Number.isFinite(n) ? n : undefined;
            };
            const quantityProduced = producedKey ? toNum(row[producedKey]) : undefined;
            const quantityWaste = wasteKey ? toNum(row[wasteKey]) : undefined;
            const workersCount = workersKey ? toNum(row[workersKey]) : undefined;
            const workHours = hoursKey ? toNum(row[hoursKey]) : undefined;

            if (!reportCode) errors.push('كود التقرير مفقود');
            if (dateKey) {
              const rawDate = String(row[dateKey] ?? '').trim();
              if (rawDate && !date) errors.push('التاريخ الجديد غير مقروء');
              else if (date && !isValidDate(date)) errors.push(`تاريخ غير صالح: ${date}`);
            }

            if (producedKey && String(row[producedKey] ?? '').trim() && quantityProduced === undefined) {
              errors.push('الكمية المنتجة غير رقمية');
            } else if (quantityProduced !== undefined && quantityProduced <= 0) {
              errors.push('الكمية المنتجة يجب أن تكون أكبر من 0');
            }

            if (wasteKey && String(row[wasteKey] ?? '').trim() && quantityWaste === undefined) {
              errors.push('الهالك غير رقمي');
            } else if (quantityWaste !== undefined && quantityWaste < 0) {
              errors.push('الهالك لا يمكن أن يكون سالب');
            }

            if (workersKey && String(row[workersKey] ?? '').trim() && workersCount === undefined) {
              errors.push('عدد العمال غير رقمي');
            } else if (workersCount !== undefined && workersCount <= 0) {
              errors.push('عدد العمال يجب أن يكون أكبر من 0');
            }

            if (hoursKey && String(row[hoursKey] ?? '').trim() && workHours === undefined) {
              errors.push('ساعات العمل غير رقمية');
            } else if (workHours !== undefined && workHours <= 0) {
              errors.push('ساعات العمل يجب أن تكون أكبر من 0');
            }

            const updatedFieldsCount = [
              date ? 1 : 0,
              quantityProduced !== undefined ? 1 : 0,
              quantityWaste !== undefined ? 1 : 0,
              workersCount !== undefined ? 1 : 0,
              workHours !== undefined ? 1 : 0,
            ].reduce((s, n) => s + n, 0);
            if (updatedFieldsCount === 0) {
              errors.push('لا توجد أي بيانات تحديث في الصف');
            }

            return {
              rowIndex: idx + 2,
              reportCode,
              date: date || undefined,
              quantityProduced,
              quantityWaste,
              workersCount,
              workHours,
              updatedFieldsCount,
              errors,
            };
          })
          .filter((r) =>
            r.reportCode ||
            r.date ||
            r.quantityProduced !== undefined ||
            r.quantityWaste !== undefined ||
            r.workersCount !== undefined ||
            r.workHours !== undefined ||
            r.errors.length > 0
          );

        const validCount = rows.filter((r) => r.errors.length === 0).length;
        resolve({
          rows,
          totalRows: rows.length,
          validCount,
          errorCount: rows.length - validCount,
          detectedTemplate: true,
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert valid parsed rows into report data objects ready for createReport().
 */
export function toReportData(
  row: ParsedReportRow,
): Omit<ProductionReport, 'id' | 'createdAt'> {
  return {
    date: row.date,
    lineId: row.lineId,
    productId: row.productId,
    employeeId: row.employeeId,
    quantityProduced: row.quantityProduced,
    quantityWaste: row.quantityWaste,
    workersCount: row.workersCount,
    workHours: row.workHours,
  };
}
