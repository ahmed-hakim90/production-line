/**
 * Excel import for product components (BOM) with optional location + absolute balance (جرد).
 * One row = one BOM line; optional رصيد المكون = target quantity via ADJUSTMENT (not cumulative IN).
 */
import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types';
import {
  resolveProductImportMaterial,
  type ProductImportMaterialCatalogItem,
} from './importProducts';

export interface ProductComponentLocationLookup {
  id: string;
  code: string;
  warehouseId: string;
  warehouseName?: string;
  isActive?: boolean;
}

export interface ParsedProductComponentRow {
  rowIndex: number;
  productCode: string;
  productId: string;
  productName: string;
  materialCode: string;
  materialName: string;
  quantityUsed: number;
  unitCost: number;
  locationCode: string;
  locationId?: string;
  locationWarehouseId?: string;
  locationWarehouseName?: string;
  /** True when «رصيد المكون» cell was filled (including 0). */
  balanceProvided: boolean;
  balanceQty: number;
  matchedMaterialId?: string;
  matchedMaterialName?: string;
  matchedMaterialUnit?: string;
  matchedMaterialCode?: string;
  /** True when material code+name are new and will be created on save. */
  willCreateMaterial?: boolean;
  /** Informational: BOM line already exists and will be updated. */
  skipBom?: boolean;
  /** Skip stock movement (e.g. target equals current). */
  skipStock?: boolean;
  skipNotes?: string[];
  errors: string[];
}

export interface ProductComponentMaterialToCreate {
  code: string;
  name: string;
  purchaseCost: number;
}

export interface ProductComponentStockMovementPlan {
  key: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit?: string;
  /** Absolute target quantity (رصيد المكون / الكمية الفعلية). */
  quantity: number;
  /** Current on-hand at plan time (0 if unknown / new). */
  currentQuantity: number;
  /** target − current; posted as ADJUSTMENT.quantity */
  deltaQuantity: number;
  locationId?: string;
  locationCode?: string;
  warehouseId?: string;
  warehouseName?: string;
  willCreateMaterial?: boolean;
  sourceRowIndexes: number[];
}

export interface ProductComponentBomGroup {
  productId: string;
  productCode: string;
  productName: string;
  items: Array<{
    materialId: string;
    materialName: string;
    materialCode: string;
    materialUnit?: string;
    quantityUsed: number;
    unitCost: number;
    willCreateMaterial?: boolean;
  }>;
}

export interface ProductComponentsImportResult {
  rows: ParsedProductComponentRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  bomGroupCount: number;
  stockMovementCount: number;
  newMaterialCount: number;
  skippedBomCount: number;
  skippedStockCount: number;
  needsFallbackWarehouse: boolean;
  bomGroups: ProductComponentBomGroup[];
  stockMovements: ProductComponentStockMovementPlan[];
  materialsToCreate: ProductComponentMaterialToCreate[];
  fileErrors: string[];
}

export interface ProductComponentsExistingLookup {
  /** Keys: `${productId}__${materialId}` — existing BOM lines (for update notes). */
  bomKeys: Set<string>;
  /**
   * Current quantities keyed by stockExistKeyForLocation / stockExistKeyForWarehouse.
   * Used to compute ADJUSTMENT delta toward absolute target.
   */
  stockQtyByKey: Map<string, number>;
}

export function bomExistKey(productId: string, materialId: string): string {
  return `${productId}__${materialId}`;
}

export function stockExistKeyForLocation(materialId: string, locationId: string): string {
  return `${materialId}__loc__${locationId}`;
}

export function stockExistKeyForWarehouse(materialId: string, warehouseId: string): string {
  return `${materialId}__wh__${warehouseId}`;
}

export function stockExistKeyAny(materialId: string): string {
  return `${materialId}__any`;
}

function resolveCurrentStockQty(
  existing: ProductComponentsExistingLookup,
  materialId: string,
  locationId?: string,
  warehouseId?: string,
): number {
  if (locationId) {
    return existing.stockQtyByKey.get(stockExistKeyForLocation(materialId, locationId)) ?? 0;
  }
  if (warehouseId) {
    return existing.stockQtyByKey.get(stockExistKeyForWarehouse(materialId, warehouseId)) ?? 0;
  }
  return 0;
}

