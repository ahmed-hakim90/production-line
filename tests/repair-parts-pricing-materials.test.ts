import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRepairPartsPricingMaterial } from '../modules/repair/lib/repairPartsPricingMaterials';

describe('isRepairPartsPricingMaterial', () => {
  it('includes active raw_material components with any category code prefix', () => {
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm1',
        type: 'raw_material',
        code: 'MAT-180',
        isActive: true,
      }),
      true,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm2',
        type: 'raw_material',
        code: ' sp-0001 ',
      }),
      true,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm3',
        type: 'raw_material',
        code: 'INJ-0001',
      }),
      true,
    );
  });

  it('excludes other types, inactive, unavailable, and missing ids/codes', () => {
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm4',
        type: 'consumable',
        code: 'MAT-001',
      }),
      false,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm5',
        type: 'raw_material',
        code: 'SP-0001',
        isActive: false,
      }),
      false,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        type: 'raw_material',
        code: 'SP-0001',
      }),
      false,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm6',
        type: 'raw_material',
        code: 'SP-0001',
        availableForSpareParts: false,
      }),
      false,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm7',
        type: 'raw_material',
        code: '   ',
      }),
      false,
    );
  });
});
