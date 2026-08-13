/**
 * Excel import for manufacturing materials — create/update by business code.
 * Round-trip: export → edit → re-upload merges only provided columns (preserves identity).
 */
import * as XLSX from 'xlsx';
import { toEnglishDigits } from '../lib/englishDigits';
import { normalizeCategoryName } from '../modules/catalog/lib/categoryTree';
import {
  LEGACY_UNIT_TO_BASE,
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  type Material,
  type MaterialType,
  type MaterialUnit,
} from '../modules/manufacturing/types';

export type MaterialImportAction = 'create' | 'update';

export interface MaterialImportCategory {
  id: string;
  name: string;
  breadcrumb?: string;
}

export interface MaterialImportProductRef {
  id: string;
  code: string;
}

export interface ParsedMaterialRow {
  rowIndex: number;
  action: MaterialImportAction;
  matchedId?: string;
  currentCode?: string;
  newCode?: string;
  providedFields: {
    name: boolean;
    code: boolean;
    category: boolean;
    type: boolean;
    baseUnit: boolean;
    purchaseUnit: boolean;
    conversionRate: boolean;
    purchaseCost: boolean;
    wastePercent: boolean;
    minStock: boolean;
    isManufacturedInternally: boolean;
    manufacturedProductCode: boolean;
    availableForSpareParts: boolean;
    isActive: boolean;
  };
  name: string;
  code: string;
  categoryId: string | null;
  categoryName: string;
  type: MaterialType;
  baseUnit: MaterialUnit;
  purchaseUnit: string;
  conversionRate: number;
  purchaseCost: number;
  wastePercent: number;
  minStock: number;
  isManufacturedInternally: boolean;
  manufacturedProductId: string | null;
  manufacturedProductCode: string;
  availableForSpareParts: boolean;
  isActive: boolean;
  errors: string[];
  changes?: string[];
}

export interface MaterialImportResult {
  rows: ParsedMaterialRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  newCount: number;
  updateCount: number;
  fileErrors?: string[];
}

export interface MaterialImportParseOptions {
  categories?: MaterialImportCategory[];
  products?: MaterialImportProductRef[];
}

const HEADER_MAP: Record<string, string> = {
  'اسم المادة': 'name',
  'المادة': 'name',
  'الاسم': 'name',
  'اسم': 'name',
  'الكود': 'code',
  'كود': 'code',
  'كود المادة': 'code',
  'الكود الحالي': 'currentCode',
  'كود حالي': 'currentCode',
  'الكود الجديد': 'newCode',
  'كود جديد': 'newCode',
  'الفئة': 'category',
  'فئة': 'category',
  'فئة المادة': 'category',
  'النوع': 'type',
  'نوع المادة': 'type',
  'الوحدة': 'baseUnit',
  'الوحدة الأساسية': 'baseUnit',
  'وحدة': 'baseUnit',
  'وحدة الشراء': 'purchaseUnit',
  'معامل التحويل': 'conversionRate',
  'معدل التحويل': 'conversionRate',
  'تكلفة الشراء': 'purchaseCost',
  'تكلفة': 'purchaseCost',
  'هالك %': 'wastePercent',
  'نسبة الهالك': 'wastePercent',
  'الهالك': 'wastePercent',
  'الحد الأدنى للمخزون': 'minStock',
  'حد أدنى': 'minStock',
  'مصدر المادة': 'isManufacturedInternally',
  'المصدر': 'isManufacturedInternally',
  'يُصنع داخلياً': 'isManufacturedInternally',
  'يصنع داخليا': 'isManufacturedInternally',
  'التصنيع': 'isManufacturedInternally',
  'كود المنتج المرتبط': 'manufacturedProductCode',
  'منتج مرتبط': 'manufacturedProductCode',
  'تظهر في قطع الغيار': 'availableForSpareParts',
  'قطع الغيار': 'availableForSpareParts',
  'متاحة لقطع الغيار': 'availableForSpareParts',
  'الحالة': 'isActive',
  'نشط': 'isActive',
};

const TYPE_BY_LABEL: Record<string, MaterialType> = Object.fromEntries(
  (Object.entries(MATERIAL_TYPE_LABELS) as [MaterialType, string][]).map(([k, v]) => [
    normalizeCategoryName(v),
    k,
  ]),
) as Record<string, MaterialType>;

