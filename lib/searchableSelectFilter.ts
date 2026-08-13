import { toEnglishDigits } from '@/lib/englishDigits';

export function normalizeScanQuery(value: string | undefined | null): string {
  return toEnglishDigits(String(value || '')).trim().toLowerCase();
}

/**
 * cmdk-compatible filter: Arabic/Persian digits in the search query match Western digits in option values.
 * Returns 1 when the normalized search is contained in the normalized item value, else 0.
 */
export function searchableSelectFilter(itemValue: string, search: string): number {
  const q = normalizeScanQuery(search);
  if (!q) return 1;
  const hay = normalizeScanQuery(itemValue);
  return hay.includes(q) ? 1 : 0;
}

export type ScanMatchOption = {
  value: string;
  scanKeys?: string[];
};

/**
 * Exact barcode/code hit for a gun scan or typed code in the same search box.
 * Returns the option value only when exactly one scan key matches.
 */
export function matchSelectOptionByScan(
  options: ScanMatchOption[],
  raw: string,
): string | null {
  const q = normalizeScanQuery(raw);
  if (!q) return null;
  const hits = options.filter((opt) =>
    (opt.scanKeys || []).some((key) => normalizeScanQuery(key) === q),
  );
  if (hits.length !== 1) return null;
  const value = String(hits[0]?.value || '').trim();
  return value || null;
}
