/**
 * Foundation harden — usecase result, tenant context, portal home, event catalog.
 * Run: npx --yes tsx tests/foundation-harden.test.ts
 */
import assert from 'node:assert/strict';
import { setCurrentTenant } from '../lib/currentTenant';
import {
  assertSameTenant,
  requireTenantIdOrThrow,
  withTrustedTenantId,
} from '../core/auth/tenantContext';
import { assertUiPermission } from '../core/auth/authBoundary';
import { ok, err, runUseCase, unwrapOrThrow } from '../shared/usecases';
import { SystemEvents, type SystemEventName } from '../shared/events/system-events';
import {
  hasPrivilegedInventoryAccess,
  resolvePortalKind,
  PRIVILEGED_INVENTORY_PERMISSIONS,
  SUPERVISOR_PORTAL_PATHS,
  EMPLOYEE_PORTAL_PATHS,
} from '../modules/dashboards/lib/portalHome';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

async function main() {
  section('usecase result helpers');
  assert.equal(ok(42).ok, true);
  assert.equal(ok(42).data, 42);
  const failed = err(new Error('boom'), 'X');
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.message, 'boom');
    assert.equal(failed.code, 'X');
  }
  const ranOk = await runUseCase(async () => 'yes');
  assert.equal(ranOk.ok, true);
  if (ranOk.ok) assert.equal(ranOk.data, 'yes');
  const ranErr = await runUseCase(async () => {
    throw new Error('nope');
  });
  assert.equal(ranErr.ok, false);
  assert.equal(unwrapOrThrow(ok('x')), 'x');
  assert.throws(() => unwrapOrThrow(err('fail')), /fail/);

  section('tenant context — trusted stamp + cross-tenant deny');
  setCurrentTenant(null);
  assert.throws(() => requireTenantIdOrThrow(), /Tenant context/);
  setCurrentTenant('tenant-a');
  assert.equal(requireTenantIdOrThrow(), 'tenant-a');
  const stamped = withTrustedTenantId({ name: 'role', tenantId: 'evil-tenant' });
  assert.equal(stamped.tenantId, 'tenant-a', 'client-supplied tenantId must be overwritten');
  assert.doesNotThrow(() => assertSameTenant('tenant-a'));
  assert.throws(() => assertSameTenant('tenant-b'), /Cross-tenant/);
  assert.throws(() => assertSameTenant(null), /Cross-tenant/);
  assert.throws(() => assertSameTenant(undefined), /Cross-tenant/);

  section('auth boundary — UI permission pre-check (not security)');
  assert.doesNotThrow(() =>
    assertUiPermission({ 'roles.manage': true }, 'roles.manage'),
  );
  assert.throws(
    () => assertUiPermission({ 'roles.manage': false }, 'roles.manage'),
    /غير مصرح/,
  );
  assert.throws(
    () => assertUiPermission({}, 'roles.manage'),
    /غير مصرح/,
  );

  section('portal home resolution');
  assert.equal(
    resolvePortalKind({ can: (p) => p === 'adminDashboard.view' }),
    'admin',
  );
  assert.equal(
    resolvePortalKind({ can: (p) => p === 'factoryDashboard.view' }),
    'factory_manager',
  );
  assert.equal(
    resolvePortalKind({ can: (p) => p === 'employeeDashboard.view' }),
    'employee',
  );
  assert.equal(resolvePortalKind({ can: () => false }), 'generic');
  assert.equal(
    hasPrivilegedInventoryAccess({
      can: (p) => p === 'inventory.view',
    }),
    false,
    'inventory.view alone is not privileged',
  );
  assert.equal(
    hasPrivilegedInventoryAccess({
      can: (p) => p === 'productionIssue.approve',
    }),
    true,
  );
  assert.ok(PRIVILEGED_INVENTORY_PERMISSIONS.includes('inventory.counts.manage'));
  assert.equal(SUPERVISOR_PORTAL_PATHS.productionIssueRequests, '/production/issue-requests');
  assert.equal(EMPLOYEE_PORTAL_PATHS.home, '/');

  section('system events catalog includes foundation harden events');
  const required: SystemEventName[] = [
    SystemEvents.REPORT_CREATED,
    SystemEvents.ISSUE_REQUESTED,
    SystemEvents.WORK_ORDER_STATUS_CHANGED,
    SystemEvents.STOCK_MOVED,
    SystemEvents.ISSUE_APPROVED,
    SystemEvents.ISSUE_REJECTED,
    SystemEvents.ISSUE_ISSUED,
    SystemEvents.TRANSFER_APPROVED,
    SystemEvents.TRANSFER_REJECTED,
    SystemEvents.TRANSFER_REQUESTED,
    SystemEvents.MATERIAL_CREATED,
    SystemEvents.LEAVE_REQUESTED,
    SystemEvents.REPAIR_JOB_CREATED,
    SystemEvents.COST_CENTER_CREATED,
    SystemEvents.ROLE_CREATED,
    SystemEvents.ROLE_UPDATED,
    SystemEvents.ROLE_DELETED,
  ];
  for (const name of required) {
    assert.equal(typeof name, 'string');
    assert.ok(name.includes('.'));
  }

  section('usecases require tenant context (unauthorized without tenant)');
  setCurrentTenant(null);
  const { requireTenantIdOrThrow: requireTenant } = await import('../core/auth/tenantContext');
  const { runUseCase: run } = await import('../shared/usecases');
  const noTenant = await run(async () => {
    requireTenant();
    return true;
  });
  assert.equal(noTenant.ok, false);
  if (!noTenant.ok) {
    assert.match(noTenant.error.message, /Tenant context/i);
  }

  setCurrentTenant('tenant-secure');
  const withTenant = await run(async () => {
    assert.equal(requireTenant(), 'tenant-secure');
    return 'ok';
  });
  assert.equal(withTenant.ok, true);
  if (withTenant.ok) assert.equal(withTenant.data, 'ok');

  setCurrentTenant(null);
  console.log('\nAll foundation-harden tests passed.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
