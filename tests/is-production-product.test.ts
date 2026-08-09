import { describe, expect, it } from './assertHarness.ts';
import {
  filterProductionProducts,
  isProductionProduct,
} from '../modules/production/utils/isProductionProduct.ts';

describe('isProductionProduct', () => {
  it('treats missing flag as manufactured', () => {
    expect(isProductionProduct({})).toBe(true);
    expect(isProductionProduct({ isManufactured: true })).toBe(true);
    expect(isProductionProduct({ isManufactured: undefined })).toBe(true);
  });

  it('excludes non-manufactured products', () => {
    expect(isProductionProduct({ isManufactured: false })).toBe(false);
    expect(isProductionProduct(null)).toBe(false);
    expect(isProductionProduct(undefined)).toBe(false);
  });

  it('filters production product lists', () => {
    const rows = [
      { id: 'a', isManufactured: true },
      { id: 'b', isManufactured: false },
      { id: 'c' },
    ];
    expect(filterProductionProducts(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

console.log('is-production-product.test.ts: ok');