/**
 * Annotates existing BOM lines (update, not skip) and builds absolute stock adjustment plans.
 * Empty رصيد المكون → no stock plan. Filled (incl. 0) → target qty; delta 0 → skipStock.
 * Rebuilds bomGroups + stockMovements from actionable rows.
 */
export function applySkipExistingProductComponents(
  result: ProductComponentsImportResult,
  existing: ProductComponentsExistingLookup,
): ProductComponentsImportResult {
  const rows = result.rows.map((row) => {
    if (row.errors.length > 0) return row;
    const skipNotes: string[] = [];
    let skipBom = false;
    let skipStock = false;

    const materialRef =
      row.matchedMaterialId ||
      (row.willCreateMaterial && row.matchedMaterialCode
        ? pendingMaterialRef(row.matchedMaterialCode)
        : '');

    if (materialRef && !materialRef.startsWith('pending:') && row.productId) {
      if (existing.bomKeys.has(bomExistKey(row.productId, materialRef))) {
        // Keep in bomGroups for upsert — note only (skipBom stays false).
        skipNotes.push('مكون BOM موجود — سيتم تحديث الكمية/التكلفة');
      }
    }

    if (row.balanceProvided && materialRef && !materialRef.startsWith('pending:')) {
      const currentQty = resolveCurrentStockQty(
        existing,
        materialRef,
        row.locationId,
        row.locationWarehouseId,
      );
      const delta = Number(row.balanceQty) - currentQty;
      if (delta === 0) {
        skipStock = true;
        skipNotes.push('الرصيد مطابق للحالي — لا تسوية');
      } else {
        skipNotes.push(
          `تسوية رصيد إلى ${row.balanceQty} (الحالي ${currentQty}، فرق ${delta > 0 ? '+' : ''}${delta})`,
        );
      }
    }

    if (skipNotes.length === 0 && !skipBom && !skipStock) return row;
    return { ...row, skipBom, skipStock, skipNotes };
  });

  const actionable = rows.filter((r) => r.errors.length === 0);
  const bomMap = new Map<string, ProductComponentBomGroup>();
  for (const row of actionable) {
    if (!row.productId) continue;
    const materialRef =
      row.matchedMaterialId ||
      (row.willCreateMaterial && row.matchedMaterialCode
        ? pendingMaterialRef(row.matchedMaterialCode)
        : '');
    if (!materialRef) continue;
    let group = bomMap.get(row.productId);
    if (!group) {
      group = {
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        items: [],
      };
      bomMap.set(row.productId, group);
    }
    const existingItem = group.items.find((i) => i.materialId === materialRef);
    if (existingItem) {
      existingItem.quantityUsed = row.quantityUsed;
      existingItem.unitCost = row.unitCost;
    } else {
      group.items.push({
        materialId: materialRef,
        materialName: row.matchedMaterialName || row.materialName,
        materialCode: row.matchedMaterialCode || row.materialCode,
        materialUnit: row.matchedMaterialUnit,
        quantityUsed: row.quantityUsed,
        unitCost: row.unitCost,
        willCreateMaterial: row.willCreateMaterial,
      });
    }
  }

  const stockByKey = new Map<string, ProductComponentStockMovementPlan>();
  for (const row of actionable) {
    if (!row.balanceProvided || row.skipStock) continue;
    const materialRef =
      row.matchedMaterialId ||
      (row.willCreateMaterial && row.matchedMaterialCode
        ? pendingMaterialRef(row.matchedMaterialCode)
        : '');
    if (!materialRef) continue;
    const currentQuantity = materialRef.startsWith('pending:')
      ? 0
      : resolveCurrentStockQty(
          existing,
          materialRef,
          row.locationId,
          row.locationWarehouseId,
        );
    const targetQuantity = Number(row.balanceQty);
    const deltaQuantity = targetQuantity - currentQuantity;
    if (deltaQuantity === 0) continue;

    const key = stockKey(materialRef, row.locationId, row.locationCode);
    const existingPlan = stockByKey.get(key);
    if (!existingPlan) {
      stockByKey.set(key, {
        key,
        materialId: materialRef,
        materialName: row.matchedMaterialName || row.materialName,
        materialCode: row.matchedMaterialCode || row.materialCode,
        materialUnit: row.matchedMaterialUnit,
        quantity: targetQuantity,
        currentQuantity,
        deltaQuantity,
        locationId: row.locationId,
        locationCode: row.locationCode || undefined,
        warehouseId: row.locationWarehouseId,
        warehouseName: row.locationWarehouseName,
        willCreateMaterial: row.willCreateMaterial,
        sourceRowIndexes: [row.rowIndex],
      });
    } else {
      existingPlan.sourceRowIndexes.push(row.rowIndex);
    }
  }

  const bomGroups = Array.from(bomMap.values()).filter((g) => g.items.length > 0);
  const stockMovements = Array.from(stockByKey.values());

  const materialsNeeded = new Set<string>();
  for (const g of bomGroups) {
    for (const item of g.items) {
      if (item.willCreateMaterial) materialsNeeded.add(item.materialCode.trim().toUpperCase());
    }
  }
  for (const m of stockMovements) {
    if (m.willCreateMaterial) materialsNeeded.add(m.materialCode.trim().toUpperCase());
  }
  const materialsToCreate = result.materialsToCreate.filter((m) =>
    materialsNeeded.has(m.code.trim().toUpperCase()),
  );

  return {
    ...result,
    rows,
    bomGroupCount: bomGroups.length,
    stockMovementCount: stockMovements.length,
    newMaterialCount: materialsToCreate.length,
    skippedBomCount: 0,
    skippedStockCount: actionable.filter((r) => r.skipStock).length,
    needsFallbackWarehouse: stockMovements.some((m) => !m.locationId),
    bomGroups,
    stockMovements,
    materialsToCreate,
  };
}

