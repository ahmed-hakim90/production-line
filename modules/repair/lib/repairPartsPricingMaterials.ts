/** Pricing screen is for repair components only (MaterialType raw_material → label «مكون»). */
export const REPAIR_PRICING_MATERIAL_TYPE = 'raw_material' as const;

/**
 * Materials eligible for the repair parts pricing list:
 * active raw_material (مكون) available for spare parts.
 * Codes follow category prefixes (MAT-…, SP-…, INJ-…, etc.) — not a single legacy MAT* prefix.
 */
export function isRepairPartsPricingMaterial(material: {
  id?: string | null;
  type?: string | null;
  code?: string | null;
  isActive?: boolean | null;
  availableForSpareParts?: boolean | null;
}): boolean {
  if (material.isActive === false) return false;
  if (!String(material.id || '').trim()) return false;
  if (material.type !== REPAIR_PRICING_MATERIAL_TYPE) return false;
  if (material.availableForSpareParts === false) return false;
  return Boolean(String(material.code || '').trim());
}
