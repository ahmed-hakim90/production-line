import assert from 'node:assert/strict';
import {
  isValidMaterialCategoryCode,
  materialCategoryCounterKey,
  maxMaterialCategorySequence,
  normalizeMaterialCategoryCode,
} from '../modules/manufacturing/lib/materialCode.ts';

assert.equal(normalizeMaterialCategoryCode(' inj '), 'INJ');
assert.equal(isValidMaterialCategoryCode('INJ'), true);
assert.equal(isValidMaterialCategoryCode('I'), false);
assert.equal(isValidMaterialCategoryCode('حقن'), false);
assert.equal(isValidMaterialCategoryCode('INJ-01'), false);
assert.equal(
  materialCategoryCounterKey(' inj '),
  'manufacturing_material_by_category_v2:INJ',
);
assert.equal(
  maxMaterialCategorySequence(
    ['INJ-0001', 'INJ-0023', 'INJ-00012', 'INJ-000112', 'CUT-0099'],
    'INJ',
  ),
  23,
);

console.log('material-code tests passed');
