import type { StockItemBalance } from '../types';

export type StockUnitCostKey = `${StockItemBalance['itemType']}__${string}`;

export function stockUnitCostKey(itemType: StockItemBalance['itemType'], itemId: string): StockUnitCostKey {
  return `${itemType}__${itemId}`;
}

/** Estimated inventory value = sum(qty × unit cost) for rows with a known cost. */
export function estimateStockValue(
  balances: StockItemBalance[],
  unitCostByItem: Map<string, number>,
): { totalValue: number; valuedLines: number; unknownLines: number } {
  let totalValue = 0;
  let valuedLines = 0;
  let unknownLines = 0;

  for (const row of balances) {
    const qty = Number(row.quantity || 0);
    if (qty === 0) continue;
    const cost = Number(unitCostByItem.get(stockUnitCostKey(row.itemType, row.itemId)) ?? 0);
    if (cost <= 0) {
      unknownLines += 1;
      continue;
    }
    valuedLines += 1;
    totalValue += qty * cost;
  }

  return { totalValue, valuedLines, unknownLines };
}
