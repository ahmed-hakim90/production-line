import assert from 'node:assert/strict';
import {
  isFullManufacturerWarrantyJob,
  isPartialManufacturerWarrantyJob,
  isWarrantyAttributedPart,
  resolveManufacturerWarrantyScope,
  warrantyProductItemIds,
} from '../functions/src/repairManufacturerWarranty';

assert.equal(resolveManufacturerWarrantyScope([{ inWarranty: true }, { inWarranty: false }]), 'partial');
assert.equal(isFullManufacturerWarrantyJob({ warrantyScope: 'partial' }), false);
assert.equal(isPartialManufacturerWarrantyJob({ warrantyScope: 'partial' }), true);

const ids = warrantyProductItemIds([
  { itemId: 'a', inWarranty: true },
  { itemId: 'b', inWarranty: false },
]);
assert.equal(ids.has('a'), true);
assert.equal(ids.has('b'), false);

assert.equal(isWarrantyAttributedPart({ productItemId: 'a' }, ids, false), true);
assert.equal(isWarrantyAttributedPart({ productItemId: 'b' }, ids, false), false);
assert.equal(isWarrantyAttributedPart({ scope: 'job' }, ids, false), false);
assert.equal(isWarrantyAttributedPart({ scope: 'job' }, ids, true), true);

console.log('repair-manufacturer-warranty-functions.test.ts: ok');
