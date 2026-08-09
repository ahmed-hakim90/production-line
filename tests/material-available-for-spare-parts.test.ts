import { describe, expect, it } from './assertHarness.ts';
import {
  filterMaterialsAvailableForSpareParts,
  isMaterialAvailableForSpareParts,
} from '../modules/manufacturing/utils/isMaterialAvailableForSpareParts.ts';

describe('isMaterialAvailableForSpareParts', () => {
  it('treats missing flag as available', () => {
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

console.log('material-available-for-spare-parts.test.ts: ok');
