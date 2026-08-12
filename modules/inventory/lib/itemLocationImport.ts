import * as XLSX from 'xlsx';
import type { InventoryItemType, StockItemBalance, StockLocationBalance, WarehouseLocation } from '../types';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import { stockService } from '../services/stockService';
import { INVENTORY_STOCK_MOVE_PATHS } from '../../system/lib/operationPathSettings';

export type ItemLocationImportItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: InventoryItemType;
  unit?: string;
};

export type ParsedItemLocationRow = {
  rowNo: number;
  itemCode: string;
  locationCode: string;
  previousLocationCode: string;
  status: 'ready' | 'skip' | 'error';
  error?: string;
  note?: string;
  itemId?: string;
  itemType?: InventoryItemType;
  itemName?: string;
  unit?: string;
  locationId?: string;
  previousLocationId?: string;
  transferQty?: number;
};

export type ItemLocationImportResult = {
  rows: ParsedItemLocationRow[];
  readyCount: number;
  skipCount: number;
  errorCount: number;
};

export type ParseItemLocationImportOptions = {
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  items: ItemLocationImportItem[];
  locations: Array<Pick<WarehouseLocation, 'id' | 'code' | 'warehouseId' | 'isActive'>>;
  locationBalances: Array<Pick<StockLocationBalance, 'itemId' | 'itemType' | 'locationId' | 'locationCode' | 'quantity' | 'warehouseId'>>;
  defaults?: Array<{ itemId: string; itemType: string; locationId?: string; locationCode?: string }>;
  canMoveStock?: boolean;
};

type ParsedRow = Record<string, unknown>;

const normalizeHeader = (value: unknown) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

export function normalizeItemLocationCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

export function normalizeItemCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function findValue(row: ParsedRow, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(normalizeHeader));
  const key = Object.keys(row).find((candidate) => wanted.has(normalizeHeader(candidate)));
  return key ? row[key] : undefined;
}

function itemsFromBalances(balances: StockItemBalance[]): ItemLocationImportItem[] {
  const map = new Map<string, ItemLocationImportItem>();
  for (const row of balances) {
    const itemId = String(row.itemId || '').trim();
    if (!itemId) continue;
    const key = `${row.itemType}__${itemId}`;
    if (map.has(key)) continue;
    map.set(key, {
      itemId,
      itemCode: String(row.itemCode || ''),
      itemName: String(row.itemName || ''),
      itemType: row.itemType,
      unit: row.unit,
    });
  }
  return Array.from(map.values());
}

export function catalogItemsFromWarehouseBalances(
  balances: StockItemBalance[],
  warehouseId: string,
): ItemLocationImportItem[] {
  return itemsFromBalances(balances.filter((row) => row.warehouseId === warehouseId));
}

