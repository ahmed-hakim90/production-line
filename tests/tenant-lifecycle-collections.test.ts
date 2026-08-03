import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_BACKUP_COLLECTIONS,
  TENANT_DELETE_QUERY_COLLECTIONS,
} from '../functions/src/tenantBackupExport';
import { TENANT_SCOPED_COLLECTIONS } from '../functions/src/tenantFootprintCollections';

const requiredOperationalCollections = [
  'production_handover_receipts',
  'department_consumable_issues',
  'production_issue_orders',
  'supplies_receipt_orders',
] as const;

assert.equal(
  new Set(TENANT_SCOPED_COLLECTIONS).size,
  TENANT_SCOPED_COLLECTIONS.length,
  'tenant footprint registry must not contain duplicates',
);
assert.deepEqual(
  TENANT_DELETE_QUERY_COLLECTIONS,
  TENANT_SCOPED_COLLECTIONS,
  'tenant delete and footprint registries must stay identical',
);

for (const collectionName of TENANT_SCOPED_COLLECTIONS) {
  assert.ok(
    ALL_BACKUP_COLLECTIONS.includes(collectionName),
    `${collectionName} must be included in full tenant backups`,
  );
}
for (const collectionName of requiredOperationalCollections) {
  assert.ok(TENANT_SCOPED_COLLECTIONS.includes(collectionName));
  assert.ok(ALL_BACKUP_COLLECTIONS.includes(collectionName));
}

const clientBackupSource = readFileSync(
  new URL('../services/backupService.ts', import.meta.url),
  'utf8',
);
const clientRegistryBlock = clientBackupSource.match(
  /const ALL_COLLECTIONS = \[([\s\S]*?)\] as const;/,
);
assert.ok(clientRegistryBlock, 'client backup collection registry must be readable');
const clientCollections = Array.from(
  clientRegistryBlock[1].matchAll(/^\s*'([^']+)',/gm),
  (match) => match[1],
);
assert.deepEqual(
  clientCollections,
  ALL_BACKUP_COLLECTIONS,
  'client and server full-backup collection registries must stay identical',
);

console.log('tenant-lifecycle-collections.test.ts: ok');
