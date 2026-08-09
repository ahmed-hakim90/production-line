import type { InventoryItemType, StockItemBalance } from '../types';

export type WarehouseBalanceDelta = {
  warehouseId: string;
  itemType: InventoryItemType;
  itemId: string;
  /** Signed change: +IN / −OUT / signed ADJUSTMENT */
  delta: number;
  itemName?: string;
  itemCode?: string;
  minStock?: number;
};

/**
 * Patch warehouse-level balances in memory after a successful local stock write.
 * Server remains source of truth — use only to keep the next voucher snappy without a full reload.
 */
export function applyWarehouseBalanceDeltas(
  balances: StockItemBalance[],
  deltas: WarehouseBalanceDelta[],
  nowIso = new Date().toISOString(),
): StockItemBalance[] {
  if (!deltas.length) return balances;

  const next = balances.map((row) => ({ ...row }));
  const index = new Map<string, number>();
  for (let i = 0; i < next.length; i += 1) {
    const row = next[i];
    index.set(`${row.warehouseId}__${row.itemType}__${row.itemId}`, i);
  }

  for (const d of deltas) {
    if (!d.warehouseId || !d.itemId || !Number.isFinite(d.delta) || d.delta === 0) continue;
    const key = `${d.warehouseId}__${d.itemType}__${d.itemId}`;
    const at = index.get(key);
    if (at == null) {
      if (d.delta < 0) continue;
      index.set(key, next.length);
      next.push({
        warehouseId: d.warehouseId,
        itemType: d.itemType,
        itemId: d.itemId,
        itemName: d.itemName || d.itemId,
        itemCode: d.itemCode || '',
        quantity: d.delta,
        availableQty: d.delta,
        minStock: Number(d.minStock || 0),
        updatedAt: nowIso,
        lastMovementAt: nowIso,
      });
      continue;
    }
    const row = next[at];
    const quantity = Number(row.quantity || 0) + d.delta;
    const reserved = Number(row.reservedQty || 0);
    next[at] = {
      ...row,
      quantity,
      availableQty: quantity - reserved,
      updatedAt: nowIso,
      lastMovementAt: nowIso,
      ...(d.itemName ? { itemName: d.itemName } : {}),
      ...(d.itemCode ? { itemCode: d.itemCode } : {}),
      ...(d.minStock != null ? { minStock: Number(d.minStock) } : {}),
    };
  }

  return next;
}
