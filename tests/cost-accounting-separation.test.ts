import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const costRoutes = read('modules/costs/routes/index.ts');
assert.match(costRoutes, /path:\s*['"]\/cost-centers['"]/);
assert.match(costRoutes, /path:\s*['"]\/monthly-costs['"]/);
assert.match(costRoutes, /path:\s*['"]\/cost-settings['"]/);
assert.doesNotMatch(costRoutes, /path:\s*['"]\/accounting\/cost-centers['"]/);

const accountingRoutes = read('modules/accounting/routes/index.ts');
assert.match(accountingRoutes, /path:\s*['"]\/accounting\/cost-centers['"]/);
assert.match(accountingRoutes, /AccountingCostCenters/);

const accountingOps = read('functions/src/accountingOps.ts');
const productionStart = accountingOps.indexOf('async function upsertProductionCostCenter');
const productionEnd = accountingOps.indexOf('async function deactivateProductionCostCenter');
const productionWriter = accountingOps.slice(productionStart, productionEnd);
assert.doesNotMatch(productionWriter, /patch\.code\s*=/);
assert.doesNotMatch(productionWriter, /patch\.accountingCategory\s*=.*existing/);
assert.doesNotMatch(productionWriter, /patch\.allowPosting\s*=.*existing/);
assert.match(productionWriter, /productionCostingEnabled/);
assert.match(accountingOps, /\|\s*"close_cost_period"/);
assert.match(accountingOps, /\|\s*"reopen_cost_period"/);
assert.match(accountingOps, /preCloseCostingStatus/);
assert.match(accountingOps, /cost_period_closures/);
assert.match(accountingOps, /openingBalanceStatus/);
assert.match(accountingOps, /DEFAULT_CUTOVER_PERIOD\s*=\s*"2026-09"/);

const postingPolicy = read('functions/src/accountingPostingPolicy.ts');
assert.match(postingPolicy, /accounting_posting_outbox/);
assert.match(postingPolicy, /opening_balance_pending/);
assert.match(postingPolicy, /period_closed/);
assert.match(postingPolicy, /period < cutoverPeriod/);

const rules = read('firestore.rules');
assert.match(rules, /match \/accounting_posting_outbox/);
assert.match(rules, /match \/accounting_audit_log/);
assert.match(rules, /match \/cost_period_closures/);
assert.match(rules, /match \/cost_centers\/\{docId\}[\s\S]*?allow create, update, delete: if false;/);

console.log('cost-accounting-separation.test.ts: ok');
