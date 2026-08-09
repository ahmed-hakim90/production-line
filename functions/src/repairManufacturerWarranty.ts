/**
 * Manufacturer warranty helpers for Cloud Functions (mirrors modules/repair/lib).
 * Full = all products inWarranty → settlementType warranty.
 * Partial = mixed → bill non-warranty services/parts only.
 */

export type WarrantyScope = 'none' | 'partial' | 'manufacturer';

type ProductFlag = { inWarranty?: unknown; itemId?: unknown } | null | undefined;

export function jobHasInWarrantyProduct(products: Array<ProductFlag> | null | undefined): boolean {
  return (products || []).some((item) => Boolean(item?.inWarranty));
}

export function resolveManufacturerWarrantyScope(
  products: Array<ProductFlag> | null | undefined,
): WarrantyScope {
  const list = (products || []).filter(Boolean) as Array<NonNullable<ProductFlag>>;
  if (list.length === 0) return 'none';
  const warrantyCount = list.filter((item) => Boolean(item.inWarranty)).length;
  if (warrantyCount === 0) return 'none';
  if (warrantyCount === list.length) return 'manufacturer';
  return 'partial';
}

export function isFullManufacturerWarrantyJob(job: {
  warrantyScope?: unknown;
  jobProducts?: Array<ProductFlag> | null;
}): boolean {
  if (String(job.warrantyScope || '') === 'manufacturer') return true;
  if (String(job.warrantyScope || '') === 'partial') return false;
  if (String(job.warrantyScope || '') === 'none') return false;
  return resolveManufacturerWarrantyScope(job.jobProducts) === 'manufacturer';
}

export function isPartialManufacturerWarrantyJob(job: {
  warrantyScope?: unknown;
  jobProducts?: Array<ProductFlag> | null;
}): boolean {
  if (String(job.warrantyScope || '') === 'partial') return true;
  if (String(job.warrantyScope || '') === 'manufacturer') return false;
  if (String(job.warrantyScope || '') === 'none') return false;
  return resolveManufacturerWarrantyScope(job.jobProducts) === 'partial';
}

export function warrantyProductItemIds(
  products: Array<ProductFlag> | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const row of products || []) {
    if (!row?.inWarranty) continue;
    const id = String(row.itemId || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

/** Part usage counts toward warranty allowance (not customer bill). */
export function isWarrantyAttributedPart(
  usage: { productItemId?: unknown; scope?: unknown } | null | undefined,
  warrantyIds: Set<string>,
  fullWarranty: boolean,
): boolean {
  if (fullWarranty) return true;
  if (warrantyIds.size === 0) return false;
  const productItemId = String(usage?.productItemId || '').trim();
  return Boolean(productItemId && warrantyIds.has(productItemId));
}
