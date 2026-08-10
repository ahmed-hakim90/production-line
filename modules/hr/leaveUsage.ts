import type { LeaveTypeDefinition } from './leaveTypes';
import type { FirestoreLeaveBalance, LeaveType } from './types';
import { DEFAULT_LEAVE_BALANCE } from './types';

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

type LedgerLeaveType = 'annual' | 'sick' | 'emergency';

const LEDGER_LEAVE_TYPES = new Set<LedgerLeaveType>(['annual', 'sick', 'emergency']);

const DEFAULT_BALANCE_BY_TYPE: Record<LedgerLeaveType, number> = {
  annual: DEFAULT_LEAVE_BALANCE.annualBalance,
  sick: DEFAULT_LEAVE_BALANCE.sickBalance,
  emergency: DEFAULT_LEAVE_BALANCE.emergencyBalance,
};

function remainingBalanceForType(
  leaveType: string,
  leaveBalance: FirestoreLeaveBalance,
): number | null {
  if (leaveType === 'annual') return Math.max(0, leaveBalance.annualBalance || 0);
  if (leaveType === 'sick') return Math.max(0, leaveBalance.sickBalance || 0);
  if (leaveType === 'emergency') return Math.max(0, leaveBalance.emergencyBalance || 0);
  return null;
}

/**
 * Build leave usage rows from configured leave types only.
 * Self-service / profile tables must not invent types missing from HR settings.
 */
export function buildLeaveTypeUsageRows(params: {
  configuredLeaveTypes: LeaveTypeDefinition[];
  leaveBalance: FirestoreLeaveBalance;
  approvedDaysByType: Record<string, number>;
  approvedCountByType: Record<string, number>;
  lastUsedDateByType: Record<string, string | null>;
}): LeaveTypeUsageItem[] {
  const {
    configuredLeaveTypes,
    leaveBalance,
    approvedDaysByType,
    approvedCountByType,
    lastUsedDateByType,
  } = params;

  return configuredLeaveTypes.map((row) => {
    const leaveType = row.key;
    const approvedDays = approvedDaysByType[leaveType] || 0;
    const approvedCount = approvedCountByType[leaveType] || 0;
    const lastUsedDate = lastUsedDateByType[leaveType] || null;

    if (leaveType === 'unpaid') {
      return {
        leaveType,
        label: row.label,
        approvedDaysInRange: approvedDays,
        usedDays: Math.max(leaveBalance.unpaidTaken || 0, approvedDays),
        availableDays: 0,
        defaultDays: null,
        approvedRequestsCount: approvedCount,
        lastUsedDate,
      };
    }

    if (LEDGER_LEAVE_TYPES.has(leaveType as LedgerLeaveType)) {
      const ledgerKey = leaveType as LedgerLeaveType;
      const available = remainingBalanceForType(leaveType, leaveBalance) ?? 0;
      const defaultDays = Number.isFinite(row.defaultBalance)
        ? Number(row.defaultBalance)
        : DEFAULT_BALANCE_BY_TYPE[ledgerKey];
      const fromBalance = Math.max(0, defaultDays - available);
      return {
        leaveType,
        label: row.label,
        approvedDaysInRange: approvedDays,
        usedDays: Math.max(approvedDays, fromBalance),
        availableDays: available,
        defaultDays,
        approvedRequestsCount: approvedCount,
        lastUsedDate,
      };
    }

    const defaultDays = Number(row.defaultBalance ?? 0);
    return {
      leaveType,
      label: row.label,
      approvedDaysInRange: approvedDays,
      usedDays: approvedDays,
      availableDays: Math.max(0, defaultDays - approvedDays),
      defaultDays,
      approvedRequestsCount: approvedCount,
      lastUsedDate,
    };
  });
}