export interface ProductComponentsParseOptions {
  manufacturingMaterials: ProductImportMaterialCatalogItem[];
  locations: ProductComponentLocationLookup[];
}

const HEADER_MAP: Record<string, string> = {
  'كود المنتج': 'productCode',
  'الكود': 'productCode',
  'كود': 'productCode',
  'product code': 'productCode',
  'productcode': 'productCode',
  'كود المادة': 'materialCode',
  'كود المادة الخام': 'materialCode',
  'كود خامة': 'materialCode',
  'كود الخامة': 'materialCode',
  'material code': 'materialCode',
  'materialcode': 'materialCode',
  'اسم المادة': 'materialName',
  'اسم المادة الخام': 'materialName',
  'المادة الخام': 'materialName',
  'المادة': 'materialName',
  'material name': 'materialName',
  'materialname': 'materialName',
  'الكمية المستخدمة': 'quantityUsed',
  'الكمية': 'quantityUsed',
  'الكمية/وحدة': 'quantityUsed',
  'qty': 'quantityUsed',
  'quantity': 'quantityUsed',
  'تكلفة الوحدة': 'unitCost',
  'تكلفة': 'unitCost',
  'سعر الوحدة': 'unitCost',
  'unit cost': 'unitCost',
  'كود اللوكيشن': 'locationCode',
  'كود الموقع': 'locationCode',
  'اللوكيشن': 'locationCode',
  'لوكيشن': 'locationCode',
  'كود الرف': 'locationCode',
  'الرف': 'locationCode',
  'location code': 'locationCode',
  'locationcode': 'locationCode',
  'location': 'locationCode',
  'shelf code': 'locationCode',
  'رصيد المكون': 'balanceQty',
  'رصيد المادة': 'balanceQty',
  'رصيد الخامة': 'balanceQty',
  'رصيد المخزن': 'balanceQty',
  'رصيد اول المدة': 'balanceQty',
  'رصيد أول المدة': 'balanceQty',
  'الرصيد الافتتاحي': 'balanceQty',
  'رصيد افتتاحي': 'balanceQty',
  'رصيد': 'balanceQty',
  'الرصيد': 'balanceQty',
  'الكمية في المخزن': 'balanceQty',
  'كمية الرصيد': 'balanceQty',
  'كمية المخزون': 'balanceQty',
  'opening balance': 'balanceQty',
  'openingbalance': 'balanceQty',
  'stock': 'balanceQty',
  'stock qty': 'balanceQty',
  'stockqty': 'balanceQty',
  'balance': 'balanceQty',
  'balance qty': 'balanceQty',
  'balanceqty': 'balanceQty',
};

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Map a raw Excel header to a known field; supports fuzzy match for balance/location. */
function mapHeader(raw: string): string | undefined {
  const norm = normalizeHeader(raw);
  if (!norm) return undefined;
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];
  // Fuzzy: any header containing balance keywords (and not already a qty/cost column)
  if (/رصيد|افتتاح|stock|balance|opening/.test(norm) && !/تكلفة|سعر|cost|price/.test(norm)) {
    return 'balanceQty';
  }
  if (/لوكيشن|location|shelf|رف/.test(norm) && /كود|code/.test(norm)) {
    return 'locationCode';
  }
  if (/^كمية$|^qty$|^quantity$/.test(norm)) {
    return 'quantityUsed';
  }
  return undefined;
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

