import assert from 'node:assert/strict';
import {
  calculateOperationalPeriodDailyTarget,
  countOperationalPeriodWorkingDays,
  countWorkingDaysInRange,
  normalizeOperationalMonthStartDay,
  resolveOperationalPeriod,
} from '../modules/production/lib/operationalPeriod.ts';

assert.equal(normalizeOperationalMonthStartDay(26), 26);
assert.equal(normalizeOperationalMonthStartDay(0), 26);
assert.equal(normalizeOperationalMonthStartDay(99), 28);
assert.equal(normalizeOperationalMonthStartDay(null), 26);

const midPeriod = resolveOperationalPeriod('2026-07-15', 26);
assert.ok(midPeriod);
assert.equal(midPeriod.startDate, '2026-06-26');
assert.equal(midPeriod.endDateExclusive, '2026-07-26');
assert.equal(midPeriod.endDateInclusive, '2026-07-25');

const onBoundary = resolveOperationalPeriod('2026-07-26', 26);
assert.ok(onBoundary);
assert.equal(onBoundary.startDate, '2026-07-26');
assert.equal(onBoundary.endDateExclusive, '2026-08-26');
assert.equal(onBoundary.endDateInclusive, '2026-08-25');

const beforeBoundary = resolveOperationalPeriod('2026-07-25', 26);
assert.ok(beforeBoundary);
assert.equal(beforeBoundary.startDate, '2026-06-26');
assert.equal(beforeBoundary.endDateExclusive, '2026-07-26');

// Non-overlapping: last day of one period + first day of next
assert.equal(midPeriod.endDateExclusive, onBoundary.startDate);

const workingDays = countWorkingDaysInRange('2026-06-26', '2026-07-26');
assert.equal(workingDays, countOperationalPeriodWorkingDays('2026-07-10', 26));
assert.ok(workingDays > 0);
assert.ok(workingDays <= 31);
// Fridays in Jun 26–Jul 25 2026: Jun 26, Jul 3, Jul 10, Jul 17, Jul 24 → 5 Fridays
// Calendar days = 30 → working = 25
assert.equal(workingDays, 25);

const eightyK = calculateOperationalPeriodDailyTarget({
  plannedQuantity: 80_000,
  anchorDate: '2026-07-10',
  startDay: 26,
});
assert.equal(eightyK.workingDays, 25);
assert.equal(eightyK.dailyTarget, Math.ceil(80_000 / 25)); // 3200
assert.equal(eightyK.period?.startDate, '2026-06-26');
assert.equal(eightyK.period?.endDateInclusive, '2026-07-25');

const zeroQty = calculateOperationalPeriodDailyTarget({
  plannedQuantity: 0,
  anchorDate: '2026-07-10',
  startDay: 26,
});
assert.equal(zeroQty.dailyTarget, 0);

console.log('operational-period.test.ts: ok');
