/**
 * Approval Audit Service
 *
 * Records every action on approval requests for compliance and traceability.
 * Each audit entry is immutable once written.
 */
import {
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { approvalAuditLogsRef } from './collections';
import type {
  FirestoreApprovalAuditLog,
  ApprovalAction,
  ApprovalRequestType,
} from './types';

export const approvalAuditService = {
  async log(
    requestId: string,
    requestType: ApprovalRequestType,
    employeeId: string,
    action: ApprovalAction,
    performedBy: string,
    performedByName: string,
    step: number | null,
    details: Record<string, any> = {},
  ): Promise<string> {
    if (!isConfigured) return '';

    const entry: Omit<FirestoreApprovalAuditLog, 'id'> = {
      tenantId: getCurrentTenantId(),
      requestId,
      requestType,
      employeeId,
      action,
      performedBy,
      performedByName,
      step,
      details,
      timestamp: serverTimestamp(),
    };

    const ref = await addDoc(approvalAuditLogsRef(), entry);
    return ref.id;
  },

  async getByRequest(requestId: string): Promise<FirestoreApprovalAuditLog[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalAuditLogsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('requestId', '==', requestId),
      orderBy('timestamp', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalAuditLog));
  },

  async getByEmployee(employeeId: string): Promise<FirestoreApprovalAuditLog[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalAuditLogsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('employeeId', '==', employeeId),
      orderBy('timestamp', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalAuditLog));
  },

  async getByPerformer(performedBy: string): Promise<FirestoreApprovalAuditLog[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalAuditLogsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('performedBy', '==', performedBy),
      orderBy('timestamp', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalAuditLog));
  },

  async getByAction(action: ApprovalAction): Promise<FirestoreApprovalAuditLog[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalAuditLogsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('action', '==', action),
      orderBy('timestamp', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalAuditLog));
  },
};
