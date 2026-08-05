import type { CustomerType } from '../../customers/types';
import type { RepairSparePart } from '../types';

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** Normalize a non-negative money amount; invalid → 0. */
export function normalizeRepairSalePrice(value: unknown): number {
  const sale = Number(value ?? 0);
  if (!Number.isFinite(sale) || sale < 0) return 0;
  return Math.round(sale * 10000) / 10000;
}

/**
 * Company-wide sale price by customer type:
 * - trader → Material.traderSalePrice when > 0, else consumer price
 * - consumer / missing type → Material.defaultSalePrice (consumer), then legacy part catalog
 * Never falls back to purchase cost.
 */
export function resolveRepairSalePrice(input: {
  customerType?: CustomerType | string | null;
  materialSalePrice?: number | null;
  materialTraderSalePrice?: number | null;
  partSalePrice?: number | null;
}): number {
  const consumer =
    normalizeRepairSalePrice(input.materialSalePrice)
    || normalizeRepairSalePrice(input.partSalePrice);
  if (input.customerType === 'trader') {
    const trader = normalizeRepairSalePrice(input.materialTraderSalePrice);
    if (trader > 0) return trader;
  }
  return consumer;
}

/**
 * Legacy helper: part catalog sale only.
 * Prefer resolveRepairSalePrice when a Material price may exist.
 */
export function repairSparePartSalePrice(part: Pick<RepairSparePart, 'defaultSalePrice'>): number {
  return normalizeRepairSalePrice(part.defaultSalePrice);
}

/**
 * Internal purchase cost after warehouse discount — inventory/manufacturing only.
 * Do not use as a customer-facing sale price.
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
