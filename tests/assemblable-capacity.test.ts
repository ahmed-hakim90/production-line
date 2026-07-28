import assert from 'node:assert/strict';
import {
  buildAvailableByItemCode,
  buildAvailableByItemId,
  componentShortageQtyForTarget,
  computeAssemblableCapacity,
  lineTouchesStock,
  missingComponentsForTarget,
  requiredQtyPerUnit,
} from '../modules/inventory/lib/assemblableCapacity';

assert.equal(requiredQtyPerUnit(2, 0), 2);
assert.equal(requiredQtyPerUnit(2, 10), 2.2);

const available = buildAvailableByItemId([
  { itemId: 'm1', availableQty: 100 },
  { itemId: 'm2', quantity: 50 },
  { itemId: 'm1', availableQty: 20 },
]);
assert.equal(available.get('m1'), 120);
assert.equal(available.get('m2'), 50);

const byCode = buildAvailableByItemCode([
  { itemId: 'x', itemCode: 'sk-999n-7', availableQty: 3540 },
  { itemId: 'y', itemCode: 'SK-999N-7', availableQty: 10 },
]);
assert.equal(byCode.get('SK-999N-7'), 3550);

const rows = computeAssemblableCapacity(
  [
    {
      productId: 'p1',
      productName: 'Product 1',
      productCode: 'SK-999N',
      lines: [
        { materialId: 'm1', materialName: 'وش', materialCode: 'SK-999N-1', qtyPerUnit: 1, stockKeys: ['legacy-m1'] },
        { materialId: 'm7', materialName: 'يد', materialCode: 'SK-999N-7', qtyPerUnit: 1 },
        { materialId: 'm9', materialName: 'عصا', materialCode: 'SK-999N-9', qtyPerUnit: 1 },
      ],
    },
  ],
  buildAvailableByItemId([
    { itemId: 'legacy-m1', availableQty: 3840 },
    { itemId: 'm7', availableQty: 3540 },
    { itemId: 'm9', availableQty: 3740 },
  ]),
);

assert.equal(rows.length, 1);
assert.equal(rows[0].maxAssemblable, 3540);
assert.equal(rows[0].bottleneck?.materialCode, 'SK-999N-7');
assert.equal(rows[0].bottleneck?.materialName, 'يد');
assert.equal(rows[0].components[0].materialCode, 'SK-999N-7');

const byCodeOnly = computeAssemblableCapacity(
  [
    {
      productId: 'p3',
      productName: 'P3',
      productCode: 'P3',
      lines: [{ materialId: 'unknown', materialName: 'يد', materialCode: 'SK-999N-7', qtyPerUnit: 1 }],
    },
  ],
  buildAvailableByItemId([]),
  buildAvailableByItemCode([{ itemId: 'any', itemCode: 'SK-999N-7', availableQty: 3540 }]),
);
assert.equal(byCodeOnly[0].maxAssemblable, 3540);

assert.equal(
  lineTouchesStock(
    { materialId: 'x', materialName: 'a', materialCode: 'SK-999N-7', qtyPerUnit: 1 },
    new Set(),
    new Set(['SK-999N-7']),
  ),
  true,
);

const withWaste = computeAssemblableCapacity(
  [
    {
      productId: 'p2',
      productName: 'P2',
      productCode: 'P2',
      lines: [{ materialId: 'm1', materialName: 'A', qtyPerUnit: 2, wastePercent: 10 }],
    },
  ],
  buildAvailableByItemId([{ itemId: 'm1', availableQty: 22 }]),
);
assert.equal(withWaste[0].maxAssemblable, 10);

assert.equal(
  componentShortageQtyForTarget({ requiredPerUnit: 2, availableQty: 5 }, 10),
  15,
);
assert.equal(
  componentShortageQtyForTarget({ requiredPerUnit: 2, availableQty: 30 }, 10),
  0,
);

const missing = missingComponentsForTarget(
  {
    components: [
      {
        materialId: 'm1',
        materialName: 'A',
        materialCode: 'A',
        qtyPerUnit: 1,
        wastePercent: 0,
        requiredPerUnit: 1,
        availableQty: 0,
        maxAssemblable: 0,
      },
      {
        materialId: 'm2',
        materialName: 'B',
        materialCode: 'B',
        qtyPerUnit: 2,
        wastePercent: 0,
        requiredPerUnit: 2,
        availableQty: 10,
        maxAssemblable: 5,
      },
    ],
  },
  10,
);
assert.equal(missing.length, 2);
assert.equal(missing[0].materialId, 'm1');
assert.equal(missing[0].shortageQty, 10);
assert.equal(missing[1].shortageQty, 10);

console.log('assemblable-capacity.test.ts: OK');
