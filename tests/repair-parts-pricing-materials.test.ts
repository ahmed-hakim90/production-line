import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRepairPartsPricingMaterial } from '../modules/repair/lib/repairPartsPricingMaterials';

describe('isRepairPartsPricingMaterial', () => {
  it('includes active raw_material codes starting with MAT', () => {
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
        code: ' mat-181 ',
      }),
      true,
    );
  });

  it('excludes other prefixes, types, inactive, and missing ids', () => {
    assert.equal(
      isRepairPartsPricingMaterial({
        id: 'm3',
        type: 'raw_material',
        code: 'INJ-001',
      }),
      false,
    );
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
        code: 'MAT-001',
        isActive: false,
      }),
      false,
    );
    assert.equal(
      isRepairPartsPricingMaterial({
        type: 'raw_material',
        code: 'MAT-001',
      }),
      false,
    );
  });
});