const UNIT_BY_LABEL: Record<string, MaterialUnit> = Object.fromEntries(
  (Object.entries(MATERIAL_UNIT_LABELS) as [MaterialUnit, string][]).map(([k, v]) => [
    normalizeCategoryName(v),
    k,
  ]),
) as Record<string, MaterialUnit>;

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, ' ');
}

function cellStr(v: unknown): string {
  return toEnglishDigits(String(v ?? '').trim());
}

function parseNumber(v: unknown): number | null {
  const raw = cellStr(v).replace(/,/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseBool(v: unknown): boolean | null {
  const s = normalizeCategoryName(cellStr(v));
  if (!s) return null;
  if ([
    '1',
    'true',
    'yes',
    'y',
    'نعم',
    'ايوه',
    'أيوه',
    'داخلي',
    'داخليًا',
    'تصنيع داخلي',
    'تصنع داخليا',
    'تُصنع داخلياً',
    'يصنع داخليا',
    'يصنع داخليًا',
  ].includes(s)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'لا', 'شراء', 'شراء خارجي', 'خارجي', 'موقوف'].includes(s)) {
    return false;
  }
  return null;
}

function parseActive(v: unknown): boolean | null {
  const s = normalizeCategoryName(cellStr(v));
  if (!s) return null;
  if (['active', 'نشط', 'مفعل', 'مفعّل', '1', 'true', 'yes', 'نعم'].includes(s)) return true;
  if (['inactive', 'موقوف', 'غير نشط', 'معطل', 'معطّل', '0', 'false', 'no', 'لا'].includes(s)) return false;
  const b = parseBool(v);
  return b;
}

/** Yes/no for spare-parts visibility (not conflated with موقوف). */
function parseSparePartsVisibility(v: unknown): boolean | null {
  const s = normalizeCategoryName(cellStr(v));
  if (!s) return null;
  if (['1', 'true', 'yes', 'y', 'نعم', 'ايوه', 'أيوه', 'يظهر', 'تظهر'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'لا', 'لا يظهر', 'لا تظهر', 'مخفي'].includes(s)) return false;
  return null;
}

function parseType(v: unknown): MaterialType | null {
  const raw = cellStr(v);
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/-/g, '_');
  if (key in MATERIAL_TYPE_LABELS) return key as MaterialType;
  return TYPE_BY_LABEL[normalizeCategoryName(raw)] ?? null;
}

function parseUnit(v: unknown): MaterialUnit | null {
  const raw = cellStr(v);
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key in MATERIAL_UNIT_LABELS) return key as MaterialUnit;
  if (LEGACY_UNIT_TO_BASE[key]) return LEGACY_UNIT_TO_BASE[key];
  return UNIT_BY_LABEL[normalizeCategoryName(raw)] ?? null;
}

function normalizeCode(v: unknown): string {
  return cellStr(v).toUpperCase();
}

function buildMaterialLookup(materials: Material[]) {
  const byCode = new Map<string, Material>();
  for (const m of materials) {
    const code = normalizeCode(m.code);
    if (code) byCode.set(code, m);
  }
  return { byCode };
}

function resolveCategory(
  label: string,
  categories: MaterialImportCategory[],
): { id: string | null; name: string; error?: string } {
  const want = normalizeCategoryName(label);
  if (!want) return { id: null, name: '' };
  const byBreadcrumb = categories.find((c) => normalizeCategoryName(c.breadcrumb || '') === want);
  if (byBreadcrumb) return { id: byBreadcrumb.id, name: byBreadcrumb.breadcrumb || byBreadcrumb.name };
  const byName = categories.filter((c) => normalizeCategoryName(c.name) === want);
  if (byName.length === 1) return { id: byName[0].id, name: byName[0].breadcrumb || byName[0].name };
  if (byName.length > 1) {
    return { id: null, name: label, error: `الفئة "${label}" غير فريدة — استخدم المسار الكامل` };
  }
  return { id: null, name: label, error: `الفئة "${label}" غير موجودة` };
}

