/**
 * Leave Service — Firestore CRUD for leave requests and balances.
 * Handles leave creation, approval with balance deduction, and queries.
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
  Timestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import {
  leaveRequestsRef,
  leaveBalancesRef,
  HR_COLLECTIONS,
} from './collections';
import type {
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  LeaveType,
  ApprovalChainItem,
  ApprovalStatus,
} from './types';
import { DEFAULT_LEAVE_BALANCE } from './types';

// ─── Leave Balance Service ──────────────────────────────────────────────────

export const leaveBalanceService = {
  async getByEmployee(employeeId: string): Promise<FirestoreLeaveBalance | null> {
    if (!isConfigured) return null;
    const q = query(leaveBalancesRef(), where('employeeId', '==', employeeId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as FirestoreLeaveBalance;
  },

  async getOrCreate(employeeId: string): Promise<FirestoreLeaveBalance> {
    if (!isConfigured) {
      return { employeeId, ...DEFAULT_LEAVE_BALANCE };
    }

    const existing = await this.getByEmployee(employeeId);
    if (existing) return existing;

    const docRef = await addDoc(leaveBalancesRef(), {
      employeeId,
      ...DEFAULT_LEAVE_BALANCE,
      lastUpdated: serverTimestamp(),
    });

    return {
      id: docRef.id,
      employeeId,
      ...DEFAULT_LEAVE_BALANCE,
    };
  },

  async update(id: string, data: Partial<FirestoreLeaveBalance>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.LEAVE_BALANCES, id), {
      ...data,
      lastUpdated: serverTimestamp(),
    });
  },

  /**
   * Deduct days from the appropriate balance bucket.
   * Returns false if insufficient balance (except unpaid which is unlimited).
   */
  async deductBalance(
    employeeId: string,
    leaveType: LeaveType,
    days: number,
  ): Promise<{ success: boolean; error?: string }> {
    const balance = await this.getOrCreate(employeeId);
    if (!balance.id) return { success: false, error: 'خطأ في تحميل رصيد الإجازات' };

    switch (leaveType) {
      case 'annual':
        if (balance.annualBalance < days) {
          return { success: false, error: `رصيد الإجازات السنوية غير كافٍ (${balance.annualBalance} يوم متبقي)` };
        }
        await this.update(balance.id, { annualBalance: balance.annualBalance - days });
        return { success: true };

      case 'sick':
        if (balance.sickBalance < days) {
          return { success: false, error: `رصيد الإجازات المرضية غير كافٍ (${balance.sickBalance} يوم متبقي)` };
        }
        await this.update(balance.id, { sickBalance: balance.sickBalance - days });
        return { success: true };

      case 'emergency':
        if (balance.emergencyBalance < days) {
          return { success: false, error: `رصيد الإجازات الطارئة غير كافٍ (${balance.emergencyBalance} يوم متبقي)` };
        }
        await this.update(balance.id, { emergencyBalance: balance.emergencyBalance - days });
        return { success: true };

      case 'unpaid':
        await this.update(balance.id, { unpaidTaken: balance.unpaidTaken + days });
        return { success: true };

      default:
        return { success: false, error: 'نوع إجازة غير معروف' };
    }
  },

  async getAll(): Promise<FirestoreLeaveBalance[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(leaveBalancesRef());
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveBalance));
  },
};

// ─── Leave Request Service ──────────────────────────────────────────────────

export const leaveRequestService = {
  async create(data: Omit<FirestoreLeaveRequest, 'id' | 'createdAt'>): Promise<string> {
    if (!isConfigured) return '';
    const docRef = await addDoc(leaveRequestsRef(), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async getAll(): Promise<FirestoreLeaveRequest[]> {
    if (!isConfigured) return [];
    const q = query(leaveRequestsRef(), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveRequest));
  },

  async getByEmployee(employeeId: string): Promise<FirestoreLeaveRequest[]> {
    if (!isConfigured) return [];
    const q = query(
      leaveRequestsRef(),
      where('employeeId', '==', employeeId),
    );
    const snap = await getDocs(q);
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveRequest));
    return results.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tb - ta;
    });
  },

  async getById(id: string): Promise<FirestoreLeaveRequest | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, HR_COLLECTIONS.LEAVE_REQUESTS, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreLeaveRequest;
  },

  async getPending(): Promise<FirestoreLeaveRequest[]> {
    if (!isConfigured) return [];
    const q = query(
      leaveRequestsRef(),
      where('finalStatus', '==', 'pending'),
    );
    const snap = await getDocs(q);
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveRequest));
    return results.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tb - ta;
    });
  },

  async updateApproval(
    id: string,
    approvalChain: ApprovalChainItem[],
    finalStatus: ApprovalStatus,
    status: ApprovalStatus,
  ): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.LEAVE_REQUESTS, id), {
      approvalChain,
      finalStatus,
      status,
    });
  },

  async update(id: string, data: Partial<FirestoreLeaveRequest>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, HR_COLLECTIONS.LEAVE_REQUESTS, id), data as any);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    const { deleteDoc: delDoc } = await import('firebase/firestore');
    await delDoc(doc(db, HR_COLLECTIONS.LEAVE_REQUESTS, id));
  },

  /**
   * Get approved leaves for a specific employee within a date range (for payroll).
   */
  async getApprovedByEmployeeAndRange(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<FirestoreLeaveRequest[]> {
    if (!isConfigured) return [];
    const q = query(
      leaveRequestsRef(),
      where('employeeId', '==', employeeId),
      where('finalStatus', '==', 'approved'),
      where('startDate', '>=', startDate),
      where('startDate', '<=', endDate),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveRequest));
  },
};
