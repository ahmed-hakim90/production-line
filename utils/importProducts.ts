/**
 * Excel Import Utility for Products — parse .xlsx/.xls into FirestoreProduct data.
 * Supports both creating new products and updating existing ones (matched by code).
 */
import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportAction = 'create' | 'update';

export interface ParsedProductRow {
  rowIndex: number;
  action: ImportAction;
  matchedId?: string;
  currentCode?: string;
  newCode?: string;
  providedFields: {
    name: boolean;
    code: boolean;
    model: boolean;
    openingBalance: boolean;
    chineseUnitCost: boolean;
    innerBoxCost: boolean;
    outerCartonCost: boolean;
    unitsPerCarton: boolean;
    sellingPrice: boolean;
  };
  name: string;
  code: string;
  model: string;
  openingBalance: number;
  chineseUnitCost: number;
  innerBoxCost: number;
  outerCartonCost: number;
  unitsPerCarton: number;
  sellingPrice: number;
  materials: ParsedProductMaterialInput[];
  errors: string[];
  changes?: string[];
}

export interface ParsedProductMaterialInput {
  materialName: string;
  quantityUsed: number;
  unitCost: number;
}

export interface ProductImportResult {
  rows: ParsedProductRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  newCount: number;
  updateCount: number;
}

// ─── Header mapping (Arabic → field) ────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'اسم المنتج': 'name',
  'اسم متعدل': 'name',
  'المنتج': 'name',
  'الاسم': 'name',
  'اسم': 'name',
  'الكود': 'code',
  'كود': 'code',
  'كود المنتج': 'code',
  'الكود الحالي': 'currentCode',
  'كود حالي': 'currentCode',
  'الكود الجديد': 'newCode',
  'كود جديد': 'newCode',
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
  'سعر البيع': 'sellingPrice',
  'سعر بيع': 'sellingPrice',
  'سعر': 'sellingPrice',
};

const MATERIAL_HEADER_MAP: Record<string, string> = {
  'كود المنتج': 'productCode',
  'الكود': 'productCode',
  'كود': 'productCode',
  'اسم المادة الخام': 'materialName',
  'المادة الخام': 'materialName',
  'المادة': 'materialName',
  'الكمية المستخدمة': 'quantityUsed',
  'الكمية': 'quantityUsed',
  'الكمية/وحدة': 'quantityUsed',
  'تكلفة الوحدة': 'unitCost',
  'تكلفة': 'unitCost',
  'سعر الوحدة': 'unitCost',
};

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, ' ');
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

interface ProductLookup {
  byCode: Map<string, FirestoreProduct>;
  byName: Map<string, FirestoreProduct>;
}

function buildLookup(products: FirestoreProduct[]): ProductLookup {
  const byCode = new Map<string, FirestoreProduct>();
  const byName = new Map<string, FirestoreProduct>();
  for (const p of products) {
    byCode.set(p.code.trim().toLowerCase(), p);
    byName.set(p.name.trim().toLowerCase(), p);
  }
  return { byCode, byName };
}

function describeChanges(existing: FirestoreProduct, next: Omit<FirestoreProduct, 'id'>): string[] {
  const changes: string[] = [];
  if (existing.code !== next.code) changes.push(`الكود: ${existing.code} ← ${next.code}`);
  if (existing.name !== next.name) changes.push(`الاسم: ${existing.name} ← ${next.name}`);
  if ((existing.model || '') !== next.model) changes.push(`الفئة`);
  if ((existing.openingBalance || 0) !== next.openingBalance) changes.push(`الرصيد: ${existing.openingBalance || 0} ← ${next.openingBalance}`);
  if ((existing.chineseUnitCost || 0) !== next.chineseUnitCost) changes.push(`تكلفة صينية`);
  if ((existing.innerBoxCost || 0) !== next.innerBoxCost) changes.push(`علبة داخلية`);
  if ((existing.outerCartonCost || 0) !== next.outerCartonCost) changes.push(`كرتونة خارجية`);
  if ((existing.unitsPerCarton || 0) !== next.unitsPerCarton) changes.push(`وحدات/كرتونة`);
  if ((existing.sellingPrice || 0) !== next.sellingPrice) changes.push(`سعر البيع`);
  return changes;
}

function resolveProductsSheetName(sheetNames: string[]): string {
  const productsSheet = sheetNames.find((n) => /منتج|products?/i.test(n));
  return productsSheet ?? sheetNames[0];
}

function resolveMaterialsSheetName(sheetNames: string[], productsSheetName: string): string | null {
  const preferred = sheetNames.find((n) => /مواد|material/i.test(n));
  if (preferred) return preferred;
  const fallback = sheetNames.find((n) => n !== productsSheetName);
  return fallback ?? null;
}

