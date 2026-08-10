import assert from 'node:assert/strict';
import {
  applyBuiltinRolePermissionLocks,
  BUILTIN_ROLE_PERMISSION_LOCKS,
} from '../utils/builtinRolePermissionLocks.ts';

assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.supervisor?.includes('plans.view'));
assert.ok(BUILTIN_ROLE_PERMISSION_LOCKS.supervisor?.includes('productionDashboard.view'));

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

console.log('builtin-role-permission-locks.test.ts: ok');
