/**
 * Manager technician-performance analysis (أداء الفنيين).
 * Pure helpers — date period, row aggregation, ranking, and drill-down summaries.
 */
import {
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from '../utils/repairWorkflowNormalize';
import {
  isRepairJobDelayed,
  isRepairJobOpenStatus,
} from './repairTechnicianHomeMetrics';

export type RepairTechKpiPeriod = 'today' | 'week' | 'month' | 'custom';

export type RepairTechKpiSortKey =
  | 'successRate'
  | 'revenue'
  | 'total'
  | 'avgRepairDays'
  | 'delayed'
  | 'open'
  | 'delivered';

export type RepairTechKpiJob = {
  id?: string;
  receiptNo?: string;
  technicianId?: string;
  branchId?: string;
  status: string;
  deviceType?: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  createdAt?: string;
  assignedAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  dueAt?: string;
  /** Precomputed job revenue (final cost) — never trust client for mutations; display only. */
  revenue: number;
};

export type RepairTechKpiRange = {
  startMs: number;
  endMs: number;
};

export type RepairTechnicianPerfRow = {
  technicianId: string;
  total: number;
  delivered: number;
  unrepairable: number;
  ready: number;
  open: number;
  delayed: number;
  cancelled: number;
  revenue: number;
  /** Mean calendar days assignment→delivery for delivered jobs; null when none. */
  avgRepairDays: number | null;
  /** delivered / (delivered + unrepairable); null when no terminal outcomes. */
  successRate: number | null;
  /** delivered / total assigned in scope. */
  deliveryRate: number;
  deviceBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
};

export type RepairTechTeamTotals = {
  totalJobs: number;
  delivered: number;
  unrepairable: number;
  open: number;
  delayed: number;
  ready: number;
  revenue: number;
  successRate: number;
  avgRepairDays: number | null;
  technicianCount: number;
};

export type RepairTechCountBar = {
  key: string;
  label: string;
  count: number;
  share: number;
};

export const UNASSIGNED_TECHNICIAN_ID = 'غير مسند';

export const REPAIR_TECH_KPI_PERIODS: { value: RepairTechKpiPeriod; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'هذا الأسبوع' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'custom', label: 'مخصص' },
];

function parseTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive local calendar range for manager KPI period pills. */
export function resolveRepairTechKpiRange(
  period: RepairTechKpiPeriod,
  custom: { from?: string; to?: string } = {},
  now: Date = new Date(),
): RepairTechKpiRange {
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  if (period === 'today') {
    return { startMs: todayStart.getTime(), endMs: todayEnd.getTime() };
  }

  if (period === 'week') {
    const weekStart = new Date(todayStart);
    const day = weekStart.getDay();
    const offset = (day + 1) % 7; // Saturday → 0 (common AR ops week)
    weekStart.setDate(weekStart.getDate() - offset);
    return { startMs: weekStart.getTime(), endMs: todayEnd.getTime() };
  }

  if (period === 'month') {
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return { startMs: monthStart.getTime(), endMs: todayEnd.getTime() };
  }

  const fromMs = custom.from
    ? startOfLocalDay(new Date(`${custom.from}T00:00:00`)).getTime()
    : Number.NEGATIVE_INFINITY;
  const toMs = custom.to
    ? endOfLocalDay(new Date(`${custom.to}T00:00:00`)).getTime()
    : Number.POSITIVE_INFINITY;
  return { startMs: fromMs, endMs: toMs };
}

/** Default date inputs when switching to a preset (for display / CSV labels). */
export function resolveRepairTechKpiDateInputs(
  period: RepairTechKpiPeriod,
  now: Date = new Date(),
): { from: string; to: string } {
  const range = resolveRepairTechKpiRange(period, {}, now);
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) {
    return { from: '', to: '' };
  }
  return {
    from: toIsoDateLocal(new Date(range.startMs)),
    to: toIsoDateLocal(new Date(range.endMs)),
  };
}

