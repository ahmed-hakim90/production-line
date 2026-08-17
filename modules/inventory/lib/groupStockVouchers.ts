import type { StockSourceModule, StockTransaction } from '../types';
import type { StockTransferPrintData } from '../components/StockTransferPrint';

/** Multi-line IN/OUT voucher sharing one INV reference (e.g. إذن إضافة قطع غيار). */
export type StockVoucherGroup = {
  referenceNo: string;
  movementType: 'IN' | 'OUT';
  createdAt: string;
  createdBy: string;
  warehouseId: string;
  note?: string;
  sourceModule?: StockSourceModule;
  lines: StockTransaction[];
};

const INV_REF = /^INV-/i;

/**
 * Groups multi-line manual receipts/issues that share the same INV reference.
 * Single-line refs and non-IN/OUT rows stay as individual transactions.
 */
export function groupManualVoucherTransactions(rows: StockTransaction[]): {
  singles: StockTransaction[];
  vouchers: StockVoucherGroup[];
} {
  const byKey = new Map<string, StockTransaction[]>();
  const singles: StockTransaction[] = [];

  for (const tx of rows) {
    if (tx.movementType !== 'IN' && tx.movementType !== 'OUT') {
      singles.push(tx);
      continue;
    }
    const ref = String(tx.referenceNo || '').trim();
    if (!ref || !INV_REF.test(ref)) {
      singles.push(tx);
      continue;
    }
    const key = `${tx.movementType}|${tx.warehouseId}|${ref}`;
    const bucket = byKey.get(key) || [];
    bucket.push(tx);
    byKey.set(key, bucket);
  }

  const vouchers: StockVoucherGroup[] = [];
  for (const lines of byKey.values()) {
    if (lines.length < 2) {
      singles.push(...lines);
      continue;
    }
    const sortedByTime = [...lines].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const first = sortedByTime[0]!;
    vouchers.push({
      referenceNo: String(first.referenceNo || '').trim(),
      movementType: first.movementType as 'IN' | 'OUT',
      createdAt: first.createdAt,
      createdBy: first.createdBy,
      warehouseId: first.warehouseId,
      note: first.note,
      sourceModule: first.sourceModule,
      lines: [...lines].sort((a, b) => a.itemName.localeCompare(b.itemName, 'ar')),
    });
  }

  return { singles, vouchers };
}

export const REPAIR_STOCK_SOURCE_MODULES: StockSourceModule[] = [
  'manual_movement',
  'spare_parts_replenishment',
  'spare_parts_purchase',
  'repair_spare_issue',
  'repair_spare_return',
  'repair_customer_custody',
  'repair_unrepairable',
];

export function isRepairStockSource(source?: StockSourceModule | null): boolean {
  if (!source) return false;
  return REPAIR_STOCK_SOURCE_MODULES.includes(source);
}

export function voucherMovementTitle(movementType: 'IN' | 'OUT', spareContext = false): string {
  if (movementType === 'IN') return spareContext ? 'إذن إضافة قطع غيار' : 'إذن إضافة';
  return spareContext ? 'إذن منصرف قطع غيار' : 'إذن منصرف';
}

export function voucherDestinationLabel(movementType: 'IN' | 'OUT', spareContext = false): string {
  if (movementType === 'IN') return spareContext ? 'وارد قطع غيار للمخزن' : 'وارد للمخزن';
  return spareContext ? 'منصرف قطع غيار من المخزن' : 'منصرف من المخزن';
}

export function buildVoucherPrintDataFromTransactions(params: {
  group: Pick<
    StockVoucherGroup,
    'referenceNo' | 'movementType' | 'createdAt' | 'createdBy' | 'warehouseId' | 'note' | 'lines'
  >;
  warehouseName: string;
  spareContext?: boolean;
}): StockTransferPrintData {
  const { group, warehouseName, spareContext = false } = params;
  const documentType = voucherMovementTitle(group.movementType, spareContext);
  return {
    transferNo: group.referenceNo,
    createdAt: group.createdAt,
    fromWarehouseName: warehouseName,
    toWarehouseName: voucherDestinationLabel(group.movementType, spareContext),
    note: group.note,
    statusLabel: documentType,
    documentType,
    createdBy: group.createdBy,
    items: group.lines.map((line) => ({
      itemName: line.itemName,
      itemCode: line.itemCode,
      unitLabel: 'قطعة',
      quantity: Math.abs(Number(line.quantity || 0)),
      quantityPieces: Math.abs(Number(line.quantity || 0)),
      unitsPerCarton: Number(line.unitsPerCarton || 0) || undefined,
      ...(line.locationCode ? { locationCode: line.locationCode } : {}),
    })),
  };
}

export function voucherPrintFilePrefix(movementType: 'IN' | 'OUT', spareContext = false): string {
  if (movementType === 'IN') return spareContext ? 'اذن-اضافة' : 'اذن-اضافة';
  return spareContext ? 'اذن-منصرف' : 'اذن-منصرف';
}

/** Flatten grouped recent rows for a compact ops feed. */
export function flattenRecentVoucherFeed(rows: StockTransaction[]): Array<
  | { kind: 'voucher'; group: StockVoucherGroup; sortAt: number }
  | { kind: 'transaction'; tx: StockTransaction; sortAt: number }
> {
  const { singles, vouchers } = groupManualVoucherTransactions(rows);
  return [
    ...vouchers.map((group) => ({
      kind: 'voucher' as const,
      group,
      sortAt: new Date(group.createdAt).getTime(),
    })),
    ...singles.map((tx) => ({
      kind: 'transaction' as const,
      tx,
      sortAt: new Date(tx.createdAt).getTime(),
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);
}
