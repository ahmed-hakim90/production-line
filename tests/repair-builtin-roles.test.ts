import assert from 'node:assert/strict';
import {
  REPAIR_BUILTIN_ROLE_DEFS,
  REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS,
  assertRepairBuiltinRoleIsIsolated,
} from '../modules/repair/lib/repairBuiltinRoles.ts';
import { MENU_CONFIG, canAccessMenuItem } from '../config/menu.config.ts';

{
  const reception = REPAIR_BUILTIN_ROLE_DEFS.repair_reception;
  assert.equal(reception.name, 'استقبال صيانة');
  assert.ok(reception.permissions.includes('repair.jobs.create'));
  assert.ok(reception.permissions.includes('repair.jobs.edit'));
  assert.ok(reception.permissions.includes('repair.parts.view'));
  assert.ok(reception.permissions.includes('sparePartsReplenishment.create'));
  assert.ok(reception.permissions.includes('sparePartsReplenishment.receive'));
  assert.ok(reception.permissions.includes('sparePartsRecall.confirm'));
  assert.ok(reception.permissions.includes('repairSpareIssues.issue'));
  assert.ok(reception.permissions.includes('inventory.view'));
  assert.ok(!reception.permissions.includes('repair.jobs.technician'));
  assert.ok(!reception.permissions.includes('repair.branches.manage'));
  assert.ok(!reception.permissions.includes('repair.callCenter.viewAll'));
  assert.ok(!reception.permissions.includes('sparePartsRecall.create'));
  assert.ok(!reception.permissions.includes('sparePartsReplenishment.prepare'));
}

{
  const repairItems = MENU_CONFIG.find((group) => group.key === 'repair')?.children || [];
  const technicianItems = repairItems.filter((item) => item.includeRoleKeys?.includes('repair_technician'));
  assert.deepEqual(technicianItems.map((item) => item.key), [
    'repair-technician-home',
    'repair-my-jobs',
  ]);
  assert.ok(technicianItems.every((item) => canAccessMenuItem(() => true, item, 'repair_technician')));
  assert.ok(technicianItems.every((item) => !canAccessMenuItem(() => true, item, 'admin')));
}

{
  const tech = REPAIR_BUILTIN_ROLE_DEFS.repair_technician;
  assert.equal(tech.name, 'فني صيانة');
  assert.ok(tech.permissions.includes('repair.jobs.technician'));
  assert.ok(!tech.permissions.includes('repair.jobs.edit'));
  assert.ok(!tech.permissions.includes('repair.parts.view'));
  assert.ok(!tech.permissions.includes('repair.view'));
  assert.ok(tech.permissions.includes('repair.parts.request'));
  assert.ok(tech.permissions.includes('dashboard.view'));
  assert.ok(!tech.permissions.includes('repair.jobs.create'));
  assert.ok(!tech.permissions.includes('repair.adminDashboard.view'));
  assert.ok(!tech.permissions.includes('repair.dashboard.view'));
  assert.ok(!tech.permissions.includes('repair.technician.view'));
}

{
  const bad = {
    'repair.view': true,
    'repair.branches.manage': true,
  };
  const violations = assertRepairBuiltinRoleIsIsolated(bad);
  assert.ok(violations.includes('repair.branches.manage'));
  assert.ok(REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS.length >= 4);
}

console.log('repair-builtin-roles.test.ts: ok');
