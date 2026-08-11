const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const SEARCH_PREFIX_LIMIT = 80;
export const SEARCH_PREFIX_MAX_LENGTH = 32;
export const SEARCH_MIN_LENGTH = 2;

/** Stable Arabic/Latin normalization used by both writes and list queries. */
export function normalizeFirestoreSearch(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ar-EG')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(ARABIC_DIACRITICS, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function addPrefixes(target: Set<string>, value: string, minLength: number): void {
  const max = Math.min(value.length, SEARCH_PREFIX_MAX_LENGTH);
  for (let length = minLength; length <= max && target.size < SEARCH_PREFIX_LIMIT; length += 1) {
    target.add(value.slice(0, length));
  }
}

/**
 * Builds bounded Firestore array-contains keys. Every word suffix is indexed,
 * so a user can start at any word without an external search service.
 */
export function buildSearchPrefixes(values: readonly unknown[]): string[] {
  const prefixes = new Set<string>();
  for (const raw of values) {
    const normalized = normalizeFirestoreSearch(raw);
    if (!normalized) continue;
    const words = normalized.split(' ').filter(Boolean);
    for (let index = 0; index < words.length && prefixes.size < SEARCH_PREFIX_LIMIT; index += 1) {
      const suffix = words.slice(index).join(' ');
      addPrefixes(prefixes, suffix, SEARCH_MIN_LENGTH);
      addPrefixes(prefixes, words[index]!, SEARCH_MIN_LENGTH);
    }
  }
  return Array.from(prefixes).slice(0, SEARCH_PREFIX_LIMIT);
}

export function isServerSearchReady(value: unknown): boolean {
  const normalized = normalizeFirestoreSearch(value);
  return normalized.length === 0 || normalized.length >= SEARCH_MIN_LENGTH;
}
