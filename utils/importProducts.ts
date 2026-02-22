/**
 * Excel Import Utility for Products — parse .xlsx/.xls into FirestoreProduct data.
 */
import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedProductRow {
  rowIndex: number;
  name: string;
  code: string;
  model: string;
  openingBalance: number;
  chineseUnitCost: number;
  innerBoxCost: number;
  outerCartonCost: number;
  unitsPerCarton: number;
  errors: string[];
}

export interface ProductImportResult {
  rows: ParsedProductRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
}

// ─── Header mapping (Arabic → field) ────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'اسم المنتج': 'name',
  'المنتج': 'name',
  'الاسم': 'name',
  'اسم': 'name',
  'الكود': 'code',
  'كود': 'code',
  'كود المنتج': 'code',
  'الفئة': 'model',
  'فئة': 'model',
  'الموديل': 'model',
  'موديل': 'model',
  'الفئة / الموديل': 'model',
  'النوع': 'model',
  'الرصيد الافتتاحي': 'openingBalance',
  'رصيد افتتاحي': 'openingBalance',
  'الرصيد': 'openingBalance',
  'رصيد': 'openingBalance',
  'تكلفة الوحدة الصينية': 'chineseUnitCost',
  'الوحدة الصينية': 'chineseUnitCost',
  'تكلفة صينية': 'chineseUnitCost',
  'تكلفة العلبة الداخلية': 'innerBoxCost',
  'العلبة الداخلية': 'innerBoxCost',
  'علبة داخلية': 'innerBoxCost',
  'تكلفة الكرتونة الخارجية': 'outerCartonCost',
  'الكرتونة الخارجية': 'outerCartonCost',
  'تكلفة الكرتونة': 'outerCartonCost',
  'كرتونة': 'outerCartonCost',
  'عدد الوحدات في الكرتونة': 'unitsPerCarton',
  'وحدات/كرتونة': 'unitsPerCarton',
  'وحدات الكرتونة': 'unitsPerCarton',
};

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, ' ');
}

// ─── Existing product duplicate check ───────────────────────────────────────

interface ExistingProducts {
  existingNames: Set<string>;
  existingCodes: Set<string>;
}

function buildExistingLookup(products: FirestoreProduct[]): ExistingProducts {
  return {
    existingNames: new Set(products.map((p) => p.name.trim().toLowerCase())),
    existingCodes: new Set(products.map((p) => p.code.trim().toLowerCase())),
  };
}

// ─── Main parse function ────────────────────────────────────────────────────

export function parseProductsExcel(
  file: File,
  existingProducts: FirestoreProduct[],
): Promise<ProductImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (jsonRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
          return;
        }

        const rawHeaders = Object.keys(jsonRows[0]);
        const headerMapping: Record<string, string> = {};
        for (const rawH of rawHeaders) {
          const norm = normalizeHeader(rawH);
          const mapped = HEADER_MAP[norm];
          if (mapped) headerMapping[rawH] = mapped;
        }

        const existing = buildExistingLookup(existingProducts);
        const seenCodes = new Set<string>();

        const rows: ParsedProductRow[] = jsonRows.map((row, idx) => {
          const errors: string[] = [];

          const getValue = (field: string): any => {
            const key = rawHeaders.find((h) => headerMapping[h] === field);
            return key ? row[key] : undefined;
          };

          const name = String(getValue('name') ?? '').trim();
          if (!name) errors.push('اسم المنتج مفقود');
          else if (existing.existingNames.has(name.toLowerCase())) {
            errors.push(`المنتج "${name}" موجود بالفعل`);
          }

          const code = String(getValue('code') ?? '').trim();
          if (!code) errors.push('الكود مفقود');
          else if (existing.existingCodes.has(code.toLowerCase())) {
            errors.push(`الكود "${code}" موجود بالفعل`);
          } else if (seenCodes.has(code.toLowerCase())) {
            errors.push(`الكود "${code}" مكرر في الملف`);
          }
          if (code) seenCodes.add(code.toLowerCase());

          const model = String(getValue('model') ?? '').trim();
          const openingBalance = Number(getValue('openingBalance')) || 0;
          const chineseUnitCost = Number(getValue('chineseUnitCost')) || 0;
          const innerBoxCost = Number(getValue('innerBoxCost')) || 0;
          const outerCartonCost = Number(getValue('outerCartonCost')) || 0;
          const unitsPerCarton = Number(getValue('unitsPerCarton')) || 0;

          return {
            rowIndex: idx + 2,
            name,
            code,
            model,
            openingBalance,
            chineseUnitCost,
            innerBoxCost,
            outerCartonCost,
            unitsPerCarton,
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

export function toProductData(row: ParsedProductRow): Omit<FirestoreProduct, 'id'> {
  return {
    name: row.name,
    code: row.code,
    model: row.model,
    openingBalance: row.openingBalance,
    chineseUnitCost: row.chineseUnitCost,
    innerBoxCost: row.innerBoxCost,
    outerCartonCost: row.outerCartonCost,
    unitsPerCarton: row.unitsPerCarton,
  };
}
