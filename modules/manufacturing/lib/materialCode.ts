export const MATERIAL_CATEGORY_CODE_REQUIRED = 'MATERIAL_CATEGORY_CODE_REQUIRED';
export const INVALID_MATERIAL_CATEGORY_CODE = 'INVALID_MATERIAL_CATEGORY_CODE';
export const MATERIAL_CODE_PADDING = 4;

const MATERIAL_CATEGORY_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

export function normalizeMaterialCategoryCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function isValidMaterialCategoryCode(value: unknown): boolean {
  return MATERIAL_CATEGORY_CODE_PATTERN.test(normalizeMaterialCategoryCode(value));
}

export function materialCategoryCounterKey(categoryCode: string): string {
  return `manufacturing_material_by_category_v2:${normalizeMaterialCategoryCode(categoryCode)}`;
}

export function maxMaterialCategorySequence(
  codes: readonly string[],
  categoryCode: string,
): number {
  const prefix = normalizeMaterialCategoryCode(categoryCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!prefix) return 0;
  const pattern = new RegExp(`^${prefix}-(\\d{${MATERIAL_CODE_PADDING}})$`, 'i');
  let max = 0;
  for (const code of codes) {
    const match = String(code || '').trim().match(pattern);
    if (match) max = Math.max(max, Number(match[1] || 0));
  }
  return max;
}
