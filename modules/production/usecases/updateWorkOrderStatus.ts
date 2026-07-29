import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { WorkOrder } from '@/types';
import { workOrderService } from '../services/workOrderService';

export type UpdateWorkOrderStatusInput = {
  workOrderId: string;
  toStatus: WorkOrder['status'];
  fromStatus?: WorkOrder['status'];
  actor?: { userId?: string; userName?: string };
};

export type ReopenWorkOrderInput = {
  workOrderId: string;
  actor?: { userId?: string; userName?: string };
};

export async function updateWorkOrderStatus(
  input: UpdateWorkOrderStatusInput,
): Promise<UseCaseResult<{ workOrderId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await workOrderService.updateStatus(input.workOrderId, input.toStatus);

    eventBus.emit(SystemEvents.WORK_ORDER_STATUS_CHANGED, {
      module: 'production',
      entityType: 'work_order',
      entityId: input.workOrderId,
      action: 'status_change',
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      tenantId,
      actor: input.actor,
      description: 'Work order status changed',
    });

    return { workOrderId: input.workOrderId };
  });
}

export async function reopenCompletedWorkOrder(
  input: ReopenWorkOrderInput,
): Promise<UseCaseResult<{ workOrderId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await workOrderService.reopenFromCompleted(input.workOrderId);

    eventBus.emit(SystemEvents.WORK_ORDER_STATUS_CHANGED, {
      module: 'production',
      entityType: 'work_order',
      entityId: input.workOrderId,
      action: 'reopen',
      fromStatus: 'completed',
      toStatus: 'in_progress',
      tenantId,
      actor: input.actor,
      description: 'Work order reopened from completed',
    });

    return { workOrderId: input.workOrderId };
  });
}
