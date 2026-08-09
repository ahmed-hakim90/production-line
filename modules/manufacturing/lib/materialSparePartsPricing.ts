import { isRepairPartsPricingMaterial } from '../../repair/lib/repairPartsPricingMaterials';

/** Pure helpers for spare-part pricing on the materials master. */

export function materialShowsSparePartsPricing(material: {
  id?: string | null;
  type?: string | null;
  code?: string | null;
  isActive?: boolean | null;
  availableForSpareParts?: boolean | null;
}): boolean {
  // Form preview before save may omit id — treat a temp id as present for field visibility.
  return isRepairPartsPricingMaterial({
    ...material,
    id: material.id || (String(material.code || '').trim() ? '__preview__' : ''),
  });
}

export function pricesEqual(
  left: { consumer: number; trader: number; cost: number },
  right: { consumer: number; trader: number; cost: number },
): boolean {
  return left.consumer === right.consumer
    && left.trader === right.trader
    && left.cost === right.cost;
}
