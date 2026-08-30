import type { StockItemBalance, StockTransaction } from '../types';

export type ConsumableStockTotals = {
  inbound: number;
  outbound: number;
  available: number;
};

const emptyTotals = (): ConsumableStockTotals => ({ inbound: 0, outbound: 0, available: 0 });

export function buildConsumableStockSummary(
  balances: StockItemBalance[],
  transactions: StockTransaction[],
  allowedWarehouseIds?: ReadonlySet<string> | null,
): Map<string, ConsumableStockTotals> {
  const summary = new Map<string, ConsumableStockTotals>();
  const acceptsWarehouse = (warehouseId: string) =>
    !allowedWarehouseIds || allowedWarehouseIds.has(warehouseId);

  for (const balance of balances) {
    if (balance.itemType !== 'material' || !acceptsWarehouse(balance.warehouseId)) continue;
    const totals = summary.get(balance.itemId) || emptyTotals();
    totals.available += Number(balance.quantity || 0);
    summary.set(balance.itemId, totals);
  }

  for (const transaction of transactions) {
    if (transaction.itemType !== 'material' || !acceptsWarehouse(transaction.warehouseId)) continue;
    const totals = summary.get(transaction.itemId) || emptyTotals();
    const quantity = Number(transaction.quantity || 0);
    if (transaction.movementType === 'IN') totals.inbound += Math.abs(quantity);
    if (transaction.movementType === 'OUT') totals.outbound += Math.abs(quantity);
    if (transaction.movementType === 'ADJUSTMENT') {
      if (quantity >= 0) totals.inbound += quantity;
      else totals.outbound += Math.abs(quantity);
    }
    if (transaction.movementType === 'TRANSFER') {
      if (transaction.transferDirection === 'IN') totals.inbound += Math.abs(quantity);
      if (transaction.transferDirection === 'OUT') totals.outbound += Math.abs(quantity);
    }
    summary.set(transaction.itemId, totals);
  }

  return summary;
}
