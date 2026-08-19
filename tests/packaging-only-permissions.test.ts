import assert from 'node:assert/strict';
import {
  applyPackagingOnlyPermissionLocks,
  canCreatePackagingReportsFromMap,
  isPackagingOnlyMenuItemVisible,
  isPackagingOnlyPermissions,
  normalizeRolePermissions,
  PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS,
} from '../utils/packagingOnlyPermissions.ts';

// Derived mode: packaging.create without reports.create
assert.equal(
  isPackagingOnlyPermissions({
    'reports.packaging.create': true,
  }),
  true,
);
assert.equal(
  isPackagingOnlyPermissions({
    'reports.packaging.create': true,
    'reports.create': true,
  }),
  false,
);
assert.equal(
  isPackagingOnlyPermissions({
    'reports.create': true,
  }),
  false,
);
assert.equal(isPackagingOnlyPermissions({}), false);

// Legacy flag still counts as packaging create capability
assert.equal(
  canCreatePackagingReportsFromMap({ 'reports.packaging.only': true }),
  true,
);
assert.equal(
  isPackagingOnlyPermissions({ 'reports.packaging.only': true }),
  true,
);

// Admin-style: legacy only + general create must NOT lock to packaging
assert.equal(
  isPackagingOnlyPermissions({
    'reports.packaging.only': true,
    'reports.packaging.create': true,
    'reports.create': true,
  }),
  false,
);

// normalize migrates and drops the restrictive key
const normalized = normalizeRolePermissions({
  'reports.packaging.only': true,
  'reports.view': true,
});
assert.equal(normalized['reports.packaging.create'], true);
assert.equal('reports.packaging.only' in normalized, false);
assert.equal(normalized['reports.view'], true);

const normalizedOff = normalizeRolePermissions({
  'reports.packaging.only': false,
  'reports.packaging.create': false,
});
assert.equal('reports.packaging.only' in normalizedOff, false);
assert.equal(normalizedOff['reports.packaging.create'], false);

const locked = applyPackagingOnlyPermissionLocks({
  'reports.packaging.create': true,
  'inventory.view': true,
  'inventory.transactions.create': true,
  'products.view': true,
  'sparePartsReplenishment.prepare': true,
  'sparePartsReplenishment.approve': true,
  'departmentConsumables.view': true,
  'productionIssue.create': true,
});
assert.equal(locked['reports.packaging.create'], true);
assert.equal(locked['inventory.view'], true);
assert.equal(locked['inventory.transactions.create'], true);
assert.equal(locked['products.view'], false);
assert.equal(locked['sparePartsReplenishment.prepare'], false);
assert.equal(locked['sparePartsReplenishment.approve'], false);
assert.equal(locked['departmentConsumables.view'], false);
assert.equal(locked['productionIssue.create'], false);

const adminNotLocked = applyPackagingOnlyPermissionLocks({
  'reports.packaging.create': true,
  'reports.create': true,
  'products.view': true,
});
assert.equal(adminNotLocked['products.view'], true);

assert.equal(isPackagingOnlyMenuItemVisible('inv-spare-parts-in', true), false);
assert.equal(isPackagingOnlyMenuItemVisible('packaging-control', true), true);
assert.equal(isPackagingOnlyMenuItemVisible('inv-fg-transfer', true), true);
assert.equal(isPackagingOnlyMenuItemVisible('inv-wh-space-abc', true), true);
assert.equal(isPackagingOnlyMenuItemVisible('inv-spare-parts-in', false), true);

assert.ok(PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS.includes('reports.packaging.create'));
assert.equal(
  (PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS as readonly string[]).includes('reports.create'),
  false,
);
assert.equal(
  (PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS as readonly string[]).includes('products.view'),
  false,
);

console.log('packaging-only-permissions: all assertions passed');
