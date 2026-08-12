import assert from 'node:assert/strict';
import {
  buildSparePartLocationLabelMap,
  resolveSparePartLocationLabel,
} from '../modules/repair/lib/sparePartLocationLabel.ts';

{
  const map = buildSparePartLocationLabelMap({
    defaults: [{ itemId: 'm1', locationCode: 'A-1' }],
    balances: [
      { itemId: 'm1', locationCode: 'B-2', quantity: 3 },
      { itemId: 'm2', locationCode: 'C-1', quantity: 1 },
      { itemId: 'm2', locationCode: 'C-2', quantity: 2 },
      { itemId: 'm3', locationCode: 'D-1', quantity: 0 },
    ],
  });
  assert.equal(map.get('m1'), 'A-1', 'default location wins over balance labels');
  assert.equal(map.get('m2'), 'C-1، C-2', 'balances join unique codes with qty > 0');
  assert.equal(map.has('m3'), false, 'zero-qty balances ignored');
}

{
  const map = buildSparePartLocationLabelMap({
    defaults: [{ itemId: '  ', locationCode: 'X' }, { itemId: 'm9', locationCode: '' }],
    balances: [],
  });
  assert.equal(map.size, 0);
}

{
  const locationByItemId = new Map([['mat-1', 'SHELF-9']]);
  assert.equal(
    resolveSparePartLocationLabel({
      materialId: 'mat-1',
      locationByItemId,
    }),
    'SHELF-9',
  );
  assert.equal(
    resolveSparePartLocationLabel({
      rawMaterialId: 'mat-1',
      locationByItemId,
    }),
    'SHELF-9',
  );
  assert.equal(
    resolveSparePartLocationLabel({
      materialId: 'missing',
      locationByItemId,
    }),
    '—',
  );
  assert.equal(
    resolveSparePartLocationLabel({
      locationByItemId,
    }),
    '—',
    'unlinked part shows dash',
  );
}

console.log('spare-part-location-label: ok');
