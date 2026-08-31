import assert from 'node:assert/strict';
import {
  applyBuiltinRolePermissionLocks,
  BUILTIN_ROLE_PERMISSION_LOCKS,
} from '../utils/builtinRolePermissionLocks.ts';
import { checkPermission } from '../utils/permissions.ts';

assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.supervisor?.includes('plans.view'));
assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.supervisor?.includes('productionDashboard.view'));
assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.spare_parts_central_warehouse?.includes('materials.view'));
assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.spare_parts_central_warehouse?.includes('products.view'));
assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.maintenance_center_warehouse?.includes('materials.view'));

const roleServiceSource = await import('node:fs').then(({ readFileSync }) =>
  readFileSync(new URL('../modules/system/services/roleService.ts', import.meta.url), 'utf8'),
);
assert.match(
  roleServiceSource,
  /spare_parts_central_warehouse:[\s\S]*?'inventory\.transactions\.create'/,
  'existing central warehouse roles must receive the general voucher create permission migration',
);

const locked = applyBuiltinRolePermissionLocks(
  {
    'plans.view': true,
    'productionDashboard.view': true,
    'reports.view': true,
    'employeeDashboard.view': true,
  },
  'supervisor',
);

assert.equal(locked['plans.view'], false);
assert.equal(locked['productionDashboard.view'], false);
assert.equal(locked['reports.view'], true);
assert.equal(locked['employeeDashboard.view'], true);

const untouched = applyBuiltinRolePermissionLocks(
  { 'plans.view': true },
  'factory_manager',
);
assert.equal(untouched['plans.view'], true);

const centralLocked = applyBuiltinRolePermissionLocks(
  {
    'inventory.view': true,
    'inventory.items.manage': true,
    'materials.view': true,
    'materials.manage': true,
    'products.view': true,
    'sparePartsReplenishment.view': true,
  },
  'spare_parts_central_warehouse',
);
assert.equal(centralLocked['materials.view'], false);
assert.equal(centralLocked['materials.manage'], false);
assert.equal(centralLocked['products.view'], false);
assert.equal(centralLocked['inventory.view'], true);
assert.equal(centralLocked['sparePartsReplenishment.view'], true);

assert.equal(
  checkPermission({ 'inventory.view': true, 'inventory.items.manage': true }, 'materials.view'),
  false,
);
assert.equal(
  checkPermission({ 'materials.view': true }, 'materials.view'),
  true,
);
assert.equal(
  checkPermission({ 'products.rawMaterials.view': true }, 'materials.view'),
  true,
);

console.log('builtin-role-permission-locks.test.ts: ok');
