import { auth, isConfigured } from '../../auth/services/firebase';
import { employeeService } from '../employeeService';
import { getPendingApprovals } from './approvalEngine';
import type { ApprovalRequestType } from './types';

/**
 * Sidebar badge: approval requests the signed-in employee must act on
 * (matches ApprovalCenter / HRDashboard “بانتظاري”).
 */
export async function countActionableApprovalsForCurrentUser(
  requestType?: ApprovalRequestType,
): Promise<number> {
  if (!isConfigured) return 0;
  const uid = auth?.currentUser?.uid;
  if (!uid) return 0;
  try {
    const employee = await employeeService.getByUserId(uid);
    if (!employee?.id) return 0;
    const rows = await getPendingApprovals({
      approverEmployeeId: employee.id,
      approverUserId: uid,
      ...(requestType ? { requestType } : {}),
    });
    return rows.length;
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '').toLowerCase();
    if (code.includes('permission-denied')) return 0;
    console.error('countActionableApprovalsForCurrentUser failed', {
      message: error instanceof Error ? error.message : String(error),
      requestType: requestType || 'all',
    });
    return 0;
  }
}
