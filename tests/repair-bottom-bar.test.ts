import assert from 'node:assert/strict';
import { MENU_CONFIG, type MenuItem } from '../config/menu.config.ts';
import {
  resolveRepairBottomPersona,
  resolveVisibleRepairBottomBarItems,
  shouldShowRepairBottomBar,
} from '../src/shared/ui/layout/repairBottomBar.ts';

const MENU_ITEMS_BY_KEY = MENU_CONFIG.reduce<Record<string, MenuItem>>((acc, group) => {
  group.children.forEach((item) => {
    acc[item.key] = item;
  });
  return acc;
}, {});

const alwaysEnabled = () => true;

{
  assert.equal(
    shouldShowRepairBottomBar({ can: (p) => p === 'repair.adminDashboard.view' }),
    true,
  );
  assert.equal(
    shouldShowRepairBottomBar({ can: (p) => p === 'repair.dashboard.view' }),
    true,
  );
  assert.equal(
    shouldShowRepairBottomBar({
      can: (p) => p === 'repair.jobs.technician',
      roleKey: 'repair_technician',
    }),
    true,
  );
  assert.equal(
    shouldShowRepairBottomBar({ can: (p) => p === 'factoryDashboard.view' }),
    false,
  );
  assert.equal(
    shouldShowRepairBottomBar({ can: (p) => p === 'adminDashboard.view' }),
    false,
    'system admin keeps factory bottom bar',
  );
}

{
  assert.equal(
    resolveRepairBottomPersona({ can: (p) => p === 'repair.adminDashboard.view' }),
    'admin',
  );
  assert.equal(
    resolveRepairBottomPersona({
      can: (p) => p === 'repair.dashboard.view' || p === 'repair.jobs.create',
      roleKey: 'repair_reception',
    }),
    'reception',
  );
  assert.equal(
    resolveRepairBottomPersona({
      can: (p) => p === 'repair.jobs.technician',
      roleKey: 'repair_technician',
    }),
    'technician',
  );
}

{
  const adminItems = resolveVisibleRepairBottomBarItems({
    can: (p) =>
      p === 'repair.adminDashboard.view'
      || p === 'repair.view'
      || p === 'sparePartsReplenishment.view'
      || p === 'repair.technician.view',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    adminItems.map((i) => i.key),
    ['admin-home', 'jobs', 'replenish', 'kpis'],
  );
  assert.equal(adminItems[0]?.path, '/');
}

{
  const receptionItems = resolveVisibleRepairBottomBarItems({
    can: (p) =>
      p === 'repair.dashboard.view'
      || p === 'repair.jobs.create'
      || p === 'repair.view'
      || p === 'repair.payments.view',
    roleKey: 'repair_reception',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    receptionItems.map((i) => i.key),
    ['dash', 'new-job', 'jobs', 'payments'],
  );
  assert.equal(receptionItems.find((i) => i.key === 'new-job')?.primary, true);
}

{
  const techItems = resolveVisibleRepairBottomBarItems({
    can: (p) => p === 'repair.jobs.technician',
    roleKey: 'repair_technician',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    techItems.map((i) => i.key),
    ['tech-home', 'my-jobs'],
  );
}

{
  const filtered = resolveVisibleRepairBottomBarItems({
    can: (p) => p === 'repair.adminDashboard.view' || p === 'repair.view',
    menuItemsByKey: MENU_ITEMS_BY_KEY,
    isOperationPathEnabled: alwaysEnabled,
  });
  assert.deepEqual(
    filtered.map((i) => i.key),
    ['admin-home', 'jobs'],
    'omits replenish/kpis when permissions missing',
  );
}

console.log('repair-bottom-bar.test.ts: ok');
