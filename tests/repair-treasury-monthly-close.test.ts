import assert from 'node:assert/strict';
import {
  assertCanCloseRepairTreasuryMonth,
  assertCanReopenRepairTreasuryMonth,
  assertMonthWritableOrThrow,
  buildRepairTreasuryMonthCloseDocId,
  isRepairTreasuryMonthClosedStatus,
  monthKeyFromIso,
  normalizeTreasuryMonth,
} from '../modules/repair/lib/repairTreasuryMonthlyClose.ts';

assert.equal(normalizeTreasuryMonth('2026-08'), '2026-08');
assert.equal(normalizeTreasuryMonth('bad'), new Date().toISOString().slice(0, 7));
assert.equal(monthKeyFromIso('2026-08-15T10:00:00.000Z'), '2026-08');

assert.equal(
  buildRepairTreasuryMonthCloseDocId('tenant-a', 'branch-1', '2026-08'),
  'tenant-a_branch-1_2026-08',
);
assert.equal(
  buildRepairTreasuryMonthCloseDocId('tenant-a', 'branch-1', '2026-08'),
  buildRepairTreasuryMonthCloseDocId('tenant-a', 'branch-1', '2026-08'),
);

assert.equal(isRepairTreasuryMonthClosedStatus('closed'), true);
assert.equal(isRepairTreasuryMonthClosedStatus('open'), false);
assert.equal(isRepairTreasuryMonthClosedStatus(null), false);

assert.throws(
  () => assertCanCloseRepairTreasuryMonth({ alreadyClosed: true, openSessionsCount: 0 }),
  /مقفول بالفعل/,
);
assert.throws(
  () => assertCanCloseRepairTreasuryMonth({ alreadyClosed: false, openSessionsCount: 2 }),
  /جلسات خزينة مفتوحة/,
);
assert.doesNotThrow(
  () => assertCanCloseRepairTreasuryMonth({ alreadyClosed: false, openSessionsCount: 0 }),
);

assert.throws(
  () => assertCanReopenRepairTreasuryMonth({ currentlyClosed: false, reopenReason: 'سبب' }),
  /غير مقفول/,
);
assert.throws(
  () => assertCanReopenRepairTreasuryMonth({ currentlyClosed: true, reopenReason: '   ' }),
  /سبب إعادة فتح/,
);
assert.doesNotThrow(
  () => assertCanReopenRepairTreasuryMonth({ currentlyClosed: true, reopenReason: 'تصحيح قيد' }),
);

assert.throws(
  () => assertMonthWritableOrThrow({ monthClosed: true, month: '2026-08' }),
  /مقفول لخزينة/,
);
assert.doesNotThrow(
  () => assertMonthWritableOrThrow({ monthClosed: false, month: '2026-08' }),
);

console.log('repair-treasury-monthly-close tests passed');
