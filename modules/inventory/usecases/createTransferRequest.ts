import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { transferApprovalService } from '../services/transferApprovalService';

type CreateTransferRequestArgs = Parameters<typeof transferApprovalService.createRequest>[0];
type CreateTransferRequestContext = Parameters<typeof transferApprovalService.createRequest>[1];

export async function createTransferRequest(
  input: CreateTransferRequestArgs,
  context: CreateTransferRequestContext,
): Promise<UseCaseResult<{ requestId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const requestId = await transferApprovalService.createRequest(input, context);
    if (!requestId) throw new Error('تعذر إنشاء طلب التحويل');

    eventBus.emit(SystemEvents.TRANSFER_REQUESTED, {
      module: 'inventory',
      entityType: 'inventory_transfer_request',
      entityId: requestId,
      action: 'request',
      tenantId,
      actor: { userId: input.createdByUserId, userName: input.createdBy },
      description: 'Inventory transfer requested',
      metadata: {
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        requestType: input.requestType,
        referenceNo: input.referenceNo,
      },
    });

    return { requestId };
  });
}
