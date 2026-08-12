import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canCorrectUnrepairableQuantity,
  computeCustomerDeviceBalances,
  mergePortalScannedLine,
  summarizeCustodyAging,
} from '../modules/repair/lib/repairCustomerCustody.ts';
import { custodyAgeDays } from '../modules/repair/lib/repairCustomerOpsLabels.ts';

{
  const balance = computeCustomerDeviceBalances({ receivedQuantity: 10, unrepairableQuantity: 3,
    custodyHandedOverQuantity: 2, unrepairableHandedOverQuantity: 1 });
  assert.deepEqual(balance, { custody: 5, unrepairableStock: 2, valid: true });
}

{
  const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const summary = summarizeCustodyAging(
    [
      {
        receivedQuantity: 2,
        unrepairableQuantity: 0,
        custodyHandedOverQuantity: 0,
        unrepairableHandedOverQuantity: 0,
        createdAt: old,
      },
      {
        receivedQuantity: 3,
        unrepairableQuantity: 1,
        custodyHandedOverQuantity: 0,
        unrepairableHandedOverQuantity: 0,
        createdAt: old,
      },
    ],
    custodyAgeDays,
  );
  assert.equal(summary.custodyUnits, 4);
  assert.equal(summary.custodyRows, 2);
  assert.equal(summary.aging7Rows, 2);
  assert.equal(summary.unrepairableUnits, 1);
  assert.equal(summary.unrepairableRows, 1);
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

{
  const technicianOps = readFileSync(
    new URL('../functions/src/repairTechnicianOps.ts', import.meta.url),
    'utf8',
  );
  assert.match(technicianOps, /recordAssignedJobFullyUnrepairable/);
  assert.doesNotMatch(
    technicianOps,
    /status === 'unrepairable' \? \{ closedReason: reason \}/,
    'technician must not close an unrepairable job by status-only update',
  );
  const custodyPage = readFileSync(
    new URL('../modules/repair/pages/RepairCustodyStock.tsx', import.meta.url),
    'utf8',
  );
  assert.match(custodyPage, /طلب استبدال/);
  assert.match(custodyPage, /row\.productCode !== row\.productId/);
  assert.match(custodyPage, /سبب عدم الإصلاح/);
  assert.match(custodyPage, /statusFilter/);
  assert.match(
    custodyPage,
    /resolveAccessibleRepairBranchIds/,
    'custody/unrepairable stock must resolve warehouse-bound center operators before querying',
  );
}

{
  const { resolveAccessibleRepairBranchIds } = await import('../modules/repair/lib/repairBranchAccess.ts');
  const ids = resolveAccessibleRepairBranchIds({
    user: {
      id: 'u1',
      inventoryWarehouseId: 'wh-10',
      repairBranchIds: [],
    } as any,
    branches: [
      { id: 'br-other', warehouseId: 'wh-other' },
      { id: 'br-10', warehouseId: 'wh-10' },
    ],
    canViewAllBranches: false,
  });
  assert.deepEqual(ids, ['br-10']);
}

console.log('repair-customer-custody.test.ts: ok');
