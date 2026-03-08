import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types';

export interface ParsedInventoryInRow {
  rowIndex: number;
  productCode: string;
  quantity: number;
  productId: string;
  productName: string;
  errors: string[];
}

export interface InventoryInImportResult {
  rows: ParsedInventoryInRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

const HEADER_MAP: Record<string, 'productCode' | 'quantity'> = {
  'كود الصنف': 'productCode',
  'كود المنتج': 'productCode',
  'كود المادة الخام': 'productCode',
  'كود الخام': 'productCode',
  'الكود': 'productCode',
  'product code': 'productCode',
  'productcode': 'productCode',
  'code': 'productCode',
  'الكمية': 'quantity',
  'كمية': 'quantity',
  'quantity': 'quantity',
  'qty': 'quantity',
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

type ImportLookupItem = Pick<FirestoreProduct, 'id' | 'name' | 'code'>;

export function parseInventoryInByCodeExcel(
  file: File,
  items: ImportLookupItem[],
  options?: { itemLabel?: string },
): Promise<InventoryInImportResult> {
  return new Promise((resolve, reject) => {
    const itemLabel = options?.itemLabel?.trim() || 'الصنف';
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
          return;
        }

        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        if (aoa.length < 2) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
          return;
        }

        const headers = (aoa[0] || []).map((h) => normalizeHeader(String(h || '')));
        const codeIdx = headers.findIndex((h) => HEADER_MAP[h] === 'productCode');
        const qtyIdx = headers.findIndex((h) => HEADER_MAP[h] === 'quantity');
        if (codeIdx < 0 || qtyIdx < 0) {
          throw new Error('القالب غير صحيح. الأعمدة المطلوبة: الكود + الكمية.');
        }

        const byCode = new Map<string, ImportLookupItem>();
        items.forEach((p) => byCode.set((p.code || '').trim().toLowerCase(), p));

        const rows: ParsedInventoryInRow[] = [];
        for (let i = 1; i < aoa.length; i++) {
          const source = aoa[i] || [];
          const rawCode = String(source[codeIdx] ?? '').trim();
          const rawQty = Number(source[qtyIdx] ?? 0);
          if (!rawCode && !rawQty) continue;
          const errors: string[] = [];
          const product = byCode.get(rawCode.toLowerCase());
          if (!rawCode) errors.push(`كود ${itemLabel} مطلوب.`);
          if (!product) errors.push(`كود ${itemLabel} غير موجود: ${rawCode || '—'}`);
          if (!Number.isFinite(rawQty) || rawQty <= 0) errors.push('الكمية يجب أن تكون أكبر من صفر.');
          rows.push({
            rowIndex: i + 1,
            productCode: rawCode,
            quantity: Number.isFinite(rawQty) ? rawQty : 0,
            productId: product?.id || '',
            productName: product?.name || '',
            errors,
          });
        }

        resolve({
          rows,
          totalRows: rows.length,
          validCount: rows.filter((r) => r.errors.length === 0).length,
          errorCount: rows.filter((r) => r.errors.length > 0).length,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

