import { documentId, getDocs, limit, where } from 'firebase/firestore';
import { db, isConfigured, mutateRepairCustomerOpsCallable } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import {
  CUSTOMER_SERVICE_REQUESTS_COLLECTION,
  REPAIR_CUSTODY_RECORDS_COLLECTION,
  REPAIR_JOBS_COLLECTION,
  REPAIR_REPLACEMENT_REQUESTS_COLLECTION,
} from '../collections';
import type { CustomerServiceRequest, RepairCustodyRecord, RepairJob, RepairReplacementRequest } from '../types';

const sortNewest = <T extends { createdAt?: string; updatedAt?: string }>(rows: T[]) =>
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

async function listByBranches<T extends { id?: string; branchId?: string; createdAt?: string; updatedAt?: string }>(
  collectionName: string,
  branchIds: string[] | undefined,
  rowLimit: number,
): Promise<T[]> {
  const normalized = Array.from(new Set((branchIds || []).filter(Boolean)));
  if (!normalized.length) {
    const snap = await getDocs(tenantQuery(db, collectionName, limit(rowLimit)));
    return sortNewest(snap.docs.map((item) => ({ id: item.id, ...item.data() } as unknown as T)));
  }
  const snapshots = await Promise.all(normalized.map((branchId) =>
    getDocs(tenantQuery(db, collectionName, where('branchId', '==', branchId), limit(rowLimit))),
  ));
  const unique = new Map<string, T>();
  snapshots.forEach((snap) => snap.docs.forEach((item) => unique.set(item.id, { id: item.id, ...item.data() } as unknown as T)));
  return sortNewest(Array.from(unique.values()));
}

