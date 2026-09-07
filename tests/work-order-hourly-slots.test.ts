import assert from 'node:assert/strict';
import { canCompleteHourlyWorkOrder, generateWorkOrderHourlySlots, hasActiveHourlySlot, hasStartedHourlySlots, summarizeHourlySlotsByDay } from '../modules/production/utils/workOrderHourlySlots';

const slots = generateWorkOrderHourlySlots({
  startDate: '2026-09-07', targetDate: '2026-09-08',
  workdayStartTime: '08:00', workdayEndTime: '16:00',
  breakStartTime: '12:00', breakEndTime: '12:30', dailyTarget: 750,
});
assert.equal(slots.length, 16);
assert.equal(slots[4].startTime, '12:30');
assert.equal(slots[4].endTime, '13:30');
assert.equal(slots.filter((slot) => slot.date === '2026-09-07').reduce((sum, slot) => sum + slot.targetQuantity, 0), 750);
assert.equal(hasStartedHourlySlots(slots), false);
assert.equal(hasStartedHourlySlots([{ ...slots[0], status: 'open' }]), true);
assert.equal(hasActiveHourlySlot(slots), false);
assert.equal(hasActiveHourlySlot([{ ...slots[0], status: 'open' }]), true);
assert.equal(hasActiveHourlySlot([{ ...slots[0], status: 'paused' }]), true);
assert.equal(hasActiveHourlySlot([{ ...slots[0], status: 'quality_pending' }]), false);
assert.equal(canCompleteHourlyWorkOrder([]), false);
assert.equal(canCompleteHourlyWorkOrder([{ ...slots[0], status: 'finished' }, { ...slots[1], status: 'quality_rejected' }]), true);
assert.equal(canCompleteHourlyWorkOrder([{ ...slots[0], status: 'finished' }, { ...slots[1], status: 'packaging' }]), false);
const daily = summarizeHourlySlotsByDay([
  { ...slots[0], status: 'finished', actualQuantity: 100, qualityAcceptedQuantity: 95, qualityRejectedQuantity: 5, packagingQuantity: 94, packagingRejectedQuantity: 1, totalPausedSeconds: 120 },
  { ...slots[8], status: 'quality_rejected', actualQuantity: 20, qualityAcceptedQuantity: 0, qualityRejectedQuantity: 20 },
]);
assert.equal(daily.length, 2);
assert.deepEqual({ produced: daily[0].producedQuantity, packaged: daily[0].packagedQuantity, rejected: daily[0].rejectedQuantity, paused: daily[0].pausedSeconds }, { produced: 100, packaged: 94, rejected: 6, paused: 120 });
assert.equal(daily[1].completedSlots, 1);
assert.throws(() => generateWorkOrderHourlySlots({ startDate: '2026-09-07', targetDate: '2026-09-07', workdayStartTime: '16:00', workdayEndTime: '08:00', dailyTarget: 10 }));
console.log('work-order-hourly-slots.test.ts: OK');
