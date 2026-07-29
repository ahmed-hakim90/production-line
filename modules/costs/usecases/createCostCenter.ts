import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { CostCenter } from '@/types';
import { costCenterService } from '../services/costCenterService';

export async function createCostCenter(
  data: Omit<CostCenter, 'id' | 'createdAt'>,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ costCenterId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const costCenterId = await costCenterService.create(data);
    if (!costCenterId) throw new Error('تعذر إنشاء مركز التكلفة');

    eventBus.emit(SystemEvents.COST_CENTER_CREATED, {
      module: 'costs',
      entityType: 'cost_center',
      entityId: costCenterId,
      action: 'create',
      tenantId,
      actor,
      description: 'Cost center created',
      metadata: { name: data.name },
    });

    return { costCenterId };
  });
}
