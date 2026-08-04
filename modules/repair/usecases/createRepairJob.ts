import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { customerActivityService } from '@/modules/customers/services/customerActivityService';
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
        customerId: input.customerId,
      },
    });

    if (input.customerId) {
      await customerActivityService.record({
        customerId: input.customerId,
        module: 'repair',
        action: 'repair.job_created',
        title: 'طلب صيانة جديد',
        summary: `${input.customerName || ''} · ${input.deviceBrand || ''} ${input.deviceModel || ''}`.trim(),
        referenceType: 'repair_job',
        referenceId: result.id,
        referenceLabel: input.receiptNo || result.id,
        actorUid: actor?.userId,
        actorName: actor?.userName,
        metadata: { branchId: input.branchId },
      });
    }

    return { jobId: result.id, usedFallbackReceipt: result.usedFallbackReceipt };
  });
}
