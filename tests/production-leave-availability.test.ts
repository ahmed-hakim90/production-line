import assert from 'node:assert/strict';
import { getApprovedLeaveForDate, isOnApprovedLeave } from '../modules/production/utils/productionLeaveAvailability.ts';
import type { FirestoreLeaveRequest } from '../modules/hr/types.ts';

const requests: FirestoreLeaveRequest[] = [
  {
    employeeId: 'emp-1',
    leaveType: 'annual',
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    totalDays: 3,
    affectsSalary: false,
    status: 'approved',
    approvalChain: [],
    finalStatus: 'approved',
    reason: 'approved',
    createdBy: 'user-1',
  },
  {
    employeeId: 'emp-1',
    leaveType: 'annual',
    startDate: '2026-06-20',
    endDate: '2026-06-21',
    totalDays: 2,
    affectsSalary: false,
    status: 'pending',
    approvalChain: [],
    finalStatus: 'pending',
    reason: 'pending',
    createdBy: 'user-1',
  },
];

assert.equal(isOnApprovedLeave(requests, '2026-06-10'), true);
assert.equal(isOnApprovedLeave(requests, '2026-06-12'), true);
assert.equal(isOnApprovedLeave(requests, '2026-06-13'), false);
assert.equal(isOnApprovedLeave(requests, '2026-06-20'), false);
assert.equal(getApprovedLeaveForDate(requests, '2026-06-11')?.reason, 'approved');

console.log('production-leave-availability.test.ts: ok');