/** Normalize location codes so 20–01–0 / 20-01-0 / 20 - 01 - 0 all match. */
function normalizeLocationCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

function stripLeadingZeros(code: string): string {
  const trimmed = code.trim();
  if (!/^\d+$/.test(trimmed)) return trimmed.toLowerCase();
  return trimmed.replace(/^0+/, '') || '0';
}

function isRowEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => String(v ?? '').trim() === '');
}

function stockKey(materialRef: string, locationId: string | undefined, locationCode: string): string {
  if (locationId) return `${materialRef}__loc__${locationId}`;
  const code = locationCode.trim().toUpperCase();
  if (code) return `${materialRef}__loccode__${code}`;
  return `${materialRef}__wh__fallback`;
}

function pendingMaterialRef(code: string): string {
  return `pending:${code.trim().toUpperCase()}`;
}

export function parseProductComponentsFromBuffer(
  data: ArrayBuffer | Uint8Array,
  products: Pick<FirestoreProduct, 'id' | 'name' | 'code'>[],
  options: ProductComponentsParseOptions,
): ProductComponentsImportResult {
  const wb = XLSX.read(data, { type: 'array' });
  const preferredSheet =
    wb.SheetNames.find((n) => /مكون|component|مواد|material|bom/i.test(n)) ?? wb.SheetNames[0];
  const ws = preferredSheet ? wb.Sheets[preferredSheet] : undefined;
  if (!ws) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      bomGroupCount: 0,
      stockMovementCount: 0,
      newMaterialCount: 0,
      skippedBomCount: 0,
      skippedStockCount: 0,
      needsFallbackWarehouse: false,
      bomGroups: [],
      stockMovements: [],
      materialsToCreate: [],
      fileErrors: ['الملف لا يحتوي على شيت صالح.'],
    };
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false, // keep Excel-formatted text when possible (helps product codes)
  });
  if (jsonRows.length === 0) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      bomGroupCount: 0,
      stockMovementCount: 0,
      newMaterialCount: 0,
      skippedBomCount: 0,
      skippedStockCount: 0,
      needsFallbackWarehouse: false,
      bomGroups: [],
      stockMovements: [],
      materialsToCreate: [],
      fileErrors: [],
    };
  }

  const rawHeaders = Object.keys(jsonRows[0]);
  const headerMapping: Record<string, string> = {};
  for (const rawH of rawHeaders) {
    const mapped = mapHeader(rawH);
    if (mapped) headerMapping[rawH] = mapped;
  }

  const hasProductCode = Object.values(headerMapping).includes('productCode');
  const hasMaterial =
    Object.values(headerMapping).includes('materialCode') ||
    Object.values(headerMapping).includes('materialName');
  const hasQty = Object.values(headerMapping).includes('quantityUsed');
  const hasBalance = Object.values(headerMapping).includes('balanceQty');
  const fileErrors: string[] = [];
  if (!hasProductCode || !hasMaterial || !hasQty) {
    fileErrors.push(
      'القالب غير صحيح. الأعمدة المطلوبة: كود المنتج + كود/اسم المادة + الكمية المستخدمة.',
    );
  }
  if (!hasBalance) {
    fileErrors.push(
      'ملاحظة: لم يُعثر على عمود «رصيد المكون» — سيتم حفظ BOM فقط بدون إدخال أرصدة. حمّل «قالب المكونات» أو أضف عمود رصيد المكون.',
    );
  }

  const productsByCode = new Map<string, Pick<FirestoreProduct, 'id' | 'name' | 'code'>>();
  const productsByStrippedCode = new Map<string, Pick<FirestoreProduct, 'id' | 'name' | 'code'>[]>();
  for (const p of products) {
    if (!p.code?.trim() || !p.id) continue;
    const key = p.code.trim().toLowerCase();
    productsByCode.set(key, p);
    const stripped = stripLeadingZeros(p.code);
    const list = productsByStrippedCode.get(stripped) ?? [];
    list.push(p);
    productsByStrippedCode.set(stripped, list);
  }

  const resolveProduct = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return undefined;
    const direct = productsByCode.get(code.toLowerCase());
    if (direct) return direct;
    // Excel often strips leading zeros from numeric product codes (050530 → 50530)
    const stripped = stripLeadingZeros(code);
    const candidates = productsByStrippedCode.get(stripped) ?? [];
    if (candidates.length === 1) return candidates[0];
    return undefined;
  };

  const locationsByCode = new Map<string, ProductComponentLocationLookup>();
  for (const loc of options.locations) {
    if (!loc.code?.trim() || !loc.id) continue;
    locationsByCode.set(normalizeLocationCode(loc.code), loc);
  }

  const rows: ParsedProductComponentRow[] = [];
  jsonRows.forEach((source, idx) => {
    if (isRowEmpty(source)) return;

    const get = (field: string): unknown => {
      const key = rawHeaders.find((h) => headerMapping[h] === field);
      return key ? source[key] : undefined;
    };

    const productCode = String(get('productCode') ?? '').trim();
    const materialCode = String(get('materialCode') ?? '').trim();
    const materialName = String(get('materialName') ?? '').trim();
    const quantityUsed = parseNumericCell(get('quantityUsed'));
    const unitCostRaw = get('unitCost');
    const unitCost =
      unitCostRaw === undefined || String(unitCostRaw).trim() === ''
        ? 0
        : parseNumericCell(unitCostRaw);
    const locationCode = normalizeLocationCode(get('locationCode'));
    const balanceRaw = get('balanceQty');
    const balanceEmpty = balanceRaw === undefined || String(balanceRaw).trim() === '';
    const balanceQty = balanceEmpty ? 0 : parseNumericCell(balanceRaw);
    const balanceProvided = !balanceEmpty;

    const errors: string[] = [];
    if (!productCode) errors.push('كود المنتج مطلوب.');
    const product = productCode ? resolveProduct(productCode) : undefined;
    if (productCode && !product) {
      errors.push(
        `كود المنتج غير موجود: ${productCode}` +
          (/^\d+$/.test(productCode)
            ? ' (تأكد أن العمود نص في Excel حتى لا تُحذف الأصفار من بداية الكود)'
            : ''),
      );
    }

    if (!materialCode && !materialName) {
      errors.push('كود المادة أو اسم المادة مطلوب.');
    }

    let matchedMaterial: ProductImportMaterialCatalogItem | undefined;
    let willCreateMaterial = false;
    if (materialCode || materialName) {
      const resolved = resolveProductImportMaterial(
        { materialCode: materialCode || undefined, materialName },
        options.manufacturingMaterials,
      );
      if (resolved.material) {
        matchedMaterial = resolved.material;
      } else if (materialCode && materialName) {
        // New material: create on save when both code and name are provided.
        willCreateMaterial = true;
      } else if (materialCode && !materialName) {
        errors.push(`كود المادة "${materialCode}" غير موجود؛ أضف اسم المادة لإنشائها تلقائياً.`);
      } else if (resolved.error) {
        errors.push(resolved.error);
      }
    }

    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
      errors.push('الكمية المستخدمة يجب أن تكون أكبر من صفر.');
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      errors.push('تكلفة الوحدة لا تقل عن صفر.');
    }
    if (balanceProvided && (!Number.isFinite(balanceQty) || balanceQty < 0)) {
      errors.push('رصيد المكون إن وُجد يجب أن يكون صفر أو أكبر.');
    }

    let locationId: string | undefined;
    let locationWarehouseId: string | undefined;
    let locationWarehouseName: string | undefined;
    if (locationCode) {
      const loc = locationsByCode.get(locationCode);
      if (!loc) {
        errors.push(
          `كود اللوكيشن غير موجود في النظام: ${locationCode}. أنشئه من شاشة اللوكيشنات أولاً، أو اترك العمود فاضي واختر المخزن عند الحفظ.`,
        );
      } else if (loc.isActive === false) {
        errors.push(`اللوكيشن موقوف: ${locationCode}`);
      } else {
        locationId = loc.id;
        locationWarehouseId = loc.warehouseId;
        locationWarehouseName = loc.warehouseName;
      }
    }

    const resolvedCode = (matchedMaterial?.code || materialCode).trim().toUpperCase();
    rows.push({
      rowIndex: idx + 2,
      productCode,
      productId: product?.id || '',
      productName: product?.name || '',
      materialCode,
      materialName: materialName || matchedMaterial?.name || '',
      quantityUsed: Number.isFinite(quantityUsed) ? quantityUsed : 0,
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      locationCode,
      locationId,
      locationWarehouseId,
      locationWarehouseName,
      balanceProvided,
      balanceQty: Number.isFinite(balanceQty) ? balanceQty : 0,
      matchedMaterialId: matchedMaterial?.id,
      matchedMaterialName: matchedMaterial?.name || materialName,
      matchedMaterialUnit: matchedMaterial?.baseUnit || (willCreateMaterial ? 'piece' : undefined),
      matchedMaterialCode: resolvedCode || materialCode,
      willCreateMaterial,
      errors,
    });
  });

  // Detect conflicting names for the same new material code
  const materialsToCreateMap = new Map<string, ProductComponentMaterialToCreate>();
  for (const row of rows) {
    if (row.errors.length > 0 || !row.willCreateMaterial) continue;
    const code = (row.matchedMaterialCode || row.materialCode).trim().toUpperCase();
    const name = (row.matchedMaterialName || row.materialName).trim();
    if (!code || !name) continue;
    const existing = materialsToCreateMap.get(code);
    if (existing && existing.name !== name) {
      const msg = `كود المادة "${code}" له أكثر من اسم لإنشاء مادة جديدة`;
      for (const r of rows) {
        if (
          r.willCreateMaterial &&
          (r.matchedMaterialCode || r.materialCode).trim().toUpperCase() === code &&
          !r.errors.includes(msg)
        ) {
          r.errors.push(msg);
        }
      }
      materialsToCreateMap.delete(code);
      continue;
    }
    if (!existing) {
      materialsToCreateMap.set(code, {
        code,
        name,
        purchaseCost: Number(row.unitCost || 0),
      });
    }
  }

  // Detect conflicting absolute balances for same material/location
  const stockByKey = new Map<string, ProductComponentStockMovementPlan>();
  const stockConflictKeys = new Set<string>();
  for (const row of rows) {
    if (row.errors.length > 0 || !row.balanceProvided) continue;
    const materialRef = row.matchedMaterialId || (row.willCreateMaterial && row.matchedMaterialCode
      ? pendingMaterialRef(row.matchedMaterialCode)
      : '');
    if (!materialRef) continue;

    const key = stockKey(materialRef, row.locationId, row.locationCode);
    const existing = stockByKey.get(key);
    if (!existing) {
      stockByKey.set(key, {
        key,
        materialId: materialRef,
        materialName: row.matchedMaterialName || row.materialName,
        materialCode: row.matchedMaterialCode || row.materialCode,
        materialUnit: row.matchedMaterialUnit,
        quantity: row.balanceQty,
        currentQuantity: 0,
        deltaQuantity: row.balanceQty,
        locationId: row.locationId,
        locationCode: row.locationCode || undefined,
        warehouseId: row.locationWarehouseId,
        warehouseName: row.locationWarehouseName,
        willCreateMaterial: row.willCreateMaterial,
        sourceRowIndexes: [row.rowIndex],
      });
      continue;
    }
    existing.sourceRowIndexes.push(row.rowIndex);
    if (existing.quantity !== row.balanceQty) {
      stockConflictKeys.add(key);
      const msg = `رصيد المكون متعارض لنفس المادة/اللوكيشن (صفوف ${existing.sourceRowIndexes.join('، ')})`;
      for (const r of rows) {
        if (existing.sourceRowIndexes.includes(r.rowIndex) && !r.errors.includes(msg)) {
          r.errors.push(msg);
        }
      }
    }
  }
  for (const key of stockConflictKeys) {
    stockByKey.delete(key);
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  for (const code of Array.from(materialsToCreateMap.keys())) {
    const stillValid = validRows.some(
      (r) =>
        r.willCreateMaterial &&
        (r.matchedMaterialCode || r.materialCode).trim().toUpperCase() === code,
    );
    if (!stillValid) materialsToCreateMap.delete(code);
  }

  const bomMap = new Map<string, ProductComponentBomGroup>();
  for (const row of validRows) {
    if (!row.productId) continue;
    const materialRef = row.matchedMaterialId || (row.willCreateMaterial && row.matchedMaterialCode
      ? pendingMaterialRef(row.matchedMaterialCode)
      : '');
    if (!materialRef) continue;
    let group = bomMap.get(row.productId);
    if (!group) {
      group = {
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        items: [],
      };
      bomMap.set(row.productId, group);
    }
    const existingItem = group.items.find((i) => i.materialId === materialRef);
    if (existingItem) {
      existingItem.quantityUsed = row.quantityUsed;
      existingItem.unitCost = row.unitCost;
    } else {
      group.items.push({
        materialId: materialRef,
        materialName: row.matchedMaterialName || row.materialName,
        materialCode: row.matchedMaterialCode || row.materialCode,
        materialUnit: row.matchedMaterialUnit,
        quantityUsed: row.quantityUsed,
        unitCost: row.unitCost,
        willCreateMaterial: row.willCreateMaterial,
      });
    }
  }

  // Keep only stock plans whose source rows are still valid
  const validRowIndexes = new Set(validRows.map((r) => r.rowIndex));
  const stockMovements = Array.from(stockByKey.values()).filter((plan) =>
    plan.sourceRowIndexes.every((idx) => validRowIndexes.has(idx)),
  );
  const materialsToCreate = Array.from(materialsToCreateMap.values());
  const needsFallbackWarehouse = stockMovements.some((m) => !m.locationId);

  return {
    rows,
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: rows.length - validRows.length,
    bomGroupCount: bomMap.size,
    stockMovementCount: stockMovements.length,
    newMaterialCount: materialsToCreate.length,
    skippedBomCount: 0,
    skippedStockCount: 0,
    needsFallbackWarehouse,
    bomGroups: Array.from(bomMap.values()),
    stockMovements,
    materialsToCreate,
    fileErrors,
  };
}

export function parseProductComponentsExcel(
  file: File,
  products: Pick<FirestoreProduct, 'id' | 'name' | 'code'>[],
  options: ProductComponentsParseOptions,
): Promise<ProductComponentsImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        resolve(parseProductComponentsFromBuffer(data, products, options));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}
