import assert from 'node:assert/strict';
import {
  DEFAULT_ACTIVITY_PACKS,
  isMenuGroupEnabledForPacks,
  isPermissionGroupEnabledForPacks,
  resolveActivityPacks,
  sanitizeActivityPacksForWrite,
} from '../lib/activityPacks.ts';

assert.deepEqual(resolveActivityPacks(undefined), [...DEFAULT_ACTIVITY_PACKS]);
assert.deepEqual(resolveActivityPacks(null), [...DEFAULT_ACTIVITY_PACKS]);
assert.deepEqual(resolveActivityPacks([]), [...DEFAULT_ACTIVITY_PACKS]);
assert.deepEqual(resolveActivityPacks(['repair']), ['repair']);
assert.deepEqual(resolveActivityPacks(['manufacturing']), ['manufacturing']);
assert.deepEqual(resolveActivityPacks(['repair', 'manufacturing', 'repair']), ['repair', 'manufacturing']);
assert.deepEqual(resolveActivityPacks(['unknown' as 'repair']), [...DEFAULT_ACTIVITY_PACKS]);

assert.equal(isMenuGroupEnabledForPacks('production', ['manufacturing', 'repair']), true);
assert.equal(isMenuGroupEnabledForPacks('production', ['repair']), false);
assert.equal(isMenuGroupEnabledForPacks('repair', ['repair']), true);
assert.equal(isMenuGroupEnabledForPacks('repair', ['manufacturing']), false);
assert.equal(isMenuGroupEnabledForPacks('inventory', ['repair']), true);
assert.equal(isMenuGroupEnabledForPacks('inventory', ['manufacturing']), true);
assert.equal(isMenuGroupEnabledForPacks('hr', ['repair']), true);
assert.equal(isMenuGroupEnabledForPacks('dashboards', []), true);

assert.equal(isPermissionGroupEnabledForPacks('production', ['manufacturing']), true);
assert.equal(isPermissionGroupEnabledForPacks('repair', ['manufacturing']), false);
assert.equal(isPermissionGroupEnabledForPacks('system', ['repair']), true);

assert.deepEqual(sanitizeActivityPacksForWrite(['repair']), ['repair']);
assert.deepEqual(sanitizeActivityPacksForWrite([]), [...DEFAULT_ACTIVITY_PACKS]);

console.log('activity-packs.test.ts: ok');