function isMaterialRowEmpty(row: Record<string, any>): boolean {
  return Object.values(row).every((v) => String(v ?? '').trim() === '');
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
        const productsSheetName = resolveProductsSheetName(wb.SheetNames);
        const ws = wb.Sheets[productsSheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (jsonRows.length === 0) {
          resolve({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, newCount: 0, updateCount: 0 });
          return;
        }

        const rawHeaders = Object.keys(jsonRows[0]);
        const headerMapping: Record<string, string> = {};
        for (const rawH of rawHeaders) {
          const norm = normalizeHeader(rawH);
          const mapped = HEADER_MAP[norm];
          if (mapped) headerMapping[rawH] = mapped;
        }
        const hasField = (field: string) => rawHeaders.some((h) => headerMapping[h] === field);
        const providedFields = {
          name: hasField('name'),
          code: hasField('code') || hasField('newCode'),
          model: hasField('model'),
          openingBalance: hasField('openingBalance'),
          chineseUnitCost: hasField('chineseUnitCost'),
          innerBoxCost: hasField('innerBoxCost'),
          outerCartonCost: hasField('outerCartonCost'),
          unitsPerCarton: hasField('unitsPerCarton'),
          sellingPrice: hasField('sellingPrice'),
        };

        const lookup = buildLookup(existingProducts);
        const seenTargetCodes = new Set<string>();

        const rows: ParsedProductRow[] = jsonRows.map((row, idx) => {
          const errors: string[] = [];

          const getValue = (field: string): any => {
            const key = rawHeaders.find((h) => headerMapping[h] === field);
            return key ? row[key] : undefined;
          };

          const name = String(getValue('name') ?? '').trim();

          const legacyCode = String(getValue('code') ?? '').trim();
          const currentCode = String(getValue('currentCode') ?? '').trim();
          const explicitNewCode = String(getValue('newCode') ?? '').trim();

          const matchCode = currentCode || legacyCode;
          const existingByMatchCode = matchCode ? lookup.byCode.get(matchCode.toLowerCase()) : undefined;
          const fallbackCode = existingByMatchCode?.code ?? '';
          const targetCode = explicitNewCode || legacyCode || fallbackCode;
          const existingByTargetCode = targetCode ? lookup.byCode.get(targetCode.toLowerCase()) : undefined;
          const matched = existingByMatchCode ?? existingByTargetCode;
          const action: ImportAction = matched ? 'update' : 'create';
          const matchedId = matched?.id;

          if (action === 'create' && !name) errors.push('اسم المنتج مفقود');
          if (action === 'update' && providedFields.name && !name) errors.push('اسم المنتج مفقود');

          if (!targetCode) errors.push('الكود مفقود (أدخل "الكود" أو "الكود الجديد" أو "الكود الحالي" لمنتج موجود)');
          else if (seenTargetCodes.has(targetCode.toLowerCase())) {
            errors.push(`الكود النهائي "${targetCode}" مكرر في الملف`);
          }
          if (targetCode) seenTargetCodes.add(targetCode.toLowerCase());

          const model = String(getValue('model') ?? '').trim();
          const openingBalance = Number(getValue('openingBalance')) || 0;
          const chineseUnitCost = Number(getValue('chineseUnitCost')) || 0;
          const innerBoxCost = Number(getValue('innerBoxCost')) || 0;
          const outerCartonCost = Number(getValue('outerCartonCost')) || 0;
          const unitsPerCarton = Number(getValue('unitsPerCarton')) || 0;
          const sellingPrice = Number(getValue('sellingPrice')) || 0;

          if (action === 'create' && currentCode) {
            errors.push(`الكود الحالي "${currentCode}" غير موجود`);
          }

          if (targetCode) {
            const targetOwner = lookup.byCode.get(targetCode.toLowerCase());
            if (targetOwner && matchedId && targetOwner.id !== matchedId) {
              errors.push(`الكود الجديد "${targetCode}" مستخدم بواسطة منتج آخر`);
            }
            if (targetOwner && action === 'create') {
              errors.push(`الكود "${targetCode}" مستخدم بالفعل`);
            }
          }

          const parsed: ParsedProductRow = {
            rowIndex: idx + 2,
            action,
            matchedId,
            currentCode: currentCode || undefined,
            newCode: explicitNewCode || undefined,
            providedFields,
            name,
            code: targetCode,
            model,
            openingBalance,
            chineseUnitCost,
            innerBoxCost,
            outerCartonCost,
            unitsPerCarton,
            sellingPrice,
            materials: [],
            errors,
          };

          if (action === 'update' && matched && errors.length === 0) {
            parsed.changes = describeChanges(matched, toProductDataWithExisting(parsed, matched));
          }

          return parsed;
        });

        const productRowsByCode = new Map<string, ParsedProductRow>();
        rows.forEach((r) => {
          if (r.code) productRowsByCode.set(r.code.trim().toLowerCase(), r);
          if (r.currentCode) productRowsByCode.set(r.currentCode.trim().toLowerCase(), r);
        });

        const materialsSheetName = resolveMaterialsSheetName(wb.SheetNames, productsSheetName);
        if (materialsSheetName) {
          const materialsSheet = wb.Sheets[materialsSheetName];
          const materialRows = XLSX.utils.sheet_to_json<Record<string, any>>(materialsSheet, { defval: '' });

          if (materialRows.length > 0) {
            const rawMaterialHeaders = Object.keys(materialRows[0]);
            const materialHeaderMapping: Record<string, string> = {};
            for (const rawH of rawMaterialHeaders) {
              const norm = normalizeHeader(rawH);
              const mapped = MATERIAL_HEADER_MAP[norm];
              if (mapped) materialHeaderMapping[rawH] = mapped;
            }

            materialRows.forEach((materialRow, idx) => {
              if (isMaterialRowEmpty(materialRow)) return;

              const getMaterialValue = (field: string): any => {
                const key = rawMaterialHeaders.find((h) => materialHeaderMapping[h] === field);
                return key ? materialRow[key] : undefined;
              };

              const productCode = String(getMaterialValue('productCode') ?? '').trim();
              const materialName = String(getMaterialValue('materialName') ?? '').trim();
              const quantityUsed = Number(getMaterialValue('quantityUsed')) || 0;
              const unitCost = Number(getMaterialValue('unitCost')) || 0;

              if (!productCode || !materialName) return;

              const targetProduct = productRowsByCode.get(productCode.toLowerCase());
              if (!targetProduct) return;

              targetProduct.materials.push({
                materialName,
                quantityUsed,
                unitCost,
              });

              if (quantityUsed < 0 || unitCost < 0) {
                targetProduct.errors.push(`صف مادة خام ${idx + 2}: الكمية والتكلفة يجب أن تكونا >= 0`);
              }
            });
          }
        }

        const validRows = rows.filter((r) => r.errors.length === 0);
        const newCount = validRows.filter((r) => r.action === 'create').length;
        const updateCount = validRows.filter((r) => r.action === 'update').length;

        resolve({
          rows,
          totalRows: rows.length,
          validCount: validRows.length,
          errorCount: rows.length - validRows.length,
          newCount,
          updateCount,
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
  const fallback: Omit<FirestoreProduct, 'id'> = {
    name: '',
    code: '',
    model: '',
    openingBalance: 0,
    chineseUnitCost: 0,
    innerBoxCost: 0,
    outerCartonCost: 0,
    unitsPerCarton: 0,
    sellingPrice: 0,
  };
  const base = fallback;
  return {
    name: row.providedFields.name ? row.name : base.name,
    code: row.providedFields.code ? row.code : base.code,
    model: row.providedFields.model ? row.model : base.model,
    openingBalance: row.providedFields.openingBalance ? row.openingBalance : base.openingBalance,
    chineseUnitCost: row.providedFields.chineseUnitCost ? row.chineseUnitCost : base.chineseUnitCost,
    innerBoxCost: row.providedFields.innerBoxCost ? row.innerBoxCost : base.innerBoxCost,
    outerCartonCost: row.providedFields.outerCartonCost ? row.outerCartonCost : base.outerCartonCost,
    unitsPerCarton: row.providedFields.unitsPerCarton ? row.unitsPerCarton : base.unitsPerCarton,
    sellingPrice: row.providedFields.sellingPrice ? row.sellingPrice : base.sellingPrice,
  };
}

export function toProductDataWithExisting(
  row: ParsedProductRow,
  existing: FirestoreProduct,
): Omit<FirestoreProduct, 'id'> {
  const base: Omit<FirestoreProduct, 'id'> = {
    name: existing.name || '',
    code: existing.code || '',
    model: existing.model || '',
    openingBalance: Number(existing.openingBalance || 0),
    chineseUnitCost: Number(existing.chineseUnitCost || 0),
    innerBoxCost: Number(existing.innerBoxCost || 0),
    outerCartonCost: Number(existing.outerCartonCost || 0),
    unitsPerCarton: Number(existing.unitsPerCarton || 0),
    sellingPrice: Number(existing.sellingPrice || 0),
  };
  return {
    name: row.providedFields.name ? row.name : base.name,
    code: row.providedFields.code ? row.code : base.code,
    model: row.providedFields.model ? row.model : base.model,
    openingBalance: row.providedFields.openingBalance ? row.openingBalance : base.openingBalance,
    chineseUnitCost: row.providedFields.chineseUnitCost ? row.chineseUnitCost : base.chineseUnitCost,
    innerBoxCost: row.providedFields.innerBoxCost ? row.innerBoxCost : base.innerBoxCost,
    outerCartonCost: row.providedFields.outerCartonCost ? row.outerCartonCost : base.outerCartonCost,
    unitsPerCarton: row.providedFields.unitsPerCarton ? row.unitsPerCarton : base.unitsPerCarton,
    sellingPrice: row.providedFields.sellingPrice ? row.sellingPrice : base.sellingPrice,
  };
}
