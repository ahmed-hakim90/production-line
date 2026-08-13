import type { StockTransferPrintData } from '../components/StockTransferPrint';
import type { InventoryItemType, TransferRequestLine } from '../types';
import { getTransferDisplay, type TransferDisplayUnitMode } from './transferUnits';

export type TransferUnit = 'piece' | 'carton';

export type TransferFormLine = {
  id: string;
  itemId: string;
  quantity: number;
  unit: TransferUnit;
  /** Optional shelf/bin for IN/OUT vouchers (and future per-line picks). */
  locationId?: string;
};

export type TransferItemOption = {
  id: string;
  name: string;
  code: string;
  /** Optional product/material barcode — used for scan match only, not dropdown display. */
  barcode?: string;
  minStock: number;
  unitsPerCarton?: number;
  /** Actual stock ledger type (e.g. manufacturing `material` vs legacy `raw_material`). */
  stockItemType?: InventoryItemType;
};

export const INV_REF_REGEX = /^INV-(\d+)$/i;

export const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

export const createTransferLine = (defaults?: Partial<Pick<TransferFormLine, 'locationId' | 'unit'>>): TransferFormLine => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemId: '',
  quantity: 0,
  unit: defaults?.unit || 'piece',
  locationId: defaults?.locationId || '',
});

export function lineQuantityInPieces(
  line: TransferFormLine,
  item: TransferItemOption | undefined,
  itemType: 'finished_good' | 'raw_material',
): number {
  if (!item) return Number(line.quantity || 0);
  if (itemType === 'finished_good' && line.unit === 'carton') {
    return Number(line.quantity || 0) * Number(item.unitsPerCarton || 0);
  }
  return Number(line.quantity || 0);
}

/** Returns Arabic error message or null if valid. */
export function validateTransferLines(
  transferItems: TransferFormLine[],
  itemType: 'finished_good' | 'raw_material',
  getItemById: (id: string) => TransferItemOption | undefined,
  options?: {
    requireLocation?: boolean;
    /** When true, same item may appear twice if location differs (IN/OUT vouchers). */
    allowSameItemDifferentLocation?: boolean;
  },
): string | null {
  if (transferItems.length === 0) {
    return 'أضف صنفًا واحدًا على الأقل في التحويلة.';
  }
  const duplicate = new Set<string>();
  for (const line of transferItems) {
    const item = getItemById(line.itemId);
    if (!item) {
      return 'كل صف يجب أن يحتوي على صنف.';
    }
    if (Number(line.quantity || 0) <= 0) {
      return `كمية الصنف "${item.name}" يجب أن تكون أكبر من صفر.`;
    }
    if (options?.requireLocation && !String(line.locationId || '').trim()) {
      return `حدد الرف/اللوكيشن للصنف "${item.name}".`;
    }
    const key = options?.allowSameItemDifferentLocation
      ? `${line.itemId}__${line.unit}__${String(line.locationId || '').trim()}`
      : `${line.itemId}__${line.unit}`;
    if (duplicate.has(key)) {
      return options?.allowSameItemDifferentLocation
        ? `لا يمكن تكرار نفس الصنف على نفس الرف أكثر من مرة: ${item.name}`
        : `لا يمكن تكرار نفس الصنف بنفس الوحدة أكثر من مرة: ${item.name}`;
    }
    duplicate.add(key);

    if (itemType === 'finished_good' && line.unit === 'carton' && Number(item.unitsPerCarton || 0) <= 0) {
      return `الصنف "${item.name}" لا يحتوي وحدات/كرتونة.`;
    }
  }
  return null;
}

/** Find catalog option by exact code or barcode (safe for scanners). */
export function findItemOptionByCode(
  options: TransferItemOption[],
  rawCode: string,
): TransferItemOption | undefined {
  const code = String(rawCode || '').trim().toLowerCase();
  if (!code) return undefined;
  return options.find((opt) => {
    if (String(opt.code || '').trim().toLowerCase() === code) return true;
    const barcode = String(opt.barcode || '').trim().toLowerCase();
    return Boolean(barcode) && barcode === code;
  });
}

/**
 * Apply a scanned/typed code to voucher lines:
 * - if same item(+location) exists → increment qty by 1
 * - else fill first empty row or append a new row
 */
