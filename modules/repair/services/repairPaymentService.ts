import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateRepairPaymentCallable } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
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

const tenantRows = <T>(snap: Awaited<ReturnType<typeof getDocs>>): T[] => {
  const tenantId = getCurrentTenantId();
  return snap.docs
    .map((row) => ({ id: row.id, ...(row.data() as Record<string, unknown>) }) as unknown as T & { tenantId?: string })
    .filter((row) => String(row.tenantId || '') === tenantId) as T[];
};

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
    if (!isConfigured) return [];
    const snap = await getDocs(query(
      collection(db, REPAIR_JOB_FINANCIALS_COLLECTION),
      where('tenantId', '==', getCurrentTenantId()),
    ));
    const allowed = new Set((branchIds || []).filter(Boolean));
    return tenantRows<RepairJobFinancial>(snap).filter((row) => allowed.size === 0 || allowed.has(row.branchId));
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
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const allowed = new Set((branchIds || []).filter(Boolean));
    // One tenant query (single-field index) + client branch filter — avoids N branch round-trips.
    const snap = await getDocs(query(
      collection(db, REPAIR_PAYMENT_AUTHORIZATIONS_COLLECTION),
      where('tenantId', '==', tenantId),
    ));
    return tenantRows<RepairPaymentAuthorization>(snap)
      .filter((row) => allowed.size === 0 || allowed.has(row.branchId))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  },

  async listApprovals(branchIds?: string[]): Promise<RepairFinancialApproval[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const allowed = new Set((branchIds || []).filter(Boolean));
    const snap = await getDocs(query(
      collection(db, REPAIR_FINANCIAL_APPROVALS_COLLECTION),
      where('tenantId', '==', tenantId),
    ));
    return tenantRows<RepairFinancialApproval>(snap)
      .filter((row) => allowed.size === 0 || allowed.has(row.branchId))
      .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  },

  async listPayments(jobId?: string, branchIds?: string[]): Promise<RepairPayment[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const allowed = new Set((branchIds || []).filter(Boolean));
    const snap = await getDocs(query(
      collection(db, REPAIR_PAYMENTS_COLLECTION),
      where('tenantId', '==', tenantId),
    ));
    return tenantRows<RepairPayment>(snap)
      .filter((row) => (allowed.size === 0 || allowed.has(row.branchId)) && (!jobId || row.jobId === jobId))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
  reverse(input: { paymentId: string; reason: string }) {
    return mutateRepairPaymentCallable({ operation: 'reverse_payment', ...input });
  },
  deliver(input: { jobId: string; warranty?: string }) {
    return mutateRepairPaymentCallable({ operation: 'deliver', ...input });
  },
};
