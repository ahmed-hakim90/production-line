import { isConfigured, mutateRepairCustomerOpsCallable } from '../../auth/services/firebase';
import type { RepairFollowUp } from '../types';

export type CreateRepairFollowUpInput = {
  jobId: string;
  branchId: string;
  tenantId?: string;
  note: string;
  followUpAt?: string;
  actorUid: string;
  actorName: string;
};

export const repairFollowUpService = {
  async create(input: CreateRepairFollowUpInput): Promise<string | null> {
    if (!isConfigured) return null;
    const jobId = String(input.jobId || '').trim();
    const note = String(input.note || '').trim();
    if (!jobId || !note) {
      throw new Error('بيانات المتابعة غير مكتملة.');
    }
    const result = await mutateRepairCustomerOpsCallable<{ followUpId: string }>({
      action: 'createRepairFollowUp',
      jobId,
      note,
      followUpAt: input.followUpAt,
    });
    return result.followUpId;
  },

  async listByJob(jobId: string): Promise<RepairFollowUp[]> {
    if (!isConfigured || !jobId) return [];
    const result = await mutateRepairCustomerOpsCallable<{ followUps: RepairFollowUp[] }>({
      action: 'listRepairFollowUps',
      jobId,
    });
    return Array.isArray(result.followUps) ? result.followUps : [];
  },
};
