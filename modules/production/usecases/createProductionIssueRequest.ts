import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { productionIssueService } from '@/modules/inventory/services/productionIssueService';

export type CreateProductionIssueRequestInput = {
  workOrderId?: string;
  productionPlanId?: string;
  quantity: number;
  note?: string;
  createdBy: string;
  createdByUserId?: string;
};

export type CreateProductionIssueRequestOutput = {
  orderId: string;
  tenantId: string;
};

/** Production-side request: stock is not deducted until inventory approves. */
export async function createProductionIssueRequest(
  input: CreateProductionIssueRequestInput,
): Promise<UseCaseResult<CreateProductionIssueRequestOutput>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const orderId = await productionIssueService.createRequest(input);
    if (!orderId) {
      throw new Error('تعذر إرسال طلب الصرف');
    }

    eventBus.emit(SystemEvents.ISSUE_REQUESTED, {
      module: 'production',
      entityType: 'production_issue_order',
      entityId: orderId,
      action: 'request',
      workOrderId: input.workOrderId,
      productionPlanId: input.productionPlanId,
      quantity: input.quantity,
      tenantId,
      actor: {
        userId: input.createdByUserId,
        userName: input.createdBy,
      },
      description: 'Production issue requested',
      metadata: {
        note: input.note,
      },
    });

    return { orderId, tenantId };
  });
}
