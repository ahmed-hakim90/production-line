import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { repairJobService } from '../services/repairJobService';

type CreateRepairJobInput = Parameters<typeof repairJobService.create>[0];

export async function createRepairJob(
  input: CreateRepairJobInput,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<{ jobId: string; usedFallbackReceipt: boolean }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const result = await repairJobService.create(input);
    if (!result.id) throw new Error('تعذر إنشاء أمر الإصلاح');

    eventBus.emit(SystemEvents.REPAIR_JOB_CREATED, {
      module: 'repair',
      entityType: 'repair_job',
      entityId: result.id,
      action: 'create',
      receiptNo: input.receiptNo,
      tenantId,
      actor,
      description: 'Repair job created',
      metadata: {
        usedFallbackReceipt: result.usedFallbackReceipt,
        branchId: input.branchId,
      },
    });

    return { jobId: result.id, usedFallbackReceipt: result.usedFallbackReceipt };
  });
}
