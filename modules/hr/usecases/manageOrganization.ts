import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { organizationService } from '../services/organizationService';
import type { JobLevel } from '../types';

export async function createDepartment(
  input: { name: string; code?: string; managerId?: string },
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ departmentId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const departmentId = await organizationService.createDepartment(input);
    if (!departmentId) throw new Error('تعذر إنشاء القسم');
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'department',
      entityId: departmentId,
      action: 'create',
      tenantId,
      actor,
      description: 'Department created',
      metadata: { name: input.name },
    });
    return { departmentId };
  });
}

export async function createJobPosition(
  input: { title: string; departmentId?: string; level?: JobLevel },
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ positionId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const positionId = await organizationService.createJobPosition(input);
    if (!positionId) throw new Error('تعذر إنشاء المنصب');
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'job_position',
      entityId: positionId,
      action: 'create',
      tenantId,
      actor,
      description: 'Job position created',
      metadata: { title: input.title },
    });
    return { positionId };
  });
}

export async function createShift(
  input: Parameters<typeof organizationService.createShift>[0],
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ shiftId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const shiftId = await organizationService.createShift(input);
    if (!shiftId) throw new Error('تعذر إنشاء الوردية');
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'shift',
      entityId: shiftId,
      action: 'create',
      tenantId,
      actor,
      description: 'Shift created',
      metadata: { name: input.name },
    });
    return { shiftId };
  });
}

export async function deleteOrganizationEntity(
  collectionName: string,
  entityId: string,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ entityId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await organizationService.deleteEntity(collectionName, entityId);
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'organization_entity',
      entityId,
      action: 'delete',
      tenantId,
      actor,
      description: 'Organization entity deleted',
      metadata: { collectionName },
    });
    return { entityId };
  });
}