/**
 * Activity date for period filtering:
 * prefer delivery/resolution, else createdAt (open / in-progress jobs still count in range).
 */
export function resolveRepairTechKpiActivityMs(job: RepairTechKpiJob): number | null {
  return parseTime(job.deliveredAt)
    ?? parseTime(job.resolvedAt)
    ?? parseTime(job.closedAt)
    ?? parseTime(job.createdAt);
}

export function isJobInRepairTechKpiRange(
  job: RepairTechKpiJob,
  range: RepairTechKpiRange,
): boolean {
  const ms = resolveRepairTechKpiActivityMs(job);
  if (ms == null) return false;
  return ms >= range.startMs && ms <= range.endMs;
}

function repairDays(job: RepairTechKpiJob): number | null {
  const start = parseTime(job.assignedAt) ?? parseTime(job.createdAt);
  const end = parseTime(job.deliveredAt)
    ?? parseTime(job.resolvedAt)
    ?? parseTime(job.updatedAt);
  if (start == null || end == null || end < start) return null;
  return (end - start) / (1000 * 60 * 60 * 24);
}

export function technicianKeyOf(job: RepairTechKpiJob): string {
  const id = String(job.technicianId || '').trim();
  return id || UNASSIGNED_TECHNICIAN_ID;
}

export function filterRepairTechKpiJobs(
  jobs: readonly RepairTechKpiJob[],
  input: {
    range: RepairTechKpiRange;
    branchId?: string | 'all';
    technicianQuery?: string;
    technicianNameById?: ReadonlyMap<string, string>;
    hiddenTechnicianIds?: readonly string[];
  },
): RepairTechKpiJob[] {
  const branchId = input.branchId && input.branchId !== 'all' ? input.branchId : '';
  const query = String(input.technicianQuery || '').trim().toLowerCase();
  const hidden = new Set((input.hiddenTechnicianIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const nameById = input.technicianNameById;

  return jobs.filter((job) => {
    if (!isJobInRepairTechKpiRange(job, input.range)) return false;
    if (branchId && String(job.branchId || '') !== branchId) return false;

    const techId = String(job.technicianId || '').trim();
    if (techId && hidden.has(techId)) return false;

    if (query) {
      const name = String(nameById?.get(techId) || '').trim().toLowerCase();
      const idMatch = techId.toLowerCase().includes(query);
      const nameMatch = name.includes(query);
      const unassignedMatch = !techId && UNASSIGNED_TECHNICIAN_ID.includes(query);
      if (!idMatch && !nameMatch && !unassignedMatch) return false;
    }
    return true;
  });
}

export function buildRepairTechnicianPerfRows(
  jobs: readonly RepairTechKpiJob[],
  input: {
    openStatusIds: readonly string[];
    nowMs?: number;
  },
): RepairTechnicianPerfRow[] {
  const nowMs = input.nowMs ?? Date.now();
  const openStatusIds = input.openStatusIds;
  const byTech = new Map<string, {
    total: number;
    delivered: number;
    unrepairable: number;
    ready: number;
    open: number;
    delayed: number;
    cancelled: number;
    revenue: number;
    repairDaySum: number;
    repairDayCount: number;
    deviceBreakdown: Record<string, number>;
    statusBreakdown: Record<string, number>;
  }>();

  for (const job of jobs) {
    const key = technicianKeyOf(job);
    let row = byTech.get(key);
    if (!row) {
      row = {
        total: 0,
        delivered: 0,
        unrepairable: 0,
        ready: 0,
        open: 0,
        delayed: 0,
        cancelled: 0,
        revenue: 0,
        repairDaySum: 0,
        repairDayCount: 0,
        deviceBreakdown: {},
        statusBreakdown: {},
      };
      byTech.set(key, row);
    }

    const canonical = mapLegacyRepairStatus(job.status);
    row.total += 1;
    row.statusBreakdown[canonical] = (row.statusBreakdown[canonical] || 0) + 1;

    const device = String(job.deviceType || '').trim() || 'غير محدد';
    row.deviceBreakdown[device] = (row.deviceBreakdown[device] || 0) + 1;

    if (isDeliveredStatus(canonical)) {
      row.delivered += 1;
      row.revenue += Number.isFinite(job.revenue) ? Math.max(0, job.revenue) : 0;
      const days = repairDays(job);
      if (days != null) {
        row.repairDaySum += days;
        row.repairDayCount += 1;
      }
    } else if (isUnrepairableStatus(canonical)) {
      row.unrepairable += 1;
    } else if (canonical === 'cancelled') {
      row.cancelled += 1;
    }

    if (canonical === 'ready') row.ready += 1;

    if (isRepairJobOpenStatus(job.status, openStatusIds)) {
      row.open += 1;
    }
    if (isRepairJobDelayed(job, openStatusIds, nowMs)) {
      row.delayed += 1;
    }
  }

  return Array.from(byTech.entries()).map(([technicianId, row]) => {
    const terminal = row.delivered + row.unrepairable;
    return {
      technicianId,
      total: row.total,
      delivered: row.delivered,
      unrepairable: row.unrepairable,
      ready: row.ready,
      open: row.open,
      delayed: row.delayed,
      cancelled: row.cancelled,
      revenue: row.revenue,
      avgRepairDays: row.repairDayCount > 0 ? row.repairDaySum / row.repairDayCount : null,
      successRate: terminal > 0 ? (row.delivered / terminal) * 100 : null,
      deliveryRate: row.total > 0 ? (row.delivered / row.total) * 100 : 0,
      deviceBreakdown: row.deviceBreakdown,
      statusBreakdown: row.statusBreakdown,
    };
  });
}

export function sortRepairTechnicianPerfRows(
  rows: readonly RepairTechnicianPerfRow[],
  sortKey: RepairTechKpiSortKey,
  direction: 'asc' | 'desc' = 'desc',
): RepairTechnicianPerfRow[] {
  const dir = direction === 'asc' ? 1 : -1;
  const valueOf = (row: RepairTechnicianPerfRow): number => {
    switch (sortKey) {
      case 'successRate':
        return row.successRate ?? -1;
      case 'revenue':
        return row.revenue;
      case 'total':
        return row.total;
      case 'avgRepairDays':
        return row.avgRepairDays == null ? Number.POSITIVE_INFINITY : row.avgRepairDays;
      case 'delayed':
        return row.delayed;
      case 'open':
        return row.open;
      case 'delivered':
        return row.delivered;
      default:
        return row.revenue;
    }
  };

  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av !== bv) return av < bv ? -dir : dir;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return b.total - a.total;
  });
}

