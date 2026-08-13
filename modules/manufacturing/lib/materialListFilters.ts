import type { CatalogMaterialGap } from '@/modules/catalog/lib/catalogDrilldown';
import type { Material, MaterialType } from '../types';
import { isMaterialOptedInForSpareParts } from '../utils/isMaterialAvailableForSpareParts';

export type MaterialStatusFilter = 'all' | 'active' | 'inactive';
export type MaterialManufacturedFilter = 'all' | 'internal' | 'external';
export type MaterialSpareFilter = 'all' | 'visible' | 'hidden';

export type MaterialListFilters = {
  search: string;
  typeFilter: MaterialType | 'all';
  statusFilter: MaterialStatusFilter;
  manufacturedFilter: MaterialManufacturedFilter;
  gapFilter: CatalogMaterialGap | '';
  spareFilter: MaterialSpareFilter;
};

export function isMaterialSpareVisible(material: {
  availableForSpareParts?: boolean | null;
}): boolean {
  return isMaterialOptedInForSpareParts(material);
}

export function materialMatchesListFilters(
  row: Material,
  filters: MaterialListFilters,
): boolean {
  if (filters.typeFilter !== 'all' && row.type !== filters.typeFilter) return false;
  if (filters.statusFilter === 'active' && row.isActive === false) return false;
  if (filters.statusFilter === 'inactive' && row.isActive !== false) return false;
  if (filters.manufacturedFilter === 'internal' && !row.isManufacturedInternally) return false;
  if (filters.manufacturedFilter === 'external' && row.isManufacturedInternally) return false;
  if (filters.gapFilter === 'no_category' && String(row.categoryId || '').trim()) return false;
  if (filters.gapFilter === 'no_cost' && Number(row.purchaseCost) > 0) return false;
  if (filters.spareFilter === 'visible' && !isMaterialSpareVisible(row)) return false;
  if (filters.spareFilter === 'hidden' && isMaterialSpareVisible(row)) return false;

  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  const category = String(row.categoryName || '').toLowerCase();
  return (
    row.name.toLowerCase().includes(q)
    || row.code.toLowerCase().includes(q)
    || category.includes(q)
  );
}

export function matchingMaterialIds(rows: Material[], filters: MaterialListFilters): string[] {
  return rows
    .filter((row) => row.id && materialMatchesListFilters(row, filters))
    .map((row) => row.id as string);
}

export function mergePageSelection(
  current: ReadonlySet<string>,
  pageIds: string[],
  select: boolean,
): Set<string> {
  const next = new Set(current);
  for (const id of pageIds) {
    if (select) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function toggleIdSelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function pageSelectionState(
  pageIds: string[],
  selectedIds: ReadonlySet<string>,
): 'all' | 'some' | 'none' {
  if (pageIds.length === 0) return 'none';
  let selectedCount = 0;
  for (const id of pageIds) {
    if (selectedIds.has(id)) selectedCount += 1;
  }
  if (selectedCount === 0) return 'none';
  if (selectedCount === pageIds.length) return 'all';
  return 'some';
}
