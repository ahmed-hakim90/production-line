import assert from 'node:assert/strict';
import {
  getDateRangeForCalendarMonth,
  getMonthInputValueFromDate,
} from '../modules/production/utils/factoryGeneralMonthlyRange';

function testInvalidAndFutureMonths() {
  assert.equal(getDateRangeForCalendarMonth(''), null);
  assert.equal(getDateRangeForCalendarMonth('2026-13'), null);
  assert.equal(getDateRangeForCalendarMonth('not-a-month'), null);

  const future = new Date();
  future.setMonth(future.getMonth() + 2);
  assert.equal(getDateRangeForCalendarMonth(getMonthInputValueFromDate(future)), null);
}

function testPastMonthIsFullCalendarRange() {
  const range = getDateRangeForCalendarMonth('2024-01');
  assert.ok(range);
  assert.equal(range.startStr, '2024-01-01');
  assert.equal(range.endStr, '2024-01-31');
}

function testCurrentMonthEndsToday() {
  const today = new Date();
  const ym = getMonthInputValueFromDate(today);
  const range = getDateRangeForCalendarMonth(ym);
  assert.ok(range);
  assert.equal(range.startStr, `${ym}-01`);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  assert.equal(range.endStr, `${yyyy}-${mm}-${dd}`);
}

testInvalidAndFutureMonths();
testPastMonthIsFullCalendarRange();
testCurrentMonthEndsToday();

console.log('factory-general-monthly-range.test.ts: OK');
