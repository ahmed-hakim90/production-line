import type { InventoryItemType, PeriodBalanceReport, PeriodBalanceRow, StockItemBalance, StockTransaction } from '../types';

export type PeriodBalanceKey = string;

export function periodBalanceKey(
  warehouseId: string,
  itemType: string,
  itemId: string,
): PeriodBalanceKey {
  return `${warehouseId}__${itemType}__${itemId}`;
}

function emptyRow(params: {
  warehouseId: string;
  warehouseName?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit?: string;
}): PeriodBalanceRow {
  return {
    warehouseId: params.warehouseId,
    warehouseName: params.warehouseName,
    itemType: params.itemType,
    itemId: params.itemId,
    itemName: params.itemName,
    itemCode: params.itemCode,
    unit: params.unit,
    openingQty: 0,
    inQty: 0,
    outQty: 0,
    transferInQty: 0,
    transferOutQty: 0,
    adjustmentQty: 0,
    closingQty: 0,
  };
}

/**
 * Build opening/in/out/closing balances for a period from current balances + period transactions.
 * Opening = closing_now − net_movements_in_period (when endDate covers "now").
 * For historical end dates before now, pass balancesAsOfEnd when available; otherwise
 * uses current balances as closing approximation and derives opening.
 */
export function buildPeriodBalanceReport(params: {
  startDate: string;
  endDate: string;
  warehouseId?: string;
  currentBalances: StockItemBalance[];
  transactionsInPeriod: StockTransaction[];
}): PeriodBalanceReport {
  const map = new Map<PeriodBalanceKey, PeriodBalanceRow>();

  const ensure = (row: {
    warehouseId: string;
    warehouseName?: string;
    itemType: InventoryItemType;
    itemId: string;
    itemName: string;
    itemCode: string;
    unit?: string;
  }) => {
    const key = periodBalanceKey(row.warehouseId, row.itemType, row.itemId);
    let existing = map.get(key);
    if (!existing) {
      existing = emptyRow(row);
      map.set(key, existing);
    } else {
      if (!existing.itemName && row.itemName) existing.itemName = row.itemName;
      if (!existing.itemCode && row.itemCode) existing.itemCode = row.itemCode;
      if (!existing.warehouseName && row.warehouseName) existing.warehouseName = row.warehouseName;
    }
    return existing;
  };

  for (const bal of params.currentBalances) {
    if (params.warehouseId && bal.warehouseId !== params.warehouseId) continue;
    const row = ensure({
      warehouseId: bal.warehouseId,
      warehouseName: bal.warehouseName,
      itemType: bal.itemType,
      itemId: bal.itemId,
      itemName: bal.itemName,
      itemCode: bal.itemCode,
      unit: bal.unit,
    });
    row.closingQty = Number(bal.quantity || 0);
  }

  for (const tx of params.transactionsInPeriod) {
    if (params.warehouseId && tx.warehouseId !== params.warehouseId) continue;
    const createdAt = String(tx.createdAt || '');
    if (params.startDate && createdAt < params.startDate) continue;
    if (params.endDate && createdAt > params.endDate) continue;

    const row = ensure({
      warehouseId: tx.warehouseId,
      warehouseName: tx.warehouseName,
      itemType: tx.itemType,
      itemId: tx.itemId,
      itemName: tx.itemName,
      itemCode: tx.itemCode,
      unit: tx.unit,
    });

    const qty = Math.abs(Number(tx.quantity || 0));
    if (!(qty > 0)) continue;

    if (tx.movementType === 'IN') {
      row.inQty += qty;
    } else if (tx.movementType === 'OUT') {
      row.outQty += qty;
    } else if (tx.movementType === 'TRANSFER') {
      if (tx.transferDirection === 'IN') row.transferInQty += qty;
      else row.transferOutQty += qty;
    } else if (tx.movementType === 'ADJUSTMENT') {
      row.adjustmentQty += Number(tx.quantity || 0);
    }
  }

  for (const row of map.values()) {
    const net =
      row.inQty
      - row.outQty
      + row.transferInQty
      - row.transferOutQty
      + row.adjustmentQty;
    row.openingQty = Number((row.closingQty - net).toFixed(6));
  }

  const rows = Array.from(map.values()).sort((a, b) =>
    `${a.itemName}${a.itemCode}`.localeCompare(`${b.itemName}${b.itemCode}`, 'ar'),
  );

  return {
    warehouseId: params.warehouseId,
    startDate: params.startDate,
    endDate: params.endDate,
    rows,
  };
}

/** Aggregate period rows into daily net movement buckets by calendar day (YYYY-MM-DD). */
export function buildDailyNetFromTransactions(
  transactions: StockTransaction[],
): Array<{ date: string; inQty: number; outQty: number; transferInQty: number; transferOutQty: number; adjustmentQty: number }> {
  const byDay = new Map<string, {
    date: string;
    inQty: number;
    outQty: number;
    transferInQty: number;
    transferOutQty: number;
    adjustmentQty: number;
  }>();

  for (const tx of transactions) {
    const date = String(tx.createdAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let bucket = byDay.get(date);
    if (!bucket) {
      bucket = { date, inQty: 0, outQty: 0, transferInQty: 0, transferOutQty: 0, adjustmentQty: 0 };
      byDay.set(date, bucket);
    }
    const qty = Math.abs(Number(tx.quantity || 0));
    if (!(qty > 0) && tx.movementType !== 'ADJUSTMENT') continue;
    if (tx.movementType === 'IN') bucket.inQty += qty;
    else if (tx.movementType === 'OUT') bucket.outQty += qty;
    else if (tx.movementType === 'TRANSFER') {
      if (tx.transferDirection === 'IN') bucket.transferInQty += qty;
      else bucket.transferOutQty += qty;
    } else if (tx.movementType === 'ADJUSTMENT') {
      bucket.adjustmentQty += Number(tx.quantity || 0);
    }
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}
