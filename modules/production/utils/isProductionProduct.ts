/**
 * Finished goods used on production lines/plans/reports.
 * Missing flag = manufactured (backward compatible with existing catalog).
 */
export function isProductionProduct(
  product: { isManufactured?: boolean | null } | null | undefined,
): boolean {
  if (!product) return false;
  return product.isManufactured !== false;
}

export function filterProductionProducts<T extends { isManufactured?: boolean | null }>(
  products: T[],
): T[] {
  return products.filter((p) => isProductionProduct(p));
}

export const NON_MANUFACTURED_PRODUCT_PRODUCTION_ERROR =
  'هذا المنتج غير تصنيعي ولا يمكن استخدامه في الإنتاج. استخدمه من قطع الغيار والصيانة فقط.';