function describeChanges(existing: Material, next: ParsedMaterialRow): string[] {
  const changes: string[] = [];
  if (next.providedFields.name && (existing.name || '') !== next.name) changes.push('الاسم');
  if (next.providedFields.category && (existing.categoryId || null) !== next.categoryId) changes.push('الفئة');
  if (next.providedFields.type && existing.type !== next.type) changes.push('النوع');
  if (next.providedFields.baseUnit && existing.baseUnit !== next.baseUnit) changes.push('الوحدة');
  if (next.providedFields.purchaseUnit && (existing.purchaseUnit || '') !== next.purchaseUnit) {
    changes.push('وحدة الشراء');
  }
  if (
    next.providedFields.conversionRate &&
    Number(existing.conversionRate ?? 1) !== next.conversionRate
  ) {
    changes.push('معامل التحويل');
  }
  if (next.providedFields.purchaseCost && Number(existing.purchaseCost ?? 0) !== next.purchaseCost) {
    changes.push('تكلفة الشراء');
  }
  if (next.providedFields.wastePercent && Number(existing.wastePercent ?? 0) !== next.wastePercent) {
    changes.push('الهالك');
  }
  if (next.providedFields.minStock && Number(existing.minStock ?? 0) !== next.minStock) {
    changes.push('حد أدنى');
  }
  if (
    next.providedFields.isManufacturedInternally &&
    Boolean(existing.isManufacturedInternally) !== next.isManufacturedInternally
  ) {
    changes.push('التصنيع');
  }
  if (
    next.providedFields.manufacturedProductCode &&
    (existing.manufacturedProductId || null) !== next.manufacturedProductId
  ) {
    changes.push('المنتج المرتبط');
  }
  if (
    next.providedFields.availableForSpareParts &&
    (existing.availableForSpareParts !== false) !== next.availableForSpareParts
  ) {
    changes.push('قطع الغيار');
  }
  if (next.providedFields.isActive && (existing.isActive !== false) !== next.isActive) {
    changes.push('الحالة');
  }
  return changes;
}

function resolveSheetName(sheetNames: string[]): string {
  const preferred = sheetNames.find((n) => /مواد|material/i.test(n));
  return preferred ?? sheetNames[0];
}

