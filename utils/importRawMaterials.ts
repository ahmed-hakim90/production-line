import * as XLSX from 'xlsx';

export interface ParsedRawMaterialImportRow {
  rowIndex: number;
  name: string;
  code: string;
  unit: string;
  minStock: number;
  isActive: boolean;
  errors: string[];
}

export interface RawMaterialImportResult {
  rows: ParsedRawMaterialImportRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

const HEADER_MAP: Record<string, 'name' | 'code' | 'unit' | 'minStock' | 'isActive'> = {
  'اسم المادة': 'name',
  'اسم المادة الخام': 'name',
  'name': 'name',
  'material name': 'name',
  'الكود': 'code',
  'كود المادة': 'code',
  'كود المادة الخام': 'code',
  'code': 'code',
  'unit code': 'code',
  'الوحدة': 'unit',
  'unit': 'unit',
  'الحد الأدنى': 'minStock',
  'الحد الادنى': 'minStock',
  'min stock': 'minStock',
  'minstock': 'minStock',
  'الحالة': 'isActive',
  'نشط': 'isActive',
  'active': 'isActive',
  'is active': 'isActive',
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const parseActiveFlag = (value: unknown): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return true;
  if (['1', 'true', 'yes', 'y', 'active', 'نشط', 'نعم'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'inactive', 'غير نشط', 'لا'].includes(raw)) return false;
  return true;
};

export function parseRawMaterialsExcel(file: File): Promise<RawMaterialImportResult> {
  return new Promise((resolve, reject) => {
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
        const nameIdx = headers.findIndex((h) => HEADER_MAP[h] === 'name');
        const codeIdx = headers.findIndex((h) => HEADER_MAP[h] === 'code');
        const unitIdx = headers.findIndex((h) => HEADER_MAP[h] === 'unit');
        const minStockIdx = headers.findIndex((h) => HEADER_MAP[h] === 'minStock');
        const isActiveIdx = headers.findIndex((h) => HEADER_MAP[h] === 'isActive');

        if (nameIdx < 0 || codeIdx < 0) {
          throw new Error('القالب غير صحيح. الأعمدة المطلوبة: اسم المادة + الكود.');
        }

        const rows: ParsedRawMaterialImportRow[] = [];
        const seenCodes = new Set<string>();
        for (let i = 1; i < aoa.length; i++) {
          const source = aoa[i] || [];
          const name = String(source[nameIdx] ?? '').trim();
          const code = String(source[codeIdx] ?? '').trim().toUpperCase();
          const unit = String(unitIdx >= 0 ? source[unitIdx] ?? '' : '').trim() || 'unit';
          const minStockValue = Number(minStockIdx >= 0 ? source[minStockIdx] ?? 0 : 0);
          const isActive = parseActiveFlag(isActiveIdx >= 0 ? source[isActiveIdx] : true);

          if (!name && !code) continue;

          const errors: string[] = [];
          if (!name) errors.push('اسم المادة مطلوب.');
          if (!code) errors.push('كود المادة مطلوب.');
          if (!Number.isFinite(minStockValue) || minStockValue < 0) {
            errors.push('الحد الأدنى يجب أن يكون رقمًا >= 0.');
          }
          if (code) {
            if (seenCodes.has(code)) errors.push(`الكود مكرر داخل الملف: ${code}`);
            seenCodes.add(code);
          }

          rows.push({
            rowIndex: i + 1,
            name,
            code,
            unit,
            minStock: Number.isFinite(minStockValue) ? minStockValue : 0,
            isActive,
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
