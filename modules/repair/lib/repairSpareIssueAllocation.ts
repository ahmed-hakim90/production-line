import { allocateProductionIssueFromLocations } from '../../inventory/lib/productionIssueAllocation';
import type { StockLocationBalance } from '../../inventory/types';
import type { RepairSpareIssueAllocation } from '../types';

/**
 * Auto-allocate spare-issue qty across location balances (preferred shelf first, then FIFO).
 * Same algorithm as production issue preparation.
 */
export function allocateRepairSpareIssueFromLocations(
  balances: StockLocationBalance[],
  requiredQty: number,
  preferredLocationId?: string,
): {
  allocations: RepairSpareIssueAllocation[];
  availableQty: number;
  shortageQty: number;
} {
  const result = allocateProductionIssueFromLocations(
    balances,
    requiredQty,
    preferredLocationId,
  );
  return {
    allocations: result.allocations.map((row) => ({
      locationId: row.locationId,
      locationCode: row.locationCode,
      ...(row.rack ? { rack: row.rack } : {}),
      ...(row.shelf ? { shelf: row.shelf } : {}),
      quantity: row.quantity,
    })),
    availableQty: result.availableQty,
    shortageQty: result.shortageQty,
  };
}

/** Normalize legacy single-location lines into allocations[]. */
export function normalizeRepairSpareIssueAllocations(line: {
  quantity: number;
  locationId?: string;
  locationCode?: string;
  allocations?: RepairSpareIssueAllocation[];
}): RepairSpareIssueAllocation[] {
  if (Array.isArray(line.allocations) && line.allocations.length > 0) {
    return line.allocations
      .map((row) => ({
        locationId: String(row.locationId || '').trim(),
        locationCode: String(row.locationCode || row.locationId || '').trim(),
        ...(row.rack ? { rack: String(row.rack) } : {}),
        ...(row.shelf ? { shelf: String(row.shelf) } : {}),
        quantity: Number(row.quantity || 0),
      }))
      .filter((row) => row.locationId && row.quantity > 0);
  }
  const locationId = String(line.locationId || '').trim();
  if (!locationId) return [];
  return [{
    locationId,
    locationCode: String(line.locationCode || locationId).trim(),
    quantity: Number(line.quantity || 0),
  }];
}
