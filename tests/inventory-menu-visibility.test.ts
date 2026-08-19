import assert from 'node:assert/strict';
import {
  isFactoryProductionMenuVisibleForWarehouseScope,
  isInventoryMenuItemVisibleForWarehouseScope,
  isInventorySidebarHiddenForRoleKey,
  isManufacturingCatalogMenuVisibleForWarehouseScope,
  isRepairCenterPartsMenuVisible,
  isRepairPartsReplenishmentMenuVisible,
  isRepairSparePartsRecallMenuVisible,
  resolveAccessibleWarehouseRoles,
} from '../modules/inventory/lib/inventoryMenuVisibility.ts';

assert.equal(isInventorySidebarHiddenForRoleKey('repair_reception'), true);
assert.equal(isInventorySidebarHiddenForRoleKey('maintenance_center_warehouse'), true);
assert.equal(isInventorySidebarHiddenForRoleKey('spare_parts_central_warehouse'), false);
assert.equal(isInventorySidebarHiddenForRoleKey(null), false);
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
  true,
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
  false,
  'مساحة صالة الإنتاج moved under الإنتاج — not an inventory scoped key',
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

assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-in',
    scoped: true,
    accessibleWarehouseRoles: ['spare_parts_central'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-center-stock',
    scoped: true,
    accessibleWarehouseRoles: ['spare_parts_central'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-recall',
    scoped: true,
    accessibleWarehouseRoles: ['spare_parts_central'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-recall',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-balances',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-dashboard',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-counts',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-spare-parts-center-stock',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-balances',
    scoped: true,
    accessibleWarehouseRoles: ['repair_customer_custody'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-warehouses',
    scoped: true,
    accessibleWarehouseRoles: ['repair_unrepairable'],
  }),
  false,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'repair-wh-space-center-1',
    scoped: true,
    accessibleWarehouseRoles: ['maintenance_center'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-fg-transfer',
    scoped: true,
    accessibleWarehouseRoles: ['packaging'],
  }),
  true,
);
assert.equal(
  isInventoryMenuItemVisibleForWarehouseScope({
    menuKey: 'inv-fg-transfer',
    scoped: true,
    accessibleWarehouseRoles: ['spare_parts_central'],
  }),
  false,
);

assert.equal(
  isRepairCenterPartsMenuVisible({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  false,
);
assert.equal(
  isRepairCenterPartsMenuVisible({
    accessibleWarehouseRoles: ['maintenance_center'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  true,
);

assert.equal(
  isRepairSparePartsRecallMenuVisible({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  false,
);
assert.equal(
  isRepairSparePartsRecallMenuVisible({
    accessibleWarehouseRoles: ['maintenance_center'],
    warehouseScoped: true,
    userRepairBranchIds: [],
    canViewAllBranches: false,
  }),
  true,
);

assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
  }),
  false,
);
assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['maintenance_center'],
    warehouseScoped: true,
  }),
  false,
);
assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['finished_staging'],
    warehouseScoped: true,
  }),
  true,
);
assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['spare_parts_central', 'production_wip'],
    warehouseScoped: true,
  }),
  true,
);
assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: false,
  }),
  true,
);
assert.equal(
  isFactoryProductionMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: [],
    warehouseScoped: true,
  }),
  true,
);

assert.equal(
  isManufacturingCatalogMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['spare_parts_central'],
    warehouseScoped: true,
  }),
  false,
);
assert.equal(
  isManufacturingCatalogMenuVisibleForWarehouseScope({
    accessibleWarehouseRoles: ['finished_staging'],
    warehouseScoped: true,
  }),
  true,
);

console.log('inventory-menu-visibility tests passed');
