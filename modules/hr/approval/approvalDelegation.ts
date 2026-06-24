/**
 * Approval Delegation Service
 *
 * Allows an approver to delegate their approval authority to another employee
 * for a specific date range. The engine checks active delegations when
 * resolving who should act on a given approval step.
 */
import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import {
  approvalDelegationsRef,
  approvalDelegationDocRef,
} from './collections';
import type {
  FirestoreApprovalDelegation,
  ApprovalRequestType,
} from './types';

export const approvalDelegationService = {
  async create(
    data: Omit<FirestoreApprovalDelegation, 'id' | 'createdAt'>,
  ): Promise<string> {
    if (!isConfigured) return '';

    const ref = await addDoc(approvalDelegationsRef(), {
      ...data,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getById(id: string): Promise<FirestoreApprovalDelegation | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(approvalDelegationDocRef(id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreApprovalDelegation;
  },

  async getByFromEmployee(
    fromEmployeeId: string,
  ): Promise<FirestoreApprovalDelegation[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalDelegationsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('fromEmployeeId', '==', fromEmployeeId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalDelegation));
  },

  async getByToEmployee(
    toEmployeeId: string,
  ): Promise<FirestoreApprovalDelegation[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalDelegationsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('toEmployeeId', '==', toEmployeeId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalDelegation));
  },

  async deactivate(id: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(approvalDelegationDocRef(id), { isActive: false });
  },

  async getAll(): Promise<FirestoreApprovalDelegation[]> {
    if (!isConfigured) return [];
    const q = query(
      approvalDelegationsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalDelegation));
  },

  /**
   * Find the active delegate for a given approver on a specific date/type.
   * Returns the delegatee's employeeId, or null if no active delegation.
   */
  async resolveDelegate(
    approverEmployeeId: string,
    requestType: ApprovalRequestType,
    date: string,
  ): Promise<FirestoreApprovalDelegation | null> {
    if (!isConfigured) return null;

    const q = query(
      approvalDelegationsRef(),
      where('tenantId', '==', getCurrentTenantId()),
      where('fromEmployeeId', '==', approverEmployeeId),
      where('isActive', '==', true),
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const delegation = { id: d.id, ...d.data() } as FirestoreApprovalDelegation;

      if (delegation.startDate > date || delegation.endDate < date) continue;

      if (
        delegation.requestTypes === 'all' ||
        delegation.requestTypes.includes(requestType)
      ) {
        return delegation;
      }
    }

    return null;
  },
};
