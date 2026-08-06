import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickRepairSalePrice } from '../functions/src/repairSalePrice';
import { resolveRepairSalePrice } from '../modules/repair/utils/sparePartPricing';
import { materialShowsSparePartsPricing } from '../modules/manufacturing/lib/materialSparePartsPricing';

describe('repair sale price is materials-master only', () => {
  it('ignores catalog fallback on the server resolver', () => {
    assert.equal(pickRepairSalePrice({
      consumerSalePrice: 0,
      traderSalePrice: 0,
      fallbackSalePrice: 99,
    }), 0);
    assert.equal(pickRepairSalePrice({
      customerType: 'trader',
      consumerSalePrice: 100,
      traderSalePrice: 80,
      fallbackSalePrice: 99,
    }), 80);
  });

  it('ignores catalog fallback on the client resolver', () => {
    assert.equal(resolveRepairSalePrice({
      materialSalePrice: 0,
      partSalePrice: 55,
    }), 0);
  });

  it('shows spare pricing fields only for active MAT raw materials', () => {
    assert.equal(materialShowsSparePartsPricing({
      type: 'raw_material',
      code: 'MAT-100',
      isActive: true,
    }), true);
    assert.equal(materialShowsSparePartsPricing({
      type: 'consumable',
      code: 'MAT-100',
    }), false);
    assert.equal(materialShowsSparePartsPricing({
      type: 'raw_material',
      code: 'RM-100',
    }), false);
  });
});
