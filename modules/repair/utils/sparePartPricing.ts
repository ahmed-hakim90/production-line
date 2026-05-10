import type { RepairSparePart } from '../types';

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** تكلفة الوحدة بعد خصم المخزن (نسبة مئوية من تكلفة الشراء). */
export function effectiveSparePartUnitCost(part: RepairSparePart): number {
  const base = Number(part.purchaseUnitCost ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const disc = clampPct(Number(part.warehouseDiscountPercent ?? 0));
  return Math.round(base * (1 - disc / 100) * 10000) / 10000;
}

export function sparePartMarginPreview(part: RepairSparePart): number | null {
  const sale = Number(part.defaultSalePrice ?? NaN);
  const cost = effectiveSparePartUnitCost(part);
  if (!Number.isFinite(sale) || sale < 0) return null;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round((sale - cost) * 100) / 100;
}
