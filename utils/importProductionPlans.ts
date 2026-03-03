import * as XLSX from 'xlsx';
import type { FirestoreProduct, FirestoreProductionLine, PlanPriority } from '../types';

export interface ParsedProductionPlanRow {
  rowIndex: number;
  productId: string;
  lineId: string;
  plannedQuantity: number;
  startDate: string;
  priority: PlanPriority;
  errors: string[];
}

export interface ProductionPlanImportResult {
  rows: ParsedProductionPlanRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

interface PlanImportLookups {
  products: FirestoreProduct[];
  lines: FirestoreProductionLine[];
}

const HEADER_MAP: Record<string, string> = {
  'اسم المنتج': 'productName',
  'المنتج': 'productName',
  'كود المنتج': 'productCode',
  'الكود': 'productCode',
  'خط الإنتاج': 'lineName',
  'الخط': 'lineName',
  'كود الخط': 'lineCode',
  'الكمية المخططة': 'plannedQuantity',
  'الكمية': 'plannedQuantity',
  'تاريخ البدء': 'startDate',
  'الأولوية': 'priority',
};

const PRIORITY_MAP: Record<string, PlanPriority> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'urgent',
  منخفضة: 'low',
  متوسطة: 'medium',
  عالية: 'high',
  عاجلة: 'urgent',
};

const normalize = (value: any) => String(value ?? '').trim().toLowerCase();

const normalizeHeader = (h: string) => h.trim().replace(/\s+/g, ' ');

function normalizeDate(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export async function parseProductionPlansExcel(
  file: File,
  lookups: PlanImportLookups
): Promise<ProductionPlanImportResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

  if (jsonRows.length === 0) {
    return { rows: [], totalRows: 0, validCount: 0, errorCount: 0 };
  }

  const rawHeaders = Object.keys(jsonRows[0]);
  const headerMapping: Record<string, string> = {};
  rawHeaders.forEach((h) => {
    const mapped = HEADER_MAP[normalizeHeader(h)];
    if (mapped) headerMapping[h] = mapped;
  });

  const productsByCode = new Map(
    lookups.products.map((p) => [normalize(p.code), p])
  );
  const productsByName = new Map(
    lookups.products.map((p) => [normalize(p.name), p])
  );
  const linesByCode = new Map(
    lookups.lines.map((l) => [normalize(l.code), l])
  );
  const linesByName = new Map(
    lookups.lines.map((l) => [normalize(l.name), l])
  );

  const rows: ParsedProductionPlanRow[] = jsonRows.map((row, idx) => {
    const errors: string[] = [];
    const getValue = (field: string): any => {
      const key = rawHeaders.find((h) => headerMapping[h] === field);
      return key ? row[key] : undefined;
    };

    const productCode = normalize(getValue('productCode'));
    const productName = normalize(getValue('productName'));
    const lineCode = normalize(getValue('lineCode'));
    const lineName = normalize(getValue('lineName'));
    const startDate = normalizeDate(getValue('startDate'));
    const plannedQuantity = Number(getValue('plannedQuantity')) || 0;
    const rawPriority = normalize(getValue('priority'));
    const priority = PRIORITY_MAP[rawPriority] || 'medium';

    const product = productCode
      ? productsByCode.get(productCode)
      : productsByName.get(productName);
    const line = lineCode
      ? linesByCode.get(lineCode)
      : linesByName.get(lineName);

    if (!product) errors.push('المنتج غير موجود (بالاسم أو الكود)');
    if (!line) errors.push('خط الإنتاج غير موجود (بالاسم أو الكود)');
    if (plannedQuantity <= 0) errors.push('الكمية المخططة يجب أن تكون أكبر من 0');
    if (!startDate) errors.push('تاريخ البدء غير مقروء');
    else if (!isValidDate(startDate)) errors.push(`تاريخ البدء غير صالح: ${startDate}`);

    return {
      rowIndex: idx + 2,
      productId: product?.id || '',
      lineId: line?.id || '',
      plannedQuantity,
      startDate,
      priority,
      errors,
    };
  });

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  return {
    rows,
    totalRows: rows.length,
    validCount,
    errorCount: rows.length - validCount,
  };
}
