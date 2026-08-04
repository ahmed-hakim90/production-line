import type { RepairSparePart } from '../types';

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Sale/usage price shown in the repair module (single price for centers).
 * Never falls back to purchase cost.
 */
export function repairSparePartSalePrice(part: Pick<RepairSparePart, 'defaultSalePrice'>): number {
  const sale = Number(part.defaultSalePrice ?? 0);
  if (!Number.isFinite(sale) || sale < 0) return 0;
  return Math.round(sale * 10000) / 10000;
}

/**
 * Internal purchase cost after warehouse discount — inventory/manufacturing only.
 * Do not surface this in repair center UI.
 */
export function effectiveSparePartUnitCost(part: RepairSparePart): number {
  const base = Number(part.purchaseUnitCost ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const disc = clampPct(Number(part.warehouseDiscountPercent ?? 0));
  return Math.round(base * (1 - disc / 100) * 10000) / 10000;
}

export function sparePartMarginPreview(part: RepairSparePart): number | null {
  const sale = repairSparePartSalePrice(part);
  const cost = effectiveSparePartUnitCost(part);
  if (!(sale > 0) || !(cost > 0)) return null;
  return Math.round((sale - cost) * 100) / 100;
}
