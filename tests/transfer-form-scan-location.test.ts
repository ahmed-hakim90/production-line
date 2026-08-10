import assert from 'node:assert/strict';
import {
  applyScannedCodeToLines,
  createTransferLine,
  findItemOptionByCode,
  validateTransferLines,
  type TransferItemOption,
} from '../modules/inventory/utils/transferFormShared.ts';

const items: TransferItemOption[] = [
  { id: 'm1', name: 'موتور', code: 'SP-100', minStock: 0 },
  { id: 'm2', name: 'بكرة', code: 'SP-200', minStock: 0 },
  { id: 'm3', name: 'بكرة كبيرة', code: 'SP-200-X', minStock: 0 },
];

assert.equal(findItemOptionByCode(items, 'sp-100')?.id, 'm1');
assert.equal(findItemOptionByCode(items, 'SP-200')?.id, 'm2');
assert.equal(findItemOptionByCode(items, 'SP-20'), undefined, 'partial codes must not match');
assert.equal(findItemOptionByCode(items, 'missing'), undefined);

{
  let lines = [createTransferLine({ locationId: 'loc-a' })];
  let result = applyScannedCodeToLines({ lines, itemId: 'm1', locationId: 'loc-a' });
  assert.equal(result.action, 'filled');
  lines = result.lines;
  assert.equal(lines[0]?.itemId, 'm1');
  assert.equal(lines[0]?.quantity, 1);
  result = applyScannedCodeToLines({ lines, itemId: 'm1', locationId: 'loc-a' });
  assert.equal(result.action, 'incremented');
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.quantity, 2);
  result = applyScannedCodeToLines({ lines: result.lines, itemId: 'm1', locationId: 'loc-b' });
  assert.equal(result.action, 'appended');
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[1]?.locationId, 'loc-b');
}

{
  const err = validateTransferLines(
    [{ ...createTransferLine(), itemId: 'm1', quantity: 1, locationId: '' }],
    'raw_material',
    (id) => items.find((i) => i.id === id),
    { requireLocation: true, allowSameItemDifferentLocation: true },
  );
  assert.match(String(err), /الرف|اللوكيشن/);
}

{
  const err = validateTransferLines(
    [
      { ...createTransferLine(), itemId: 'm1', quantity: 1, locationId: 'loc-a' },
      { ...createTransferLine(), itemId: 'm1', quantity: 2, locationId: 'loc-b' },
    ],
    'raw_material',
    (id) => items.find((i) => i.id === id),
    { requireLocation: true, allowSameItemDifferentLocation: true },
  );
  assert.equal(err, null);
}

console.log('transfer-form-scan-location.test.ts: ok');
