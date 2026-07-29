import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { FirestoreRole } from '@/types';
import { roleService } from '../services/roleService';

export type CreateRoleInput = Omit<FirestoreRole, 'id'>;

export async function createRole(
  data: CreateRoleInput,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ roleId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const roleId = await roleService.create(data);
    if (!roleId) {
      throw new Error('تعذر إنشاء الدور');
    }

    eventBus.emit(SystemEvents.ROLE_CREATED, {
      module: 'system',
      entityType: 'role',
      entityId: roleId,
      action: 'create',
      roleName: data.name,
      roleKey: data.roleKey,
      tenantId,
      actor,
      description: 'Role created',
    });

    return { roleId };
  });
}

export async function updateRole(
  roleId: string,
  data: Partial<Omit<FirestoreRole, 'id'>>,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ roleId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await roleService.update(roleId, data);

    eventBus.emit(SystemEvents.ROLE_UPDATED, {
      module: 'system',
      entityType: 'role',
      entityId: roleId,
      action: 'update',
      roleName: data.name,
      roleKey: data.roleKey,
      tenantId,
      actor,
      description: 'Role updated',
      metadata: {
        changedKeys: Object.keys(data),
      },
    });

    return { roleId };
  });
}

export async function deleteRole(
  roleId: string,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ roleId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await roleService.delete(roleId);

    eventBus.emit(SystemEvents.ROLE_DELETED, {
      module: 'system',
      entityType: 'role',
      entityId: roleId,
      action: 'delete',
      tenantId,
      actor,
      description: 'Role deleted',
    });

    return { roleId };
  });
}
