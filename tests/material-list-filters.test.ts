import { describe, expect, it } from './assertHarness.ts';
import type { Material } from '../modules/manufacturing/types.ts';
import {
  matchingMaterialIds,
  materialMatchesListFilters,
  mergePageSelection,
  pageSelectionState,
  toggleIdSelection,
  type MaterialListFilters,
} from '../modules/manufacturing/lib/materialListFilters.ts';

function material(overrides: Partial<Material> & { id: string; name: string; code: string }): Material {
  return {
    type: 'raw_material',
    baseUnit: 'piece',
    isActive: true,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

const emptyFilters: MaterialListFilters = {
  search: '',
  typeFilter: 'all',
  statusFilter: 'all',
  manufacturedFilter: 'all',
  gapFilter: '',
  spareFilter: 'all',
};

describe('materialMatchesListFilters', () => {
  it('keeps manufacturing components that are not opted into spare parts', () => {
    const row = material({
      id: 'm1',
      name: 'غطاء حقن',
      code: 'INJ-01',
      isManufacturedInternally: true,
      availableForSpareParts: false,
    });
    expect(materialMatchesListFilters(row, {
      ...emptyFilters,
      manufacturedFilter: 'internal',
      spareFilter: 'hidden',
    })).toBe(true);
  });

  it('hides opted-in spare parts from the hidden-spare filter', () => {
    const row = material({
      id: 'sp1',
      name: 'موتور',
      code: 'SP-01',
      availableForSpareParts: true,
    });
    expect(materialMatchesListFilters(row, { ...emptyFilters, spareFilter: 'hidden' })).toBe(false);
    expect(materialMatchesListFilters(row, { ...emptyFilters, spareFilter: 'visible' })).toBe(true);
  });

  it('treats missing spare flag as hidden from central spare catalogs', () => {
    const row = material({ id: 'legacy', name: 'خامة قديمة', code: 'RAW-01' });
    expect(materialMatchesListFilters(row, { ...emptyFilters, spareFilter: 'visible' })).toBe(false);
    expect(materialMatchesListFilters(row, { ...emptyFilters, spareFilter: 'hidden' })).toBe(true);
  });
});

describe('cross-page material selection', () => {
  it('keeps previous page ids when selecting the current page', () => {
    const selected = mergePageSelection(new Set(['p1-a', 'p1-b']), ['p2-a', 'p2-b'], true);
    expect([...selected].sort()).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b']);
  });

  it('deselects only the current page', () => {
    const selected = mergePageSelection(
      new Set(['p1-a', 'p2-a', 'p2-b']),
      ['p2-a', 'p2-b'],
      false,
    );
    expect([...selected]).toEqual(['p1-a']);
  });

  it('toggles a single id without dropping other pages', () => {
    const selected = toggleIdSelection(new Set(['a', 'b']), 'c');
    expect(pageSelectionState(['b', 'c'], selected)).toBe('all');
    expect(pageSelectionState(['a', 'b', 'c', 'd'], selected)).toBe('some');
  });

  it('collects every matching id for bulk spare conversion', () => {
    const rows = [
      material({ id: 'a', name: 'خامة', code: 'RAW-1', availableForSpareParts: true }),
      material({ id: 'b', name: 'مكون تصنيع', code: 'INJ-1', availableForSpareParts: false }),
      material({ id: 'c', name: 'مكون ظاهر', code: 'INJ-2', availableForSpareParts: true }),
    ];
    expect(matchingMaterialIds(rows, { ...emptyFilters, spareFilter: 'visible' })).toEqual(['a', 'c']);
  });
});

console.log('material-list-filters.test.ts: ok');
