/**
 * لوحة الإنتاج is a factory-wide KPI board — gated by productionDashboard.view
 * (or factory/admin dashboards), never by operational keys like plans/reports/quickAction.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_CONFIG, canAccessMenuItem } from '../config/menu.config.ts';
import { PRODUCTION_ROUTES } from '../modules/production/routes/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const permissionsSrc = readFileSync(join(root, 'utils/permissions.ts'), 'utf8');
assert.match(permissionsSrc, /'productionDashboard\.view'/);
assert.match(permissionsSrc, /عرض لوحة الإنتاج/);

const productionDashboardItem = MENU_CONFIG
  .find((g) => g.key === 'production')
  ?.children.find((item) => item.key === 'production-dashboard');

const productionRoute = PRODUCTION_ROUTES.find((route) => route.path === '/production');

assert.equal(productionDashboardItem?.permission, 'productionDashboard.view');
assert.deepEqual(productionDashboardItem?.anyOfPermissions, [
  'productionDashboard.view',
  'factoryDashboard.view',
  'adminDashboard.view',
]);
assert.equal(productionRoute?.permission, 'productionDashboard.view');
assert.deepEqual(productionRoute?.permissionsAny, [
  'productionDashboard.view',
  'factoryDashboard.view',
  'adminDashboard.view',
]);

const supervisorCan = (permission: string) =>
  [
    'dashboard.view',
    'employeeDashboard.view',
    'plans.view',
    'reports.view',
    'quickAction.view',
    'productionIssue.request',
  ].includes(permission);

assert.equal(
  canAccessMenuItem(supervisorCan, productionDashboardItem!),
  false,
  'مشرف must not see لوحة الإنتاج via plans/reports/quickAction',
);

assert.equal(
  canAccessMenuItem((p) => p === 'productionDashboard.view', productionDashboardItem!),
  true,
);
assert.equal(
  canAccessMenuItem((p) => p === 'factoryDashboard.view', productionDashboardItem!),
  true,
);
assert.equal(
  canAccessMenuItem((p) => p === 'adminDashboard.view', productionDashboardItem!),
  true,
);

const productionGroup = MENU_CONFIG.find((g) => g.key === 'production');
assert.equal(
  productionGroup?.children.some((item) => item.key === 'supervisor-dashboard' || item.path === '/supervisor'),
  false,
  'لوحة المشرف must not duplicate under الإنتاج — home `/` already hosts it',
);

const issueRequestsItem = productionGroup?.children.find((item) => item.key === 'production-issue-requests');
assert.equal(issueRequestsItem?.permission, 'productionIssue.request');
assert.equal(issueRequestsItem?.anyOfPermissions, undefined);
assert.equal(
  canAccessMenuItem((p) => p === 'plans.view' || p === 'workOrders.view', issueRequestsItem!),
  false,
  'plans.view alone must not open طلبات صرف الإنتاج',
);
assert.equal(
  canAccessMenuItem((p) => p === 'productionIssue.request', issueRequestsItem!),
  true,
);

const plansItem = productionGroup?.children.find((item) => item.key === 'plans');
assert.equal(plansItem?.permission, 'plans.view');
assert.deepEqual(plansItem?.excludeRoleKeys, ['supervisor']);
assert.equal(
  canAccessMenuItem((p) => p === 'plans.view', plansItem!, 'supervisor'),
  false,
  'built-in مشرف must not see خطط الإنتاج',
);
assert.equal(
  canAccessMenuItem((p) => p === 'plans.view', plansItem!, 'factory_manager'),
  true,
);

const roleSrc = readFileSync(join(root, 'modules/system/services/roleService.ts'), 'utf8');
const supervisorSeedStart = roleSrc.indexOf("roleKey: 'supervisor'");
assert.ok(supervisorSeedStart > 0);
const supervisorNameIdx = roleSrc.lastIndexOf("name: 'مشرف'", supervisorSeedStart);
assert.ok(supervisorNameIdx > 0);
const supervisorSeedBlock = roleSrc.slice(supervisorNameIdx, supervisorSeedStart);
assert.doesNotMatch(
  supervisorSeedBlock,
  /'productionDashboard\.view'/,
  'built-in مشرف must not seed productionDashboard.view',
);
assert.doesNotMatch(
  supervisorSeedBlock,
  /'plans\.view'/,
  'built-in مشرف must not seed plans.view',
);
assert.match(roleSrc, /roleKey: 'factory_manager'[\s\S]*?productionDashboard\.view/);
assert.match(roleSrc, /roleKey: 'hall_supervisor'[\s\S]*?productionDashboard\.view/);

console.log('production-dashboard-permission.test.ts: ok');
