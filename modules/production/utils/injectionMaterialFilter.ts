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

export type InjectionMaterialFilterRow = {
  categoryName?: string;
  name?: string;
  code?: string;
};

export const isInjectionMaterial = (row: InjectionMaterialFilterRow, tokens: string[]) => {
  if (isInjectionCategory(row.categoryName, tokens)) return true;
  if (String(row.categoryName || '').trim()) return false;

  const fallbackText = [row.name, row.code]
    .map((part) => normalizeArabic(part || ''))
    .filter(Boolean)
    .join(' ');
  if (!fallbackText) return false;
  return tokens.some((token) => fallbackText.includes(token));
};
