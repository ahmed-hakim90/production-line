import * as XLSX from 'xlsx';
import type { InventoryItemType, StockCountLine, StockItemBalance } from '../types';

type ParsedRow = Record<string, unknown>;

const normalize = (value: unknown) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizeCode = (value: unknown) => String(value ?? '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '');

const findValue = (row: ParsedRow, aliases: string[]): unknown => {
  const wanted = new Set(aliases.map(normalize));
  const key = Object.keys(row).find((candidate) => wanted.has(normalize(candidate)));
  return key ? row[key] : undefined;
};

const parseQty = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/[,٬]/g, '').replace(/[^\d.\-]/g, '');
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
};

export type StockCountCatalogMaterial = {
  id: string;
  code: string;
  name: string;
  unit?: string;
  categoryName?: string;
  minStock?: number;
};

export type StockCountSheetCreateCandidate = {
  rowNo: number;
  itemType: InventoryItemType;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  categoryName: string;
  minStock: number;
  countedQty: number;
  needsSparePart: boolean;
  needsStockBalance: boolean;
};

export type ParseStockCountSheetOptions = {
  /** When true, unknown warehouse codes may resolve from manufacturing materials. */
  allowCreateFromCatalog?: boolean;
  catalogMaterials?: StockCountCatalogMaterial[];
  /** materialIds already present in the branch spare-parts catalog */
  existingPartMaterialIds?: ReadonlySet<string>;
};

export type StockCountSheetResult = {
  lines: StockCountLine[];
  importedRows: number;
  changedRows: number;
  errors: string[];
  warnings: string[];
  createCandidates: StockCountSheetCreateCandidate[];
};

export function parseStockCountSheet(
  data: ArrayBuffer | Uint8Array,
  balances: StockItemBalance[],
  options: ParseStockCountSheetOptions = {},
): StockCountSheetResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return {
      lines: [],
      importedRows: 0,
      changedRows: 0,
      errors: ['الملف لا يحتوي على ورقة بيانات.'],
      warnings: [],
      createCandidates: [],
    };
  }
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  if (rows.length === 0) {
    return {
      lines: [],
      importedRows: 0,
      changedRows: 0,
      errors: ['الملف لا يحتوي على صفوف جرد.'],
      warnings: [],
      createCandidates: [],
    };
  }

  const byCode = new Map<string, StockItemBalance>();
  const byId = new Map<string, StockItemBalance>();
  for (const balance of balances) {
    const code = normalizeCode(balance.itemCode);
    const id = String(balance.itemId || '').trim();
    if (code && !byCode.has(code)) byCode.set(code, balance);
    if (id) byId.set(id, balance);
  }

  const catalogByCode = new Map<string, StockCountCatalogMaterial>();
  const catalogById = new Map<string, StockCountCatalogMaterial>();
  for (const material of options.catalogMaterials || []) {
    const id = String(material.id || '').trim();
    const code = normalizeCode(material.code);
    if (id) catalogById.set(id, material);
    if (code && !catalogByCode.has(code)) catalogByCode.set(code, material);
  }

  const countedByItemId = new Map<string, number>();
  const createByMaterialId = new Map<string, StockCountSheetCreateCandidate>();
  const seen = new Set<string>();
  const errors: string[] = [];
  const warnings: string[] = [];
  const allowCreate = options.allowCreateFromCatalog === true;

  rows.forEach((row, index) => {
    const rowNo = index + 2;
    const itemId = String(findValue(row, ['معرف الصنف', 'item id', 'id']) || '').trim();
    const code = normalizeCode(findValue(row, ['كود الصنف', 'كود المادة', 'item code', 'code', 'sku']));
    const qtyValue = findValue(row, [
      'الكمية الفعلية',
      'الكمية الافتتاحية',
      'أول المدة',
      'اول المدة',
      'الرصيد الفعلي',
      'الكمية المعدودة',
      'actual qty',
      'counted qty',
      'opening qty',
      'quantity',
      'qty',
    ]);
    if (!itemId && !code && qtyValue === '') return;

    const balance = (itemId ? byId.get(itemId) : undefined) || (code ? byCode.get(code) : undefined);
    if (balance) {
      const key = String(balance.itemId || '');
      if (seen.has(key)) {
        errors.push(`صف ${rowNo}: الصنف ${balance.itemCode || balance.itemName} مكرر.`);
        return;
      }
      seen.add(key);
      const quantity = parseQty(qtyValue);
      if (quantity === null) {
        errors.push(`صف ${rowNo}: الكمية الفعلية غير صالحة للصنف ${balance.itemCode || balance.itemName}.`);
        return;
      }
      countedByItemId.set(key, quantity);
      return;
    }

    if (!allowCreate) {
      errors.push(`صف ${rowNo}: الصنف ${code || itemId || 'غير محدد'} غير موجود في المخزن المحدد.`);
      return;
    }

    const material = (itemId ? catalogById.get(itemId) : undefined)
      || (code ? catalogByCode.get(code) : undefined);
    if (!material) {
      errors.push(
        `صف ${rowNo}: الصنف ${code || itemId || 'غير محدد'} غير موجود في المخزن ولا في ماستر داتا المواد.`,
      );
      return;
    }

    const materialId = String(material.id || '').trim();
    if (!materialId) {
      errors.push(`صف ${rowNo}: بيانات المكون في الماستر غير صالحة.`);
      return;
    }
    if (seen.has(materialId) || createByMaterialId.has(materialId)) {
      errors.push(`صف ${rowNo}: الصنف ${material.code || material.name} مكرر.`);
      return;
    }
    seen.add(materialId);
    const quantity = parseQty(qtyValue);
    if (quantity === null) {
      errors.push(`صف ${rowNo}: الكمية الفعلية غير صالحة للصنف ${material.code || material.name}.`);
      return;
    }

    const existingPart = options.existingPartMaterialIds?.has(materialId) === true;
    createByMaterialId.set(materialId, {
      rowNo,
      itemType: 'material',
      materialId,
      materialCode: String(material.code || '').trim(),
      materialName: String(material.name || '').trim() || materialId,
      unit: String(material.unit || 'piece').trim() || 'piece',
      categoryName: String(material.categoryName || 'قطع غيار').trim() || 'قطع غيار',
      minStock: Number.isFinite(Number(material.minStock)) ? Number(material.minStock) : 0,
      countedQty: quantity,
      needsSparePart: !existingPart,
      needsStockBalance: true,
    });
    countedByItemId.set(materialId, quantity);
  });

  const createCandidates = Array.from(createByMaterialId.values());
  const createdBalanceLines: StockCountLine[] = createCandidates.map((candidate) => ({
    itemType: candidate.itemType,
    itemId: candidate.materialId,
    itemName: candidate.materialName,
    itemCode: candidate.materialCode,
    expectedQty: 0,
    countedQty: candidate.countedQty,
  }));

  const existingLines = balances.map((balance) => {
    const expectedQty = Number(balance.quantity || 0);
    return {
      itemType: balance.itemType,
      itemId: balance.itemId,
      itemName: balance.itemName,
      itemCode: balance.itemCode,
      expectedQty,
      countedQty: countedByItemId.get(balance.itemId) ?? expectedQty,
    };
  });

  const lines = [...existingLines, ...createdBalanceLines];
  if (createCandidates.length > 0) {
    warnings.push(
      `${createCandidates.length} صنف جديد سيُضاف إلى المخزن من الماستر داتا قبل إنشاء جلسة الجرد.`,
    );
  }
  if (countedByItemId.size < balances.length) {
    warnings.push(
      `${balances.length - countedByItemId.size} صنف بالمخزن لم يرد له عد فعلي وسيبقى مساويًا لرصيد النظام.`,
    );
  }

  return {
    lines,
    importedRows: countedByItemId.size,
    changedRows: lines.filter((line) => Math.abs(line.countedQty - line.expectedQty) > 0.00001).length,
    errors,
    warnings,
    createCandidates,
  };
}