export function parseMaterialsFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  existingMaterials: Material[],
  options: MaterialImportParseOptions = {},
): MaterialImportResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = resolveSheetName(wb.SheetNames);
  if (!sheetName) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      newCount: 0,
      updateCount: 0,
      fileErrors: ['الملف لا يحتوي على أوراق'],
    };
  }

  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const fileErrors: string[] = [];
  if (!json.length) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      newCount: 0,
      updateCount: 0,
      fileErrors: ['لا توجد صفوف بيانات'],
    };
  }

  const rawHeaders = Object.keys(json[0] || {});
  const headerMapping: Record<string, string> = {};
  for (const rawH of rawHeaders) {
    const mapped = HEADER_MAP[normalizeHeader(rawH)];
    if (mapped) headerMapping[rawH] = mapped;
  }

  const hasField = (field: string) => rawHeaders.some((h) => headerMapping[h] === field);
  if (!hasField('code') && !hasField('currentCode') && !hasField('newCode')) {
    fileErrors.push('عمود كود المادة مفقود');
  }

  const get = (row: Record<string, unknown>, field: string): unknown => {
    const key = rawHeaders.find((h) => headerMapping[h] === field);
    return key != null ? row[key] : undefined;
  };

  const lookup = buildMaterialLookup(existingMaterials);
  const categories = options.categories ?? [];
  const productsByCode = new Map(
    (options.products ?? []).map((p) => [normalizeCode(p.code), p] as const),
  );
  const targetCodesInFile = new Set<string>();
  const rows: ParsedMaterialRow[] = [];

  json.forEach((raw, idx) => {
    const empty = Object.values(raw).every((v) => cellStr(v) === '');
    if (empty) return;

    const errors: string[] = [];
    const providedFields = {
      name: hasField('name') && cellStr(get(raw, 'name')) !== '',
      code: false,
      category: hasField('category'),
      type: hasField('type') && cellStr(get(raw, 'type')) !== '',
      baseUnit: hasField('baseUnit') && cellStr(get(raw, 'baseUnit')) !== '',
      purchaseUnit: hasField('purchaseUnit') && cellStr(get(raw, 'purchaseUnit')) !== '',
      conversionRate: hasField('conversionRate') && cellStr(get(raw, 'conversionRate')) !== '',
      purchaseCost: hasField('purchaseCost') && cellStr(get(raw, 'purchaseCost')) !== '',
      wastePercent: hasField('wastePercent') && cellStr(get(raw, 'wastePercent')) !== '',
      minStock: hasField('minStock') && cellStr(get(raw, 'minStock')) !== '',
      isManufacturedInternally:
        hasField('isManufacturedInternally') && cellStr(get(raw, 'isManufacturedInternally')) !== '',
      manufacturedProductCode: hasField('manufacturedProductCode'),
      availableForSpareParts:
        hasField('availableForSpareParts') && cellStr(get(raw, 'availableForSpareParts')) !== '',
      isActive: hasField('isActive') && cellStr(get(raw, 'isActive')) !== '',
    };

    const plainCode = normalizeCode(get(raw, 'code'));
    const currentCode = normalizeCode(get(raw, 'currentCode'));
    const newCode = normalizeCode(get(raw, 'newCode'));

    if (currentCode && newCode && currentCode !== newCode) {
      errors.push('تغيير كود المادة عبر الاستيراد غير مدعوم — استخدم عمود «كود المادة» فقط');
    }

    // Identity key only — never renamed via import.
    const targetCode = plainCode || currentCode || newCode;
    providedFields.code = Boolean(targetCode);

    let matched: Material | undefined = targetCode ? lookup.byCode.get(targetCode) : undefined;

    if (!targetCode) errors.push('كود المادة مفقود');
    if (targetCode) {
      if (targetCodesInFile.has(targetCode)) {
        errors.push(`كود المادة "${targetCode}" مكرر في الملف`);
      } else {
        targetCodesInFile.add(targetCode);
      }
    }

    if (hasField('currentCode') && currentCode && !matched && !plainCode) {
      errors.push(`كود المادة "${currentCode}" غير موجود`);
    }

    const name = cellStr(get(raw, 'name'));
    if (!matched && !name) errors.push('اسم المادة مطلوب للإنشاء');

    let categoryId: string | null = null;
    let categoryName = '';
    if (providedFields.category) {
      const catLabel = cellStr(get(raw, 'category'));
      const resolved = resolveCategory(catLabel, categories);
      if (resolved.error) errors.push(resolved.error);
      categoryId = resolved.id;
      categoryName = resolved.name;
    }

    let type: MaterialType = 'raw_material';
    if (providedFields.type) {
      const parsed = parseType(get(raw, 'type'));
      if (!parsed) errors.push('نوع المادة غير معروف');
      else type = parsed;
    }

    let baseUnit: MaterialUnit = 'piece';
    if (providedFields.baseUnit) {
      const parsed = parseUnit(get(raw, 'baseUnit'));
      if (!parsed) errors.push('الوحدة الأساسية غير معروفة');
      else baseUnit = parsed;
    }

    const purchaseUnit = providedFields.purchaseUnit
      ? cellStr(get(raw, 'purchaseUnit'))
      : baseUnit;

    let conversionRate = 1;
    if (providedFields.conversionRate) {
      const n = parseNumber(get(raw, 'conversionRate'));
      if (n == null || n <= 0) errors.push('معامل التحويل يجب أن يكون أكبر من 0');
      else conversionRate = n;
    }

    let purchaseCost = 0;
    if (providedFields.purchaseCost) {
      const n = parseNumber(get(raw, 'purchaseCost'));
      if (n == null || n < 0) errors.push('تكلفة الشراء غير صالحة');
      else purchaseCost = n;
    }

    let wastePercent = 0;
    if (providedFields.wastePercent) {
      const n = parseNumber(get(raw, 'wastePercent'));
      if (n == null || n < 0) errors.push('نسبة الهالك غير صالحة');
      else wastePercent = n;
    }

    let minStock = 0;
    if (providedFields.minStock) {
      const n = parseNumber(get(raw, 'minStock'));
      if (n == null || n < 0) errors.push('الحد الأدنى للمخزون غير صالح');
      else minStock = n;
    }

    let isManufacturedInternally = false;
    if (providedFields.isManufacturedInternally) {
      const b = parseBool(get(raw, 'isManufacturedInternally'));
      if (b == null) errors.push('مصدر المادة غير صالح (استخدم: شراء خارجي أو تُصنع داخلياً)');
      else isManufacturedInternally = b;
    }

    let manufacturedProductId: string | null = null;
    let manufacturedProductCode = '';
    if (providedFields.manufacturedProductCode) {
      manufacturedProductCode = normalizeCode(get(raw, 'manufacturedProductCode'));
      if (manufacturedProductCode) {
        const product = productsByCode.get(manufacturedProductCode);
        if (!product) errors.push(`كود المنتج المرتبط "${manufacturedProductCode}" غير موجود`);
        else manufacturedProductId = product.id;
      }
    }

    let isActive = true;
    if (providedFields.isActive) {
      const a = parseActive(get(raw, 'isActive'));
      if (a == null) errors.push('الحالة غير صالحة (نشط/موقوف)');
      else isActive = a;
    }

    // New materials default off; updates without the column keep existing value.
    let availableForSpareParts = false;
    if (providedFields.availableForSpareParts) {
      const visible = parseSparePartsVisibility(get(raw, 'availableForSpareParts'));
      if (visible == null) errors.push('عمود «تظهر في قطع الغيار» غير صالح (نعم/لا)');
      else availableForSpareParts = visible;
    } else if (matched) {
      availableForSpareParts = matched.availableForSpareParts !== false;
    }

    const action: MaterialImportAction = matched?.id ? 'update' : 'create';
    if (action === 'create' && !providedFields.isManufacturedInternally) {
      errors.push('مصدر المادة مطلوب للإنشاء (شراء خارجي أو تُصنع داخلياً)');
    }
    const effectiveInternalSource = providedFields.isManufacturedInternally
      ? isManufacturedInternally
      : Boolean(matched?.isManufacturedInternally);
    const row: ParsedMaterialRow = {
      rowIndex: idx + 2,
      action,
      matchedId: matched?.id,
      currentCode: undefined,
      newCode: undefined,
      providedFields,
      name: name || matched?.name || '',
      code: targetCode,
      categoryId,
      categoryName,
      type: providedFields.type ? type : matched?.type || type,
      baseUnit: providedFields.baseUnit ? baseUnit : matched?.baseUnit || baseUnit,
      purchaseUnit: effectiveInternalSource
        ? ''
        : providedFields.purchaseUnit
        ? purchaseUnit
        : matched?.purchaseUnit || purchaseUnit,
      conversionRate: effectiveInternalSource
        ? 1
        : providedFields.conversionRate
        ? conversionRate
        : Number(matched?.conversionRate ?? 1) || 1,
      purchaseCost: effectiveInternalSource
        ? 0
        : providedFields.purchaseCost
        ? purchaseCost
        : Number(matched?.purchaseCost ?? 0),
      wastePercent: effectiveInternalSource
        ? 0
        : providedFields.wastePercent
        ? wastePercent
        : Number(matched?.wastePercent ?? 0),
      minStock: providedFields.minStock ? minStock : Number(matched?.minStock ?? 0),
      isManufacturedInternally: effectiveInternalSource,
      manufacturedProductId: providedFields.manufacturedProductCode
        ? manufacturedProductId
        : matched?.manufacturedProductId ?? null,
      manufacturedProductCode,
      availableForSpareParts,
      isActive: providedFields.isActive ? isActive : matched?.isActive !== false,
      errors,
      changes: matched ? undefined : undefined,
    };

    if (matched && errors.length === 0) {
      row.changes = describeChanges(matched, row);
    }

    rows.push(row);
  });

  const importRowByMaterialId = new Map(
    rows
      .filter((row) => row.matchedId)
      .map((row) => [row.matchedId!, row] as const),
  );

  // A target code may currently belong to another imported material when that
  // owner is being renamed in the same file. Validate the final state rather
  // than rejecting safe sequential renumbering against the pre-import state.
  let addedDependencyError = true;
  while (addedDependencyError) {
    addedDependencyError = false;
    for (const row of rows) {
      if (!row.code || !row.matchedId || row.errors.length > 0) continue;
      const owner = lookup.byCode.get(normalizeCode(row.code));
      if (!owner?.id || owner.id === row.matchedId) continue;
      const ownerImportRow = importRowByMaterialId.get(owner.id);
      const ownerVacatesCode =
        ownerImportRow
        && ownerImportRow.errors.length === 0
        && normalizeCode(ownerImportRow.code) !== normalizeCode(row.code);
      if (!ownerVacatesCode) {
        row.errors.push(`كود المادة "${row.code}" مستخدم بواسطة مادة أخرى`);
        addedDependencyError = true;
      }
    }
  }

  const pendingCodeMoves = new Map(
    rows
      .filter((row) =>
        row.errors.length === 0
        && row.matchedId
        && normalizeCode(row.currentCode) !== normalizeCode(row.code))
      .map((row) => [row.matchedId!, row] as const),
  );
  let foundMovableRow = true;
  while (pendingCodeMoves.size > 0 && foundMovableRow) {
    foundMovableRow = false;
    for (const [materialId, row] of pendingCodeMoves) {
      const targetOwner = lookup.byCode.get(normalizeCode(row.code));
      if (!targetOwner?.id || targetOwner.id === materialId || !pendingCodeMoves.has(targetOwner.id)) {
        pendingCodeMoves.delete(materialId);
        foundMovableRow = true;
      }
    }
  }
  for (const row of pendingCodeMoves.values()) {
    row.errors.push('تبادل الأكواد بشكل دائري غير مدعوم؛ استخدم كوداً وسيطاً ثم أعد الرفع');
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  return {
    rows,
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: rows.length - validRows.length,
    newCount: validRows.filter((r) => r.action === 'create').length,
    updateCount: validRows.filter((r) => r.action === 'update').length,
    fileErrors: fileErrors.length ? fileErrors : undefined,
  };
}

