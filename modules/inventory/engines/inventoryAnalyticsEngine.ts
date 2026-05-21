import type { StockItemBalance, StockTransaction } from '../types';
import { stockUnitCostKey } from '../lib/stockValuation';

export type AbcClass = 'A' | 'B' | 'C';

export type InventoryAbcRow = {
  itemType: StockItemBalance['itemType'];
  itemId: string;
  itemName: string;
  warehouseId: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  abcClass: AbcClass;
  cumulativeSharePct: number;
};

export type InventoryTurnoverRow = {
  itemType: StockItemBalance['itemType'];
  itemId: string;
  itemName: string;
  outboundQty: number;
  avgBalanceQty: number;
  turnoverRatio: number;
};

function lineValue(row: StockItemBalance, unitCostByItem: Map<string, number>): number {
  const qty = Math.max(0, Number(row.quantity || 0));
  const cost = Number(unitCostByItem.get(stockUnitCostKey(row.itemType, row.itemId)) ?? 0);
  return qty * cost;
}

export function classifyAbcInventory(
  balances: StockItemBalance[],
  unitCostByItem: Map<string, number>,
): InventoryAbcRow[] {
  const valued = balances
    .map((row) => {
      const totalValue = lineValue(row, unitCostByItem);
      return {
        row,
        totalValue,
        unitValue: Number(unitCostByItem.get(stockUnitCostKey(row.itemType, row.itemId)) ?? 0),
      };
    })
    .filter((x) => x.totalValue > 0)
    .sort((a, b) => b.totalValue - a.totalValue);

  const grand = valued.reduce((s, x) => s + x.totalValue, 0) || 1;
  let cumulative = 0;

  return valued.map(({ row, totalValue, unitValue }) => {
    const shareBefore = cumulative / grand;
    cumulative += totalValue;
    const share = cumulative / grand;
    const abcClass: AbcClass = shareBefore < 0.8 ? 'A' : shareBefore < 0.95 ? 'B' : 'C';
    return {
      itemType: row.itemType,
      itemId: row.itemId,
      itemName: row.itemName,
      warehouseId: row.warehouseId,
      quantity: Number(row.quantity || 0),
      unitValue,
      totalValue,
      abcClass,
      cumulativeSharePct: Math.round(share * 1000) / 10,
    };
  });
}

export function estimateTurnover(
  balances: StockItemBalance[],
  transactions: StockTransaction[],
): InventoryTurnoverRow[] {
  const outboundByKey = new Map<string, number>();
  const balanceQtyByKey = new Map<string, { qty: number; name: string; type: StockItemBalance['itemType'] }>();

  for (const row of balances) {
    const key = `${row.itemType}__${row.itemId}`;
    balanceQtyByKey.set(key, {
      qty: Number(row.quantity || 0),
      name: row.itemName,
      type: row.itemType,
    });
  }

  for (const tx of transactions) {
    const qty = Math.abs(Number(tx.quantity || 0));
    if (qty <= 0) continue;
    if (tx.movementType !== 'OUT' && tx.movementType !== 'TRANSFER') continue;
    const key = `${tx.itemType}__${tx.itemId}`;
    outboundByKey.set(key, (outboundByKey.get(key) || 0) + qty);
  }

  const keys = new Set([...balanceQtyByKey.keys(), ...outboundByKey.keys()]);
  const rows: InventoryTurnoverRow[] = [];
  keys.forEach((key) => {
    const meta = balanceQtyByKey.get(key);
    const [itemType, itemId] = key.split('__') as [StockItemBalance['itemType'], string];
    const avgBalanceQty = Math.max(0, meta?.qty ?? 0);
    const outboundQty = outboundByKey.get(key) || 0;
    const turnoverRatio = avgBalanceQty > 0 ? outboundQty / avgBalanceQty : outboundQty > 0 ? 999 : 0;
    rows.push({
      itemType: meta?.type || itemType,
      itemId,
      itemName: meta?.name || itemId,
      outboundQty,
      avgBalanceQty,
      turnoverRatio: Math.round(turnoverRatio * 100) / 100,
    });
  });

  return rows.sort((a, b) => b.turnoverRatio - a.turnoverRatio);
}
