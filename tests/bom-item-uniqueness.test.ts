import assert from 'node:assert/strict';
import {
  assertUniqueBomItem,
  deterministicBomItemId,
} from '../modules/manufacturing/lib/bomItemUniqueness.ts';

const rows = [{ id: 'line-1', itemType: 'material' as const, itemId: 'mat-1' }];

assert.throws(
  () => assertUniqueBomItem(rows, { itemType: 'material', itemId: 'mat-1' }),
  /مرتبط بالمنتج بالفعل/,
);
assert.doesNotThrow(() =>
  assertUniqueBomItem(rows, { itemType: 'material', itemId: 'mat-1' }, 'line-1'),
);
assert.doesNotThrow(() =>
  assertUniqueBomItem(rows, { itemType: 'material', itemId: 'mat-2' }),
);
assert.equal(
  deterministicBomItemId('bom/1', { itemType: 'material', itemId: 'mat/1' }),
  'bom%2F1__material__mat%2F1',
);

console.log('bom-item-uniqueness.test.ts: OK');
