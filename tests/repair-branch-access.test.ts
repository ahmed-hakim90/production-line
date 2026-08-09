import assert from 'node:assert/strict';
import {
  resolveAccessibleRepairBranchIds,
  resolveRepairBranchIdForInventoryWarehouse,
} from '../modules/repair/lib/repairBranchAccess.ts';
import { toUserSafeFirestoreError } from '../modules/repair/lib/repairFirestoreErrors.ts';

const branches = [
  { id: 'b-alex', warehouseId: 'w-alex', technicianIds: ['emp-1'], managerEmployeeId: 'mgr-1' },
  { id: 'b-ism', warehouseId: 'w-ism', technicianIds: ['uid-tech', 'emp-2'] },
  { id: 'b-tanta', warehouseId: 'w-tanta', technicianIds: [] },
];

assert.equal(
  resolveRepairBranchIdForInventoryWarehouse(branches, 'w-ism'),
  'b-ism',
);
assert.equal(resolveRepairBranchIdForInventoryWarehouse(branches, 'missing'), null);
assert.equal(resolveRepairBranchIdForInventoryWarehouse(branches, ''), null);

assert.deepEqual(
  resolveAccessibleRepairBranchIds({
    user: { id: 'u1', email: '', displayName: '', roleId: '', tenantId: 't', isActive: true, repairBranchIds: ['b-alex'] },
    branches,
  }),
  ['b-alex'],
);

assert.deepEqual(
  resolveAccessibleRepairBranchIds({
    user: {
      id: 'u2',
      email: '',
      displayName: '',
      roleId: '',
      tenantId: 't',
      isActive: true,
      inventoryWarehouseId: 'w-ism',
    },
    branches,
  }),
  ['b-ism'],
);

assert.deepEqual(
  new Set(
    resolveAccessibleRepairBranchIds({
      user: { id: 'uid-tech', email: '', displayName: '', roleId: '', tenantId: 't', isActive: true },
      branches,
      currentEmployeeId: 'emp-1',
    }),
  ),
  new Set(['b-alex', 'b-ism']),
);

assert.deepEqual(
  new Set(
    resolveAccessibleRepairBranchIds({
      user: { id: 'admin', email: '', displayName: '', roleId: '', tenantId: 't', isActive: true },
      branches,
      canViewAllBranches: true,
    }),
  ),
  new Set(['b-alex', 'b-ism', 'b-tanta']),
);

assert.deepEqual(
  resolveAccessibleRepairBranchIds({
    user: { id: 'mgr-user', email: '', displayName: '', roleId: '', tenantId: 't', isActive: true },
    branches,
    currentEmployeeId: 'mgr-1',
  }),
  ['b-alex'],
);

assert.equal(
  toUserSafeFirestoreError(
    { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
    'fallback',
  ),
  'ليس لديك صلاحية كافية لتنفيذ هذه العملية.',
);
assert.equal(toUserSafeFirestoreError({ message: 'تعذر الحفظ.' }, 'fallback'), 'تعذر الحفظ.');
assert.equal(toUserSafeFirestoreError({}, 'fallback'), 'fallback');

console.log('repair-branch-access tests passed');