export function summarizeRepairTechTeam(
  rows: readonly RepairTechnicianPerfRow[],
  jobs: readonly RepairTechKpiJob[],
  input: {
    openStatusIds: readonly string[];
    nowMs?: number;
  },
): RepairTechTeamTotals {
  const nowMs = input.nowMs ?? Date.now();
  let delivered = 0;
  let unrepairable = 0;
  let open = 0;
  let delayed = 0;
  let ready = 0;
  let revenue = 0;
  let repairDaySum = 0;
  let repairDayCount = 0;

  for (const job of jobs) {
    const canonical = mapLegacyRepairStatus(job.status);
    if (isDeliveredStatus(canonical)) {
      delivered += 1;
      revenue += Number.isFinite(job.revenue) ? Math.max(0, job.revenue) : 0;
      const days = repairDays(job);
      if (days != null) {
        repairDaySum += days;
        repairDayCount += 1;
      }
    } else if (isUnrepairableStatus(canonical)) {
      unrepairable += 1;
    }
    if (canonical === 'ready') ready += 1;
    if (isRepairJobOpenStatus(job.status, input.openStatusIds)) open += 1;
    if (isRepairJobDelayed(job, input.openStatusIds, nowMs)) delayed += 1;
  }

  const terminal = delivered + unrepairable;
  const assignedTechnicians = rows.filter((r) => r.technicianId !== UNASSIGNED_TECHNICIAN_ID).length;

  return {
    totalJobs: jobs.length,
    delivered,
    unrepairable,
    open,
    delayed,
    ready,
    revenue,
    successRate: terminal > 0 ? (delivered / terminal) * 100 : 0,
    avgRepairDays: repairDayCount > 0 ? repairDaySum / repairDayCount : null,
    technicianCount: assignedTechnicians,
  };
}

