import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { transferApprovalService } from '../services/transferApprovalService';

export type ApproveTransferInput = {
  requestId: string;
  approvedBy: string;
  approverUserId?: string;
  allowNegativeFromSource?: boolean;
};

export type RejectTransferInput = {
  requestId: string;
  rejectedBy: string;
  rejectedByUserId?: string;
  reason?: string;
};

export async function approveTransferRequest(
  input: ApproveTransferInput,
): Promise<UseCaseResult<{ requestId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await transferApprovalService.approveRequest(input.requestId, input.approvedBy, {
      allowNegativeFromSource: input.allowNegativeFromSource,
      approverUserId: input.approverUserId,
    });

    eventBus.emit(SystemEvents.TRANSFER_APPROVED, {
      module: 'inventory',
      entityType: 'inventory_transfer_request',
      entityId: input.requestId,
      action: 'approve',
      tenantId,
      actor: { userId: input.approverUserId, userName: input.approvedBy },
      description: 'Inventory transfer approved',
    });

    return { requestId: input.requestId };
  });
}

export async function rejectTransferRequest(
  input: RejectTransferInput,
): Promise<UseCaseResult<{ requestId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await transferApprovalService.rejectRequest(
      input.requestId,
      input.rejectedBy,
      input.reason,
      input.rejectedByUserId,
    );

    eventBus.emit(SystemEvents.TRANSFER_REJECTED, {
      module: 'inventory',
      entityType: 'inventory_transfer_request',
      entityId: input.requestId,
      action: 'reject',
      reason: input.reason,
      tenantId,
      actor: { userId: input.rejectedByUserId, userName: input.rejectedBy },
      description: 'Inventory transfer rejected',
    });

    return { requestId: input.requestId };
  });
}