export function downloadStockCountErrors(errors: string[], fileName = 'اخطاء-الجرد.xlsx'): void {
  const rows = errors.map((error, index) => ({ '#': index + 1, الخطأ: error }));
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '#': 1, الخطأ: 'لا توجد أخطاء' }]);
  sheet['!cols'] = [{ wch: 8 }, { wch: 90 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'الأخطاء');
  XLSX.writeFile(workbook, fileName);
}

export function downloadStockCountTemplate(
  warehouseName: string,
  balances: StockItemBalance[],
  options?: {
    /** Opening / first load for a center: code + qty only (no internal id). */
    mode?: 'count' | 'opening';
    catalogMaterials?: StockCountCatalogMaterial[];
  },
): void {
  const mode = options?.mode === 'opening' || balances.length === 0 ? 'opening' : 'count';
  const safeName = String(warehouseName || 'المخزن').replace(/[\\/:*?"<>|]/g, '-');

  if (mode === 'opening') {
    const fromBalances = balances.map((balance) => ({
      'كود الصنف': balance.itemCode || '',
      'اسم الصنف': balance.itemName || '',
      'الكمية الافتتاحية': '',
    }));
    const seenCodes = new Set(
      fromBalances.map((row) => String(row['كود الصنف'] || '').trim().toUpperCase()).filter(Boolean),
    );
    const fromCatalog = (options?.catalogMaterials || [])
      .filter((material) => {
        const code = String(material.code || '').trim().toUpperCase();
        if (!code || seenCodes.has(code)) return false;
        seenCodes.add(code);
        return true;
      })
      .map((material) => ({
        'كود الصنف': material.code,
        'اسم الصنف': material.name,
        'الكمية الافتتاحية': '',
      }));
    const rows = [...fromBalances, ...fromCatalog];
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{
      'كود الصنف': '',
      'اسم الصنف': '',
      'الكمية الافتتاحية': '',
    }]);
    sheet['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'أول المدة');
    XLSX.writeFile(workbook, `قالب-اول-المدة-${safeName}.xlsx`);
    return;
  }

  const rows = balances.map((balance) => ({
    'كود الصنف': balance.itemCode,
    'اسم الصنف': balance.itemName,
    'الرصيد بالنظام': Number(balance.quantity || 0),
    'الكمية الفعلية': '',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'كود الصنف': '',
    'اسم الصنف': '',
    'الرصيد بالنظام': 0,
    'الكمية الفعلية': '',
  }]);
  sheet['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'الجرد');
  XLSX.writeFile(workbook, `قالب-جرد-${safeName}.xlsx`);
}
