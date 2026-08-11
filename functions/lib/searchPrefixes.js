const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const SEARCH_PREFIX_LIMIT = 80;
export function normalizeSearch(value) {
    return String(value ?? '').trim().toLocaleLowerCase('ar-EG')
        .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
        .replace(ARABIC_DIACRITICS, '').replace(/ـ/g, '').replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي').replace(/\s+/g, ' ');
}
export function buildSearchPrefixes(values) {
    const result = new Set();
    const add = (value) => {
        for (let length = 2; length <= Math.min(value.length, 32) && result.size < SEARCH_PREFIX_LIMIT; length += 1) {
            result.add(value.slice(0, length));
        }
    };
    for (const raw of values) {
        const normalized = normalizeSearch(raw);
        const words = normalized.split(' ').filter(Boolean);
        for (let index = 0; index < words.length && result.size < SEARCH_PREFIX_LIMIT; index += 1) {
            add(words.slice(index).join(' '));
            add(words[index]);
        }
    }
    return [...result].slice(0, SEARCH_PREFIX_LIMIT);
}
