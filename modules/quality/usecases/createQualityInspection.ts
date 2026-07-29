import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { QualityInspectionStatus, QualityInspectionType } from '../types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import type { FileAttachmentMeta } from '@/types';

export type CreateQualityInspectionInput = {
  workOrderId: string;
  lineId: string;
  productId: string;
  sessionId?: string;
  serialBarcode?: string;
  type: QualityInspectionType;
  status: QualityInspectionStatus;
  inspectedBy: string;
  notes?: string;
  attachments?: FileAttachmentMeta[];
  actorUserId?: string;
};

export async function createQualityInspection(
  input: CreateQualityInspectionInput,
): Promise<UseCaseResult<{ inspectionId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const { actorUserId, ...payload } = input;
    const inspectionId = await qualityInspectionService.createInspection(payload);
    if (!inspectionId) throw new Error('تعذر تسجيل فحص الجودة');

    const approvedLike = payload.status === 'passed' || payload.status === 'approved';
    const rejectedLike = payload.status === 'failed' || payload.status === 'rejected';

    if (approvedLike) {
      eventBus.emit(SystemEvents.QC_APPROVED, {
        module: 'quality',
        entityType: 'quality_inspection',
        entityId: inspectionId,
        action: 'approve',
        tenantId,
        actor: { userId: actorUserId, userName: payload.inspectedBy },
        description: 'QC inspection passed',
        metadata: { workOrderId: payload.workOrderId, type: payload.type },
      });
    } else if (rejectedLike) {
      eventBus.emit(SystemEvents.QC_REJECTED, {
        module: 'quality',
        entityType: 'quality_inspection',
        entityId: inspectionId,
        action: 'reject',
        tenantId,
        actor: { userId: actorUserId, userName: payload.inspectedBy },
        description: 'QC inspection failed',
        metadata: { workOrderId: payload.workOrderId, type: payload.type },
      });
    } else {
      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'quality',
        entityType: 'quality_inspection',
        entityId: inspectionId,
        action: 'create',
        tenantId,
        actor: { userId: actorUserId, userName: payload.inspectedBy },
        description: 'QC inspection created',
        metadata: { workOrderId: payload.workOrderId, type: payload.type, status: payload.status },
      });
    }

    return { inspectionId };
  });
}
