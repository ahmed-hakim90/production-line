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
import { DEFAULT_LEAVE_BALANCE, LEAVE_TYPE_LABELS } from './types';

type PaidLeaveType = Exclude<LeaveType, 'unpaid'>;

const PAID_LEAVE_TYPES: PaidLeaveType[] = ['annual', 'sick', 'emergency'];

const DEFAULT_BALANCE_BY_TYPE: Record<PaidLeaveType, number> = {
  annual: DEFAULT_LEAVE_BALANCE.annualBalance,
  sick: DEFAULT_LEAVE_BALANCE.sickBalance,
  emergency: DEFAULT_LEAVE_BALANCE.emergencyBalance,
};

function getRequestTimeMs(req: FirestoreLeaveRequest): number {
  const created = req.createdAt;
  if (created?.toMillis) return created.toMillis();
  if (typeof created?.seconds === 'number') return created.seconds * 1000;
  const start = req.startDate ? Date.parse(`${req.startDate}T12:00:00`) : 0;
  return Number.isFinite(start) ? start : 0;
}

function isWithinRange(
  value: string,
  startDate?: string,
  endDate?: string,
): boolean {
  if (!value) return false;
  if (startDate && value < startDate) return false;
  if (endDate && value > endDate) return false;
  return true;
}

export interface LeaveTypeUsageItem {
  leaveType: LeaveType;
  label: string;
  approvedDaysInRange: number;
  usedDays: number;
  availableDays: number;
  defaultDays: number | null;
  approvedRequestsCount: number;
  lastUsedDate: string | null;
}

export interface EmployeeLeaveUsageSummary {
  employeeId: string;
  leaveBalance: FirestoreLeaveBalance;
  perType: LeaveTypeUsageItem[];
  lastUsedLeave: {
    leaveType: LeaveType;
    date: string;
    totalDays: number;
  } | null;
}

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
        // Custom leave types may not consume a fixed balance bucket.
        return { success: true };
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

  async getApprovedByRange(
    startDate: string,
    endDate: string,
  ): Promise<FirestoreLeaveRequest[]> {
    if (!isConfigured) return [];
    const q = query(
      leaveRequestsRef(),
      where('finalStatus', '==', 'approved'),
      where('startDate', '>=', startDate),
      where('startDate', '<=', endDate),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLeaveRequest));
  },
};

export async function getEmployeeLeaveUsageSummary(
  employeeId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    approvedRequests?: FirestoreLeaveRequest[];
    leaveBalance?: FirestoreLeaveBalance | null;
  },
): Promise<EmployeeLeaveUsageSummary> {
  const [rawBalance, allRequests] = await Promise.all([
    options?.leaveBalance ? Promise.resolve(options.leaveBalance) : leaveBalanceService.getByEmployee(employeeId),
    options?.approvedRequests ? Promise.resolve(options.approvedRequests) : leaveRequestService.getByEmployee(employeeId),
  ]);

  const leaveBalance = rawBalance ?? (await leaveBalanceService.getOrCreate(employeeId));
  const approvedRequests = (allRequests || [])
    .filter((req) => req.finalStatus === 'approved')
    .filter((req) => isWithinRange(req.startDate, options?.startDate, options?.endDate))
    .sort((a, b) => getRequestTimeMs(b) - getRequestTimeMs(a));

  const approvedDaysByType: Record<LeaveType, number> = {
    annual: 0,
    sick: 0,
    emergency: 0,
    unpaid: 0,
  };
  const approvedCountByType: Record<LeaveType, number> = {
    annual: 0,
    sick: 0,
    emergency: 0,
    unpaid: 0,
  };
  const lastUsedDateByType: Record<LeaveType, string | null> = {
    annual: null,
    sick: null,
    emergency: null,
    unpaid: null,
  };

  approvedRequests.forEach((req) => {
    approvedDaysByType[req.leaveType] += Number(req.totalDays || 0);
    approvedCountByType[req.leaveType] += 1;
    if (!lastUsedDateByType[req.leaveType]) {
      lastUsedDateByType[req.leaveType] = req.startDate;
    }
  });

  const balanceByType: Record<PaidLeaveType, number> = {
    annual: leaveBalance.annualBalance || 0,
    sick: leaveBalance.sickBalance || 0,
    emergency: leaveBalance.emergencyBalance || 0,
  };

  const perType: LeaveTypeUsageItem[] = [
    ...PAID_LEAVE_TYPES.map((leaveType) => {
      const fromBalance = Math.max(0, DEFAULT_BALANCE_BY_TYPE[leaveType] - balanceByType[leaveType]);
      return {
        leaveType,
        label: LEAVE_TYPE_LABELS[leaveType],
        approvedDaysInRange: approvedDaysByType[leaveType],
        usedDays: Math.max(approvedDaysByType[leaveType], fromBalance),
        availableDays: Math.max(0, balanceByType[leaveType]),
        defaultDays: DEFAULT_BALANCE_BY_TYPE[leaveType],
        approvedRequestsCount: approvedCountByType[leaveType],
        lastUsedDate: lastUsedDateByType[leaveType],
      };
    }),
    {
      leaveType: 'unpaid',
      label: LEAVE_TYPE_LABELS.unpaid,
      approvedDaysInRange: approvedDaysByType.unpaid,
      usedDays: Math.max(leaveBalance.unpaidTaken || 0, approvedDaysByType.unpaid),
      availableDays: 0,
      defaultDays: null,
      approvedRequestsCount: approvedCountByType.unpaid,
      lastUsedDate: lastUsedDateByType.unpaid,
    },
  ];

  const latestReq = approvedRequests[0];
  return {
    employeeId,
    leaveBalance,
    perType,
    lastUsedLeave: latestReq
      ? {
          leaveType: latestReq.leaveType,
          date: latestReq.startDate,
          totalDays: latestReq.totalDays,
        }
      : null,
  };
}

export async function getEmployeeLeaveUsageSummariesByRange(
  employeeIds: string[],
  startDate: string,
  endDate: string,
): Promise<Record<string, EmployeeLeaveUsageSummary>> {
  if (employeeIds.length === 0) return {};

  const approved = await leaveRequestService.getApprovedByRange(startDate, endDate);
  const approvedByEmployee = new Map<string, FirestoreLeaveRequest[]>();
  approved.forEach((req) => {
    if (!employeeIds.includes(req.employeeId)) return;
    const arr = approvedByEmployee.get(req.employeeId) ?? [];
    arr.push(req);
    approvedByEmployee.set(req.employeeId, arr);
  });

  const summaries = await Promise.all(
    employeeIds.map(async (employeeId) => {
      const summary = await getEmployeeLeaveUsageSummary(employeeId, {
        startDate,
        endDate,
        approvedRequests: approvedByEmployee.get(employeeId) ?? [],
      });
      return [employeeId, summary] as const;
    }),
  );

  return Object.fromEntries(summaries);
}
