/**
 * Whether a manufacturing material may be linked/created as a repair spare part.
 * Missing flag = available (backward compatible for legacy docs).
 */
export function isMaterialAvailableForSpareParts(
  material: { availableForSpareParts?: boolean | null } | null | undefined,
): boolean {
  if (!material) return false;
  return material.availableForSpareParts !== false;
}

/**
 * Explicit opt-in for spare-parts warehouse / purchase catalogs.
 * Missing or false = hidden (manufacturing components stay out of central spare UI).
 */
export function isMaterialOptedInForSpareParts(
  material: { availableForSpareParts?: boolean | null } | null | undefined,
): boolean {
  if (!material) return false;
  return material.availableForSpareParts === true;
}

export function filterMaterialsAvailableForSpareParts<
  T extends { availableForSpareParts?: boolean | null },
>(materials: T[]): T[] {
  return materials.filter((m) => isMaterialAvailableForSpareParts(m));
}

export function filterMaterialsOptedInForSpareParts<
  T extends { availableForSpareParts?: boolean | null },
>(materials: T[]): T[] {
  return materials.filter((m) => isMaterialOptedInForSpareParts(m));
}

export const MATERIAL_NOT_AVAILABLE_FOR_SPARE_PARTS_ERROR =
  'هذه المادة غير مفعّلة لقطع الغيار. فعّلها من شاشة المواد التصنيعية أولاً.';
