import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types';

export interface InventoryInLocationLookup {
  id: string;
  code: string;
  warehouseId: string;
  isActive?: boolean;
}

export interface ParsedInventoryInRow {
  rowIndex: number;
  productCode: string;
  quantity: number;
  productId: string;
  productName: string;
  locationCode: string;
  locationId?: string;
  locationWarehouseId?: string;
  errors: string[];
}

export interface InventoryInImportResult {
  rows: ParsedInventoryInRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

type HeaderField = 'productCode' | 'quantity' | 'locationCode';

const HEADER_MAP: Record<string, HeaderField> = {
  'كود الصنف': 'productCode',
  'كود المنتج': 'productCode',
  'كود المادة الخام': 'productCode',
  'كود المادة': 'productCode',
  'كود الخام': 'productCode',
  'الكود': 'productCode',
  'product code': 'productCode',
  'productcode': 'productCode',
  'code': 'productCode',
  'الكمية': 'quantity',
  'كمية': 'quantity',
  'quantity': 'quantity',
  'qty': 'quantity',
  'كود اللوكيشن': 'locationCode',
  'كود الموقع': 'locationCode',
  'اللوكيشن': 'locationCode',
  'لوكيشن': 'locationCode',
  'كود الرف': 'locationCode',
  'location code': 'locationCode',
  'locationcode': 'locationCode',
  'location': 'locationCode',
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function mapHeader(raw: string): HeaderField | undefined {
  const norm = normalizeHeader(raw);
  if (!norm) return undefined;
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];
  if (/لوكيشن|location|shelf|رف/.test(norm) && /كود|code/.test(norm)) {
    return 'locationCode';
  }
  return undefined;
}

function normalizeLocationCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

function parseNumericCell(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/٬/g, '')
    .replace(/[^\d.\-]/g, '');
  if (!raw) return NaN;
  return Number(raw);
}

type ImportLookupItem = Pick<FirestoreProduct, 'id' | 'name' | 'code'>;

export type ParseInventoryInByCodeOptions = {
  itemLabel?: string;
  locations?: InventoryInLocationLookup[];
};

export function parseInventoryInByCodeFromBuffer(
  data: ArrayBuffer | Uint8Array,
  items: ImportLookupItem[],
  options?: ParseInventoryInByCodeOptions,
): InventoryInImportResult {
  const itemLabel = options?.itemLabel?.trim() || 'الصنف';
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { rows: [], totalRows: 0, validCount: 0, errorCount: 0 };
  }

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
  if (aoa.length < 2) {
    return { rows: [], totalRows: 0, validCount: 0, errorCount: 0 };
  }

  const headers = (aoa[0] || []).map((h) => mapHeader(String(h || '')));
  const codeIdx = headers.findIndex((h) => h === 'productCode');
  const qtyIdx = headers.findIndex((h) => h === 'quantity');
  const locationIdx = headers.findIndex((h) => h === 'locationCode');
  if (codeIdx < 0 || qtyIdx < 0) {
    throw new Error('القالب غير صحيح. الأعمدة المطلوبة: الكود + الكمية. (كود اللوكيشن اختياري)');
  }

  const byCode = new Map<string, ImportLookupItem>();
  items.forEach((p) => {
    if (!p.code?.trim() || !p.id) return;
    byCode.set(p.code.trim().toLowerCase(), p);
  });

  const locationsByCode = new Map<string, InventoryInLocationLookup>();
  for (const loc of options?.locations ?? []) {
    if (!loc.id || !loc.code?.trim()) continue;
    locationsByCode.set(normalizeLocationCode(loc.code), loc);
  }

  const rows: ParsedInventoryInRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const source = aoa[i] || [];
    const rawCode = String(source[codeIdx] ?? '').trim();
    const rawQty = parseNumericCell(source[qtyIdx]);
    const locationCode = locationIdx >= 0 ? normalizeLocationCode(source[locationIdx]) : '';
    if (!rawCode && !rawQty && !locationCode) continue;

    const errors: string[] = [];
    const product = byCode.get(rawCode.toLowerCase());
    if (!rawCode) errors.push(`كود ${itemLabel} مطلوب.`);
    if (!product) errors.push(`كود ${itemLabel} غير موجود: ${rawCode || '—'}`);
    if (!Number.isFinite(rawQty) || rawQty <= 0) errors.push('الكمية يجب أن تكون أكبر من صفر.');

    let locationId: string | undefined;
    let locationWarehouseId: string | undefined;
    if (locationCode) {
      const loc = locationsByCode.get(locationCode);
      if (!loc) {
        errors.push(`كود اللوكيشن غير موجود: ${locationCode}`);
      } else if (loc.isActive === false) {
        errors.push(`اللوكيشن موقوف: ${locationCode}`);
      } else {
        locationId = loc.id;
        locationWarehouseId = loc.warehouseId;
      }
    }

    rows.push({
      rowIndex: i + 1,
      productCode: rawCode,
      quantity: Number.isFinite(rawQty) ? rawQty : 0,
      productId: product?.id || '',
      productName: product?.name || '',
      locationCode,
      locationId,
      locationWarehouseId,
      errors,
    });
  }

  return {
    rows,
    totalRows: rows.length,
    validCount: rows.filter((r) => r.errors.length === 0).length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
  };
}

export function parseInventoryInByCodeExcel(
  file: File,
  items: ImportLookupItem[],
  options?: ParseInventoryInByCodeOptions,
): Promise<InventoryInImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        resolve(parseInventoryInByCodeFromBuffer(data, items, options));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