export function downloadItemLocationImportTemplate(warehouseName?: string): void {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['كود المادة', 'كود اللوكيشن', 'كود اللوكيشن السابق'],
    ['SP-0001', 'A1-1', ''],
    ['RM-0002', 'B-03', 'A-02'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!views'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, ws, 'مواقع الأصناف');
  const guide = XLSX.utils.aoa_to_sheet([
    ['الحقل', 'مطلوب؟', 'الشرح'],
    ['كود المادة', 'نعم', 'كود الصنف كما هو في أرصدة المخزن المختار'],
    ['كود اللوكيشن', 'نعم', 'كود الرف الجديد داخل نفس المخزن'],
    ['كود اللوكيشن السابق', 'لا', 'إلزامي فقط إذا كان الصنف على أكثر من رف'],
    ['المخزن', '', warehouseName
      ? `يُختار من الشاشة قبل الرفع — الحالي: ${warehouseName}`
      : 'يُختار من الشاشة قبل الرفع. اللوكيشن لا يُحفظ بدون مخزن.'],
  ]);
  guide['!views'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, guide, 'تعليمات');
  XLSX.writeFile(wb, 'template_item_locations.xlsx');
}

export function parseItemLocationImportSheet(
  data: ArrayBuffer | Uint8Array,
  options: ParseItemLocationImportOptions,
): ItemLocationImportResult {
  const warehouseId = String(options.warehouseId || '').trim();
  if (!warehouseId) {
    return {
      rows: [{
        rowNo: 1,
        itemCode: '',
        locationCode: '',
        previousLocationCode: '',
        status: 'error',
        error: 'اختر المخزن قبل رفع الملف. اللوكيشن تابع لمخزن واحد.',
      }],
      readyCount: 0,
      skipCount: 0,
      errorCount: 1,
    };
  }

  const workbook = XLSX.read(data, { type: 'array' });
  const preferred = workbook.SheetNames.find((name) => /موقع|لوكيشن|location|صنف/i.test(String(name || '')));
  const sheet = workbook.Sheets[preferred || workbook.SheetNames[0]];
  if (!sheet) {
    return { rows: [], readyCount: 0, skipCount: 0, errorCount: 0 };
  }
  const rawRows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  const itemsByCode = new Map<string, ItemLocationImportItem[]>();
  for (const item of options.items) {
    const code = normalizeItemCode(item.itemCode);
    if (!code) continue;
    const list = itemsByCode.get(code) || [];
    list.push(item);
    itemsByCode.set(code, list);
  }

  const locationsByCode = new Map<string, ParseItemLocationImportOptions['locations'][number]>();
  for (const loc of options.locations) {
    if (loc.warehouseId && loc.warehouseId !== warehouseId) continue;
    const code = normalizeItemLocationCode(loc.code);
    if (code && loc.id) locationsByCode.set(code, loc);
  }

  const expectedWarehouseCode = normalizeItemCode(options.warehouseCode || options.warehouseName || '');

  const seenItemKeys = new Set<string>();
  const rows: ParsedItemLocationRow[] = [];

  rawRows.forEach((row, index) => {
    const rowNo = index + 2;
    const itemCode = normalizeItemCode(findValue(row, [
      'كود المادة',
      'كود الصنف',
      'كود المنتج',
      'كود المادة الخام',
      'item code',
      'code',
      'sku',
    ]));
    const locationCode = normalizeItemLocationCode(findValue(row, [
      'كود اللوكيشن',
      'كود الموقع',
      'اللوكيشن الجديد',
      'كود الرف',
      'location code',
      'location',
    ]));
    const previousLocationCode = normalizeItemLocationCode(findValue(row, [
      'كود اللوكيشن السابق',
      'اللوكيشن السابق',
      'كود الموقع السابق',
      'من لوكيشن',
      'previous location',
      'from location',
      'old location',
    ]));
    const fileWarehouse = normalizeItemCode(findValue(row, [
      'كود المخزن',
      'المخزن',
      'warehouse',
      'warehouse code',
    ]));

    if (!itemCode && !locationCode && !previousLocationCode && !fileWarehouse) return;

    if (fileWarehouse && expectedWarehouseCode && fileWarehouse !== expectedWarehouseCode) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `صف المخزن في الملف لا يطابق المخزن المختار (${options.warehouseName || options.warehouseCode || warehouseId}).`,
      });
      return;
    }

    if (!itemCode) {
      rows.push({
        rowNo, itemCode, locationCode, previousLocationCode, status: 'error', error: 'كود المادة مطلوب.',
      });
      return;
    }
    if (!locationCode) {
      rows.push({
        rowNo, itemCode, locationCode, previousLocationCode, status: 'error', error: 'كود اللوكيشن الجديد مطلوب.',
      });
      return;
    }

    const matches = itemsByCode.get(itemCode) || [];
    if (matches.length === 0) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `الصنف ${itemCode} غير موجود في أرصدة هذا المخزن.`,
      });
      return;
    }
    if (matches.length > 1) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `كود المادة ${itemCode} مكرر لأنواع أصناف مختلفة في هذا المخزن.`,
      });
      return;
    }

    const item = matches[0];
    const itemKey = `${item.itemType}__${item.itemId}`;
    if (seenItemKeys.has(itemKey)) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `الصنف ${itemCode} مكرر في الملف.`,
      });
      return;
    }
    seenItemKeys.add(itemKey);

    const location = locationsByCode.get(locationCode);
    if (!location?.id) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `كود اللوكيشن غير موجود في هذا المخزن: ${locationCode}`,
      });
      return;
    }
    if (location.isActive === false) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `اللوكيشن موقوف: ${locationCode}`,
      });
      return;
    }

    const itemLocBals = options.locationBalances.filter((bal) => (
      bal.warehouseId === warehouseId
      && bal.itemId === item.itemId
      && bal.itemType === item.itemType
      && Number(bal.quantity || 0) > 0
    ));
    const qtyOnTarget = itemLocBals
      .filter((bal) => bal.locationId === location.id)
      .reduce((sum, bal) => sum + Number(bal.quantity || 0), 0);
    const otherBals = itemLocBals.filter((bal) => bal.locationId !== location.id);

    let previousLocationId: string | undefined;
    let transferQty = 0;

    if (previousLocationCode) {
      if (previousLocationCode === locationCode) {
        previousLocationId = undefined;
      } else {
        const previous = locationsByCode.get(previousLocationCode);
        if (!previous?.id) {
          rows.push({
            rowNo,
            itemCode,
            locationCode,
            previousLocationCode,
            status: 'error',
            error: `كود اللوكيشن السابق غير موجود في هذا المخزن: ${previousLocationCode}`,
          });
          return;
        }
        previousLocationId = previous.id;
        transferQty = otherBals
          .filter((bal) => bal.locationId === previous.id)
          .reduce((sum, bal) => sum + Number(bal.quantity || 0), 0);
      }
    } else if (otherBals.length === 1) {
      previousLocationId = otherBals[0].locationId;
      transferQty = Number(otherBals[0].quantity || 0);
    } else if (otherBals.length > 1) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: `الصنف ${itemCode} على أكثر من رف. حدد «كود اللوكيشن السابق».`,
      });
      return;
    }

    if (transferQty > 0 && options.canMoveStock === false) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'error',
        error: 'نقل الرصيد من الرف القديم يحتاج صلاحية إنشاء حركات مخزون.',
      });
      return;
    }

    const currentDefault = (options.defaults || []).find(
      (row) => row.itemId === item.itemId && row.itemType === item.itemType,
    );
    const alreadyDefault = currentDefault?.locationId === location.id;
    if (alreadyDefault && transferQty <= 0) {
      rows.push({
        rowNo,
        itemCode,
        locationCode,
        previousLocationCode,
        status: 'skip',
        note: qtyOnTarget > 0
          ? `الافتراضي بالفعل ${locationCode}`
          : `الافتراضي بالفعل ${locationCode} (بدون رصيد موقع)`,
        itemId: item.itemId,
        itemType: item.itemType,
        itemName: item.itemName,
        unit: item.unit,
        locationId: location.id,
      });
      return;
    }

    const noteParts: string[] = [];
    if (transferQty > 0 && previousLocationId) {
      const fromCode = otherBals.find((bal) => bal.locationId === previousLocationId)?.locationCode
        || previousLocationCode
        || previousLocationId;
      noteParts.push(`نقل ${transferQty} من ${fromCode} إلى ${locationCode}`);
    } else {
      noteParts.push(`تعيين الافتراضي إلى ${locationCode}`);
    }

    rows.push({
      rowNo,
      itemCode,
      locationCode,
      previousLocationCode,
      status: 'ready',
      note: noteParts.join(' — '),
      itemId: item.itemId,
      itemType: item.itemType,
      itemName: item.itemName,
      unit: item.unit,
      locationId: location.id,
      previousLocationId,
      transferQty: transferQty > 0 ? transferQty : undefined,
    });
  });

  return {
    rows,
    readyCount: rows.filter((row) => row.status === 'ready').length,
    skipCount: rows.filter((row) => row.status === 'skip').length,
    errorCount: rows.filter((row) => row.status === 'error').length,
  };
}