export function buildCountBars(
  breakdown: Record<string, number>,
  labelOf?: (key: string) => string,
): RepairTechCountBar[] {
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
  return Object.entries(breakdown)
    .map(([key, count]) => ({
      key,
      label: labelOf ? labelOf(key) : key,
      count,
      share: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export function jobsForTechnician(
  jobs: readonly RepairTechKpiJob[],
  technicianId: string,
): RepairTechKpiJob[] {
  return jobs.filter((job) => technicianKeyOf(job) === technicianId);
}

export function formatRepairTechDeviceLabel(job: RepairTechKpiJob): string {
  const named = `${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim();
  if (named) return named;
  return String(job.deviceType || '').trim() || '—';
}

export type RepairTechDelayedJob = RepairTechKpiJob & {
  overdueDays: number;
};

/** Open jobs past dueAt, earliest due first. */
export function listDelayedJobsForScope(
  jobs: readonly RepairTechKpiJob[],
  openStatusIds: readonly string[],
  nowMs: number = Date.now(),
): RepairTechDelayedJob[] {
  const out: RepairTechDelayedJob[] = [];
  for (const job of jobs) {
    if (!isRepairJobDelayed(job, openStatusIds, nowMs)) continue;
    const dueMs = parseTime(job.dueAt);
    if (dueMs == null) continue;
    out.push({
      ...job,
      overdueDays: Math.max(0, (nowMs - dueMs) / (1000 * 60 * 60 * 24)),
    });
  }
  out.sort((a, b) => (parseTime(a.dueAt) ?? 0) - (parseTime(b.dueAt) ?? 0));
  return out;
}

export type RepairTechTeamDelta = {
  successRateDelta: number | null;
  avgRepairDaysDelta: number | null;
  revenueShare: number;
  delayedShare: number;
  deliveryRateDelta: number | null;
};

/** Technician vs team averages for the same filtered period. */
export function compareTechnicianToTeam(
  row: RepairTechnicianPerfRow,
  team: RepairTechTeamTotals,
): RepairTechTeamDelta {
  const successRateDelta =
    row.successRate == null ? null : row.successRate - team.successRate;
  const avgRepairDaysDelta =
    row.avgRepairDays == null || team.avgRepairDays == null
      ? null
      : row.avgRepairDays - team.avgRepairDays;
  const revenueShare = team.revenue > 0 ? (row.revenue / team.revenue) * 100 : 0;
  const delayedShare = team.delayed > 0 ? (row.delayed / team.delayed) * 100 : 0;
  const teamDeliveryRate = team.totalJobs > 0 ? (team.delivered / team.totalJobs) * 100 : 0;
  return {
    successRateDelta,
    avgRepairDaysDelta,
    revenueShare,
    delayedShare,
    deliveryRateDelta: row.deliveryRate - teamDeliveryRate,
  };
}

export type RepairTechAttentionReason = 'delayed' | 'low_success' | 'slow';

export type RepairTechAttentionItem = {
  technicianId: string;
  reasons: RepairTechAttentionReason[];
  delayed: number;
  successRate: number | null;
  avgRepairDays: number | null;
  score: number;
};

/**
 * Technicians that need manager follow-up in the current filter scope.
 * Score prioritizes delayed load, then weak success, then slow repair.
 */
export function buildRepairTechAttentionQueue(
  rows: readonly RepairTechnicianPerfRow[],
  team: RepairTechTeamTotals,
  limit = 5,
): RepairTechAttentionItem[] {
  const items: RepairTechAttentionItem[] = [];

  for (const row of rows) {
    if (row.technicianId === UNASSIGNED_TECHNICIAN_ID) continue;
    const reasons: RepairTechAttentionReason[] = [];
    let score = 0;

    if (row.delayed > 0) {
      reasons.push('delayed');
      score += row.delayed * 10;
    }
    if (row.successRate != null && row.successRate < 50 && (row.delivered + row.unrepairable) >= 2) {
      reasons.push('low_success');
      score += (50 - row.successRate);
    }
    if (
      row.avgRepairDays != null
      && team.avgRepairDays != null
      && row.avgRepairDays > team.avgRepairDays * 1.4
      && row.delivered >= 2
    ) {
      reasons.push('slow');
      score += (row.avgRepairDays - team.avgRepairDays) * 3;
    }

    if (reasons.length === 0) continue;
    items.push({
      technicianId: row.technicianId,
      reasons,
      delayed: row.delayed,
      successRate: row.successRate,
      avgRepairDays: row.avgRepairDays,
      score,
    });
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type RepairTechCompareSnapshot = {
  left: RepairTechnicianPerfRow;
  right: RepairTechnicianPerfRow;
  successRateDelta: number | null;
  avgRepairDaysDelta: number | null;
  revenueDelta: number;
  delayedDelta: number;
  deliveredDelta: number;
};

export function compareTwoTechnicians(
  left: RepairTechnicianPerfRow,
  right: RepairTechnicianPerfRow,
): RepairTechCompareSnapshot {
  const successRateDelta =
    left.successRate == null || right.successRate == null
      ? null
      : left.successRate - right.successRate;
  const avgRepairDaysDelta =
    left.avgRepairDays == null || right.avgRepairDays == null
      ? null
      : left.avgRepairDays - right.avgRepairDays;
  return {
    left,
    right,
    successRateDelta,
    avgRepairDaysDelta,
    revenueDelta: left.revenue - right.revenue,
    delayedDelta: left.delayed - right.delayed,
    deliveredDelta: left.delivered - right.delivered,
  };
}

export type RepairTechWorkloadBar = {
  technicianId: string;
  jobsShare: number;
  revenueShare: number;
  total: number;
  revenue: number;
};

/** Workload / revenue concentration across assigned technicians (excludes unassigned). */
export function buildRepairTechWorkloadBars(
  rows: readonly RepairTechnicianPerfRow[],
): RepairTechWorkloadBar[] {
  const assigned = rows.filter((r) => r.technicianId !== UNASSIGNED_TECHNICIAN_ID);
  const jobsTotal = assigned.reduce((s, r) => s + r.total, 0);
  const revenueTotal = assigned.reduce((s, r) => s + r.revenue, 0);
  return assigned
    .map((row) => ({
      technicianId: row.technicianId,
      total: row.total,
      revenue: row.revenue,
      jobsShare: jobsTotal > 0 ? (row.total / jobsTotal) * 100 : 0,
      revenueShare: revenueTotal > 0 ? (row.revenue / revenueTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || b.revenue - a.revenue);
}

export function isRepairTechKpiPeriod(value: string | null | undefined): value is RepairTechKpiPeriod {
  return value === 'today' || value === 'week' || value === 'month' || value === 'custom';
}

export function isRepairTechKpiSortKey(value: string | null | undefined): value is RepairTechKpiSortKey {
  return (
    value === 'successRate'
    || value === 'revenue'
    || value === 'total'
    || value === 'avgRepairDays'
    || value === 'delayed'
    || value === 'open'
    || value === 'delivered'
  );
}

/** Human-readable period range for headers / CSV filenames. */
export function formatRepairTechKpiPeriodLabel(
  period: RepairTechKpiPeriod,
  from: string,
  to: string,
): string {
  if (period === 'today') return 'اليوم';
  if (period === 'week') return 'هذا الأسبوع';
  if (period === 'month') return 'هذا الشهر';
  if (from && to) return `${from} → ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return 'فترة مخصصة';
}
