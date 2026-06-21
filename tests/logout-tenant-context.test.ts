import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../store/useAppStore.ts', import.meta.url), 'utf8');

const noUserBranch = appSource.match(/if \(!user\) \{[\s\S]*?return;\n\s*\}/)?.[0] ?? '';
assert.ok(noUserBranch.includes("sessionTrackerService.stop('auth_logout')"));
assert.ok(noUserBranch.includes('setCurrentTenant(null)'));
assert.ok(
  noUserBranch.indexOf("sessionTrackerService.stop('auth_logout')") < noUserBranch.indexOf('setCurrentTenant(null)'),
  'auth-state logout must emit session end before tenant context is cleared',
);

const logoutAction = storeSource.match(/logout: async \(\) => \{[\s\S]*?set\(\{/)?.[0] ?? '';
assert.ok(logoutAction.includes('getCurrentTenantIdOrNull()'));
assert.ok(logoutAction.includes("activityLogService.log(uid, userEmail, 'LOGOUT', 'تسجيل خروج')"));
assert.ok(logoutAction.includes('await signOut();'));
assert.ok(logoutAction.includes('setCurrentTenant(null);'));
assert.ok(
  logoutAction.indexOf("activityLogService.log(uid, userEmail, 'LOGOUT', 'تسجيل خروج')") <
    logoutAction.indexOf('setCurrentTenant(null);'),
  'explicit logout activity log must run before tenant context is cleared',
);
assert.ok(
  logoutAction.indexOf('await signOut();') < logoutAction.indexOf('setCurrentTenant(null);'),
  'store logout must clear tenant context after Firebase sign-out',
);

console.log('logout-tenant-context.test.ts: ok');