export async function applyItemLocationImportRows(input: {
  warehouseId: string;
  warehouseName?: string;
  createdBy: string;
  rows: ParsedItemLocationRow[];
}): Promise<{ saved: number; moved: number; failed: number; errors: string[] }> {
  const warehouseId = String(input.warehouseId || '').trim();
  if (!warehouseId) throw new Error('اختر المخزن قبل الحفظ.');

  let saved = 0;
  let moved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of input.rows) {
    if (row.status !== 'ready' || !row.itemId || !row.itemType || !row.locationId) continue;
    try {
      if (row.transferQty && row.transferQty > 0 && row.previousLocationId) {
        const movementId = await stockService.createMovement({
          warehouseId,
          locationId: row.previousLocationId,
          locationCode: row.previousLocationCode || undefined,
          toLocationId: row.locationId,
          toLocationCode: row.locationCode,
          itemType: row.itemType,
          itemId: row.itemId,
          itemName: row.itemName || row.itemCode,
          itemCode: row.itemCode,
          movementType: 'TRANSFER',
          quantity: row.transferQty,
          unit: row.unit || 'piece',
          note: `نقل لوكيشن من استيراد المواقع → ${row.locationCode}`,
          sourceModule: 'manual_movement',
          createdBy: input.createdBy,
        }, { path: INVENTORY_STOCK_MOVE_PATHS.itemLocationImport });
        if (!movementId) throw new Error('تعذر نقل الرصيد إلى اللوكيشن الجديد.');
        moved += 1;
      }

      await defaultItemLocationService.set({
        warehouseId,
        warehouseName: input.warehouseName,
        itemType: row.itemType,
        itemId: row.itemId,
        itemName: row.itemName || row.itemCode,
        itemCode: row.itemCode,
        locationId: row.locationId,
        locationCode: row.locationCode,
      });
      saved += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'تعذر حفظ الصف.';
      errors.push(`${row.itemCode}: ${message}`);
    }
  }

  return { saved, moved, failed, errors };
}