export const repairCustomerOperationsService = {
  async listCallCenterJobs(query: string): Promise<RepairJob[]> {
    const result = await mutateRepairCustomerOpsCallable<{ jobs: RepairJob[] }>({
      action: 'listCallCenterJobs',
      query,
    });
    return Array.isArray(result.jobs) ? result.jobs : [];
  },

  async listCustomerRequests(branchIds?: string[]): Promise<CustomerServiceRequest[]> {
    if (!isConfigured) return [];
    return listByBranches<CustomerServiceRequest>(CUSTOMER_SERVICE_REQUESTS_COLLECTION, branchIds, 1000);
  },

  async listCustody(branchIds?: string[]): Promise<RepairCustodyRecord[]> {
    if (!isConfigured) return [];
    const rows = await listByBranches<RepairCustodyRecord>(REPAIR_CUSTODY_RECORDS_COLLECTION, branchIds, 1500);
    const jobIds = Array.from(new Set(rows.map((row) => String(row.jobId || '').trim()).filter(Boolean)));
    const statuses = new Map<string, Pick<RepairCustodyRecord, 'jobStatus' | 'deliveryAuthorizationNo' | 'customerPhone'>>();
    try {
      for (let index = 0; index < jobIds.length; index += 30) {
        const chunk = jobIds.slice(index, index + 30);
        const snap = await getDocs(tenantQuery(db, REPAIR_JOBS_COLLECTION, where(documentId(), 'in', chunk)));
        snap.docs.forEach((item) => {
          const data = item.data();
          statuses.set(item.id, {
            jobStatus: data.status,
            deliveryAuthorizationNo: data.deliveryAuthorizationNo,
            customerPhone: data.customerPhone,
          });
        });
      }
    } catch {
      // Custody rows remain usable without job enrichment when repair.view is missing.
    }
    return rows.map((row) => ({ ...row, ...statuses.get(row.jobId) }));
  },

  async listReplacements(branchIds?: string[]): Promise<RepairReplacementRequest[]> {
    if (!isConfigured) return [];
    return listByBranches<RepairReplacementRequest>(REPAIR_REPLACEMENT_REQUESTS_COLLECTION, branchIds, 1000);
  },

  /** Sidebar badge: replacement requests awaiting approval. */
  async countPendingApprovals(): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const { resolveCurrentUserRepairBranchIdsForBadge } = await import(
        '../lib/resolveCurrentUserRepairBranchIdsForBadge'
      );
      const branchIds = await resolveCurrentUserRepairBranchIdsForBadge();
      const rows = await this.listReplacements(branchIds.length > 0 ? branchIds : undefined);
      return rows.filter((row) => row.status === 'pending_approval').length;
    } catch (error: unknown) {
      const code = String((error as { code?: string })?.code || '').toLowerCase();
      if (code.includes('permission-denied')) return 0;
      console.error('repairCustomerOps.countPendingApprovals failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  generatePortalPin(customerId: string, confirmReset = false) {
    return mutateRepairCustomerOpsCallable<{ pin: string; reset: boolean }>({
      action: 'generatePortalPin',
      customerId,
      confirmReset,
    });
  },

  getPortalPinStatus(customerId: string) {
    return mutateRepairCustomerOpsCallable<{ configured: boolean; updatedAt?: string }>({
      action: 'getPortalPinStatus',
      customerId,
    });
  },

  ensureWarehouses(branchId: string) {
    return mutateRepairCustomerOpsCallable({ action: 'ensureWarehouses', branchId });
  },

  backfillCustomerCustody(cursor?: string) {
    return mutateRepairCustomerOpsCallable<{
      branches: number;
      custodyJobs: number;
      unrepairableJobs: number;
      cancelledForReview: number;
      barcodeClaims: number;
      truncated: boolean;
      nextCursor: string;
    }>({ action: 'backfillCustomerCustody', ...(cursor ? { cursor } : {}) });
  },

  postCustody(jobId: string) {
    return mutateRepairCustomerOpsCallable({ action: 'postCustody', jobId });
  },

  createRepairJobWithCustody(jobId: string, job: Record<string, unknown>) {
    return mutateRepairCustomerOpsCallable<{ jobId: string; receiptNo: string; alreadyCreated: boolean }>({
      action: 'createRepairJobWithCustody', jobId, job,
    });
  },

  assignRequest(requestId: string, branchId: string) {
    return mutateRepairCustomerOpsCallable({ action: 'assignRequest', requestId, branchId });
  },

  receiveRequest(requestId: string, lines: Array<{ lineId: string; receivedQuantity: number; differenceNote?: string }>) {
    return mutateRepairCustomerOpsCallable<{ jobId: string; receiptNo: string }>({ action: 'receiveRequest', requestId, lines });
  },

  recordUnrepairable(jobId: string, itemId: string, quantity: number, reasonCode: string, reasonNote?: string) {
    return mutateRepairCustomerOpsCallable({
      action: 'recordUnrepairable', jobId, itemId, quantity, reasonCode, reasonNote,
    });
  },

  reopenUnrepairable(jobId: string, itemId: string, quantity: number, note?: string) {
    return mutateRepairCustomerOpsCallable<{ status: string; quantity: number }>({
      action: 'reopenUnrepairable', jobId, itemId, quantity, note,
    });
  },

  handover(jobId: string, itemId: string, quantity: number, source: 'custody' | 'unrepairable') {
    return mutateRepairCustomerOpsCallable({ action: 'handover', jobId, itemId, quantity, source });
  },

  createReplacement(jobId: string, itemId: string, quantity: number, reason?: string) {
    return mutateRepairCustomerOpsCallable<{ replacementId: string }>({ action: 'createReplacement', jobId, itemId, quantity, reason });
  },

  approveReplacement(replacementId: string, productId: string, quantity: number, note?: string) {
    return mutateRepairCustomerOpsCallable({ action: 'approveReplacement', replacementId, productId, quantity, note });
  },

  updateReplacement(action: 'rejectReplacement' | 'cancelReplacement' | 'deliverReplacement', replacementId: string, note?: string) {
    return mutateRepairCustomerOpsCallable({ action, replacementId, note });
  },
};
