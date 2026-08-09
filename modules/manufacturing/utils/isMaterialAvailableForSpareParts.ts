/**
 * Whether a manufacturing material may be linked/created as a repair spare part.
 * Missing flag = available (backward compatible).
 */
export function isMaterialAvailableForSpareParts(
  material: { availableForSpareParts?: boolean | null } | null | undefined,
): boolean {
  if (!material) return false;
  return material.availableForSpareParts !== false;
}

export function filterMaterialsAvailableForSpareParts<
  T extends { availableForSpareParts?: boolean | null },
>(materials: T[]): T[] {
  return materials.filter((m) => isMaterialAvailableForSpareParts(m));
}

export const MATERIAL_NOT_AVAILABLE_FOR_SPARE_PARTS_ERROR =
  'هذه المادة غير مفعّلة لقطع الغيار. فعّلها من شاشة المواد التصنيعية أولاً.';
