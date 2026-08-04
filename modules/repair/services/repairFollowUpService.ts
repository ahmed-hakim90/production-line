import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { REPAIR_FOLLOWUPS_COLLECTION } from '../collections';
import type { RepairFollowUp } from '../types';

const nowIso = () => new Date().toISOString();

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
    const tenantId = String(input.tenantId || getCurrentTenantId() || '').trim();
    const jobId = String(input.jobId || '').trim();
    const branchId = String(input.branchId || '').trim();
    const note = String(input.note || '').trim();
    if (!tenantId || !jobId || !branchId || !note) {
      throw new Error('بيانات المتابعة غير مكتملة.');
    }
    const payload: Omit<RepairFollowUp, 'id'> = {
      tenantId,
      branchId,
      jobId,
      note,
      actorUid: String(input.actorUid || '').trim(),
      actorName: String(input.actorName || 'مستخدم').trim(),
      createdAt: nowIso(),
      ...(input.followUpAt ? { followUpAt: String(input.followUpAt) } : {}),
    };
    const ref = await addDoc(collection(db, REPAIR_FOLLOWUPS_COLLECTION), payload);
    return ref.id;
  },

  async listByJob(jobId: string): Promise<RepairFollowUp[]> {
    if (!isConfigured || !jobId) return [];
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, REPAIR_FOLLOWUPS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('jobId', '==', jobId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairFollowUp));
  },
};
