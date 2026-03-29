import type { StockTransferPrintData } from '../components/StockTransferPrint';
import type { TransferRequestLine } from '../types';
import { getTransferDisplay, type TransferDisplayUnitMode } from './transferUnits';

export type TransferUnit = 'piece' | 'carton';

export type TransferFormLine = {
  id: string;
  itemId: string;
  quantity: number;
  unit: TransferUnit;
};

export type TransferItemOption = {
  id: string;
  name: string;
  code: string;
  minStock: number;
  unitsPerCarton?: number;
};

export const INV_REF_REGEX = /^INV-(\d+)$/i;

export const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

export const createTransferLine = (): TransferFormLine => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemId: '',
  quantity: 0,
  unit: 'piece',
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
    const key = `${line.itemId}__${line.unit}`;
    if (duplicate.has(key)) {
      return `لا يمكن تكرار نفس الصنف بنفس الوحدة أكثر من مرة: ${item.name}`;
    }
    duplicate.add(key);

    if (itemType === 'finished_good' && line.unit === 'carton' && Number(item.unitsPerCarton || 0) <= 0) {
      return `الصنف "${item.name}" لا يحتوي وحدات/كرتونة.`;
    }
  }
  return null;
}

export function buildTransferRequestLines(
  transferItems: TransferFormLine[],
  itemType: 'finished_good' | 'raw_material',
  getItemById: (id: string) => TransferItemOption | undefined,
  qtyInPieces: (line: TransferFormLine) => number,
): TransferRequestLine[] {
  return transferItems
    .map((line) => {
      const item = getItemById(line.itemId);
      if (!item) return null;
      return {
        itemType,
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code,
        quantity: qtyInPieces(line),
        requestQuantity: Number(line.quantity || 0),
        requestUnit: itemType === 'finished_good' ? line.unit : 'unit',
        unitsPerCarton: itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
        minStock: item.minStock,
      };
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
      return {
        itemName: item.name,
        itemCode: item.code,
        unitLabel: display.unitLabel,
        quantity: display.quantity,
        quantityPieces,
        unitsPerCarton: params.itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
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
  };
}
