import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { organizationService } from '../services/organizationService';
import { HR_COLLECTIONS } from '../collections';
import type {
  FirestoreAllowanceType,
  FirestoreLateRule,
  FirestorePenaltyRule,
  JobLevel,
} from '../types';

type Actor = { userId?: string; userName?: string };

async function emitOrgAction(
  entityType: string,
  entityId: string,
  action: string,
  actor?: Actor,
  metadata?: Record<string, unknown>,
) {
  eventBus.emit(SystemEvents.USER_ACTION, {
    module: 'hr',
    entityType,
    entityId,
    action,
    tenantId: requireTenantIdOrThrow(),
    actor,
    description: `Organization ${entityType} ${action}`,
    metadata,
  });
}

export async function createDepartment(
  input: { name: string; code?: string; managerId?: string; isActive?: boolean },
  actor?: Actor,
): Promise<UseCaseResult<{ departmentId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    const departmentId = await organizationService.createDepartment(input);
    if (!departmentId) throw new Error('تعذر إنشاء القسم');
    await emitOrgAction('department', departmentId, 'create', actor, { name: input.name });
    return { departmentId };
  });
}

export async function updateDepartment(
  departmentId: string,
  input: { name: string; code?: string; managerId?: string; isActive?: boolean },
  actor?: Actor,
): Promise<UseCaseResult<{ departmentId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    await organizationService.updateDepartment(departmentId, input);
    await emitOrgAction('department', departmentId, 'update', actor, { name: input.name });
    return { departmentId };
  });
}

export async function createJobPosition(
  input: {
    title: string;
    departmentId?: string;
    level?: JobLevel;
    hasSystemAccessDefault?: boolean;
    isActive?: boolean;
  },
  actor?: Actor,
): Promise<UseCaseResult<{ positionId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    const positionId = await organizationService.createJobPosition(input);
    if (!positionId) throw new Error('تعذر إنشاء المنصب');
    await emitOrgAction('job_position', positionId, 'create', actor, { title: input.title });
    return { positionId };
  });
}

export async function updateJobPosition(
  positionId: string,
  input: {
    title: string;
    departmentId?: string;
    level?: JobLevel;
    hasSystemAccessDefault?: boolean;
    isActive?: boolean;
  },
  actor?: Actor,
): Promise<UseCaseResult<{ positionId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    await organizationService.updateJobPosition(positionId, input);
    await emitOrgAction('job_position', positionId, 'update', actor, { title: input.title });
    return { positionId };
  });
}

export async function createShift(
  input: Parameters<typeof organizationService.createShift>[0],
  actor?: Actor,
): Promise<UseCaseResult<{ shiftId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    const shiftId = await organizationService.createShift(input);
    if (!shiftId) throw new Error('تعذر إنشاء الوردية');
    await emitOrgAction('shift', shiftId, 'create', actor, { name: input.name });
    return { shiftId };
  });
}

export async function updateShift(
  shiftId: string,
  input: Parameters<typeof organizationService.createShift>[0],
  actor?: Actor,
): Promise<UseCaseResult<{ shiftId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    await organizationService.updateShift(shiftId, input);
    await emitOrgAction('shift', shiftId, 'update', actor, { name: input.name });
    return { shiftId };
  });
}

export async function savePenaltyRule(
  input: Omit<FirestorePenaltyRule, 'id'>,
  editId?: string,
  actor?: Actor,
): Promise<UseCaseResult<{ entityId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    if (editId) {
      await organizationService.updatePenaltyRule(editId, input);
      await emitOrgAction('penalty_rule', editId, 'update', actor);
      return { entityId: editId };
    }
    const entityId = await organizationService.createPenaltyRule(input);
    if (!entityId) throw new Error('تعذر حفظ قاعدة الجزاء');
    await emitOrgAction('penalty_rule', entityId, 'create', actor);
    return { entityId };
  });
}

export async function saveLateRule(
  input: Omit<FirestoreLateRule, 'id'>,
  editId?: string,
  actor?: Actor,
): Promise<UseCaseResult<{ entityId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    if (editId) {
      await organizationService.updateLateRule(editId, input);
      await emitOrgAction('late_rule', editId, 'update', actor);
      return { entityId: editId };
    }
    const entityId = await organizationService.createLateRule(input);
    if (!entityId) throw new Error('تعذر حفظ قاعدة التأخير');
    await emitOrgAction('late_rule', entityId, 'create', actor);
    return { entityId };
  });
}

export async function saveAllowanceType(
  input: Omit<FirestoreAllowanceType, 'id'>,
  editId?: string,
  actor?: Actor,
): Promise<UseCaseResult<{ entityId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    if (editId) {
      await organizationService.updateAllowanceType(editId, input);
      await emitOrgAction('allowance_type', editId, 'update', actor);
      return { entityId: editId };
    }
    const entityId = await organizationService.createAllowanceType(input);
    if (!entityId) throw new Error('تعذر حفظ نوع البدل');
    await emitOrgAction('allowance_type', entityId, 'create', actor);
    return { entityId };
  });
}

export async function deleteOrganizationEntity(
  collectionName: string,
  entityId: string,
  actor?: Actor,
): Promise<UseCaseResult<{ entityId: string }>> {
  return runUseCase(async () => {
    requireTenantIdOrThrow();
    await organizationService.deleteEntity(collectionName, entityId);
    await emitOrgAction('organization_entity', entityId, 'delete', actor, { collectionName });
    return { entityId };
  });
}

export { HR_COLLECTIONS };
