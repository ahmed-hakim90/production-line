import assert from 'node:assert/strict';
import {
  canCorrectUnrepairableQuantity,
  computeCustomerDeviceBalances,
  mergePortalScannedLine,
} from '../modules/repair/lib/repairCustomerCustody.ts';

{
  const balance = computeCustomerDeviceBalances({ receivedQuantity: 10, unrepairableQuantity: 3,
    custodyHandedOverQuantity: 2, unrepairableHandedOverQuantity: 1 });
  assert.deepEqual(balance, { custody: 5, unrepairableStock: 2, valid: true });
}

{
  const input = { receivedQuantity: 5, custodyHandedOverQuantity: 2, unrepairableHandedOverQuantity: 1 };
  assert.equal(canCorrectUnrepairableQuantity(input, 1), true);
  assert.equal(canCorrectUnrepairableQuantity(input, 0), false);
  assert.equal(canCorrectUnrepairableQuantity(input, 4), false);
}

{
  const first = mergePortalScannedLine([], { productId: 'p1', name: 'منتج', code: 'P-1', barcode: '6221' });
  const second = mergePortalScannedLine(first, { productId: 'p1', name: 'منتج', code: 'P-1', barcode: '6221' });
  assert.equal(second.length, 1);
  assert.equal(second[0].quantity, 2);
}

console.log('repair-customer-custody.test.ts: ok');
