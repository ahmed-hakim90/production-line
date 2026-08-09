import assert from 'node:assert/strict';
import {
  REPAIR_BUILTIN_ROLE_DEFS,
  REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS,
  assertRepairBuiltinRoleIsIsolated,
  reconcileExistingRepairBuiltinPermissions,
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
  assert.ok(reception.permissions.includes('repairSpareIssues.print'));
  assert.ok(reception.permissions.includes('repairSpareIssues.cancel'));
  assert.ok(reception.permissions.includes('repairSpareIssues.reject'));
  assert.ok(reception.permissions.includes('sparePartsReplenishment.cancel'));
  assert.ok(reception.permissions.includes('inventory.view'));
  assert.ok(reception.permissions.includes('repair.complaints.view'));
  assert.ok(!reception.permissions.includes('repair.jobs.technician'));
  assert.ok(!reception.permissions.includes('repair.branches.manage'));
  assert.ok(!reception.permissions.includes('repair.callCenter.viewAll'));
  assert.ok(!reception.permissions.includes('sparePartsRecall.create'));
  assert.ok(!reception.permissions.includes('sparePartsReplenishment.prepare'));
  assert.ok(!reception.permissions.includes('materials.view'));
  assert.ok(!reception.permissions.includes('materials.manage'));
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

  const custody = repairItems.find((item) => item.key === 'repair-custody-stock');
  const unrepairable = repairItems.find((item) => item.key === 'repair-unrepairable-stock');
  assert.ok(custody?.excludeRoleKeys?.includes('repair_technician'));
  assert.equal(unrepairable, undefined);
  assert.equal(canAccessMenuItem(() => true, custody!, 'repair_technician'), false);
  assert.equal(canAccessMenuItem(() => true, custody!, 'repair_reception'), true);

  const catalogItems = MENU_CONFIG.find((group) => group.key === 'catalog')?.children || [];
  const materials = catalogItems.find((item) => item.key === 'manufacturing-materials');
  assert.ok(materials?.excludeRoleKeys?.includes('repair_reception'));
  assert.equal(canAccessMenuItem(() => true, materials!, 'repair_reception'), false);
  assert.equal(canAccessMenuItem(() => true, materials!, 'factory_manager'), true);
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
  assert.ok(!tech.permissions.includes('repair.custody.view'));
  assert.ok(!tech.permissions.includes('repair.custody.record'));
  assert.ok(!tech.permissions.includes('repair.custody.handover'));
}

{
  const keptOff = reconcileExistingRepairBuiltinPermissions({
    'repair.jobs.technician': true,
    'repair.custody.view': false,
    'repair.custody.record': false,
    'dashboard.view': true,
  }, 'repair_technician');
  assert.equal(keptOff.changed, false);
  assert.equal(keptOff.permissions['repair.custody.view'], false);
  assert.equal(keptOff.permissions['repair.jobs.technician'], true);

  const stripped = reconcileExistingRepairBuiltinPermissions({
    'repair.jobs.technician': true,
    'repair.branches.manage': true,
    'roles.manage': true,
  }, 'repair_technician');
  assert.equal(stripped.changed, true);
  assert.equal(stripped.permissions['repair.branches.manage'], false);
  assert.equal(stripped.permissions['roles.manage'], false);
  assert.equal(stripped.permissions['repair.jobs.technician'], true);

  const stripCustody = reconcileExistingRepairBuiltinPermissions({
    'repair.jobs.technician': true,
    'repair.custody.view': true,
    'repair.custody.record': true,
  }, 'repair_technician');
  assert.equal(stripCustody.changed, true);
  assert.equal(stripCustody.permissions['repair.custody.view'], false);
  assert.equal(stripCustody.permissions['repair.custody.record'], false);

  const receptionKeepsCustody = reconcileExistingRepairBuiltinPermissions({
    'repair.custody.view': true,
    'repair.custody.handover': true,
    'repair.payments.view': true,
    'repair.payments.collect': true,
  }, 'repair_reception');
  assert.equal(receptionKeepsCustody.changed, false);
  assert.equal(receptionKeepsCustody.permissions['repair.custody.view'], true);
  assert.equal(receptionKeepsCustody.permissions['repair.payments.view'], true);

  const stripMaterialsFromReception = reconcileExistingRepairBuiltinPermissions({
    'repair.view': true,
    'materials.view': true,
    'materials.manage': true,
  }, 'repair_reception');
  assert.equal(stripMaterialsFromReception.changed, true);
  assert.equal(stripMaterialsFromReception.permissions['materials.view'], false);
  assert.equal(stripMaterialsFromReception.permissions['materials.manage'], false);
  assert.equal(stripMaterialsFromReception.permissions['repair.view'], true);
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
