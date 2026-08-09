import {
  arrayUnion,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateRepairCustomerOpsCallable } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_COMPLAINTS_COLLECTION } from '../collections';
import type {
  RepairComplaint,
  RepairComplaintFollowUp,
  RepairComplaintStatus,
  RepairJob,
} from '../types';

const COLLECTION = REPAIR_COMPLAINTS_COLLECTION;
const MAX_LIST = 500;

const nowIso = () => new Date().toISOString();

const requireTenantId = (): string => {
  if (!isConfigured) throw new Error('Firebase غير مهيأ.');
  return getCurrentTenantId();
};

const mapDoc = (id: string, data: Record<string, unknown>): RepairComplaint => ({
  id,
  ...(data as Omit<RepairComplaint, 'id'>),
  followUps: Array.isArray(data.followUps) ? (data.followUps as RepairComplaintFollowUp[]) : [],
});

export type RepairComplaintCreateInput = Omit<
  RepairComplaint,
  'id' | 'tenantId' | 'status' | 'followUps' | 'createdAt' | 'updatedAt'
> & {
  status?: RepairComplaintStatus;
};

export type RepairComplaintJobOption = Pick<
  RepairJob,
  'id' | 'receiptNo' | 'branchId' | 'customerId' | 'customerName' | 'customerPhone' | 'productName' | 'status' | 'createdAt'
> & { jobProducts?: Array<{ productName?: string }> };

export const repairComplaintService = {
  async list(branchIds?: string[]): Promise<RepairComplaint[]> {
    if (!isConfigured) return [];
    requireTenantId();
    const constraints: Parameters<typeof tenantQuery>[2][] = [
      orderBy('createdAt', 'desc'),
      limit(MAX_LIST),
    ];
    const normalized = Array.from(
      new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (normalized.length === 1) {
      constraints.unshift(where('branchId', '==', normalized[0]));
    } else if (normalized.length > 1 && normalized.length <= 10) {
      constraints.unshift(where('branchId', 'in', normalized));
    } else if (normalized.length > 10) {
      throw new Error('نطاق الفروع أكبر من الحد المسموح للاستعلام.');
    }
    const snap = await getDocs(tenantQuery(db, COLLECTION, ...constraints));
    return snap.docs.map((row) => mapDoc(row.id, row.data() as Record<string, unknown>));
  },

  async listByBranch(branchId: string): Promise<RepairComplaint[]> {
    const branch = String(branchId || '').trim();
    if (!branch) return [];
    return this.list([branch]);
  },

  async getById(id: string): Promise<RepairComplaint | null> {
    if (!isConfigured || !id) return null;
    requireTenantId();
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    const row = mapDoc(snap.id, snap.data() as Record<string, unknown>);
    if (row.tenantId !== getCurrentTenantId()) return null;
    return row;
  },

  async listJobOptions(): Promise<RepairComplaintJobOption[]> {
    const result = await mutateRepairCustomerOpsCallable<{ jobs: RepairComplaintJobOption[] }>({
      action: 'listComplaintJobOptions',
    });
    return Array.isArray(result.jobs) ? result.jobs : [];
  },

  async create(input: RepairComplaintCreateInput): Promise<string> {
    const jobId = String(input.jobId || '').trim();
    const subject = String(input.subject || '').trim();
    if (!jobId) throw new Error('اختر طلب الصيانة المرتبط بالشكوى.');
    if (!subject) throw new Error('أدخل موضوع الشكوى.');
    const result = await mutateRepairCustomerOpsCallable<{ complaintId: string }>({
      action: 'createRepairComplaint',
      jobId,
      subject,
      notes: input.notes || undefined,
    });
    return result.complaintId;
  },

  async addFollowUp(
    complaintId: string,
    followUp: Omit<RepairComplaintFollowUp, 'id' | 'at'> & { id?: string; at?: string },
  ): Promise<void> {
    if (!complaintId) throw new Error('معرّف الشكوى غير صالح.');
    requireTenantId();
    const note = String(followUp.note || '').trim();
    if (!note) throw new Error('أدخل ملاحظة المتابعة.');

    const entry: RepairComplaintFollowUp = {
      id: followUp.id || crypto.randomUUID(),
      at: followUp.at || nowIso(),
      note,
      actorUid: String(followUp.actorUid || '').trim(),
      actorName: String(followUp.actorName || '').trim() || 'مستخدم',
      ...(followUp.followUpAt ? { followUpAt: followUp.followUpAt } : {}),
    };

    await updateDoc(doc(db, COLLECTION, complaintId), {
      followUps: arrayUnion(entry),
      updatedAt: nowIso(),
    });
  },

  async updateStatus(complaintId: string, status: RepairComplaintStatus): Promise<void> {
    if (!complaintId) throw new Error('معرّف الشكوى غير صالح.');
    requireTenantId();
    const allowed: RepairComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
    if (!allowed.includes(status)) throw new Error('حالة غير صالحة.');
    await updateDoc(doc(db, COLLECTION, complaintId), {
      status,
      updatedAt: nowIso(),
    });
  },
};
