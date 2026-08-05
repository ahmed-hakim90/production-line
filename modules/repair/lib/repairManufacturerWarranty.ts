/**
 * Manufacturer warranty settlement helpers.
 * Intake `inWarranty` on any product → whole job is manufacturer warranty (no customer revenue).
 */
import type { RepairJobProduct, RepairPartUsage, RepairWarrantyScope } from '../types';

export const REPAIR_WARRANTY_SETTLEMENT = 'warranty' as const;

export function jobHasInWarrantyProduct(
  products: Array<Pick<RepairJobProduct, 'inWarranty'> | null | undefined> | null | undefined,
): boolean {
  return (products || []).some((item) => Boolean(item?.inWarranty));
}

export function resolveManufacturerWarrantyScope(
  products: Array<Pick<RepairJobProduct, 'inWarranty'> | null | undefined> | null | undefined,
): RepairWarrantyScope {
  return jobHasInWarrantyProduct(products) ? 'manufacturer' : 'none';
}

export function isManufacturerWarrantyJob(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<Pick<RepairJobProduct, 'inWarranty'> | null | undefined> | null;
}): boolean {
  if (String(job.warrantyScope || '') === 'manufacturer') return true;
  return jobHasInWarrantyProduct(job.jobProducts);
}

export function isWarrantySettlementAuth(auth: {
  settlementType?: string | null;
  grossAmount?: number | null;
} | null | undefined): boolean {
  if (!auth) return false;
  if (String(auth.settlementType || '') === REPAIR_WARRANTY_SETTLEMENT) return true;
  return false;
}

/** Prefer inventory issue cost snapshot; fall back to qty × unitCost only when snapshot missing. */
export function sumWarrantyPartsIssueCost(
  partsUsed: Array<Pick<RepairPartUsage, 'quantity' | 'unitCost' | 'unitCostSnapshot' | 'totalCostSnapshot'> | null | undefined> | null | undefined,
): number {
  let sum = 0;
  for (const raw of partsUsed || []) {
    if (!raw) continue;
    const snapTotal = Number(raw.totalCostSnapshot);
    if (Number.isFinite(snapTotal) && snapTotal > 0) {
      sum += snapTotal;
      continue;
    }
    const unitSnap = Number(raw.unitCostSnapshot);
    const qty = Math.max(0, Number(raw.quantity || 0));
    if (Number.isFinite(unitSnap) && unitSnap > 0 && qty > 0) {
      sum += unitSnap * qty;
      continue;
    }
    // Legacy rows without purchase snapshot — exclude sale unitCost from warranty COGS KPI.
  }
  return Math.round(sum * 100) / 100;
}

export function sumManufacturerWarrantyPartsCost(
  jobs: Array<{
    warrantyScope?: string | null;
    jobProducts?: Array<Pick<RepairJobProduct, 'inWarranty'> | null | undefined> | null;
    partsUsed?: Array<Pick<RepairPartUsage, 'quantity' | 'unitCost' | 'unitCostSnapshot' | 'totalCostSnapshot'> | null | undefined> | null;
  }>,
): number {
  return Math.round(
    jobs
      .filter((job) => isManufacturerWarrantyJob(job))
      .reduce((sum, job) => sum + sumWarrantyPartsIssueCost(job.partsUsed), 0) * 100,
  ) / 100;
}
