/** Pricing screen is for repair components only (MaterialType raw_material → label «مكون»). */
export const REPAIR_PRICING_MATERIAL_TYPE = 'raw_material' as const;
/** Repair spare-part masters use company codes like MAT-180 — exclude other prefixes. */
export const REPAIR_PRICING_MATERIAL_CODE_PREFIX = 'MAT';

/**
 * Materials eligible for the repair parts pricing list:
 * active raw_material (مكون) whose business code starts with MAT.
 */
export function isRepairPartsPricingMaterial(material: {
  id?: string | null;
  type?: string | null;
  code?: string | null;
  isActive?: boolean | null;
}): boolean {
  if (material.isActive === false) return false;
  if (!String(material.id || '').trim()) return false;
  if (material.type !== REPAIR_PRICING_MATERIAL_TYPE) return false;
  return String(material.code || '')
    .trim()
    .toUpperCase()
    .startsWith(REPAIR_PRICING_MATERIAL_CODE_PREFIX);
}
