import assert from 'node:assert/strict';
import {
  canCreatePackagingReportsFromMap,
  isPackagingOnlyPermissions,
  normalizeRolePermissions,
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

console.log('packaging-only-permissions: all assertions passed');
