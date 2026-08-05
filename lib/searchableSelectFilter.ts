import { toEnglishDigits } from '@/lib/englishDigits';

/**
 * cmdk-compatible filter: Arabic/Persian digits in the search query match Western digits in option values.
 * Returns 1 when the normalized search is contained in the normalized item value, else 0.
 */
export function searchableSelectFilter(itemValue: string, search: string): number {
  const q = toEnglishDigits(String(search || '')).trim().toLowerCase();
  if (!q) return 1;
  const hay = toEnglishDigits(String(itemValue || '')).toLowerCase();
  return hay.includes(q) ? 1 : 0;
}
