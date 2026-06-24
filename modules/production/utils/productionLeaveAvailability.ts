import type { FirestoreLeaveRequest } from '@/modules/hr/types';

export function isDateWithinLeaveRequest(req: Pick<FirestoreLeaveRequest, 'startDate' | 'endDate'>, date: string): boolean {
  return Boolean(date && req.startDate <= date && req.endDate >= date);
}

export function getApprovedLeaveForDate(
  requests: FirestoreLeaveRequest[],
  date: string,
): FirestoreLeaveRequest | null {
  return requests.find((req) => req.finalStatus === 'approved' && isDateWithinLeaveRequest(req, date)) ?? null;
}

export function isOnApprovedLeave(requests: FirestoreLeaveRequest[], date: string): boolean {
  return getApprovedLeaveForDate(requests, date) !== null;
}
