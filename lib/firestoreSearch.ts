const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Split SK-7033A / PRD_12 / sk 7033 into compact identity tokens. */
const TOKEN_SPLIT = /[^0-9a-z\u0600-\u06ff]+/i;
const NON_ALNUM = /[^0-9a-z\u0600-\u06ff]+/gi;

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

/** Collapse separators so SK-7033A / sk 7033 a / sk7033a share one form. */
export function collapseFirestoreSearchToken(value: string): string {
  return value.replace(NON_ALNUM, '');
}

function addPrefixes(target: Set<string>, value: string, minLength: number): void {
  if (!value) return;
  const max = Math.min(value.length, SEARCH_PREFIX_MAX_LENGTH);
  for (let length = minLength; length <= max && target.size < SEARCH_PREFIX_LIMIT; length += 1) {
    target.add(value.slice(0, length));
  }
}

function compactTokens(normalized: string): string[] {
  const tokens = new Set<string>();
  for (const word of normalized.split(' ').filter(Boolean)) {
    tokens.add(word);
    const collapsedWord = collapseFirestoreSearchToken(word);
    if (collapsedWord) tokens.add(collapsedWord);
    for (const part of word.split(TOKEN_SPLIT).filter(Boolean)) {
      tokens.add(part);
      const collapsedPart = collapseFirestoreSearchToken(part);
      if (collapsedPart) tokens.add(collapsedPart);
    }
  }
  const fullCollapsed = collapseFirestoreSearchToken(normalized);
  if (fullCollapsed) tokens.add(fullCollapsed);
  return Array.from(tokens);
}

/**
 * Builds bounded Firestore array-contains keys.
 * Indexes hyphen/space/collapsed model forms first (SK-7033A → 7033 / sk7033a)
 * so long Arabic names cannot starve code/model lookups.
 */
export function buildSearchPrefixes(values: readonly unknown[]): string[] {
  const prefixes = new Set<string>();
  // Prefer compact identity fields (codes/barcodes) before long descriptive names.
  const normalizedValues = values
    .map((raw) => normalizeFirestoreSearch(raw))
    .filter(Boolean)
    .sort((a, b) => {
      const score = (value: string) => (/\s/.test(value) ? 1000 : 0) + value.length;
      return score(a) - score(b);
    });

  for (const normalized of normalizedValues) {
    for (const token of compactTokens(normalized)) {
      addPrefixes(prefixes, token, SEARCH_MIN_LENGTH);
    }
  }

  for (const normalized of normalizedValues) {
    const words = normalized.split(' ').filter(Boolean);
    for (let index = 0; index < words.length && prefixes.size < SEARCH_PREFIX_LIMIT; index += 1) {
      addPrefixes(prefixes, words.slice(index).join(' '), SEARCH_MIN_LENGTH);
      addPrefixes(prefixes, words[index]!, SEARCH_MIN_LENGTH);
    }
  }

  return Array.from(prefixes).slice(0, SEARCH_PREFIX_LIMIT);
}

/**
 * Picks the Firestore array-contains key for an operator query so spaced /
 * hyphenated / glued model typing all resolve to an indexed token.
 */
export function resolveFirestoreSearchKey(value: unknown): string {
  const normalized = normalizeFirestoreSearch(value);
  if (normalized.length < SEARCH_MIN_LENGTH) return normalized;

  // Spaced queries: "sk 7033" / "كبه 7033a" → strongest typed digit word.
  if (/\s/.test(normalized)) {
    const words = normalized.split(' ').filter(Boolean);
    const digitWords = words
      .map((word) => collapseFirestoreSearchToken(word) || word)
      .filter((token) => /\d/.test(token) && token.length >= SEARCH_MIN_LENGTH)
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
    if (digitWords[0]) return digitWords[0]!;

    const tokens = compactTokens(normalized).sort((a, b) => b.length - a.length);
    return tokens[0] || collapseFirestoreSearchToken(normalized);
  }

  // Single chunk keeps hyphenated form (sk-7033a); collapsed forms are indexed too.
  return normalized;
}

/** Client-side match that mirrors indexed writing-style flexibility. */
export function matchesFirestoreSearch(haystack: unknown, query: unknown): boolean {
  const q = normalizeFirestoreSearch(query);
  if (!q) return true;
  const h = normalizeFirestoreSearch(haystack);
  if (!h) return false;
  if (h.includes(q)) return true;
  const qCollapsed = collapseFirestoreSearchToken(q);
  const hCollapsed = collapseFirestoreSearchToken(h);
  if (qCollapsed.length >= SEARCH_MIN_LENGTH && hCollapsed.includes(qCollapsed)) return true;
  const key = resolveFirestoreSearchKey(q);
  return compactTokens(h).some((token) => token.startsWith(key) || token.includes(key));
}

export function isServerSearchReady(value: unknown): boolean {
  const normalized = normalizeFirestoreSearch(value);
  return normalized.length === 0 || normalized.length >= SEARCH_MIN_LENGTH;
}
