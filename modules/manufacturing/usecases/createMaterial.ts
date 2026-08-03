import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { Material } from '../types';
import { materialService } from '../services/materialService';
import type { MaterialCreatePath } from '../../system/lib/operationPathSettings';

export async function createMaterial(
  payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'>,
  context: { path: MaterialCreatePath },
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ materialId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const materialId = await materialService.create(payload, context);
    if (!materialId) throw new Error('تعذر إنشاء المادة');
    const createdMaterial = await materialService.getById(materialId);

    eventBus.emit(SystemEvents.MATERIAL_CREATED, {
      module: 'manufacturing',
      entityType: 'material',
      entityId: materialId,
      action: 'create',
      materialCode: createdMaterial?.code || payload.code,
      tenantId,
      actor,
      description: 'Manufacturing material created',
      metadata: { name: payload.name },
    });

    return { materialId };
  });
}
