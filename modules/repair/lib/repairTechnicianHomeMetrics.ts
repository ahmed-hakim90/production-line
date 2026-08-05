import {
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from '../utils/repairWorkflowNormalize';

export type RepairTechnicianHomePeriod = 'daily' | 'weekly' | 'monthly';

export type RepairTechnicianHomeJob = {
  id?: string;
  receiptNo?: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceType?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  dueAt?: string;
};

export type RepairTechnicianHomeRange = {
  startMs: number;
  endMs: number;
};

export type RepairTechnicianHomeMetrics = {
  requestsCount: number;
  fixedCount: number;
  openCount: number;
  delayedCount: number;
  successRate: number;
  fixedJobs: RepairTechnicianHomeJob[];
  delayedJobs: RepairTechnicianHomeJob[];
};

const FIXED_STATUSES = new Set(['ready', 'delivered']);

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

/** Inclusive local calendar range for technician home period pills. */
export function resolveRepairTechnicianHomeRange(
  period: RepairTechnicianHomePeriod,
  now: Date = new Date(),
): RepairTechnicianHomeRange {
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  if (period === 'daily') {
    return { startMs: todayStart.getTime(), endMs: todayEnd.getTime() };
  }

  if (period === 'weekly') {
    const weekStart = new Date(todayStart);
    const day = weekStart.getDay(); // 0 Sun … 6 Sat — treat Sat as week start (common AR ops)
    const offset = (day + 1) % 7; // Saturday → 0
    weekStart.setDate(weekStart.getDate() - offset);
    return { startMs: weekStart.getTime(), endMs: todayEnd.getTime() };
  }

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  return { startMs: monthStart.getTime(), endMs: todayEnd.getTime() };
}

function isInRange(ms: number | null, range: RepairTechnicianHomeRange): boolean {
  if (ms == null) return false;
  return ms >= range.startMs && ms <= range.endMs;
}

export function isRepairJobOpenStatus(
  status: string,
  openStatusIds: readonly string[],
): boolean {
  const canonical = mapLegacyRepairStatus(status);
  if (openStatusIds.length > 0) return openStatusIds.includes(canonical);
  return !isDeliveredStatus(canonical)
    && !isUnrepairableStatus(canonical)
    && canonical !== 'cancelled';
}

export function isRepairJobDelayed(
  job: RepairTechnicianHomeJob,
  openStatusIds: readonly string[],
  nowMs: number = Date.now(),
): boolean {
  if (!isRepairJobOpenStatus(job.status, openStatusIds)) return false;
  const dueMs = parseTime(job.dueAt);
  if (dueMs == null) return false;
  return dueMs < nowMs;
}

/** Prefer delivery/resolution timestamps; fall back to updatedAt for ready jobs. */
export function resolveRepairJobFixedAtMs(job: RepairTechnicianHomeJob): number | null {
  const canonical = mapLegacyRepairStatus(job.status);
  if (!FIXED_STATUSES.has(canonical)) return null;
  return parseTime(job.deliveredAt)
    ?? parseTime(job.resolvedAt)
    ?? parseTime(job.closedAt)
    ?? parseTime(job.updatedAt)
    ?? parseTime(job.createdAt);
}

export function isRepairJobFixedInRange(
  job: RepairTechnicianHomeJob,
  range: RepairTechnicianHomeRange,
): boolean {
  return isInRange(resolveRepairJobFixedAtMs(job), range);
}

function deviceLabel(job: RepairTechnicianHomeJob): string {
  return `${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim()
    || String(job.deviceType || '').trim()
    || '—';
}

export function summarizeRepairTechnicianHome(
  jobs: readonly RepairTechnicianHomeJob[],
  input: {
    range: RepairTechnicianHomeRange;
    openStatusIds: readonly string[];
    nowMs?: number;
  },
): RepairTechnicianHomeMetrics {
  const nowMs = input.nowMs ?? Date.now();
  const { range, openStatusIds } = input;

  let requestsCount = 0;
  let deliveredInPeriod = 0;
  let unrepairableInPeriod = 0;
  let openCount = 0;

  const fixedJobs: RepairTechnicianHomeJob[] = [];
  const delayedJobs: RepairTechnicianHomeJob[] = [];

  for (const job of jobs) {
    if (isInRange(parseTime(job.createdAt), range)) {
      requestsCount += 1;
    }

    if (isRepairJobFixedInRange(job, range)) {
      fixedJobs.push(job);
    }

    const canonical = mapLegacyRepairStatus(job.status);
    const outcomeMs = parseTime(job.deliveredAt)
      ?? parseTime(job.resolvedAt)
      ?? parseTime(job.closedAt)
      ?? parseTime(job.updatedAt);

    if (isDeliveredStatus(canonical) && isInRange(outcomeMs, range)) {
      deliveredInPeriod += 1;
    }
    if (isUnrepairableStatus(canonical) && isInRange(outcomeMs, range)) {
      unrepairableInPeriod += 1;
    }

    if (isRepairJobOpenStatus(job.status, openStatusIds)) {
      openCount += 1;
    }

    if (isRepairJobDelayed(job, openStatusIds, nowMs)) {
      delayedJobs.push(job);
    }
  }

  fixedJobs.sort((a, b) => {
    const aMs = resolveRepairJobFixedAtMs(a) ?? 0;
    const bMs = resolveRepairJobFixedAtMs(b) ?? 0;
    return bMs - aMs;
  });

  delayedJobs.sort((a, b) => {
    const aMs = parseTime(a.dueAt) ?? 0;
    const bMs = parseTime(b.dueAt) ?? 0;
    return aMs - bMs;
  });

  const successDenom = deliveredInPeriod + unrepairableInPeriod;
  const successRate = successDenom > 0 ? (deliveredInPeriod / successDenom) * 100 : 0;

  return {
    requestsCount,
    fixedCount: fixedJobs.length,
    openCount,
    delayedCount: delayedJobs.length,
    successRate,
    fixedJobs,
    delayedJobs,
  };
}

export function formatRepairTechnicianDeviceLabel(job: RepairTechnicianHomeJob): string {
  return deviceLabel(job);
}