export function orderMaterialImportRowsForSave(
  importRows: ParsedMaterialRow[],
  existingMaterials: Material[],
): ParsedMaterialRow[] {
  const ownerByCode = buildMaterialLookup(existingMaterials).byCode;
  const pending = [...importRows];
  const ordered: ParsedMaterialRow[] = [];

  while (pending.length > 0) {
    const pendingMaterialIds = new Set(
      pending.map((row) => row.matchedId).filter((id): id is string => Boolean(id)),
    );
    const readyIndex = pending.findIndex((row) => {
      const targetOwner = ownerByCode.get(normalizeCode(row.code));
      return !targetOwner?.id
        || targetOwner.id === row.matchedId
        || !pendingMaterialIds.has(targetOwner.id);
    });

    if (readyIndex < 0) {
      throw new Error('تعذر ترتيب تحديثات الأكواد؛ يوجد تبادل دائري بين المواد');
    }
    ordered.push(pending.splice(readyIndex, 1)[0]);
  }

  return ordered;
}

export function parseMaterialsExcel(
  file: File,
  existingMaterials: Material[],
  options: MaterialImportParseOptions = {},
): Promise<MaterialImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseMaterialsFromBuffer(reader.result as ArrayBuffer, existingMaterials, options));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}

/** Payload for create — all required Material fields. */
export function toMaterialCreateData(
  row: ParsedMaterialRow,
): Omit<Material, 'id' | 'createdAt' | 'tenantId'> {
  return {
    code: row.code,
    name: row.name,
    type: row.type,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    baseUnit: row.baseUnit,
    purchaseUnit: row.isManufacturedInternally ? undefined : row.purchaseUnit || row.baseUnit,
    conversionRate: row.isManufacturedInternally ? 1 : row.conversionRate || 1,
    purchaseCost: row.isManufacturedInternally ? 0 : row.purchaseCost,
    wastePercent: row.isManufacturedInternally ? 0 : row.wastePercent,
    minStock: row.minStock,
    isManufacturedInternally: row.isManufacturedInternally,
    manufacturedProductId: row.manufacturedProductId || undefined,
    availableForSpareParts: row.availableForSpareParts,
    linkedCostCenterIds: [],
    isActive: row.isActive,
  };
}

