/**
 * Rules for which catalog raw materials appear in component-injection report pickers.
 * Keep in sync across Reports, Quick Action, and global create modal.
 */

export const normalizeArabic = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const parseInjectionCategoryTokens = (value?: string) =>
  String(value || 'حقن')
    .split(',')
    .map((part) => normalizeArabic(part))
    .filter(Boolean);

export const isInjectionCategory = (value: string | undefined, tokens: string[]) => {
  const normalized = normalizeArabic(value || '');
  if (!normalized) return false;
  return tokens.some((token) => normalized.includes(token));
};
