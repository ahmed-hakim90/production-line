import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateRepairPaymentCallable } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { chunkIdsForInQuery } from '../lib/repairBranchAccess';
import {
  REPAIR_FINANCIAL_APPROVALS_COLLECTION,
  REPAIR_JOB_FINANCIALS_COLLECTION,
  REPAIR_PAYMENT_AUTHORIZATIONS_COLLECTION,
  REPAIR_PAYMENTS_COLLECTION,
} from '../collections';
import type {
  RepairFinancialApproval,
  RepairJobFinancial,
  RepairPayment,
  RepairPaymentAuthorization,
  RepairPaymentMethod,
  RepairDiscountType,
} from '../types';

const MAX_PAYMENT_LIST = 400;

const tenantRows = <T>(snap: Awaited<ReturnType<typeof getDocs>>): T[] => {
  const tenantId = getCurrentTenantId();
  return snap.docs
    .map((row) => ({ id: row.id, ...(row.data() as Record<string, unknown>) }) as unknown as T & { tenantId?: string })
    .filter((row) => String(row.tenantId || '') === tenantId) as T[];
};

/** Center-scoped reads use `branchId in` chunks; empty branchIds = capped tenant-wide (admin). */
async function listScopedByBranchIds<T extends { id?: string; branchId?: string }>(
  collectionName: string,
  branchIds: string[] | undefined,
  sortKey: (row: T) => string,
): Promise<T[]> {
  if (!isConfigured) return [];
  const chunks = chunkIdsForInQuery(branchIds || []);

  if (chunks.length === 0) {
    const snap = await getDocs(query(
      collection(db, collectionName),
      where('tenantId', '==', getCurrentTenantId()),
      limit(MAX_PAYMENT_LIST),
    ));
    return tenantRows<T>(snap).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      if (chunk.length === 1) {
        const snap = await getDocs(tenantQuery(
          db,
          collectionName,
          where('branchId', '==', chunk[0]),
          limit(MAX_PAYMENT_LIST),
        ));
        return tenantRows<T>(snap);
      }
      const snap = await getDocs(tenantQuery(
        db,
        collectionName,
        where('branchId', 'in', chunk),
        limit(MAX_PAYMENT_LIST),
      ));
      return tenantRows<T>(snap);
    }),
  );
  const byId = new Map<string, T>();
  results.flat().forEach((row) => {
    if (row.id) byId.set(row.id, row);
  });
  return Array.from(byId.values()).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

export const repairPaymentService = {
  async requestCustomerApproval(jobId: string): Promise<{ token: string; authorizationId: string; expiresAt: string }> {
    const result = await mutateRepairPaymentCallable({ operation: 'request_customer_approval', jobId });
    return {
      token: String(result.token || ''),
      authorizationId: String(result.authorizationId || ''),
      expiresAt: String(result.expiresAt || ''),
    };
  },
  async listFinancials(branchIds?: string[]): Promise<RepairJobFinancial[]> {
    return listScopedByBranchIds<RepairJobFinancial>(
      REPAIR_JOB_FINANCIALS_COLLECTION,
      branchIds,
      (row) => String((row as RepairJobFinancial & { updatedAt?: string; createdAt?: string }).updatedAt
        || (row as RepairJobFinancial & { createdAt?: string }).createdAt
        || ''),
    );
  },

  async getFinancial(jobId: string): Promise<RepairJobFinancial | null> {
    if (!isConfigured || !jobId) return null;
    const snap = await getDoc(doc(db, REPAIR_JOB_FINANCIALS_COLLECTION, jobId));
    if (!snap.exists() || String(snap.data().tenantId || '') !== getCurrentTenantId()) return null;
    return { id: snap.id, ...snap.data() } as RepairJobFinancial;
  },

  async getAuthorization(id: string): Promise<RepairPaymentAuthorization | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, REPAIR_PAYMENT_AUTHORIZATIONS_COLLECTION, id));
    if (!snap.exists() || String(snap.data().tenantId || '') !== getCurrentTenantId()) return null;
    return { id: snap.id, ...snap.data() } as RepairPaymentAuthorization;
  },

  async listAuthorizations(branchIds?: string[]): Promise<RepairPaymentAuthorization[]> {
    return listScopedByBranchIds<RepairPaymentAuthorization>(
      REPAIR_PAYMENT_AUTHORIZATIONS_COLLECTION,
      branchIds,
      (row) => String(row.updatedAt || row.createdAt || ''),
    );
  },

  async listApprovals(branchIds?: string[]): Promise<RepairFinancialApproval[]> {
    return listScopedByBranchIds<RepairFinancialApproval>(
      REPAIR_FINANCIAL_APPROVALS_COLLECTION,
      branchIds,
      (row) => String(row.requestedAt || ''),
    );
  },

  /** Sidebar badge: financial discount/credit approvals awaiting decision. */
  async countPendingApprovals(): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const { resolveCurrentUserRepairBranchIdsForBadge } = await import(
        '../lib/resolveCurrentUserRepairBranchIdsForBadge'
      );
      const branchIds = await resolveCurrentUserRepairBranchIdsForBadge();
      const rows = await this.listApprovals(branchIds.length > 0 ? branchIds : undefined);
      return rows.filter((row) => row.status === 'pending').length;
    } catch (error: unknown) {
      const code = String((error as { code?: string })?.code || '').toLowerCase();
      if (code.includes('permission-denied')) return 0;
      console.error('repairPayment.countPendingApprovals failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async listPayments(jobId?: string, branchIds?: string[]): Promise<RepairPayment[]> {
    if (!isConfigured) return [];
    if (jobId) {
      const snap = await getDocs(tenantQuery(
        db,
        REPAIR_PAYMENTS_COLLECTION,
        where('jobId', '==', jobId),
        limit(MAX_PAYMENT_LIST),
      ));
      return tenantRows<RepairPayment>(snap)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    return listScopedByBranchIds<RepairPayment>(
      REPAIR_PAYMENTS_COLLECTION,
      branchIds,
      (row) => String(row.createdAt || ''),
    );
  },

  prepare(input: { jobId: string; discountType: RepairDiscountType; discountValue: number; reason?: string }) {
    return mutateRepairPaymentCallable({ operation: 'prepare', ...input });
  },
  resolveApproval(input: { approvalId: string; decision: 'approved' | 'rejected'; note?: string }) {
    return mutateRepairPaymentCallable({ operation: 'resolve_approval', ...input });
  },
  requestCredit(input: { authorizationId: string; reason: string }) {
    return mutateRepairPaymentCallable({ operation: 'request_credit', ...input });
  },
  collect(input: { authorizationId: string; amount: number; method: RepairPaymentMethod; requestId: string }) {
    return mutateRepairPaymentCallable({ operation: 'collect', ...input });
  },
  /** Post-delivery AR clear: Dr cash · Cr receivables. */
  collectReceivable(input: { authorizationId: string; amount: number; method: RepairPaymentMethod; requestId: string }) {
    return mutateRepairPaymentCallable({ operation: 'collect_receivable', ...input });
  },
  reverse(input: { paymentId: string; reason: string }) {
    return mutateRepairPaymentCallable({ operation: 'reverse_payment', ...input });
  },
  deliver(input: { jobId: string; warranty?: string }) {
    return mutateRepairPaymentCallable({ operation: 'deliver', ...input });
  },
};
