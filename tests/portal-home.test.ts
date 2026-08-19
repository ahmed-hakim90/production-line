import assert from 'node:assert/strict';
import {
  resolvePortalKind,
  shouldUseSupervisorDashboard,
} from '../modules/dashboards/lib/portalHome.ts';

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'employeeDashboard.view' || p === 'inventory.view' || p === 'inventory.counts.manage',
    inventoryWarehouseId: 'wh-central',
  }),
  'warehouse_manager',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'employeeDashboard.view',
  }),
  'employee',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'adminDashboard.view' || p === 'inventory.view',
    inventoryWarehouseId: 'wh-central',
  }),
  'admin',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'inventory.view' || p === 'sparePartsReplenishment.view',
    roleKey: 'spare_parts_central_warehouse',
    inventoryWarehouseId: 'wh-central',
  }),
  'warehouse_manager',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'repair.dashboard.view'
      || p === 'repair.parts.view'
      || p === 'sparePartsReplenishment.receive',
    roleKey: 'maintenance_center_warehouse',
    inventoryWarehouseId: 'wh-center',
  }),
  'repair',
  'center warehouse role lands on repair portal (not inventory)',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'repair.dashboard.view'
      || p === 'inventory.view'
      || p === 'sparePartsReplenishment.receive'
      || p === 'sparePartsRecall.confirm',
    roleKey: 'repair_reception',
    inventoryWarehouseId: 'wh-center',
  }),
  'repair',
  'reception lands on repair ops portal (not warehouse / factory generic)',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'repair.adminDashboard.view' || p === 'dashboard.view',
  }),
  'repair',
  'centers manager with repair.adminDashboard.view lands on repair portal',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'repair.adminDashboard.view'
      || p === 'employeeDashboard.view'
      || p === 'dashboard.view',
  }),
  'repair',
  'repair admin portal beats employeeDashboard.view',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'repair.adminDashboard.view'
      || p === 'inventory.view'
      || p === 'sparePartsReplenishment.view',
    inventoryWarehouseId: 'wh-center',
  }),
  'repair',
  'centers manager keeps repair portal even with bound center warehouse',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'repair.dashboard.view'
      || p === 'repair.jobs.create'
      || p === 'inventory.view'
      || p === 'sparePartsReplenishment.receive',
    inventoryWarehouseId: 'wh-center',
  }),
  'repair',
  'center manager (custom role, no roleKey) keeps repair portal with bound warehouse',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'repair.jobs.technician' || p === 'inventory.view',
    roleKey: 'repair_technician',
    inventoryWarehouseId: 'wh-center',
  }),
  'repair_technician',
  'technician keeps repair portal even with bound warehouse',
);

assert.equal(
  shouldUseSupervisorDashboard(
    { can: (p) => p === 'reports.createForAnySupervisor' },
    1,
  ),
  true,
  'hall supervisor permission opens the supervisor dashboard regardless of employee level',
);

assert.equal(
  shouldUseSupervisorDashboard({ can: () => false }, 2),
  true,
  'line supervisors keep the level-2 dashboard path',
);

assert.equal(
  shouldUseSupervisorDashboard({ can: () => false }, 1),
  false,
  'ordinary employees remain on the employee dashboard',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'adminDashboard.view' || p === 'repair.adminDashboard.view',
    roleName: 'مدير الصيانة',
  }),
  'repair',
  'مدير الصيانة lands on repair portal even with copied adminDashboard.view',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'adminDashboard.view' || p === 'repair.jobs.create' || p === 'repair.dashboard.view',
    roleName: 'مسؤول الصيانة',
  }),
  'repair',
  'مسؤول الصيانة lands on repair portal even with copied adminDashboard.view',
);

assert.equal(
  resolvePortalKind({
    can: (p) =>
      p === 'reports.packaging.create'
      || p === 'inventory.view'
      || p === 'inventory.transactions.create'
      || p === 'sparePartsReplenishment.prepare',
    inventoryWarehouseId: 'wh-central',
  }),
  'packaging',
  'packaging-only operator must not land on spare-parts warehouse chrome',
);

assert.equal(
  resolvePortalKind({
    can: (p) => p === 'adminDashboard.view' || p === 'repair.adminDashboard.view',
    roleKey: 'admin',
    roleName: 'مدير النظام',
  }),
  'admin',
  'system admin keeps the admin portal',
);

console.log('portal-home.test.ts passed');
