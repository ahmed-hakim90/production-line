/**
 * Factory manager must keep production-critical grants in seed + migration lists
 * so DB-only permissions do not block report/product create on the floor.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('factory_manager seed and migration include reports/products create', () => {
  const src = readFileSync(join(root, 'modules/system/services/roleService.ts'), 'utf8');
  const factorySeedStart = src.indexOf("roleKey: 'factory_manager'");
  assert.ok(factorySeedStart > 0);
  const factorySeedBlock = src.slice(Math.max(0, factorySeedStart - 2500), factorySeedStart);
  assert.match(factorySeedBlock, /'products\.create'/);
  assert.match(factorySeedBlock, /'products\.edit'/);
  assert.match(factorySeedBlock, /'reports\.create'/);

  const migrationStart = src.indexOf('FACTORY_MANAGER_PRODUCTION_WORKER_PERMS');
  const migrationBlock = src.slice(migrationStart, migrationStart + 900);
  assert.match(migrationBlock, /'reports\.create'/);
  assert.match(migrationBlock, /'products\.create'/);
  assert.match(migrationBlock, /'products\.edit'/);
});

test('login bootstrap does not auto-run role catalog migrate/sync', () => {
  const src = readFileSync(join(root, 'store/useAppStore.ts'), 'utf8');
  assert.doesNotMatch(src, /canMigrateDefaultRoles/);
  assert.doesNotMatch(src, /missingFactoryOpsGrant/);
  assert.match(src, /seedDefaultRolesCatalog/);
});

test('Cloud Function allowlist includes factory_manager production grants', () => {
  const src = readFileSync(join(root, 'functions/src/rolePermissionMigration.ts'), 'utf8');
  assert.match(src, /factory_manager:\s*\[/);
  assert.match(src, /'reports\.create'/);
  assert.match(src, /'products\.create'/);
  assert.match(src, /'products\.edit'/);
  assert.match(src, /syncBuiltInRolePermissionGrants/);
});
