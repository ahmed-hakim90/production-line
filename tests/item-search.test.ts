import assert from 'node:assert/strict';
import {
  hasActiveItemSearch,
  matchesItemSearch,
} from '../modules/inventory/lib/itemSearch.ts';

assert.equal(hasActiveItemSearch(''), false);
assert.equal(hasActiveItemSearch('س'), false);
assert.equal(hasActiveItemSearch('سك'), true);
assert.equal(matchesItemSearch({ itemName: 'قاعدة SK', itemCode: 'SP-2477' }, ''), true);
assert.equal(matchesItemSearch({ itemName: 'قاعدة SK', itemCode: 'SP-2477' }, 'قاعدة'), true);
assert.equal(matchesItemSearch({ itemName: 'قاعدة SK', itemCode: 'SP-2477' }, 'sp-2477'), true);
assert.equal(matchesItemSearch({ itemName: 'قاعدة SK', itemCode: 'SP-2477', barcode: '62210001' }, '6221'), true);
assert.equal(matchesItemSearch({ itemName: 'قاعدة SK', itemCode: 'SP-2477' }, 'محرك'), false);

console.log('item-search tests passed');
