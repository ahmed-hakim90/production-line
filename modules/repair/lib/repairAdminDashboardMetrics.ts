/**
 * Pure KPI / queue helpers for the repair admin dashboard.
 * Keep branch scorecard + operations queues testable without Firestore.
 */

import type {
  RepairComplaint,
  RepairJob,
  RepairPartUsage,
  RepairSpareIssue,
  RepairTreasuryMonthClose,
  RepairTreasurySession,
} from '../types';
import {
  isPendingSupplyUsage,
  isReadyToIssueUsage,
} from './repairPartFulfillment';
import { isRepairTreasuryMonthClosedStatus } from './repairTreasuryMonthlyClose';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

export const REPAIR_ADMIN_OVERDUE_DAYS = 7;

const OPEN_SPR_STATUSES = new Set([
  'submitted',
  'approved',
  'prepared',
  'responsible_approved',
]);

export type RepairJobQueueFlags = {
  waitingApproval: boolean;
  waitingParts: boolean;
  readyToIssueParts: boolean;
  readyForDelivery: boolean;
  overdue: boolean;
  open: boolean;
};

export function getWorkDaysElapsed(
  createdAt: string | undefined,
  nowMs: number = Date.now(),
): number {
  const createdMs = Date.parse(String(createdAt || ''));
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
}

export function isOpenRepairJob(job: Pick<RepairJob, 'status'>, openStatusIds: string[]): boolean {
  const canonical = mapLegacyRepairStatus(job.status);
  if (!canonical) return false;
  return openStatusIds.some((id) => mapLegacyRepairStatus(id) === canonical);
}

export function jobHasPendingSupplyParts(
  partsUsed: Array<Pick<RepairPartUsage, 'fulfillmentStatus'>> | undefined,
): boolean {
  return (partsUsed || []).some((usage) => isPendingSupplyUsage(usage));
}

export function jobHasReadyToIssueParts(
  partsUsed: Array<Pick<RepairPartUsage, 'fulfillmentStatus'>> | undefined,
): boolean {
  return (partsUsed || []).some((usage) => isReadyToIssueUsage(usage));
}

export function isWaitingCustomerApproval(job: Pick<RepairJob, 'status' | 'approvalStatus'>): boolean {
  const status = String(job.status || '');
  if (status === 'waiting_approval') return true;
  // Stale approvalStatus=pending after work advanced must not inflate the approval queue.
  if (String(job.approvalStatus || '') !== 'pending') return false;
  return status === 'estimated' || status === 'diagnosed' || status === 'diagnosing' || status === 'received';
}

export function isWaitingPartsJob(
  job: Pick<RepairJob, 'status' | 'partsUsed'>,
): boolean {
  if (String(job.status || '') === 'waiting_parts') return true;
  return jobHasPendingSupplyParts(job.partsUsed);
}

export function isOverdueRepairJob(
  job: Pick<RepairJob, 'status' | 'createdAt'>,
  openStatusIds: string[],
  nowMs: number = Date.now(),
  overdueDays: number = REPAIR_ADMIN_OVERDUE_DAYS,
): boolean {
  if (!isOpenRepairJob(job, openStatusIds)) return false;
  return getWorkDaysElapsed(job.createdAt, nowMs) > overdueDays;
}

export function resolveRepairJobQueueFlags(
  job: Pick<RepairJob, 'status' | 'approvalStatus' | 'partsUsed' | 'createdAt'>,
  openStatusIds: string[],
  nowMs: number = Date.now(),
): RepairJobQueueFlags {
  return {
    waitingApproval: isWaitingCustomerApproval(job),
    waitingParts: isWaitingPartsJob(job),
    readyToIssueParts: jobHasReadyToIssueParts(job.partsUsed),
    readyForDelivery: String(job.status || '') === 'ready',
    overdue: isOverdueRepairJob(job, openStatusIds, nowMs),
    open: isOpenRepairJob(job, openStatusIds),
  };
}

export type RepairAdminJobQueueCounts = {
  waitingApproval: number;
  waitingParts: number;
  readyToIssueParts: number;
  readyForDelivery: number;
  overdue: number;
  open: number;
};

