import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultRequiresProductionIssueFromCompany,
  resolveRequiresProductionIssueOnReport,
} from '../modules/production/lib/requiresProductionIssue.ts';
import { resolveRequiresProductionIssueOnReport as resolveRequiresProductionIssueOnReportFn } from '../functions/src/requiresProductionIssue.ts';

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: true,
    workOrderRequiresProductionIssue: false,
    planRequiresProductionIssue: true,
  }),
  false,
  'explicit work-order false wins over plan and company',
);

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: false,
    workOrderRequiresProductionIssue: true,
    planRequiresProductionIssue: false,
  }),
  true,
  'explicit work-order true wins over plan and company',
);

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: false,
    planRequiresProductionIssue: true,
  }),
  true,
  'explicit plan wins when work order is unset',
);

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: true,
    planRequiresProductionIssue: false,
  }),
  false,
  'explicit plan false wins over company true',
);

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: true,
  }),
  true,
  'missing WO/plan fields inherit company true',
);

assert.equal(
  resolveRequiresProductionIssueOnReport({
    companyRequire: false,
    workOrderRequiresProductionIssue: null,
    planRequiresProductionIssue: undefined,
  }),
  false,
  'null/undefined WO/plan fields inherit company false',
);

assert.equal(defaultRequiresProductionIssueFromCompany(true), true);
assert.equal(defaultRequiresProductionIssueFromCompany(false), false);

assert.equal(
  resolveRequiresProductionIssueOnReportFn({
    companyRequire: true,
    workOrderRequiresProductionIssue: false,
    planRequiresProductionIssue: true,
  }),
  false,
  'functions mirror matches app helper',
);

const storeSource = readFileSync(new URL('../store/useAppStore.ts', import.meta.url), 'utf8');
const cfSource = readFileSync(new URL('../functions/src/productionReportInventory.ts', import.meta.url), 'utf8');
const inventorySource = readFileSync(
  new URL('../modules/inventory/services/productionInventoryService.ts', import.meta.url),
  'utf8',
);
assert.match(storeSource, /resolveRequiresProductionIssueOnReport/);
assert.match(cfSource, /resolveRequiresProductionIssueOnReport/);
assert.match(inventorySource, /resolveRequiresProductionIssueOnReport/);

console.log('requires-production-issue.test.ts: ok');
