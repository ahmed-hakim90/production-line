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
  unrepairableCount: number;
  completedOutcomesCount: number;
  openCount: number;
  delayedCount: number;
  successRate: number;
  fixedJobs: RepairTechnicianHomeJob[];
  unrepairableJobs: RepairTechnicianHomeJob[];
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
  if (openStatusIds.length > 0) {
    return openStatusIds.some((id) => mapLegacyRepairStatus(id) === canonical);
  }
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
  const unrepairableJobs: RepairTechnicianHomeJob[] = [];
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
      unrepairableJobs.push(job);
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

  unrepairableJobs.sort((a, b) => {
    const aMs = parseTime(a.resolvedAt) ?? parseTime(a.closedAt) ?? parseTime(a.updatedAt) ?? 0;
    const bMs = parseTime(b.resolvedAt) ?? parseTime(b.closedAt) ?? parseTime(b.updatedAt) ?? 0;
    return bMs - aMs;
  });

  const successDenom = deliveredInPeriod + unrepairableInPeriod;
  const successRate = successDenom > 0 ? (deliveredInPeriod / successDenom) * 100 : 0;

  return {
    requestsCount,
    fixedCount: fixedJobs.length,
    unrepairableCount: unrepairableJobs.length,
    completedOutcomesCount: successDenom,
    openCount,
    delayedCount: delayedJobs.length,
    successRate,
    fixedJobs,
    unrepairableJobs,
    delayedJobs,
  };
}

export function formatRepairTechnicianDeviceLabel(job: RepairTechnicianHomeJob): string {
  return deviceLabel(job);
}

export type RepairTechnicianDailyOutcome = {
  day: string;
  created: number;
  fixed: number;
  unrepairable: number;
};

/** Per-day created / fixed / unrepairable counts inside an inclusive local range. */
export function buildRepairTechnicianDailyOutcomes(
  jobs: readonly RepairTechnicianHomeJob[],
  range: RepairTechnicianHomeRange,
): RepairTechnicianDailyOutcome[] {
  const days: RepairTechnicianDailyOutcome[] = [];
  const dayMap = new Map<string, RepairTechnicianDailyOutcome>();

  const cursor = startOfLocalDay(new Date(range.startMs));
  const end = endOfLocalDay(new Date(range.endMs));
  while (cursor.getTime() <= end.getTime()) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: '2-digit' }).format(cursor);
    const row: RepairTechnicianDailyOutcome = { day: label, created: 0, fixed: 0, unrepairable: 0 };
    days.push(row);
    dayMap.set(key, row);
    cursor.setDate(cursor.getDate() + 1);
  }

  const localDayKey = (ms: number): string | null => {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  for (const job of jobs) {
    const createdMs = parseTime(job.createdAt);
    if (createdMs != null && isInRange(createdMs, range)) {
      const row = dayMap.get(localDayKey(createdMs) || '');
      if (row) row.created += 1;
    }

    const fixedMs = resolveRepairJobFixedAtMs(job);
    if (fixedMs != null && isInRange(fixedMs, range)) {
      const row = dayMap.get(localDayKey(fixedMs) || '');
      if (row) row.fixed += 1;
    }

    const canonical = mapLegacyRepairStatus(job.status);
    if (isUnrepairableStatus(canonical)) {
      const outcomeMs = parseTime(job.resolvedAt)
        ?? parseTime(job.closedAt)
        ?? parseTime(job.updatedAt)
        ?? parseTime(job.createdAt);
      if (outcomeMs != null && isInRange(outcomeMs, range)) {
        const row = dayMap.get(localDayKey(outcomeMs) || '');
        if (row) row.unrepairable += 1;
      }
    }
  }

  return days;
}

export type RepairOpenAgingBar = {
  name: string;
  value: number;
};

const OPEN_AGING_BUCKETS: { name: string; minDays: number; maxDays: number | null }[] = [
  { name: '0–1 يوم', minDays: 0, maxDays: 1 },
  { name: '1–3 أيام', minDays: 1, maxDays: 3 },
  { name: '3–7 أيام', minDays: 3, maxDays: 7 },
  { name: '7–14 يوم', minDays: 7, maxDays: 14 },
  { name: '+14 يوم', minDays: 14, maxDays: null },
];

/** Open-job age distribution (by createdAt) for ops aging chart. */
export function buildRepairOpenAgingBars(
  jobs: readonly RepairTechnicianHomeJob[],
  openStatusIds: readonly string[],
  nowMs: number = Date.now(),
): RepairOpenAgingBar[] {
  const counts = OPEN_AGING_BUCKETS.map((b) => ({ name: b.name, value: 0 }));

  for (const job of jobs) {
    if (!isRepairJobOpenStatus(job.status, openStatusIds)) continue;
    const createdMs = parseTime(job.createdAt);
    if (createdMs == null) continue;
    const ageDays = Math.max(0, (nowMs - createdMs) / (24 * 60 * 60 * 1000));
    for (let i = 0; i < OPEN_AGING_BUCKETS.length; i += 1) {
      const bucket = OPEN_AGING_BUCKETS[i];
      const underMax = bucket.maxDays == null || ageDays < bucket.maxDays;
      const atMin = ageDays >= bucket.minDays;
      if (atMin && underMax) {
        counts[i].value += 1;
        break;
      }
    }
  }

  return counts;
}
