import assert from 'node:assert/strict';
import { MENU_CONFIG, type MenuItem } from '../config/menu.config.ts';
import {
  isWarehouseBottomBarItemActive,
  resolveVisibleWarehouseBottomBarItems,
  resolveWarehouseBottomPersona,
  shouldShowWarehouseBottomBar,
} from '../src/shared/ui/layout/warehouseBottomBar.ts';

const MENU_ITEMS_BY_KEY = MENU_CONFIG.reduce<Record<string, MenuItem>>((acc, group) => {
  group.children.forEach((item) => {
    acc[item.key] = item;
  });
  return acc;
}, {});

const alwaysEnabled = () => true;

const centralCan = (p: string) =>
  p === 'inventory.view'
  || p === 'sparePartsReplenishment.view'
  || p === 'sparePartsReplenishment.prepare'
  || p === 'sparePartsReplenishment.approve'
  || p === 'sparePartsRecall.view';

{
  assert.equal(
    shouldShowWarehouseBottomBar({
      can: centralCan,
      roleKey: 'spare_parts_central_warehouse',
      inventoryWarehouseId: 'wh-central',
    }),
    true,
  );
  assert.equal(
    shouldShowWarehouseBottomBar({
      can: (p) => p === 'inventory.view' || p === 'sparePartsReplenishment.prepare' || p === 'sparePartsReplenishment.approve',
      inventoryWarehouseId: 'wh-central',
      boundWarehouseRole: 'spare_parts_central',
    }),
    true,
    'bound spare_parts_central warehouse gets warehouse bottom bar',
  );
  assert.equal(
    shouldShowWarehouseBottomBar({ can: (p) => p === 'factoryDashboard.view' }),
    false,
    'factory manager keeps production bottom bar',
  );
  assert.equal(
    shouldShowWarehouseBottomBar({ can: (p) => p === 'adminDashboard.view' }),
    false,
    'system admin keeps factory bottom bar',
  );
  assert.equal(
    shouldShowWarehouseBottomBar({
      can: (p) =>
        p === 'repair.adminDashboard.view'
        || p === 'inventory.view'
        || p === 'sparePartsReplenishment.prepare',
      inventoryWarehouseId: 'wh-center',
    }),
    false,
    'centers manager keeps repair bottom bar',
  );
  assert.equal(
    shouldShowWarehouseBottomBar({
      can: (p) => p === 'repair.jobs.technician',
      roleKey: 'repair_technician',
    }),
    false,
  );
}

{
  assert.equal(
    resolveWarehouseBottomPersona({
      can: centralCan,
      roleKey: 'spare_parts_central_warehouse',
    }),
    'spare_parts_central',
  );
  assert.equal(
    resolveWarehouseBottomPersona({
      can: (p) => p === 'inventory.view',
      roleKey: 'materials_warehouse',
    }),
    null,
    'materials warehouse does not steal the central spare-parts bar',
  );
}

{
  const items = resolveVisibleWarehouseBottomBarItems({
    can: centralCan,
    roleKey: 'spare_parts_central_warehouse',
    boundWarehouseId: 'wh-central',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    items.map((i) => i.key),
    ['home', 'replenish', 'balances', 'centers'],
  );
  assert.equal(items.find((i) => i.key === 'replenish')?.primary, true);
  assert.equal(items.find((i) => i.key === 'home')?.path, '/inventory/warehouses/wh-central');
}

{
  const unbound = resolveVisibleWarehouseBottomBarItems({
    can: centralCan,
    roleKey: 'spare_parts_central_warehouse',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.equal(unbound.find((i) => i.key === 'home')?.path, '/');
}

{
  const filtered = resolveVisibleWarehouseBottomBarItems({
    can: (p) => p === 'inventory.view',
    roleKey: 'spare_parts_central_warehouse',
    boundWarehouseId: 'wh-central',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    filtered.map((i) => i.key),
    ['home', 'replenish', 'balances', 'centers'],
    'inventory.view is enough for the four central shortcuts',
  );
}

{
  const home = resolveVisibleWarehouseBottomBarItems({
    can: centralCan,
    roleKey: 'spare_parts_central_warehouse',
    boundWarehouseId: 'wh-central',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  }).find((i) => i.key === 'home');
  assert.ok(home);
  const isMenuItemActive = () => true;
  assert.equal(isWarehouseBottomBarItemActive(home, '/inventory/warehouses/wh-central', isMenuItemActive), true);
  assert.equal(isWarehouseBottomBarItemActive(home, '/', isMenuItemActive), true);
  assert.equal(isWarehouseBottomBarItemActive(home, '/inventory', isMenuItemActive), true);
  assert.equal(
    isWarehouseBottomBarItemActive(home, '/inventory/spare-parts-replenishment', isMenuItemActive),
    false,
    'home must not stay active on other inventory screens',
  );
  assert.equal(
    isWarehouseBottomBarItemActive(home, '/inventory/balances', isMenuItemActive),
    false,
  );
}

console.log('warehouse-bottom-bar.test.ts: ok');
