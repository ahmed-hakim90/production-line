import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../modules/inventory/components/departmentConsumables/ItemMovementTraceModal.tsx', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /stockService\.getBalancesForItems\(\[item\.id\]\)/,
  'item movement trace must query balances directly by item id instead of relying on a capped full scan',
);
assert.doesNotMatch(
  source,
  /stockService\.getBalances\(\)/,
  'item movement trace must not load the tenant-wide balance collection',
);
assert.match(source, /balancesLoading \? \(/, 'balance area should distinguish loading from an empty balance');

console.log('item movement trace balance query tests passed');
