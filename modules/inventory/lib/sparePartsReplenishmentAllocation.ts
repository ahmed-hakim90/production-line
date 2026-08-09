import { allocateProductionIssueFromLocations } from './productionIssueAllocation';
import type {
  SparePartsReplenishmentAllocation,
  SparePartsReplenishmentLine,
  StockLocationBalance,
} from '../types';

/**
 * Auto-allocate replenishment qty across central-warehouse location balances (FIFO).
 * Same algorithm as production issue / repair spare-issue preparation.
 */
export function allocateSparePartsReplenishmentFromLocations(
  balances: StockLocationBalance[],
  requiredQty: number,
  preferredLocationId?: string,
): {
  allocations: SparePartsReplenishmentAllocation[];
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

/** Normalize legacy single-location fields into allocations[]. */
export function normalizeSparePartsReplenishmentAllocations(
  line: Pick<
    SparePartsReplenishmentLine,
    'preparedQty' | 'requestedQty' | 'locationId' | 'locationCode' | 'allocations'
  >,
): SparePartsReplenishmentAllocation[] {
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
  const qty = Number(line.preparedQty || line.requestedQty || 0);
  if (!(qty > 0)) return [];
  return [{
    locationId,
    locationCode: String(line.locationCode || locationId).trim(),
    quantity: qty,
  }];
}

/** Scale pick plan down when received qty is less than prepared (FIFO order). */
export function scaleSparePartsReplenishmentAllocations(
  allocations: SparePartsReplenishmentAllocation[],
  targetQty: number,
): SparePartsReplenishmentAllocation[] {
  let remaining = Number(targetQty || 0);
  if (!(remaining > 0)) return [];
  const out: SparePartsReplenishmentAllocation[] = [];
  for (const row of allocations) {
    if (remaining <= 0) break;
    const take = Math.min(Number(row.quantity || 0), remaining);
    if (!(take > 0)) continue;
    out.push({ ...row, quantity: take });
    remaining -= take;
  }
  return out;
}
