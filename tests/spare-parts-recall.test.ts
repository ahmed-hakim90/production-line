import assert from 'node:assert/strict';
import {
  canCancelSparePartsRecall,
  canConfirmSparePartsRecall,
  SPARE_PARTS_RECALL_STATUS_LABELS,
} from '../modules/inventory/lib/sparePartsRecall.ts';

assert.equal(canConfirmSparePartsRecall({ status: 'submitted' }), true);
assert.equal(canConfirmSparePartsRecall({ status: 'confirmed' }), false);
assert.equal(canCancelSparePartsRecall({ status: 'submitted' }), true);
assert.equal(canCancelSparePartsRecall({ status: 'cancelled' }), false);
assert.equal(SPARE_PARTS_RECALL_STATUS_LABELS.submitted.includes('تأكيد'), true);

console.log('spare-parts-recall.test.ts passed');
