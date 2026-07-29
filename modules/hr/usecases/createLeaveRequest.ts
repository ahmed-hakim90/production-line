import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { FirestoreLeaveRequest } from '../types';
import { leaveRequestService } from '../leaveService';

export async function createLeaveRequest(
  data: Omit<FirestoreLeaveRequest, 'id' | 'createdAt'>,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ leaveRequestId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const leaveRequestId = await leaveRequestService.create(data);
    if (!leaveRequestId) throw new Error('تعذر إرسال طلب الإجازة');

    eventBus.emit(SystemEvents.LEAVE_REQUESTED, {
      module: 'hr',
      entityType: 'leave_request',
      entityId: leaveRequestId,
      action: 'request',
      employeeId: data.employeeId,
      tenantId,
      actor,
      description: 'Leave request submitted',
      metadata: {
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });

    return { leaveRequestId };
  });
}
