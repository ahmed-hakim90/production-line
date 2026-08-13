import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUploadOpeningBalances } from '../modules/inventory/lib/openingBalanceAccess.ts';
import type { Permission } from '../utils/permissions.ts';

const asCan = (allowed: Permission[]) => (key: Permission) => allowed.includes(key);

assert.equal(canUploadOpeningBalances(asCan(['roles.manage'])), true);
assert.equal(canUploadOpeningBalances(asCan(['inventory.counts.manage'])), false);
assert.equal(canUploadOpeningBalances(asCan(['sparePartsReplenishment.view'])), false);
assert.equal(canUploadOpeningBalances(asCan([])), false);

const replenishmentSrc = readFileSync(
  new URL('../modules/inventory/pages/SparePartsReplenishment.tsx', import.meta.url),
  'utf8',
);
assert.match(replenishmentSrc, /canUploadOpeningBalances/);
assert.match(replenishmentSrc, /canUploadOpening && primaryCentralWarehouseId/);

const workspaceSrc = readFileSync(
  new URL('../modules/inventory/pages/WarehouseWorkspace.tsx', import.meta.url),
  'utf8',
);
assert.match(workspaceSrc, /canUploadOpeningBalances/);
assert.match(workspaceSrc, /showOpeningBalanceImport/);

console.log('opening-balance-access tests passed');
