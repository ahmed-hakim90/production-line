import type { ProductionIssueAllocation, StockLocationBalance } from '../types';

export function allocateProductionIssueFromLocations(
  balances: StockLocationBalance[],
  requiredQty: number,
  preferredLocationId?: string,
): { allocations: ProductionIssueAllocation[]; availableQty: number; shortageQty: number } {
  let remaining = requiredQty;
  const allocations: ProductionIssueAllocation[] = [];
  const sorted = balances
    .filter((row) => Number(row.quantity || 0) > 0)
    .sort((a, b) => {
      if (preferredLocationId) {
        if (a.locationId === preferredLocationId && b.locationId !== preferredLocationId) return -1;
        if (b.locationId === preferredLocationId && a.locationId !== preferredLocationId) return 1;
      }
      return String(a.lastMovementAt || a.updatedAt).localeCompare(String(b.lastMovementAt || b.updatedAt));
    });
  const availableQty = sorted.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  for (const row of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(row.quantity || 0));
    allocations.push({
      locationId: row.locationId,
      locationCode: row.locationCode,
      rack: row.rack,
      shelf: row.shelf,
      quantity: take,
    });
    remaining -= take;
  }
  return { allocations, availableQty, shortageQty: Math.max(0, requiredQty - availableQty) };
}
