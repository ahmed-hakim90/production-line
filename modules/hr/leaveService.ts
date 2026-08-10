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
  runTransaction,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import {
  leaveRequestsRef,
  leaveBalancesRef,
  HR_COLLECTIONS,
} from './collections';
import { getLeaveTypesFromConfig } from './leaveTypes';
import { buildLeaveTypeUsageRows, type LeaveTypeUsageItem } from './leaveUsage';
import type {
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  LeaveType,
  ApprovalChainItem,
  ApprovalStatus,
} from './types';
import { DEFAULT_LEAVE_BALANCE } from './types';

export type { LeaveTypeUsageItem } from './leaveUsage';
export { buildLeaveTypeUsageRows } from './leaveUsage';

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

export interface LeaveBalanceDeductionResult {
  success: boolean;
  error?: string;
  outsideBalanceDays?: number;
}

export interface LeaveBalanceDeductionOptions {
  allowOutsideBalance?: boolean;
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
      tenantId: getCurrentTenantId(),
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
    options?: LeaveBalanceDeductionOptions,
  ): Promise<LeaveBalanceDeductionResult> {
    const balance = await this.getOrCreate(employeeId);
    if (!balance.id) return { success: false, error: 'خطأ في تحميل رصيد الإجازات' };
    const allowOutsideBalance = options?.allowOutsideBalance === true;

    const trackOutsideBalance = async (trackedDays: number): Promise<LeaveBalanceDeductionResult> => {
      const currentOutside = Number((balance as any).outsideBalanceTaken || 0);
      const outsideByType = {
        ...((balance as any).outsideBalanceByType || {}),
        [leaveType]: Number(((balance as any).outsideBalanceByType || {})[leaveType] || 0) + trackedDays,
      };
      await this.update(balance.id!, {
        outsideBalanceTaken: currentOutside + trackedDays,
        outsideBalanceByType: outsideByType,
      } as any);
      return { success: true, outsideBalanceDays: trackedDays };
    };

    switch (leaveType) {
      case 'annual':
        if (balance.annualBalance < days) {
          if (allowOutsideBalance) {
            return trackOutsideBalance(days);
          }
          return { success: false, error: `رصيد الإجازات السنوية غير كافٍ (${balance.annualBalance} يوم متبقي)` };
        }
        await this.update(balance.id, { annualBalance: balance.annualBalance - days });
        return { success: true };

      case 'sick':
        if (balance.sickBalance < days) {
          if (allowOutsideBalance) {
            return trackOutsideBalance(days);
          }
          return { success: false, error: `رصيد الإجازات المرضية غير كافٍ (${balance.sickBalance} يوم متبقي)` };
        }
        await this.update(balance.id, { sickBalance: balance.sickBalance - days });
        return { success: true };

      case 'emergency':
        if (balance.emergencyBalance < days) {
          if (allowOutsideBalance) {
            return trackOutsideBalance(days);
          }
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

export async function syncLeaveApprovalDecision(params: {
  leaveRequestId: string;
  approvalChain: ApprovalChainItem[];
  decisionStatus: ApprovalStatus;
}): Promise<{
  success: boolean;
  error?: string;
  outsideBalanceDays?: number;
}> {
  const { leaveRequestId, approvalChain, decisionStatus } = params;

  await leaveRequestService.updateApproval(
    leaveRequestId,
    approvalChain,
    decisionStatus,
    decisionStatus,
  );

  if (decisionStatus !== 'approved') {
    return { success: true };
  }

  const leaveReq = await leaveRequestService.getById(leaveRequestId);
  if (!leaveReq) {
    return { success: false, error: 'سجل الإجازة المرتبط غير موجود' };
  }

  const existingBalance = await leaveBalanceService.getByEmployee(leaveReq.employeeId);
  const tenantId = getCurrentTenantId();
  const balanceId = existingBalance?.id
    || `${tenantId.replace(/\//g, '_')}__${leaveReq.employeeId.replace(/\//g, '_')}`;
  const requestRef = doc(db, HR_COLLECTIONS.LEAVE_REQUESTS, leaveRequestId);
  const balanceRef = doc(db, HR_COLLECTIONS.LEAVE_BALANCES, balanceId);

  const deductionResult = await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      return { success: false, error: 'سجل الإجازة المرتبط غير موجود' };
    }
    const currentRequest = requestSnap.data() as FirestoreLeaveRequest & {
      balanceImpactApplied?: boolean;
      outsideBalanceDaysApplied?: number;
    };
    if (currentRequest.balanceImpactApplied) {
      return {
        success: true,
        outsideBalanceDays: Number(currentRequest.outsideBalanceDaysApplied || 0),
      };
    }
    if (currentRequest.finalStatus !== 'approved') {
      return { success: true, outsideBalanceDays: 0 };
    }

    const balanceSnap = await transaction.get(balanceRef);
    const balance = {
      employeeId: currentRequest.employeeId,
      tenantId,
      ...DEFAULT_LEAVE_BALANCE,
      ...(balanceSnap.exists() ? balanceSnap.data() : {}),
    } as FirestoreLeaveBalance & {
      outsideBalanceTaken?: number;
      outsideBalanceByType?: Record<string, number>;
    };
    const days = Math.max(0, Number(currentRequest.totalDays || 0));
    let outsideBalanceDays = 0;
    const balancePatch: Record<string, unknown> = {
      employeeId: currentRequest.employeeId,
      tenantId,
      lastUpdated: serverTimestamp(),
    };

    if (currentRequest.leaveType === 'unpaid') {
      balancePatch.unpaidTaken = Number(balance.unpaidTaken || 0) + days;
    } else if (
      currentRequest.leaveType === 'annual'
      || currentRequest.leaveType === 'sick'
      || currentRequest.leaveType === 'emergency'
    ) {
      const field = `${currentRequest.leaveType}Balance` as
        'annualBalance' | 'sickBalance' | 'emergencyBalance';
      const available = Number(balance[field] || 0);
      if (available >= days) {
        balancePatch[field] = available - days;
      } else {
        outsideBalanceDays = days;
        balancePatch.outsideBalanceTaken =
          Number(balance.outsideBalanceTaken || 0) + outsideBalanceDays;
        balancePatch.outsideBalanceByType = {
          ...(balance.outsideBalanceByType || {}),
          [currentRequest.leaveType]:
            Number(balance.outsideBalanceByType?.[currentRequest.leaveType] || 0)
            + outsideBalanceDays,
        };
      }
    }

    transaction.set(balanceRef, balancePatch, { merge: true });
    transaction.update(requestRef, {
      balanceImpactApplied: true,
      outsideBalanceDaysApplied: outsideBalanceDays,
    });
    return { success: true, outsideBalanceDays };
  });

  if (!deductionResult.success) {
    return deductionResult;
  }

  return {
    success: true,
    outsideBalanceDays: deductionResult.outsideBalanceDays,
  };
}

// ─── Leave Request Service ──────────────────────────────────────────────────

export const leaveRequestService = {
  async create(data: Omit<FirestoreLeaveRequest, 'id' | 'createdAt'>): Promise<string> {
    if (!isConfigured) return '';
    const docRef = await addDoc(leaveRequestsRef(), {
      ...data,
      tenantId: getCurrentTenantId(),
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

  const configuredLeaveTypes = await getLeaveTypesFromConfig();
  const approvedDaysByType: Record<LeaveType, number> = {};
  const approvedCountByType: Record<LeaveType, number> = {};
  const lastUsedDateByType: Record<LeaveType, string | null> = {};

  approvedRequests.forEach((req) => {
    approvedDaysByType[req.leaveType] = (approvedDaysByType[req.leaveType] || 0) + Number(req.totalDays || 0);
    approvedCountByType[req.leaveType] = (approvedCountByType[req.leaveType] || 0) + 1;
    if (!lastUsedDateByType[req.leaveType]) {
      lastUsedDateByType[req.leaveType] = req.startDate;
    }
  });

  const perType = buildLeaveTypeUsageRows({
    configuredLeaveTypes,
    leaveBalance,
    approvedDaysByType,
    approvedCountByType,
    lastUsedDateByType,
  });

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
