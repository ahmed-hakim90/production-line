import assert from 'node:assert/strict';
import { resolvePortalKind } from '../modules/dashboards/lib/portalHome.ts';

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
    can: (p) => p === 'inventory.view' || p === 'sparePartsReplenishment.receive',
    roleKey: 'maintenance_center_warehouse',
    inventoryWarehouseId: 'wh-center',
  }),
  'warehouse_manager',
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
  'generic',
  'reception stays off warehouse portal even when bound to center warehouse + spare-parts perms',
);

console.log('portal-home.test.ts passed');
