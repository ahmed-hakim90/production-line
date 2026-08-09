import assert from 'node:assert/strict';
import { summarizeRepairUnrepairableReasons } from '../modules/repair/lib/repairUnrepairableAnalytics.ts';
import type { RepairJob } from '../modules/repair/types.ts';

const jobs = [
  {
    id: 'job-1', receiptNo: 'REP-0001', branchId: 'b1',
    jobProducts: [
      {
        itemId: 'a', unrepairableReasonCode: 'parts_unavailable',
        unrepairableReasonLabel: 'قطع الغيار غير متوفرة',
        unrepairableDecisionQuantity: 2, unrepairableQuantity: 1,
        reopenedFromUnrepairableQuantity: 1,
      },
    ],
  },
  {
    id: 'job-2', receiptNo: 'REP-0002', branchId: 'b1',
    jobProducts: [
      {
        itemId: 'b', unrepairableReasonCode: 'parts_unavailable',
        unrepairableReasonLabel: 'قطع الغيار غير متوفرة',
        unrepairableQuantity: 3,
      },
      {
        itemId: 'c', unrepairableReasonCode: 'severe_damage',
        unrepairableReasonLabel: 'تلف شديد', unrepairableQuantity: 1,
      },
    ],
  },
] as unknown as RepairJob[];

const summary = summarizeRepairUnrepairableReasons(jobs);
assert.equal(summary.affectedJobs, 2);
assert.equal(summary.decisionQuantity, 6);
assert.equal(summary.currentStockQuantity, 5);
assert.equal(summary.reopenedQuantity, 1);
assert.equal(summary.reasons[0].code, 'parts_unavailable');
assert.equal(summary.reasons[0].jobs, 2);
assert.equal(summary.reasons[0].decisionQuantity, 5);
assert.equal(summary.reasons[0].currentStockQuantity, 4);

const historical = summarizeRepairUnrepairableReasons([
  {
    id: 'legacy', receiptNo: 'REP-OLD', branchId: 'b1',
    jobProducts: [{ itemId: 'legacy-item', unrepairableReason: 'سبب قديم', unrepairableQuantity: 1 }],
  } as unknown as RepairJob,
]);
assert.equal(historical.reasons[0].code, 'legacy_unclassified');
assert.equal(historical.reasons[0].label, 'سبب قديم');

console.log('repair-unrepairable-analytics.test.ts: ok');
