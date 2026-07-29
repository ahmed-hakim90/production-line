import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import {
  productionIssueService,
} from '../services/productionIssueService';

export type ApproveProductionIssueInput = {
  orderId: string;
  actor: string;
  actorUserId?: string;
  quantityOverride?: number;
  sourceWarehouseId?: string;
};

export type RejectProductionIssueInput = {
  orderId: string;
  actor: string;
  actorUserId?: string;
  reason?: string;
};

export type IssueProductionIssueInput = {
  orderId: string;
  actor: string;
  actorUserId?: string;
  /** When true and status is draft, submit then issue. */
  submitIfDraft?: boolean;
};

export async function approveProductionIssueRequest(
  input: ApproveProductionIssueInput,
): Promise<UseCaseResult<{ orderId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await productionIssueService.approveRequest(input.orderId, input.actor, {
      quantityOverride: input.quantityOverride,
      sourceWarehouseId: input.sourceWarehouseId,
    });

    eventBus.emit(SystemEvents.ISSUE_APPROVED, {
      module: 'inventory',
      entityType: 'production_issue_order',
      entityId: input.orderId,
      action: 'approve',
      tenantId,
      actor: { userId: input.actorUserId, userName: input.actor },
      description: 'Production issue request approved',
      metadata: {
        quantityOverride: input.quantityOverride,
        sourceWarehouseId: input.sourceWarehouseId,
      },
    });

    return { orderId: input.orderId };
  });
}

export async function rejectProductionIssueRequest(
  input: RejectProductionIssueInput,
): Promise<UseCaseResult<{ orderId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await productionIssueService.rejectRequest(input.orderId, input.actor, input.reason);

    eventBus.emit(SystemEvents.ISSUE_REJECTED, {
      module: 'inventory',
      entityType: 'production_issue_order',
      entityId: input.orderId,
      action: 'reject',
      reason: input.reason,
      tenantId,
      actor: { userId: input.actorUserId, userName: input.actor },
      description: 'Production issue request rejected',
    });

    return { orderId: input.orderId };
  });
}

export async function issueProductionIssueOrder(
  input: IssueProductionIssueInput,
): Promise<UseCaseResult<{ orderId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    if (input.submitIfDraft) {
      const order = await productionIssueService.getById(input.orderId);
      if (order?.status === 'draft') {
        await productionIssueService.submit(input.orderId);
      }
    }
    await productionIssueService.issue(input.orderId, input.actor);

    eventBus.emit(SystemEvents.ISSUE_ISSUED, {
      module: 'inventory',
      entityType: 'production_issue_order',
      entityId: input.orderId,
      action: 'issue',
      tenantId,
      actor: { userId: input.actorUserId, userName: input.actor },
      description: 'Production issue order issued',
    });

    return { orderId: input.orderId };
  });
}
