/** Pure helpers for MAT* spare-part pricing on the materials master. */

export function materialShowsSparePartsPricing(material: {
  type?: string | null;
  code?: string | null;
  isActive?: boolean | null;
}): boolean {
  if (material.isActive === false) return false;
  if (material.type !== 'raw_material') return false;
  return String(material.code || '')
    .trim()
    .toUpperCase()
    .startsWith('MAT');
}

export function pricesEqual(
  left: { consumer: number; trader: number; cost: number },
  right: { consumer: number; trader: number; cost: number },
): boolean {
  return left.consumer === right.consumer
    && left.trader === right.trader
    && left.cost === right.cost;
}
