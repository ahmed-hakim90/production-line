import assert from 'node:assert/strict';
import {
  isInventoryMenuItemVisibleForWarehouseScope,
  isRepairPartsReplenishmentMenuVisible,
  resolveAccessibleWarehouseRoles,
} from '../modules/inventory/lib/inventoryMenuVisibility.ts';

assert.deepEqual(
  resolveAccessibleWarehouseRoles({ warehouseRoles: ['decomposed'] }),
  ['decomposed'],
);
assert.deepEqual(
  resolveAccessibleWarehouseRoles({
    warehouseRoles: [],
    isMaterialsWarehouseRole: true,
  }),
  ['raw_material', 'decomposed'],
);

const materialsScoped = {
  scoped: true as const,
  accessibleWarehouseRoles: ['decomposed'] as const,
};

assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-production-floor',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-replenishment',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-warehouses',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-transfer-approvals',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-analytics',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-exceptions',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-department-consumables',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-production-component-records',
    ...materialsScoped,
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-raw-control',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-raw-alerts',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-item-card',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-production-issues',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-wh-space-abc',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'repair-wh-space-abc',
    ...materialsScoped,
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-production-floor',
    scoped: false,
    accessibleWarehouseRoles: ['decomposed'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-production-floor',
    scoped: true,
    accessibleWarehouseRoles: ['production_floor'],
  }),
  true,
);

assert.equal(
  isRepairPartsReplenishmentMenuVisible({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  false,
);
assert.equal(
  isRepairPartsReplenishmentMenuVisible({
    accessibleWarehouseRoles: ['maintenance_center'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  true,
);
assert.equal(
  isRepairPartsReplenishmentMenuVisible({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
    userRepairBranchIds: ['branch-1'],
    canViewAllBranches: false,
  }),
  true,
);
assert.equal(
  isRepairPartsReplenishmentMenuVisible({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: true,
  }),
  true,
);
assert.equal(
  isRepairPartsReplenishmentMenuVisible({
    accessibleWarehouseRoles: [],
    warehouseScoped: false,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  true,
);

console.log('inventory-menu-visibility tests passed');