export function countRepairJobQueues(
  jobs: Array<Pick<RepairJob, 'status' | 'approvalStatus' | 'partsUsed' | 'createdAt'>>,
  openStatusIds: string[],
  nowMs: number = Date.now(),
): RepairAdminJobQueueCounts {
  const counts: RepairAdminJobQueueCounts = {
    waitingApproval: 0,
    waitingParts: 0,
    readyToIssueParts: 0,
    readyForDelivery: 0,
    overdue: 0,
    open: 0,
  };
  for (const job of jobs) {
    const flags = resolveRepairJobQueueFlags(job, openStatusIds, nowMs);
    if (flags.waitingApproval) counts.waitingApproval += 1;
    if (flags.waitingParts) counts.waitingParts += 1;
    if (flags.readyToIssueParts) counts.readyToIssueParts += 1;
    if (flags.readyForDelivery) counts.readyForDelivery += 1;
    if (flags.overdue) counts.overdue += 1;
    if (flags.open) counts.open += 1;
  }
  return counts;
}

export type SparePartsReplenishmentLike = {
  status?: string;
  sourceBranchId?: string;
  toWarehouseId?: string;
  openBasket?: boolean;
};

export function isOpenSparePartsReplenishment(
  doc: Pick<SparePartsReplenishmentLike, 'status'>,
): boolean {
  return OPEN_SPR_STATUSES.has(String(doc.status || '').trim());
}

export function countOpenSparePartsReplenishments(
  rows: SparePartsReplenishmentLike[],
  allowedBranchIds: string[],
  warehouseIdByBranchId: Record<string, string>,
): { open: number; openBasket: number } {
  const allowed = new Set(allowedBranchIds.map((id) => String(id || '').trim()).filter(Boolean));
  const allowedWarehouses = new Set(
    Array.from(allowed)
      .map((branchId) => String(warehouseIdByBranchId[branchId] || '').trim())
      .filter(Boolean),
  );
  let open = 0;
  let openBasket = 0;
  for (const row of rows) {
    if (!isOpenSparePartsReplenishment(row)) continue;
    const sourceBranchId = String(row.sourceBranchId || '').trim();
    const toWarehouseId = String(row.toWarehouseId || '').trim();
    const inScope = (sourceBranchId && allowed.has(sourceBranchId))
      || (toWarehouseId && allowedWarehouses.has(toWarehouseId));
    if (!inScope) continue;
    open += 1;
    if (row.openBasket !== false && String(row.status || '') === 'submitted') {
      openBasket += 1;
    }
  }
  return { open, openBasket };
}

export function countSubmittedSpareIssues(
  rows: Array<Pick<RepairSpareIssue, 'status' | 'branchId'>>,
  allowedBranchIds: string[],
): number {
  const allowed = new Set(allowedBranchIds.map((id) => String(id || '').trim()).filter(Boolean));
  return rows.filter(
    (row) => String(row.status || '') === 'submitted'
      && allowed.has(String(row.branchId || '').trim()),
  ).length;
}

export function countOpenComplaints(
  rows: Array<Pick<RepairComplaint, 'status' | 'branchId'>>,
  allowedBranchIds: string[],
): number {
  const allowed = new Set(allowedBranchIds.map((id) => String(id || '').trim()).filter(Boolean));
  return rows.filter((row) => {
    if (!allowed.has(String(row.branchId || '').trim())) return false;
    const status = String(row.status || '');
    return status === 'open' || status === 'in_progress';
  }).length;
}

export function countOpenTreasurySessions(
  sessions: Array<Pick<RepairTreasurySession, 'status' | 'branchId'>>,
  allowedBranchIds: string[],
): number {
  const allowed = new Set(allowedBranchIds.map((id) => String(id || '').trim()).filter(Boolean));
  return sessions.filter(
    (session) => String(session.status || '') === 'open'
      && allowed.has(String(session.branchId || '').trim()),
  ).length;
}

export type MonthCloseSummary = {
  closedBranches: number;
  openBranches: number;
  totalBranches: number;
};

export function summarizeMonthCloses(
  allowedBranchIds: string[],
  monthCloses: Array<Pick<RepairTreasuryMonthClose, 'branchId' | 'status'>>,
): MonthCloseSummary {
  const allowed = allowedBranchIds.map((id) => String(id || '').trim()).filter(Boolean);
  const closedByBranch = new Map<string, boolean>();
  for (const row of monthCloses) {
    const branchId = String(row.branchId || '').trim();
    if (!branchId) continue;
    closedByBranch.set(branchId, isRepairTreasuryMonthClosedStatus(row.status));
  }
  let closedBranches = 0;
  for (const branchId of allowed) {
    if (closedByBranch.get(branchId)) closedBranches += 1;
  }
  return {
    closedBranches,
    openBranches: Math.max(0, allowed.length - closedBranches),
    totalBranches: allowed.length,
  };
}