export function applyScannedCodeToLines(params: {
  lines: TransferFormLine[];
  itemId: string;
  locationId?: string;
  unit?: TransferUnit;
}): { lines: TransferFormLine[]; action: 'incremented' | 'filled' | 'appended' } {
  const locationId = String(params.locationId || '').trim();
  const unit = params.unit || 'piece';
  const existingIdx = params.lines.findIndex(
    (line) =>
      line.itemId === params.itemId
      && (line.unit || 'piece') === unit
      && String(line.locationId || '').trim() === locationId,
  );
  if (existingIdx >= 0) {
    return {
      action: 'incremented',
      lines: params.lines.map((line, idx) =>
        idx === existingIdx
          ? { ...line, quantity: Number(line.quantity || 0) + 1, locationId: locationId || line.locationId }
          : line,
      ),
    };
  }
  const emptyIdx = params.lines.findIndex((line) => !line.itemId);
  if (emptyIdx >= 0) {
    return {
      action: 'filled',
      lines: params.lines.map((line, idx) =>
        idx === emptyIdx
          ? { ...line, itemId: params.itemId, quantity: 1, unit, locationId }
          : line,
      ),
    };
  }
  return {
    action: 'appended',
    lines: [
      ...params.lines,
      {
        ...createTransferLine({ locationId, unit }),
        itemId: params.itemId,
        quantity: 1,
      },
    ],
  };
}

export type TransferRequestLineLocations = {
  locationId?: string;
  locationCode?: string;
  toLocationId?: string;
  toLocationCode?: string;
};

/** Build Firestore-safe transfer lines (never include `undefined` field values). */
export function buildTransferRequestLines(
  transferItems: TransferFormLine[],
  itemType: 'finished_good' | 'raw_material',
  getItemById: (id: string) => TransferItemOption | undefined,
  qtyInPieces: (line: TransferFormLine) => number,
  locations?: TransferRequestLineLocations,
): TransferRequestLine[] {
  return transferItems
    .map((line): TransferRequestLine | null => {
      const item = getItemById(line.itemId);
      if (!item) return null;
      const stockItemType = item.stockItemType || itemType;
      const row: TransferRequestLine = {
        itemType: stockItemType,
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code,
        quantity: qtyInPieces(line),
        requestQuantity: Number(line.quantity || 0),
        requestUnit: (itemType === 'finished_good' ? line.unit : 'unit') as TransferRequestLine['requestUnit'],
        minStock: item.minStock,
      };
      if (itemType === 'finished_good') {
        row.unitsPerCarton = Number(item.unitsPerCarton || 0);
      }
      const locationId = String(locations?.locationId || '').trim();
      if (locationId) {
        row.locationId = locationId;
        const locationCode = String(locations?.locationCode || '').trim();
        if (locationCode) row.locationCode = locationCode;
      }
      const toLocationId = String(locations?.toLocationId || '').trim();
      if (toLocationId) {
        row.toLocationId = toLocationId;
        const toLocationCode = String(locations?.toLocationCode || '').trim();
        if (toLocationCode) row.toLocationCode = toLocationCode;
      }
      return row;
    })
    .filter((line): line is TransferRequestLine => Boolean(line));
}

export function buildTransferPrintDataPayload(params: {
  resolvedReferenceNo: string;
  txId: string | null;
  transferItems: TransferFormLine[];
  itemType: 'finished_good' | 'raw_material';
  getItemById: (id: string) => TransferItemOption | undefined;
  qtyInPieces: (line: TransferFormLine) => number;
  fromWarehouseName: string;
  effectiveWarehouseId: string;
  toWarehouseName: string;
  toWarehouseId: string;
  transferDisplayUnit: TransferDisplayUnitMode;
  createdBy: string;
  documentType?: string;
  resolveLocationCode?: (locationId?: string) => string | undefined;
}): StockTransferPrintData {
  const now = new Date().toISOString();
  const transferNo =
    params.resolvedReferenceNo ||
    (params.txId ? `TR-${params.txId.slice(0, 8)}` : `TR-${Date.now()}`);
  const printableItems = params.transferItems
    .map((line) => {
      const item = params.getItemById(line.itemId);
      if (!item) return null;
      const quantityPieces = params.qtyInPieces(line);
      const display = getTransferDisplay(
        {
          itemType: params.itemType,
          quantity: quantityPieces,
          requestQuantity: Number(line.quantity || 0),
          requestUnit: params.itemType === 'finished_good' ? line.unit : 'unit',
          unitsPerCarton: params.itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
        },
        params.transferDisplayUnit,
      );
      const locationCode = params.resolveLocationCode?.(line.locationId);
      return {
        itemName: item.name,
        itemCode: item.code,
        unitLabel: display.unitLabel,
        quantity: display.quantity,
        quantityPieces,
        unitsPerCarton: params.itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
        ...(locationCode ? { locationCode } : {}),
      };
    })
    .filter(Boolean) as NonNullable<StockTransferPrintData['items']>;

  return {
    transferNo,
    createdAt: now,
    fromWarehouseName: params.fromWarehouseName || params.effectiveWarehouseId,
    toWarehouseName: params.toWarehouseName || params.toWarehouseId,
    items: printableItems,
    createdBy: params.createdBy,
    ...(params.documentType ? { documentType: params.documentType } : {}),
  };
}