/**
 * Merge import row onto existing material — only overwrite provided columns.
 * Never wipes id / tenantId / createdAt / legacyRawMaterialId / linkedCostCenterIds
 * unless those columns are intentionally supported later.
 */
export function toMaterialUpdateData(
  row: ParsedMaterialRow,
  existing: Material,
): Partial<Material> {
  const patch: Partial<Material> = {};
  // Code is identity/match key only — never rewritten on update.
  if (row.providedFields.name) patch.name = row.name;
  if (row.providedFields.category) {
    patch.categoryId = row.categoryId;
    patch.categoryName = row.categoryName;
  }
  if (row.providedFields.type) patch.type = row.type;
  if (row.providedFields.baseUnit) patch.baseUnit = row.baseUnit;
  if (row.providedFields.purchaseUnit) patch.purchaseUnit = row.purchaseUnit;
  if (row.providedFields.conversionRate) patch.conversionRate = row.conversionRate;
  if (row.providedFields.purchaseCost) patch.purchaseCost = row.purchaseCost;
  if (row.providedFields.wastePercent) patch.wastePercent = row.wastePercent;
  if (row.providedFields.minStock) patch.minStock = row.minStock;
  if (row.providedFields.isManufacturedInternally) {
    patch.isManufacturedInternally = row.isManufacturedInternally;
  }
  if (row.providedFields.manufacturedProductCode) {
    patch.manufacturedProductId = row.manufacturedProductId || undefined;
  }
  if (row.providedFields.availableForSpareParts) {
    patch.availableForSpareParts = row.availableForSpareParts;
  }
  if (row.providedFields.isActive) patch.isActive = row.isActive;

  return patch;
}
