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
    chineseUnitCost: boolean;
    innerBoxCost: boolean;
    outerCartonCost: boolean;
    unitsPerCarton: boolean;
    sellingPrice: boolean;
    routingTargetUnitSeconds: boolean;
  };
  name: string;
  code: string;
  model: string;
  chineseUnitCost: number;
  innerBoxCost: number;
  outerCartonCost: number;
  unitsPerCarton: number;
  sellingPrice: number;
  /** Parsed seconds/unit when column present; 0 means empty or invalid cell */
  routingTargetUnitSeconds: number;
  materials: ParsedProductMaterialInput[];
  errors: string[];
  changes?: string[];
}

export interface ParsedProductMaterialInput {
  productCode: string;
  materialCode?: string;
  materialName: string;
  quantityUsed: number;
  unitCost: number;
  matchedMaterialId?: string;
  matchedMaterialName?: string;
  matchedMaterialUnit?: string;
}

export interface ProductImportResult {
  rows: ParsedProductRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  newCount: number;
  updateCount: number;
  fileErrors?: string[];
}

export interface ProductImportMaterialCatalogItem {
  id?: string;
  code?: string;
  name: string;
  baseUnit?: string;
  isActive?: boolean;
}

export interface ProductImportParseOptions {
  manufacturingMaterials?: ProductImportMaterialCatalogItem[];
  validateManufacturingMaterials?: boolean;
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
  'تارجت المتوقع تقارير (ث)': 'routingTargetUnitSeconds',
  'تارجت تقارير (ث)': 'routingTargetUnitSeconds',
  'تارجت المتوقع (ث)': 'routingTargetUnitSeconds',
};

