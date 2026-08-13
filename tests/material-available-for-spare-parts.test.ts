import { describe, expect, it } from './assertHarness.ts';
import {
  filterMaterialsAvailableForSpareParts,
  filterMaterialsOptedInForSpareParts,
  isMaterialAvailableForSpareParts,
  isMaterialOptedInForSpareParts,
} from '../modules/manufacturing/utils/isMaterialAvailableForSpareParts.ts';

describe('isMaterialAvailableForSpareParts', () => {
  it('treats missing flag as available (legacy)', () => {
    expect(isMaterialAvailableForSpareParts({})).toBe(true);
    expect(isMaterialAvailableForSpareParts({ availableForSpareParts: true })).toBe(true);
  });

  it('excludes materials opted out of spare parts', () => {
    expect(isMaterialAvailableForSpareParts({ availableForSpareParts: false })).toBe(false);
    expect(isMaterialAvailableForSpareParts(null)).toBe(false);
  });

  it('filters spare-parts material lists', () => {
    const rows = [
      { id: 'a', availableForSpareParts: true },
      { id: 'b', availableForSpareParts: false },
      { id: 'c' },
    ];
    expect(filterMaterialsAvailableForSpareParts(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('isMaterialOptedInForSpareParts', () => {
  it('requires explicit true for central spare catalogs', () => {
    expect(isMaterialOptedInForSpareParts({})).toBe(false);
    expect(isMaterialOptedInForSpareParts({ availableForSpareParts: false })).toBe(false);
    expect(isMaterialOptedInForSpareParts({ availableForSpareParts: true })).toBe(true);
  });

  it('filters opted-in lists', () => {
    const rows = [
      { id: 'a', availableForSpareParts: true },
      { id: 'b', availableForSpareParts: false },
      { id: 'c' },
    ];
    expect(filterMaterialsOptedInForSpareParts(rows).map((r) => r.id)).toEqual(['a']);
  });
});

console.log('material-available-for-spare-parts.test.ts: ok');
