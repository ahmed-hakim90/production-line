import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const permissionsModule = await server.ssrLoadModule('/utils/permissions.ts');
  assert.ok(
    permissionsModule.ALL_PERMISSIONS.length > 0,
    'permissions catalog should initialize when it is the module entry point',
  );

  const storeModule = await server.ssrLoadModule('/store/useAppStore.ts');
  assert.deepEqual(
    storeModule.useAppStore.getState().userPermissions,
    {},
    'store should initialize with fail-closed permissions without reading the circular export',
  );
  assert.equal(
    typeof storeModule.useAppStore.getState().hydrateFromCachedSession,
    'function',
    'store should expose warm-session hydration used by App bootstrap',
  );
  assert.deepEqual(
    storeModule.useAppStore.getState().tenantActivityPacks,
    ['manufacturing', 'repair'],
    'store should initialize legacy tenants with the default activity packs',
  );
} finally {
  await server.close();
}

console.log('store-initialization.test.ts: ok');
