/**
 * Loan Service — Firestore CRUD for employee loans and installment tracking.
 * Supports two loan types:
 *   - monthly_advance: one-time monthly advance with disbursement tracking
 *   - installment: loan repaid over multiple months
 */
import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import {
  employeeLoansRef,
  HR_COLLECTIONS,
} from './collections';
import type {
  FirestoreEmployeeLoan,
  ApprovalChainItem,
  ApprovalStatus,
  LoanInstallment,
  LoanType,
} from './types';
const MAX_PAGE_SIZE = 100;

type FirestoreCursor = QueryDocumentSnapshot | null;
type LoanPageResult = {
  items: FirestoreEmployeeLoan[];
  nextCursor: FirestoreCursor;
  hasMore: boolean;
};

export const loanService = {
  async listPaged(params?: {
    employeeId?: string;
    loanType?: LoanType;
    finalStatus?: ApprovalStatus;
    status?: FirestoreEmployeeLoan['status'];
    month?: string;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<LoanPageResult> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 30), MAX_PAGE_SIZE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.employeeId) constraints.unshift(where('employeeId', '==', params.employeeId));
    if (params?.loanType) constraints.unshift(where('loanType', '==', params.loanType));
    if (params?.finalStatus) constraints.unshift(where('finalStatus', '==', params.finalStatus));
    if (params?.status) constraints.unshift(where('status', '==', params.status));
    if (params?.month) constraints.unshift(where('month', '==', params.month));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const q = query(employeeLoansRef(), ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  async create(data: Omit<FirestoreEmployeeLoan, 'id' | 'createdAt'>): Promise<string> {
    if (!isConfigured) return '';
    const docRef = await addDoc(employeeLoansRef(), {
      ...data,
      disbursed: data.disbursed ?? false,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async getAll(): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    try {
      const rows: FirestoreEmployeeLoan[] = [];
      let cursor: FirestoreCursor = null;
      const maxPages = 10;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await this.listPaged({ limit: MAX_PAGE_SIZE, cursor });
        rows.push(...res.items);
        if (!res.hasMore || !res.nextCursor) break;
        cursor = res.nextCursor;
      }
      return rows;
    } catch {
      return [];
    }
  },

  async getByEmployee(employeeId: string): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        employeeLoansRef(),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
    } catch {
      const q = query(
        employeeLoansRef(),
        where('employeeId', '==', employeeId),
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
      results.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.seconds ?? 0;
        return tb - ta;
      });
      return results;
    }
  },

  async getById(id: string): Promise<FirestoreEmployeeLoan | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreEmployeeLoan;
  },

  async getByType(loanType: LoanType): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        employeeLoansRef(),
        where('loanType', '==', loanType),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
    } catch {
      const q = query(employeeLoansRef(), where('loanType', '==', loanType));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
      results.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      return results;
    }
  },

  async getByMonth(month: string): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    const q = query(
      employeeLoansRef(),
      where('month', '==', month),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
  },

  async getPending(): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        employeeLoansRef(),
        where('finalStatus', '==', 'pending'),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
    } catch {
      const q = query(employeeLoansRef(), where('finalStatus', '==', 'pending'));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
      results.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      return results;
    }
  },

  async getActive(): Promise<FirestoreEmployeeLoan[]> {
    if (!isConfigured) return [];
    const q = query(
      employeeLoansRef(),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeLoan));
  },

  async updateApproval(
    id: string,
    approvalChain: ApprovalChainItem[],
    finalStatus: ApprovalStatus,
  ): Promise<void> {
    if (!isConfigured) return;
    const updates: Record<string, any> = { approvalChain, finalStatus };

    if (finalStatus === 'approved') {
      updates.status = 'active';
    } else if (finalStatus === 'rejected') {
      updates.status = 'pending';
    }

    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id), updates);
  },

  async disburse(
    id: string,
    disbursedBy: string,
    disbursedByName: string,
  ): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id), {
      disbursed: true,
      disbursedAt: serverTimestamp(),
      disbursedBy,
      disbursedByName,
    });
  },

  async undoDisburse(id: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id), {
      disbursed: false,
      disbursedAt: null,
      disbursedBy: null,
      disbursedByName: null,
    });
  },

  async processInstallment(loanId: string): Promise<{ closed: boolean }> {
    if (!isConfigured) return { closed: false };

    const loan = await this.getById(loanId);
    if (!loan || loan.status !== 'active') return { closed: false };

    const newRemaining = Math.max(0, loan.remainingInstallments - 1);
    const closed = newRemaining === 0;

    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, loanId), {
      remainingInstallments: newRemaining,
      status: closed ? 'closed' : 'active',
    });

    return { closed };
  },

  async update(id: string, data: Partial<FirestoreEmployeeLoan>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id), data as any);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    const { deleteDoc: delDoc } = await import('firebase/firestore');
    await delDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_LOANS, id));
  },

  async getActiveInstallments(employeeId: string): Promise<LoanInstallment[]> {
    if (!isConfigured) return [];
    const q = query(
      employeeLoansRef(),
      where('employeeId', '==', employeeId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as FirestoreEmployeeLoan;
      return {
        loanId: d.id,
        employeeId: data.employeeId,
        installmentAmount: data.installmentAmount,
        remainingInstallments: data.remainingInstallments,
      };
    });
  },
};
