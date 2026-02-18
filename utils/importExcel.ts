/**
 * Excel Import Utility — parse .xlsx/.xls files into ProductionReport data.
 * Resolves Arabic column headers and maps names → IDs using lookup arrays.
 */
import * as XLSX from 'xlsx';
import type { ProductionReport, FirestoreProduct, FirestoreProductionLine, FirestoreSupervisor } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedReportRow {
  rowIndex: number;
  date: string;
  lineName: string;
  lineId: string;
  productName: string;
  productId: string;
  supervisorName: string;
  supervisorId: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
  errors: string[];
}

export interface ImportResult {
  rows: ParsedReportRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

interface Lookups {
  products: FirestoreProduct[];
  lines: FirestoreProductionLine[];
  supervisors: FirestoreSupervisor[];
}

// ─── Header mapping (Arabic → field) ────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'التاريخ': 'date',
  'تاريخ': 'date',
  'خط الإنتاج': 'lineName',
  'خط الانتاج': 'lineName',
  'الخط': 'lineName',
  'المنتج': 'productName',
  'منتج': 'productName',
  'المشرف': 'supervisorName',
  'مشرف': 'supervisorName',
  'الكمية المنتجة': 'quantityProduced',
  'كمية الانتاج': 'quantityProduced',
  'كمية الإنتاج': 'quantityProduced',
  'الكمية': 'quantityProduced',
  'الهالك': 'quantityWaste',
  'هالك': 'quantityWaste',
  'عدد العمال': 'workersCount',
  'العمال': 'workersCount',
  'عمال': 'workersCount',
  'ساعات العمل': 'workHours',
  'ساعات': 'workHours',
};

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, ' ');
}

// ─── Name → ID resolvers ────────────────────────────────────────────────────

function findByName<T extends { id?: string; name: string }>(
  items: T[],
  name: string,
): T | undefined {
  const n = name.trim().toLowerCase();
  return items.find((i) => i.name.trim().toLowerCase() === n);
}

// ─── Date normalization ─────────────────────────────────────────────────────

function normalizeDate(raw: any): string {
  if (!raw) return '';

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

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }

  // MM/DD/YYYY
  const usMatch = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (usMatch) {
    return `${usMatch[1]}-${usMatch[2].padStart(2, '0')}-${usMatch[3].padStart(2, '0')}`;
  }

  return s;
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
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (jsonRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
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

        const rows: ParsedReportRow[] = jsonRows
          .filter((row) => {
            const dateVal = String(row[rawHeaders.find((h) => headerMapping[h] === 'date') ?? ''] ?? '').trim();
            return dateVal !== '' && dateVal !== 'الإجمالي' && dateVal !== 'الاجمالي';
          })
          .map((row, idx) => {
            const errors: string[] = [];

            const getValue = (field: string): any => {
              const key = rawHeaders.find((h) => headerMapping[h] === field);
              return key ? row[key] : undefined;
            };

            const date = normalizeDate(getValue('date'));
            if (!date) errors.push('التاريخ مفقود');

            const lineName = String(getValue('lineName') ?? '').trim();
            const line = lineName ? findByName(lookups.lines, lineName) : undefined;
            if (lineName && !line) errors.push(`خط "${lineName}" غير موجود`);
            if (!lineName) errors.push('خط الإنتاج مفقود');

            const productName = String(getValue('productName') ?? '').trim();
            const product = productName ? findByName(lookups.products, productName) : undefined;
            if (productName && !product) errors.push(`المنتج "${productName}" غير موجود`);
            if (!productName) errors.push('المنتج مفقود');

            const supervisorName = String(getValue('supervisorName') ?? '').trim();
            const supervisor = supervisorName ? findByName(lookups.supervisors, supervisorName) : undefined;
            if (supervisorName && !supervisor) errors.push(`المشرف "${supervisorName}" غير موجود`);
            if (!supervisorName) errors.push('المشرف مفقود');

            const quantityProduced = Number(getValue('quantityProduced')) || 0;
            if (quantityProduced <= 0) errors.push('الكمية المنتجة يجب أن تكون أكبر من 0');

            const quantityWaste = Number(getValue('quantityWaste')) || 0;
            const workersCount = Number(getValue('workersCount')) || 0;
            if (workersCount <= 0) errors.push('عدد العمال مفقود');

            const workHours = Number(getValue('workHours')) || 0;
            if (workHours <= 0) errors.push('ساعات العمل مفقودة');

            return {
              rowIndex: idx + 2,
              date,
              lineName,
              lineId: line?.id ?? '',
              productName,
              productId: product?.id ?? '',
              supervisorName,
              supervisorId: supervisor?.id ?? '',
              quantityProduced,
              quantityWaste,
              workersCount,
              workHours,
              errors,
            };
          });

        const validCount = rows.filter((r) => r.errors.length === 0).length;

        resolve({
          rows,
          totalRows: rows.length,
          validCount,
          errorCount: rows.length - validCount,
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
    supervisorId: row.supervisorId,
    quantityProduced: row.quantityProduced,
    quantityWaste: row.quantityWaste,
    workersCount: row.workersCount,
    workHours: row.workHours,
  };
}
