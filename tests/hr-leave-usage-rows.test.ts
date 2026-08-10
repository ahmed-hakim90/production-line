import assert from 'node:assert/strict';
import { buildLeaveTypeUsageRows } from '../modules/hr/leaveUsage.ts';
import type { FirestoreLeaveBalance } from '../modules/hr/types.ts';

const balance: FirestoreLeaveBalance = {
  employeeId: 'emp-1',
  annualBalance: 18,
  sickBalance: 10,
  emergencyBalance: 5,
  unpaidTaken: 2,
};

const baseStats = {
  leaveBalance: balance,
  approvedDaysByType: { annual: 3, emergency: 1 } as Record<string, number>,
  approvedCountByType: { annual: 1, emergency: 1 } as Record<string, number>,
  lastUsedDateByType: { annual: '2026-03-01', emergency: '2026-04-01' } as Record<string, string | null>,
};

const withoutEmergency = buildLeaveTypeUsageRows({
  ...baseStats,
  configuredLeaveTypes: [
    { key: 'annual', label: 'إجازة سنوية', isPaid: true, defaultBalance: 21 },
    { key: 'sick', label: 'إجازة مرضية', isPaid: true, defaultBalance: 14 },
    { key: 'unpaid', label: 'بدون راتب', isPaid: false, defaultBalance: 0 },
  ],
});

assert.deepEqual(
  withoutEmergency.map((row) => row.leaveType),
  ['annual', 'sick', 'unpaid'],
  'usage table must not invent emergency/عارضة when missing from HR leave settings',
);
assert.equal(withoutEmergency.some((row) => row.leaveType === 'emergency'), false);
assert.equal(withoutEmergency.find((row) => row.leaveType === 'annual')?.availableDays, 18);
assert.equal(withoutEmergency.find((row) => row.leaveType === 'unpaid')?.usedDays, 2);
assert.equal(withoutEmergency.find((row) => row.leaveType === 'unpaid')?.defaultDays, null);

const withCustomOnly = buildLeaveTypeUsageRows({
  ...baseStats,
  configuredLeaveTypes: [
    { key: 'maternity', label: 'إجازة أمومة', isPaid: true, defaultBalance: 90 },
  ],
  approvedDaysByType: { maternity: 10 },
  approvedCountByType: { maternity: 1 },
  lastUsedDateByType: { maternity: '2026-05-01' },
});

assert.deepEqual(withCustomOnly.map((row) => row.leaveType), ['maternity']);
assert.equal(withCustomOnly[0].availableDays, 80);
assert.equal(withCustomOnly[0].label, 'إجازة أمومة');

console.log('hr-leave-usage-rows.test.ts: ok');
