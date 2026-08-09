import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../functions/src/purgeRepairOperationalData.ts', import.meta.url),
  'utf8',
);

assert.match(source, /PURGE_REPAIR_OPS_/);
assert.match(source, /repair_jobs/);
assert.match(source, /repair_custody_records/);
assert.match(source, /repair_spare_issues/);
assert.match(source, /customer_service_requests/);
assert.match(source, /repair_replacement_requests/);
assert.match(source, /repair\.settings\.manage/);
assert.match(source, /stock_items/, 'kept masters must be documented');
assert.doesNotMatch(
  source,
  /deleteByTenant\('repair_branches'/,
  'must not delete repair branches',
);
assert.doesNotMatch(
  source,
  /deleteByTenant\('repair_spare_parts'/,
  'must not delete spare parts catalog',
);
assert.doesNotMatch(
  source,
  /deleteByTenant\('repair_spare_parts_stock'/,
  'must not delete current spare stock balances',
);
assert.doesNotMatch(
  source,
  /deleteByTenant\('customers'/,
  'must not delete customers',
);
assert.doesNotMatch(
  source,
  /collection\('stock_items'\)/,
  'must not mutate stock_items balances',
);

const settingsPage = readFileSync(
  new URL('../modules/repair/pages/RepairSettings.tsx', import.meta.url),
  'utf8',
);
assert.match(settingsPage, /purgeRepairOperationalDataCallable/);
assert.match(settingsPage, /PURGE_REPAIR_OPS_/);

console.log('purge-repair-operational-data.test.ts: ok');
