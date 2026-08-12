const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Split SK-7033A / PRD_12 / sk 7033 into compact identity tokens. */
const TOKEN_SPLIT = /[^0-9a-z\u0600-\u06ff]+/i;
const NON_ALNUM = /[^0-9a-z\u0600-\u06ff]+/gi;
export const SEARCH_PREFIX_LIMIT = 80;
export const SEARCH_PREFIX_MAX_LENGTH = 32;
export const SEARCH_MIN_LENGTH = 2;
export function normalizeSearch(value) {
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
export function collapseSearchToken(value) {
    return value.replace(NON_ALNUM, '');
}
function addPrefixes(target, value, minLength) {
    if (!value)
        return;
    const max = Math.min(value.length, SEARCH_PREFIX_MAX_LENGTH);
    for (let length = minLength; length <= max && target.size < SEARCH_PREFIX_LIMIT; length += 1) {
        target.add(value.slice(0, length));
    }
}
function compactTokens(normalized) {
    const tokens = new Set();
    for (const word of normalized.split(' ').filter(Boolean)) {
        tokens.add(word);
        const collapsedWord = collapseSearchToken(word);
        if (collapsedWord)
            tokens.add(collapsedWord);
        for (const part of word.split(TOKEN_SPLIT).filter(Boolean)) {
            tokens.add(part);
            const collapsedPart = collapseSearchToken(part);
            if (collapsedPart)
                tokens.add(collapsedPart);
        }
    }
    const fullCollapsed = collapseSearchToken(normalized);
    if (fullCollapsed)
        tokens.add(fullCollapsed);
    return Array.from(tokens);
}
/**
 * Builds bounded Firestore array-contains keys.
 * Indexes hyphen/space/collapsed model forms first (SK-7033A → 7033 / sk7033a)
 * so long Arabic names cannot starve code/model lookups.
 */
export function buildSearchPrefixes(values) {
    const prefixes = new Set();
    // Prefer compact identity fields (codes/barcodes) before long descriptive names.
    const normalizedValues = values
        .map((raw) => normalizeSearch(raw))
        .filter(Boolean)
        .sort((a, b) => {
        const score = (value) => (/\s/.test(value) ? 1000 : 0) + value.length;
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
            addPrefixes(prefixes, words[index], SEARCH_MIN_LENGTH);
        }
    }
    return Array.from(prefixes).slice(0, SEARCH_PREFIX_LIMIT);
}
export function resolveSearchKey(value) {
    const normalized = normalizeSearch(value);
    if (normalized.length < SEARCH_MIN_LENGTH)
        return normalized;
    if (/\s/.test(normalized)) {
        const words = normalized.split(' ').filter(Boolean);
        const digitWords = words
            .map((word) => collapseSearchToken(word) || word)
            .filter((token) => /\d/.test(token) && token.length >= SEARCH_MIN_LENGTH)
            .sort((a, b) => b.length - a.length || a.localeCompare(b));
        if (digitWords[0])
            return digitWords[0];
        const tokens = compactTokens(normalized).sort((a, b) => b.length - a.length);
        return tokens[0] || collapseSearchToken(normalized);
    }
    return normalized;
}
