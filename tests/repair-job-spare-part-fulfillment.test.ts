import assert from 'node:assert/strict';
import {
  canMergeIntoOpenBasket,
  isPendingReplenishmentStatus,
  isStockoutDemandLine,
  mergeDemandIntoBasketLines,
  validateSparePartsDraftLines,
} from '../modules/inventory/lib/sparePartsReplenishment.ts';
import {
  effectiveFulfillmentStatus,
  formatDurationArabic,
  formatPartAvailabilityPickerHint,
  replenishmentDurationMs,
  resolvePartAvailabilityAtRequest,
  resolvePartAvailabilityBadge,
} from '../modules/repair/lib/repairPartFulfillment.ts';
import {
  repairPartAvailabilityChipType,
  repairPartFulfillmentChipType,
} from '../modules/repair/lib/repairSemanticStatus.ts';

assert.equal(resolvePartAvailabilityAtRequest(5, 0, 3), 'center');
assert.equal(resolvePartAvailabilityAtRequest(1, 10, 3), 'central');
assert.equal(resolvePartAvailabilityAtRequest(0, 0, 1), 'none');
assert.equal(resolvePartAvailabilityAtRequest(2, 5, 2), 'center');

assert.equal(resolvePartAvailabilityBadge(1, 0), 'center');
assert.equal(resolvePartAvailabilityBadge(0, 2), 'central');
assert.equal(resolvePartAvailabilityBadge(0, 0), 'none');

assert.equal(formatPartAvailabilityPickerHint('center', 4, 0), 'مخزن المركز · 4');
assert.equal(formatPartAvailabilityPickerHint('central', 0, 3), 'المركزي · 3');
assert.equal(formatPartAvailabilityPickerHint('none', 0, 0), 'غير متاح');

assert.equal(repairPartAvailabilityChipType('center'), 'success');
assert.equal(repairPartAvailabilityChipType('central'), 'info');
assert.equal(repairPartAvailabilityChipType('none'), 'danger');
assert.equal(repairPartFulfillmentChipType('pending_supply'), 'warning');
assert.equal(repairPartFulfillmentChipType('ready_to_issue'), 'info');
assert.equal(repairPartFulfillmentChipType('issued'), 'success');

assert.equal(effectiveFulfillmentStatus({ fulfillmentStatus: 'pending_supply' }), 'pending_supply');
assert.equal(effectiveFulfillmentStatus({ issueId: 'rsi-1' }), 'issued');
assert.equal(effectiveFulfillmentStatus({}), 'issued');

assert.equal(canMergeIntoOpenBasket({ status: 'submitted', openBasket: true }), true);
assert.equal(canMergeIntoOpenBasket({ status: 'submitted' }), true);
assert.equal(canMergeIntoOpenBasket({ status: 'submitted', openBasket: false }), false);
assert.equal(canMergeIntoOpenBasket({ status: 'approved', openBasket: true }), false);

const mergedOnce = mergeDemandIntoBasketLines([], {
  itemId: 'mat-1',
  itemName: 'مروحة',
  itemCode: 'M1',
  unit: 'قطعة',
  quantity: 2,
  unitCostSnapshot: 10,
  jobId: 'job-a',
  usageId: 'usage-1',
  availabilityAtRequest: 'central',
});
assert.equal(mergedOnce.length, 1);
assert.equal(mergedOnce[0].requestedQty, 2);
assert.deepEqual(mergedOnce[0].sourceJobIds, ['job-a']);
assert.equal(mergedOnce[0].demandLinks?.length, 1);

const mergedTwoJobs = mergeDemandIntoBasketLines(mergedOnce, {
  itemId: 'mat-1',
  itemName: 'مروحة',
  itemCode: 'M1',
  unit: 'قطعة',
  quantity: 1,
  unitCostSnapshot: 10,
  jobId: 'job-b',
  usageId: 'usage-2',
  availabilityAtRequest: 'none',
});
assert.equal(mergedTwoJobs.length, 1);
assert.equal(mergedTwoJobs[0].requestedQty, 3);
assert.deepEqual(mergedTwoJobs[0].sourceJobIds, ['job-a', 'job-b']);
assert.equal(mergedTwoJobs[0].demandLinks?.length, 2);
assert.equal(mergedTwoJobs[0].availabilityAtRequest, 'none');
assert.equal(isStockoutDemandLine(mergedTwoJobs[0]), true);

const withSecondItem = mergeDemandIntoBasketLines(mergedTwoJobs, {
  itemId: 'mat-2',
  itemName: 'مفتاح',
  itemCode: 'M2',
  unit: 'قطعة',
  quantity: 1,
  unitCostSnapshot: 5,
  jobId: 'job-b',
  usageId: 'usage-3',
  availabilityAtRequest: 'central',
});
assert.equal(withSecondItem.length, 2);

assert.equal(isPendingReplenishmentStatus('submitted'), true);
assert.equal(isPendingReplenishmentStatus('received'), false);

const duration = replenishmentDurationMs('2026-08-01T10:00:00.000Z', '2026-08-01T12:30:00.000Z');
assert.equal(duration, 2.5 * 60 * 60 * 1000);
assert.equal(formatDurationArabic(duration).includes('ساعة'), true);
assert.equal(formatDurationArabic(null), '—');

assert.doesNotThrow(() => validateSparePartsDraftLines([{ itemId: 'm1', quantity: 1 }]));

console.log('repair-job-spare-part-fulfillment tests passed');
