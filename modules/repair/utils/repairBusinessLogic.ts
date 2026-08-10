import { getTodayDateString } from '../../../utils/calculations';
import type { RepairAccessContext } from './repairAccessContext';
import type { RepairJob } from '../types';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from './repairWorkflowNormalize';

export type RepairPaymentStatus = 'unpaid' | 'partial' | 'paid';

export type RepairJobCostSummary = {
  partsCost: number;
  laborCost: number;
  serviceOnlyCost: number;
  productsFinalCost: number;
  estimatedCost: number;
  finalCost: number;
  balanceDue: number;
  paymentStatus: RepairPaymentStatus;
};

export type RepairJobActionState = {
  canEdit: boolean;
  canChangeStatus: boolean;
  canRequestApproval: boolean;
  canUseParts: boolean;
  canDeliver: boolean;
  isClosed: boolean;
  blockedReason?: string;
};

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export function computeRepairJobCost(job: Pick<
  RepairJob,
  | 'partsUsed'
  | 'laborCost'
  | 'serviceOnlyCost'
  | 'jobProducts'
  | 'estimatedCost'
  | 'finalCost'
  | 'finalCostOverride'
  | 'paidAmount'
  | 'paymentStatus'
>): RepairJobCostSummary {
  const partsCost = (job.partsUsed || []).reduce(
    (sum, part) => sum + money(part.quantity) * money(part.unitCost),
    0,
  );
  const laborCost = money(job.laborCost);
  const serviceOnlyCost = money(job.serviceOnlyCost);
  const productsFinalCost = (job.jobProducts || []).reduce((sum, item) => sum + money(item.finalCost), 0);
  const estimatedCost = money(job.estimatedCost);
  const computedFinal = partsCost + laborCost + serviceOnlyCost + productsFinalCost;
  const hasCostComponents =
    partsCost > 0
    || laborCost > 0
    || serviceOnlyCost > 0
    || productsFinalCost > 0;
  const finalCost = money(job.finalCostOverride ?? (hasCostComponents ? computedFinal : job.finalCost));
  const hasPaidAmount = job.paidAmount !== undefined && job.paidAmount !== null;
  const paidAmount = hasPaidAmount ? Math.min(finalCost, money(job.paidAmount)) : undefined;
  const paymentStatus = normalizePaymentStatus(job.paymentStatus, finalCost, paidAmount);
  const balanceDue = paidAmount !== undefined
    ? Math.max(0, finalCost - paidAmount)
    : (paymentStatus === 'paid' ? 0 : finalCost);

  return {
    partsCost,
    laborCost,
    serviceOnlyCost,
    productsFinalCost,
    estimatedCost,
    finalCost,
    balanceDue,
    paymentStatus,
  };
}

export function normalizePaymentStatus(
  value: unknown,
  finalCost: number,
  paidAmount?: number,
): RepairPaymentStatus {
  const cost = money(finalCost);
  if (paidAmount !== undefined && paidAmount !== null) {
    const paid = money(paidAmount);
    if (cost <= 0 || paid >= cost - 0.00001) return 'paid';
    return paid > 0 ? 'partial' : 'unpaid';
  }
  // سجلات ما قبل إضافة paidAmount تظل قابلة للقراءة بدون تغيير تاريخها.
  if (value === 'paid' || value === 'partial' || value === 'unpaid') return value;
  return cost > 0 ? 'unpaid' : 'paid';
}

export function resolveRepairJobActionState(input: {
  job: RepairJob;
  access: RepairAccessContext;
  technicianIds: string[];
  canEditByPermission: boolean;
  canCreatePartsUsage?: boolean;
}): RepairJobActionState {
  const assigned = String(input.job.technicianId || '').trim();
  const isAssignedTechnician = assigned.length > 0 && input.technicianIds.includes(assigned);
  const isClosed = Boolean(input.job.isClosed)
    || isDeliveredStatus(input.job.status)
    || isCancelledStatus(input.job.status)
    || isUnrepairableStatus(input.job.status);
  const canEdit = !isClosed && (input.canEditByPermission || (input.access.isRepairTechnician && isAssignedTechnician));
  const blockedReason = isClosed
    ? 'الطلب مغلق؛ يمكن عرضه فقط.'
    : (!canEdit ? 'لا تملك صلاحية تعديل هذا الطلب أو أنه غير مسند لك.' : undefined);

  return {
    canEdit,
    canChangeStatus: canEdit,
    canRequestApproval: canEdit,
    canUseParts: canEdit && input.canCreatePartsUsage !== false,
    canDeliver: canEdit,
    isClosed,
    blockedReason,
  };
}

export function summarizeRepairJobs(jobs: RepairJob[], openStatusIds: string[]) {
  const openSet = new Set(openStatusIds.map((id) => mapLegacyRepairStatus(id)));
  const today = getTodayDateString();
  return jobs.reduce(
    (acc, job) => {
      const status = mapLegacyRepairStatus(job.status);
      acc.total += 1;
      if (openSet.has(status)) acc.open += 1;
      if (status === 'ready') acc.ready += 1;
      if (isDeliveredStatus(status)) acc.delivered += 1;
      if (job.createdAt?.slice(0, 10) === today) acc.createdToday += 1;
      if (job.dueAt && Date.parse(String(job.dueAt)) < Date.now() && openSet.has(status)) acc.overdue += 1;
      acc.revenue += computeRepairJobCost(job).finalCost;
      return acc;
    },
    { total: 0, open: 0, ready: 0, delivered: 0, createdToday: 0, overdue: 0, revenue: 0 },
  );
}