const MATERIAL_HEADER_MAP: Record<string, string> = {
  'كود المنتج': 'productCode',
  'الكود': 'productCode',
  'كود': 'productCode',
  'كود المادة': 'materialCode',
  'كود المادة الخام': 'materialCode',
  'كود خامة': 'materialCode',
  'كود الخامة': 'materialCode',
  'material code': 'materialCode',
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
  if ((existing.chineseUnitCost || 0) !== next.chineseUnitCost) changes.push(`تكلفة صينية`);
  if ((existing.innerBoxCost || 0) !== next.innerBoxCost) changes.push(`علبة داخلية`);
  if ((existing.outerCartonCost || 0) !== next.outerCartonCost) changes.push(`كرتونة خارجية`);
  if ((existing.unitsPerCarton || 0) !== next.unitsPerCarton) changes.push(`وحدات/كرتونة`);
  if ((existing.sellingPrice || 0) !== next.sellingPrice) changes.push(`سعر البيع`);
  const prevT = existing.routingTargetUnitSeconds;
  const nextT = next.routingTargetUnitSeconds;
  if ((prevT ?? 0) !== (nextT ?? 0)) changes.push(`تارجت التقارير (ث/وحدة)`);
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

function normalizeLookupKey(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function uniqueByIdOrCode(rows: ProductImportMaterialCatalogItem[]): ProductImportMaterialCatalogItem[] {
  const seen = new Set<string>();
  const unique: ProductImportMaterialCatalogItem[] = [];
  for (const row of rows) {
    const key = row.id || row.code || row.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function buildMaterialLookup(materials: ProductImportMaterialCatalogItem[]) {
  const byCode = new Map<string, ProductImportMaterialCatalogItem[]>();
  const byName = new Map<string, ProductImportMaterialCatalogItem[]>();
  for (const material of materials) {
    const codeKey = normalizeLookupKey(material.code);
    if (codeKey) byCode.set(codeKey, [...(byCode.get(codeKey) ?? []), material]);
    const nameKey = normalizeLookupKey(material.name);
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), material]);
  }
  return { byCode, byName };
}

export function resolveProductImportMaterial(
  input: Pick<ParsedProductMaterialInput, 'materialCode' | 'materialName'>,
  materials: ProductImportMaterialCatalogItem[],
): { material?: ProductImportMaterialCatalogItem; error?: string } {
  const lookup = buildMaterialLookup(materials);
  const code = String(input.materialCode || '').trim();
  const name = String(input.materialName || '').trim();
  const candidates = code
    ? lookup.byCode.get(normalizeLookupKey(code)) ?? []
    : lookup.byName.get(normalizeLookupKey(name)) ?? [];
  const label = code ? `كود المادة "${code}"` : `اسم المادة "${name}"`;

  if (candidates.length === 0) {
    return { error: `لم يتم العثور على ${label} في مواد التصنيع` };
  }

  const uniqueCandidates = uniqueByIdOrCode(candidates);
  if (uniqueCandidates.length > 1) {
    return { error: `${label} يطابق أكثر من مادة تصنيع؛ استخدم كود مادة فريد` };
  }

  const material = uniqueCandidates[0];
  if (!material.id) {
    return { error: `${label} لا يحتوي على معرّف صالح في كتالوج مواد التصنيع` };
  }
  if (material.isActive === false) {
    return { error: `${label} يطابق مادة غير نشطة` };
  }

  return { material };
}

// ─── Main parse function ────────────────────────────────────────────────────

export function parseProductsExcel(
  file: File,
  existingProducts: FirestoreProduct[],
  options: ProductImportParseOptions = {},
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
          chineseUnitCost: hasField('chineseUnitCost'),
          innerBoxCost: hasField('innerBoxCost'),
          outerCartonCost: hasField('outerCartonCost'),
          unitsPerCarton: hasField('unitsPerCarton'),
          sellingPrice: hasField('sellingPrice'),
          routingTargetUnitSeconds: hasField('routingTargetUnitSeconds'),
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
          const chineseUnitCost = Number(getValue('chineseUnitCost')) || 0;
          const innerBoxCost = Number(getValue('innerBoxCost')) || 0;
          const outerCartonCost = Number(getValue('outerCartonCost')) || 0;
          const unitsPerCarton = Number(getValue('unitsPerCarton')) || 0;
          const sellingPrice = Number(getValue('sellingPrice')) || 0;
          const routingRaw = getValue('routingTargetUnitSeconds');
          const routingTargetUnitSecondsParsed = Number(routingRaw);
          const routingTargetUnitSeconds =
            providedFields.routingTargetUnitSeconds &&
            Number.isFinite(routingTargetUnitSecondsParsed) &&
            routingTargetUnitSecondsParsed > 0
              ? Math.round(routingTargetUnitSecondsParsed)
              : 0;

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
            chineseUnitCost,
            innerBoxCost,
            outerCartonCost,
            unitsPerCarton,
            sellingPrice,
            routingTargetUnitSeconds,
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

        const fileErrors: string[] = [];
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
              const materialCode = String(getMaterialValue('materialCode') ?? '').trim();
              const materialName = String(getMaterialValue('materialName') ?? '').trim();
              const quantityUsed = Number(getMaterialValue('quantityUsed')) || 0;
              const unitCost = Number(getMaterialValue('unitCost')) || 0;

              if (!productCode || (!materialCode && !materialName)) return;

              const targetProduct = productRowsByCode.get(productCode.toLowerCase());
              if (!targetProduct) {
                fileErrors.push(`صف مادة خام ${idx + 2}: كود المنتج "${productCode}" غير موجود في شيت المنتجات`);
                return;
              }

              let matchedMaterial: ProductImportMaterialCatalogItem | undefined;
              if (options.validateManufacturingMaterials === true) {
                const resolved = resolveProductImportMaterial(
                  { materialCode: materialCode || undefined, materialName },
                  options.manufacturingMaterials ?? [],
                );
                if (resolved.error) {
                  targetProduct.errors.push(`صف مادة خام ${idx + 2}: ${resolved.error}`);
                }
                matchedMaterial = resolved.material;
              }

              targetProduct.materials.push({
                productCode,
                materialCode: materialCode || undefined,
                materialName,
                quantityUsed,
                unitCost,
                matchedMaterialId: matchedMaterial?.id,
                matchedMaterialName: matchedMaterial?.name,
                matchedMaterialUnit: matchedMaterial?.baseUnit,
              });

              if (quantityUsed <= 0 || unitCost < 0) {
                targetProduct.errors.push(`صف مادة خام ${idx + 2}: الكمية يجب أن تكون أكبر من 0 والتكلفة لا تقل عن 0`);
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
          fileErrors,
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
    openingBalance: 0,
    chineseUnitCost: row.providedFields.chineseUnitCost ? row.chineseUnitCost : base.chineseUnitCost,
    innerBoxCost: row.providedFields.innerBoxCost ? row.innerBoxCost : base.innerBoxCost,
    outerCartonCost: row.providedFields.outerCartonCost ? row.outerCartonCost : base.outerCartonCost,
    unitsPerCarton: row.providedFields.unitsPerCarton ? row.unitsPerCarton : base.unitsPerCarton,
    sellingPrice: row.providedFields.sellingPrice ? row.sellingPrice : base.sellingPrice,
    routingTargetUnitSeconds:
      row.providedFields.routingTargetUnitSeconds && row.routingTargetUnitSeconds > 0
        ? row.routingTargetUnitSeconds
        : undefined,
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
    routingTargetUnitSeconds:
      existing.routingTargetUnitSeconds != null && Number(existing.routingTargetUnitSeconds) > 0
        ? Math.round(Number(existing.routingTargetUnitSeconds))
        : undefined,
  };
  return {
    name: row.providedFields.name ? row.name : base.name,
    code: row.providedFields.code ? row.code : base.code,
    model: row.providedFields.model ? row.model : base.model,
    openingBalance: base.openingBalance,
    chineseUnitCost: row.providedFields.chineseUnitCost ? row.chineseUnitCost : base.chineseUnitCost,
    innerBoxCost: row.providedFields.innerBoxCost ? row.innerBoxCost : base.innerBoxCost,
    outerCartonCost: row.providedFields.outerCartonCost ? row.outerCartonCost : base.outerCartonCost,
    unitsPerCarton: row.providedFields.unitsPerCarton ? row.unitsPerCarton : base.unitsPerCarton,
    sellingPrice: row.providedFields.sellingPrice ? row.sellingPrice : base.sellingPrice,
    routingTargetUnitSeconds: row.providedFields.routingTargetUnitSeconds
      ? row.routingTargetUnitSeconds > 0
        ? row.routingTargetUnitSeconds
        : undefined
      : base.routingTargetUnitSeconds,
  };
}
