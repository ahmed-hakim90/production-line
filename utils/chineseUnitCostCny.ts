/**
 * Chinese supplier unit price is entered in CNY (¥); `chineseUnitCost` on the product is stored in EGP.
 * `cnyToEgpRate` means: 1 CNY = cnyToEgpRate EGP (from cost settings).
 */

export function chineseUnitCostEgpFromYuanUnitPrice(yuan: number, cnyToEgpRate: number): number {
  const y = Number(yuan);
  const r = Number(cnyToEgpRate);
  if (!Number.isFinite(y) || y < 0 || !Number.isFinite(r) || r <= 0) return 0;
  return y * r;
}

/** String for a controlled input, derived from stored EGP when editing. */
export function yuanUnitPriceInputFromChineseUnitCostEgp(egp: number, cnyToEgpRate: number): string {
  const e = Number(egp);
  const r = Number(cnyToEgpRate);
  if (!Number.isFinite(e) || e < 0 || !Number.isFinite(r) || r <= 0) return '';
  const y = e / r;
  if (!Number.isFinite(y)) return '';
  const rounded = Math.round(y * 1e6) / 1e6;
  return String(rounded);
}
