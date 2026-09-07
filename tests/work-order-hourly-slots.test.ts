import assert from 'node:assert/strict';
import { generateWorkOrderHourlySlots, hasActiveHourlySlot, hasStartedHourlySlots } from '../modules/production/utils/workOrderHourlySlots';

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
assert.throws(() => generateWorkOrderHourlySlots({ startDate: '2026-09-07', targetDate: '2026-09-07', workdayStartTime: '16:00', workdayEndTime: '08:00', dailyTarget: 10 }));
console.log('work-order-hourly-slots.test.ts: OK');
