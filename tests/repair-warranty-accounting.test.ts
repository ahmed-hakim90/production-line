import assert from 'node:assert/strict';
import {
  buildWarrantySettlementTotals,
  warrantyJournalIsBalanced,
} from '../functions/src/repairWarrantyAccountingPolicy.ts';

assert.deepEqual(buildWarrantySettlementTotals(350), {
  grossAmount: 350,
  discountType: 'percent',
  discountValue: 100,
  discountAmount: 350,
  netAmount: 0,
});
assert.equal(warrantyJournalIsBalanced({ serviceGross: 200, partsGross: 150, allowance: 350 }), true);
assert.equal(warrantyJournalIsBalanced({ serviceGross: 200, partsGross: 150, allowance: 300 }), false);

console.log('repair-warranty-accounting.test.ts: ok');
