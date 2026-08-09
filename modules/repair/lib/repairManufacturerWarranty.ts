/**
 * Manufacturer warranty settlement helpers.
 *
 * Per-product `inWarranty` at intake:
 * - all products → full manufacturer settlement (no customer revenue)
 * - some products → partial (bill non-warranty lines only)
 * - none → standard collection
 */
import type { RepairPartUsage, RepairWarrantyScope } from '../types';

export const REPAIR_WARRANTY_SETTLEMENT = 'warranty' as const;

export const MANUFACTURER_WARRANTY_LINE_LABEL = {
  inWarranty: 'داخل الضمان',
  without: 'بدون ضمان',
} as const;

export const MANUFACTURER_WARRANTY_SCOPE_LABEL: Record<'none' | 'partial' | 'manufacturer', string> = {
  none: 'بدون ضمان',
  partial: 'ضمان مختلط',
  manufacturer: 'داخل الضمان',
};

type WarrantyProductFlag = {
  inWarranty?: boolean | null;
  itemId?: string | null;
} | null | undefined;

export function jobHasInWarrantyProduct(
  products: Array<WarrantyProductFlag> | null | undefined,
): boolean {
  return (products || []).some((item) => Boolean(item?.inWarranty));
}

export function jobHasBillableProduct(
  products: Array<WarrantyProductFlag> | null | undefined,
): boolean {
  const list = products || [];
  if (list.length === 0) return true;
  return list.some((item) => !item?.inWarranty);
}

/** Derive job warranty scope from product lines. Legacy `in_store` is not written. */
export function resolveManufacturerWarrantyScope(
  products: Array<WarrantyProductFlag> | null | undefined,
): Exclude<RepairWarrantyScope, 'in_store'> {
  const list = (products || []).filter(Boolean) as Array<NonNullable<WarrantyProductFlag>>;
  if (list.length === 0) return 'none';
  const warrantyCount = list.filter((item) => Boolean(item.inWarranty)).length;
  if (warrantyCount === 0) return 'none';
  if (warrantyCount === list.length) return 'manufacturer';
  return 'partial';
}

export function manufacturerWarrantyLineLabel(inWarranty: boolean | null | undefined): string {
  return inWarranty
    ? MANUFACTURER_WARRANTY_LINE_LABEL.inWarranty
    : MANUFACTURER_WARRANTY_LINE_LABEL.without;
}

export function manufacturerWarrantyScopeLabel(
  scope: string | null | undefined,
  products?: Array<WarrantyProductFlag> | null,
): string {
  const resolved = scope === 'partial' || scope === 'manufacturer' || scope === 'none'
    ? scope
    : resolveManufacturerWarrantyScope(products);
  if (resolved === 'partial') return MANUFACTURER_WARRANTY_SCOPE_LABEL.partial;
  if (resolved === 'manufacturer') return MANUFACTURER_WARRANTY_SCOPE_LABEL.manufacturer;
  return MANUFACTURER_WARRANTY_SCOPE_LABEL.none;
}

/** Full manufacturer warranty — entire job free / warranty settlement. */
export function isFullManufacturerWarrantyJob(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<WarrantyProductFlag> | null;
}): boolean {
  if (String(job.warrantyScope || '') === 'manufacturer') return true;
  if (String(job.warrantyScope || '') === 'partial') return false;
  if (String(job.warrantyScope || '') === 'none') return false;
  return resolveManufacturerWarrantyScope(job.jobProducts) === 'manufacturer';
}

/** Mixed job: some lines warranty, some billable. */
export function isPartialManufacturerWarrantyJob(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<WarrantyProductFlag> | null;
}): boolean {
  if (String(job.warrantyScope || '') === 'partial') return true;
  if (String(job.warrantyScope || '') === 'manufacturer') return false;
  if (String(job.warrantyScope || '') === 'none') return false;
  return resolveManufacturerWarrantyScope(job.jobProducts) === 'partial';
}

/**
 * Alias for full manufacturer warranty only (settlementType === 'warranty').
 * Does NOT include partial/mixed jobs — use `hasManufacturerWarrantyCoverage` or
 * `isPartialManufacturerWarrantyJob` when mixed coverage matters.
 */
export function isManufacturerWarrantyJob(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<WarrantyProductFlag> | null;
}): boolean {
  return isFullManufacturerWarrantyJob(job);
}

export function hasManufacturerWarrantyCoverage(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<WarrantyProductFlag> | null;
}): boolean {
  const scope = String(job.warrantyScope || '');
  if (scope === 'manufacturer' || scope === 'partial') return true;
  return jobHasInWarrantyProduct(job.jobProducts);
}

export function warrantyProductItemIds(
  products: Array<WarrantyProductFlag> | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const row of products || []) {
    if (!row?.inWarranty) continue;
    const id = String(row.itemId || '').trim();
    if (id) ids.add(id);
  }
  return ids;
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
  partsUsed: Array<Partial<Pick<RepairPartUsage, 'quantity' | 'unitCost' | 'unitCostSnapshot' | 'totalCostSnapshot'>> | null | undefined> | null | undefined,
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

/**
 * Parts cost attributable to manufacturer warranty.
 * Full warranty jobs: all parts. Partial: only parts linked to warranty productItemId.
 */
export function sumJobManufacturerWarrantyPartsCost(job: {
  warrantyScope?: string | null;
  jobProducts?: Array<WarrantyProductFlag> | null;
  partsUsed?: Array<Partial<Pick<RepairPartUsage, 'quantity' | 'unitCost' | 'unitCostSnapshot' | 'totalCostSnapshot' | 'productItemId' | 'scope'>> | null | undefined> | null;
}): number {
  if (isFullManufacturerWarrantyJob(job)) {
    return sumWarrantyPartsIssueCost(job.partsUsed);
  }
  if (!isPartialManufacturerWarrantyJob(job)) return 0;
  const warrantyIds = warrantyProductItemIds(job.jobProducts);
  const warrantyParts = (job.partsUsed || []).filter((raw) => {
    if (!raw) return false;
    const productItemId = String(raw.productItemId || '').trim();
    return Boolean(productItemId && warrantyIds.has(productItemId));
  });
  return sumWarrantyPartsIssueCost(warrantyParts);
}

export function sumManufacturerWarrantyPartsCost(
  jobs: Array<{
    warrantyScope?: string | null;
    jobProducts?: Array<WarrantyProductFlag> | null;
    partsUsed?: Array<Partial<Pick<RepairPartUsage, 'quantity' | 'unitCost' | 'unitCostSnapshot' | 'totalCostSnapshot' | 'productItemId' | 'scope'>> | null | undefined> | null;
  }>,
): number {
  return Math.round(
    jobs.reduce((sum, job) => sum + sumJobManufacturerWarrantyPartsCost(job), 0) * 100,
  ) / 100;
}
