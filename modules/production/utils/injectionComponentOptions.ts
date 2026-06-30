import type { RawMaterial } from '../../inventory/types';
import type { Material } from '../../manufacturing/types';
import {
  isInjectionMaterial,
  parseInjectionCategoryTokens,
  type InjectionMaterialFilterRow,
} from './injectionMaterialFilter';

export type InjectionComponentOption = {
  id: string;
  name: string;
  code: string;
  categoryName?: string;
};

const toOption = (row: InjectionMaterialFilterRow & { id: string }): InjectionComponentOption => ({
  id: row.id,
  name: String(row.name || '').trim(),
  code: String(row.code || '').trim(),
  categoryName: String(row.categoryName || '').trim(),
});

/**
 * Merge manufacturing materials with legacy raw_materials for injection report pickers
 * and label resolution. Materials supersede linked legacy rows.
 */
export function mergeInjectionComponentOptions(
  materials: Material[],
  rawRows: RawMaterial[],
  categoryKeywords?: string,
): InjectionComponentOption[] {
  const tokens = parseInjectionCategoryTokens(categoryKeywords);
  const linkedLegacyIds = new Set(
    materials
      .map((row) => String(row.legacyRawMaterialId || '').trim())
      .filter(Boolean),
  );
  const byId = new Map<string, InjectionComponentOption>();

  for (const row of materials) {
    if (!row.id || row.isActive === false) continue;
    byId.set(row.id, toOption({ ...row, id: row.id }));
  }

  for (const row of rawRows) {
    if (!row.id || row.isActive === false || linkedLegacyIds.has(row.id)) continue;
    if (!byId.has(row.id)) {
      byId.set(row.id, toOption({ ...row, id: row.id }));
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function filterInjectionComponentOptions(
  options: InjectionComponentOption[],
  categoryKeywords?: string,
): InjectionComponentOption[] {
  const tokens = parseInjectionCategoryTokens(categoryKeywords);
  return options.filter((row) => isInjectionMaterial(row, tokens));
}

export async function loadInjectionComponentOptions(
  categoryKeywords?: string,
): Promise<InjectionComponentOption[]> {
  const [{ rawMaterialService }, { materialService }] = await Promise.all([
    import('../../inventory/services/rawMaterialService'),
    import('../../manufacturing/services/materialService'),
  ]);
  const [materials, rawRows] = await Promise.all([
    materialService.getAll(),
    rawMaterialService.getAll(),
  ]);
  const merged = mergeInjectionComponentOptions(materials, rawRows, categoryKeywords);
  return filterInjectionComponentOptions(merged, categoryKeywords);
}

export async function loadReportsComponentLabelOptions(): Promise<InjectionComponentOption[]> {
  const [{ rawMaterialService }, { materialService }] = await Promise.all([
    import('../../inventory/services/rawMaterialService'),
    import('../../manufacturing/services/materialService'),
  ]);
  const [materials, rawRows] = await Promise.all([
    materialService.getAll(),
    rawMaterialService.getAll(),
  ]);
  return mergeInjectionComponentOptions(materials, rawRows);
}
