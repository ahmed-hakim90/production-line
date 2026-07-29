import type { CatalogComponent } from '../../catalog/lib/productComponents';
import type { RepairSparePart } from '../types';

export type SparePartCatalogLinkPlan = {
  partId: string;
  partName: string;
  materialId: string;
  materialName: string;
  materialCode?: string;
  itemType: CatalogComponent['itemType'];
};

const normalizeName = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

/**
 * Plan materialId backfill for spare parts that are still unlinked.
 * Matches by normalized Arabic name against shared catalog components.
 * Ambiguous names (multiple catalog hits) are skipped.
 */
export function planSparePartCatalogLinks(
  parts: Array<Pick<RepairSparePart, 'id' | 'name' | 'materialId' | 'rawMaterialId'>>,
  components: CatalogComponent[],
): SparePartCatalogLinkPlan[] {
  const byName = new Map<string, CatalogComponent[]>();
  for (const component of components) {
    const key = normalizeName(component.materialName);
    if (!key) continue;
    const list = byName.get(key) || [];
    list.push(component);
    byName.set(key, list);
  }

  const plans: SparePartCatalogLinkPlan[] = [];
  for (const part of parts) {
    const partId = String(part.id || '').trim();
    if (!partId) continue;
    if (String(part.materialId || '').trim() || String(part.rawMaterialId || '').trim()) continue;

    const key = normalizeName(part.name || '');
    if (!key) continue;
    const matches = byName.get(key) || [];
    if (matches.length !== 1) continue;
    const match = matches[0];
    plans.push({
      partId,
      partName: String(part.name || ''),
      materialId: match.materialId,
      materialName: match.materialName,
      materialCode: match.materialCode,
      itemType: match.itemType,
    });
  }
  return plans;
}
