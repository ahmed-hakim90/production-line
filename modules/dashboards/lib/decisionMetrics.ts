/**
 * Decision-oriented dashboard equations (pure, testable).
 * Prefer these over ad-hoc ratios so Admin/Factory stay aligned.
 */

import { calculateTimeRatio, getTodayDateString } from '../../../utils/calculations';
import { isBlockingOpenIssueStatus } from '../../inventory/lib/productionIssueRequest';
import type { ProductionIssueOrder } from '../../inventory/types';
import type { InventoryTransferRequest } from '../../inventory/types';
import type { ProductionPlan } from '../../../types';

export type PlanActualInput = {
  plannedQuantity: number;
  actualQuantity: number;
  startDate: string;
  plannedEndDate: string;
  status?: ProductionPlan['status'];
};

/** Volume-weighted plan fulfilment: Σ min(actual, planned) / Σ planned × 100 */
export function volumeWeightedPlanAchievement(
  plans: Array<Pick<PlanActualInput, 'plannedQuantity' | 'actualQuantity'>>,
): number {
  let plannedSum = 0;
  let credited = 0;
  for (const plan of plans) {
    const planned = Math.max(0, Number(plan.plannedQuantity || 0));
    const actual = Math.max(0, Number(plan.actualQuantity || 0));
    if (planned <= 0) continue;
    plannedSum += planned;
    credited += Math.min(actual, planned);
  }
  if (plannedSum <= 0) return 0;
  return Number(((credited / plannedSum) * 100).toFixed(1));
}

/**
 * Schedule adherence for one plan:
 * actual cumulative / expected cumulative as of today × 100
 * Expected = planned × min(1, elapsed/totalDays)
 */
export function scheduleAdherencePercent(plan: PlanActualInput, asOfDate = getTodayDateString()): number {
  const planned = Math.max(0, Number(plan.plannedQuantity || 0));
  const actual = Math.max(0, Number(plan.actualQuantity || 0));
  if (planned <= 0) return 0;

  const start = plan.startDate || '';
  const end = plan.plannedEndDate || '';
  if (!start || !end) {
    return Number(((Math.min(actual, planned) / planned) * 100).toFixed(1));
  }

  // calculateTimeRatio uses today; if asOfDate differs we approximate via ratio of day spans.
  let timeRatio = calculateTimeRatio(start, end);
  if (asOfDate !== getTodayDateString()) {
    const totalMs = new Date(end).getTime() - new Date(start).getTime();
    const elapsedMs = new Date(asOfDate).getTime() - new Date(start).getTime();
    timeRatio = totalMs > 0 ? Number(((Math.max(elapsedMs, 0) / totalMs) * 100).toFixed(1)) : 100;
  }

  const expectedQty = planned * Math.min(1, Math.max(0, timeRatio) / 100);
  if (expectedQty <= 0) return actual > 0 ? 100 : 0;
  return Number(((actual / expectedQty) * 100).toFixed(1));
}

/** Average schedule adherence across active plans (equal plan weight on adherence %). */
export function averageScheduleAdherence(plans: PlanActualInput[]): number {
  const active = plans.filter((p) => {
    const status = p.status;
    return !status || status === 'in_progress' || status === 'planned' || status === 'completed';
  });
  if (active.length === 0) return 0;
  const sum = active.reduce((s, p) => s + scheduleAdherencePercent(p), 0);
  return Number((sum / active.length).toFixed(1));
}

/**
 * Plan is behind when time has advanced meaningfully and actual trails expected by gapPct+.
 * Replaces the old broken formula that collapsed to a fixed 30/50% threshold.
 */
export function isPlanBehindSchedule(
  plan: PlanActualInput,
  options?: { minElapsedDays?: number; gapPercent?: number },
): boolean {
  const status = plan.status;
  if (status === 'completed' || status === 'cancelled' || status === 'paused') return false;

  const planned = Math.max(0, Number(plan.plannedQuantity || 0));
  if (planned <= 0 || !plan.startDate || !plan.plannedEndDate) return false;

  const timeRatio = calculateTimeRatio(plan.startDate, plan.plannedEndDate);
  const minElapsedDays = options?.minElapsedDays ?? 1;
  const gapPercent = options?.gapPercent ?? 20;

  // Approximate elapsed days from time ratio × total span
  const totalDays = Math.max(
    1,
    Math.round(
      (new Date(plan.plannedEndDate).getTime() - new Date(plan.startDate).getTime()) / 86_400_000,
    ),
  );
  const elapsedDays = (timeRatio / 100) * totalDays;
  if (elapsedDays < minElapsedDays) return false;

  const adherence = scheduleAdherencePercent(plan);
  return adherence < 100 - gapPercent;
}

/** Good-output yield (not OEE): good / (good + scrap) × 100 */
export function yieldEfficiencyPercent(goodUnits: number, scrapUnits: number): number {
  const good = Math.max(0, Number(goodUnits || 0));
  const scrap = Math.max(0, Number(scrapUnits || 0));
  const total = good + scrap;
  if (total <= 0) return 0;
  return Number(((good / total) * 100).toFixed(1));
}

export type IssueDecisionSummary = {
  openCount: number;
  submittedCount: number;
  draftCount: number;
  requestedCount: number;
  issuedCount: number;
  openRequestedQty: number;
  issuedQty: number;
  fulfilmentPercent: number;
  agingOver24h: number;
  agingOver72h: number;
};

function ageHours(iso: string | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

export function summarizeProductionIssuesForDecision(
  orders: ProductionIssueOrder[],
  nowMs = Date.now(),
): IssueDecisionSummary {
  let openCount = 0;
  let submittedCount = 0;
  let draftCount = 0;
  let requestedCount = 0;
  let issuedCount = 0;
  let openRequestedQty = 0;
  let issuedQty = 0;
  let agingOver24h = 0;
  let agingOver72h = 0;

  for (const row of orders) {
    if (row.sourceType === 'production_report') continue;
    const qty = Number(row.quantity || 0);
    const requested = Number(row.requestedQuantity ?? row.quantity ?? 0);
    const openQty = requested > 0 ? requested : qty;

    if (row.status === 'issued') {
      issuedCount += 1;
      issuedQty += qty;
      continue;
    }

    if (!isBlockingOpenIssueStatus(row.status)) continue;

    openCount += 1;
    openRequestedQty += openQty;
    if (row.status === 'submitted') submittedCount += 1;
    else if (row.status === 'draft') draftCount += 1;
    else if (row.status === 'requested') requestedCount += 1;

    const hours = ageHours(row.submittedAt || row.requestedAt || row.createdAt, nowMs);
    if (hours >= 72) agingOver72h += 1;
    else if (hours >= 24) agingOver24h += 1;
  }

  const denom = issuedQty + openRequestedQty;
  const fulfilmentPercent =
    denom > 0 ? Number(((issuedQty / denom) * 100).toFixed(1)) : issuedCount > 0 ? 100 : 0;

  return {
    openCount,
    submittedCount,
    draftCount,
    requestedCount,
    issuedCount,
    openRequestedQty,
    issuedQty,
    fulfilmentPercent,
    agingOver24h,
    agingOver72h,
  };
}

export type TransferDecisionSummary = {
  pendingTotal: number;
  pendingProductionEntry: number;
  pendingPackaging: number;
  pendingOther: number;
  agingOver24h: number;
};

export function summarizePendingTransfersForDecision(
  transfers: InventoryTransferRequest[],
  nowMs = Date.now(),
): TransferDecisionSummary {
  let pendingProductionEntry = 0;
  let pendingPackaging = 0;
  let pendingOther = 0;
  let agingOver24h = 0;

  for (const row of transfers) {
    if (row.status !== 'pending') continue;
    const type = row.requestType || 'transfer';
    if (type === 'production_entry') pendingProductionEntry += 1;
    else if (type === 'packaging_transfer') pendingPackaging += 1;
    else pendingOther += 1;

    const hours = ageHours(row.createdAt, nowMs);
    if (hours >= 24) agingOver24h += 1;
  }

  return {
    pendingTotal: pendingProductionEntry + pendingPackaging + pendingOther,
    pendingProductionEntry,
    pendingPackaging,
    pendingOther,
    agingOver24h,
  };
}

export type PackagingDecisionSummary = {
  awaitingUnits: number;
  skuCount: number;
  pendingTransfers: number;
  configured: boolean;
};

export function summarizePackagingQueue(params: {
  awaitingUnits: number;
  skuCount: number;
  pendingPackagingTransfers: number;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
}): PackagingDecisionSummary {
  const source = String(params.sourceWarehouseId || '').trim();
  const target = String(params.targetWarehouseId || '').trim();
  return {
    awaitingUnits: Math.max(0, Number(params.awaitingUnits || 0)),
    skuCount: Math.max(0, Number(params.skuCount || 0)),
    pendingTransfers: Math.max(0, Number(params.pendingPackagingTransfers || 0)),
    configured: Boolean(source && target && source !== target),
  };
}

export type InventoryRiskSummary = {
  lowStockCount: number;
  negativeCount: number;
  suppliesAlertCount: number;
  wipQty: number;
  finishedQty: number;
  wasteQty: number;
  /** Finished staging cover vs expected daily demand. Null when demand unknown. */
  finishedDaysOfCover: number | null;
  skusBelowMinCover: number;
};

/** available / dailyDemand — null when demand is missing. */
export function daysOfCover(availableQty: number, dailyDemand: number): number | null {
  const avail = Math.max(0, Number(availableQty || 0));
  const demand = Number(dailyDemand || 0);
  if (!(demand > 0)) return null;
  return Number((avail / demand).toFixed(1));
}

export function summarizeInventoryRisk(params: {
  lowStockCount: number;
  negativeCount: number;
  suppliesAlertCount: number;
  wipQty: number;
  finishedQty: number;
  wasteQty: number;
  dailyFinishedDemand: number;
  /** Optional per-SKU (qty, minStock, dailyDemand) for cover breaches. */
  coverRows?: Array<{ quantity: number; minStock?: number; dailyDemand?: number; minCoverDays?: number }>;
}): InventoryRiskSummary {
  const finishedDaysOfCover = daysOfCover(params.finishedQty, params.dailyFinishedDemand);
  const minCoverDays = 3;
  let skusBelowMinCover = 0;
  for (const row of params.coverRows || []) {
    const demand = Number(row.dailyDemand || 0);
    if (!(demand > 0)) continue;
    const cover = daysOfCover(row.quantity, demand);
    const threshold = Number(row.minCoverDays || minCoverDays);
    if (cover !== null && cover < threshold) skusBelowMinCover += 1;
  }

  return {
    lowStockCount: Math.max(0, Number(params.lowStockCount || 0)),
    negativeCount: Math.max(0, Number(params.negativeCount || 0)),
    suppliesAlertCount: Math.max(0, Number(params.suppliesAlertCount || 0)),
    wipQty: Math.max(0, Number(params.wipQty || 0)),
    finishedQty: Math.max(0, Number(params.finishedQty || 0)),
    wasteQty: Math.max(0, Number(params.wasteQty || 0)),
    finishedDaysOfCover,
    skusBelowMinCover,
  };
}

export type ReceiptDecisionSummary = {
  awaitingCount: number;
  submittedCount: number;
  approvedCount: number;
  agingOver24h: number;
  agingOver72h: number;
  /** Average hours from submit → execute for recent executed rows. */
  avgCycleHours: number | null;
};

export function summarizeReceiptsForDecision(
  receipts: Array<{
    status: string;
    createdAt?: string;
    submittedAt?: string;
    approvedAt?: string;
    executedAt?: string;
  }>,
  nowMs = Date.now(),
): ReceiptDecisionSummary {
  let awaitingCount = 0;
  let submittedCount = 0;
  let approvedCount = 0;
  let agingOver24h = 0;
  let agingOver72h = 0;
  const cycleHours: number[] = [];

  for (const row of receipts) {
    if (row.status === 'submitted' || row.status === 'approved') {
      awaitingCount += 1;
      if (row.status === 'submitted') submittedCount += 1;
      else approvedCount += 1;
      const hours = ageHours(row.submittedAt || row.createdAt, nowMs);
      if (hours >= 72) agingOver72h += 1;
      else if (hours >= 24) agingOver24h += 1;
    }
    if (row.status === 'executed' && row.submittedAt && row.executedAt) {
      const start = new Date(row.submittedAt).getTime();
      const end = new Date(row.executedAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        cycleHours.push((end - start) / 3_600_000);
      }
    }
  }

  const avgCycleHours =
    cycleHours.length > 0
      ? Number((cycleHours.reduce((s, h) => s + h, 0) / cycleHours.length).toFixed(1))
      : null;

  return {
    awaitingCount,
    submittedCount,
    approvedCount,
    agingOver24h,
    agingOver72h,
    avgCycleHours,
  };
}

export function sumBalanceQty(
  balances: Array<{ quantity?: number; itemType?: string }>,
  options?: { finishedOnly?: boolean },
): number {
  return balances.reduce((sum, row) => {
    if (options?.finishedOnly && row.itemType !== 'finished_good') return sum;
    return sum + Number(row.quantity || 0);
  }, 0);
}

export function countNegativeAndLow(
  balances: Array<{ quantity?: number; minStock?: number }>,
): { negativeCount: number; lowCount: number } {
  let negativeCount = 0;
  let lowCount = 0;
  for (const row of balances) {
    const qty = Number(row.quantity || 0);
    const min = Number(row.minStock || 0);
    if (qty < 0) negativeCount += 1;
    else if (min > 0 && qty <= min) lowCount += 1;
  }
  return { negativeCount, lowCount };
}

export type StockCountAccuracy = {
  countedLines: number;
  matchedLines: number;
  accuracyPercent: number;
  absoluteVarianceQty: number;
};

/** matched lines / counted lines × 100 (exact qty match). */
export function stockCountAccuracyFromLines(
  lines: Array<{ expectedQty?: number; countedQty?: number }>,
): StockCountAccuracy {
  let countedLines = 0;
  let matchedLines = 0;
  let absoluteVarianceQty = 0;
  for (const line of lines) {
    const expected = Number(line.expectedQty || 0);
    const counted = Number(line.countedQty || 0);
    // Skip untouched blank rows
    if (!Number.isFinite(expected) && !Number.isFinite(counted)) continue;
    countedLines += 1;
    const diff = counted - expected;
    absoluteVarianceQty += Math.abs(diff);
    if (diff === 0) matchedLines += 1;
  }
  const accuracyPercent =
    countedLines > 0 ? Number(((matchedLines / countedLines) * 100).toFixed(1)) : 0;
  return {
    countedLines,
    matchedLines,
    accuracyPercent,
    absoluteVarianceQty: Number(absoluteVarianceQty.toFixed(2)),
  };
}

export type StockCountDecisionSummary = {
  openSessions: number;
  awaitingApproval: number;
  approvedRecent: number;
  accuracyPercent: number | null;
  absoluteVarianceQty: number;
  countedLines: number;
};

export function summarizeStockCountSessions(
  sessions: Array<{
    status: string;
    createdAt?: string;
    approvedAt?: string;
    lines?: Array<{ expectedQty?: number; countedQty?: number }>;
  }>,
  options?: { recentDays?: number; nowMs?: number },
): StockCountDecisionSummary {
  const nowMs = options?.nowMs ?? Date.now();
  const recentDays = Math.max(1, Number(options?.recentDays || 30));
  const recentCutoff = nowMs - recentDays * 86_400_000;

  let openSessions = 0;
  let awaitingApproval = 0;
  let approvedRecent = 0;
  const accuracyLines: Array<{ expectedQty?: number; countedQty?: number }> = [];

  for (const session of sessions) {
    if (session.status === 'open') openSessions += 1;
    else if (session.status === 'counted') awaitingApproval += 1;
    else if (session.status === 'approved') {
      const ts = new Date(session.approvedAt || session.createdAt || '').getTime();
      if (Number.isFinite(ts) && ts >= recentCutoff) approvedRecent += 1;
    }

    if (
      (session.status === 'counted' || session.status === 'approved') &&
      Array.isArray(session.lines) &&
      session.lines.length > 0
    ) {
      accuracyLines.push(...session.lines);
    }
  }

  const accuracy = stockCountAccuracyFromLines(accuracyLines);
  return {
    openSessions,
    awaitingApproval,
    approvedRecent,
    accuracyPercent: accuracy.countedLines > 0 ? accuracy.accuracyPercent : null,
    absoluteVarianceQty: accuracy.absoluteVarianceQty,
    countedLines: accuracy.countedLines,
  };
}

/**
 * Labor utilization proxy (NOT true OEE):
 * actual logged labor hours / scheduled labor hours × 100
 */
export function laborUtilizationPercent(
  actualLaborHours: number,
  scheduledLaborHours: number,
): number {
  const actual = Math.max(0, Number(actualLaborHours || 0));
  const scheduled = Number(scheduledLaborHours || 0);
  if (!(scheduled > 0)) return 0;
  return Number(((actual / scheduled) * 100).toFixed(1));
}

/**
 * Performance proxy vs ideal cycle (still not OEE — no availability):
 * actual units / (runHours × idealUnitsPerHour) × 100
 */
export function performanceProxyPercent(params: {
  actualUnits: number;
  runHours: number;
  idealUnitsPerHour: number;
}): number {
  const actual = Math.max(0, Number(params.actualUnits || 0));
  const hours = Math.max(0, Number(params.runHours || 0));
  const idealRate = Math.max(0, Number(params.idealUnitsPerHour || 0));
  const idealOutput = hours * idealRate;
  if (!(idealOutput > 0)) return 0;
  return Number(((actual / idealOutput) * 100).toFixed(1));
}

/** Actual output vs ideal expected output (from product daily rate × worked hours). */
export function outputVsIdealPercent(actualUnits: number, idealUnits: number): number {
  const actual = Math.max(0, Number(actualUnits || 0));
  const ideal = Number(idealUnits || 0);
  if (!(ideal > 0)) return 0;
  return Number(((actual / ideal) * 100).toFixed(1));
}

export type MaterialReadinessSummary = {
  activePlanCount: number;
  plansWithShortage: number;
  openShortageRows: number;
  totalShortageQty: number;
  /** Plans without open/in_progress shortages / active plans × 100 */
  readinessPercent: number;
  /** Remaining qty on plans that have open shortages */
  blockedRemainingQty: number;
};

/**
 * Material readiness from production-plan component follow-ups (already tracked shortages).
 * readiness = plans without open shortages / active plans.
 */
export function summarizeMaterialReadiness(params: {
  plans: Array<{
    id?: string;
    plannedQuantity?: number;
    producedQuantity?: number;
    status?: string;
  }>;
  followUps: Array<{
    planId?: string;
    status?: string;
    shortageQty?: number;
  }>;
}): MaterialReadinessSummary {
  const activePlans = params.plans.filter(
    (p) => p.status === 'in_progress' || p.status === 'planned',
  );
  const openFollowUps = params.followUps.filter(
    (f) => f.status === 'open' || f.status === 'in_progress',
  );

  const shortageByPlan = new Map<string, number>();
  let openShortageRows = 0;
  let totalShortageQty = 0;
  for (const row of openFollowUps) {
    const planId = String(row.planId || '').trim();
    const qty = Math.max(0, Number(row.shortageQty || 0));
    openShortageRows += 1;
    totalShortageQty += qty;
    if (!planId) continue;
    shortageByPlan.set(planId, (shortageByPlan.get(planId) || 0) + qty);
  }

  let blockedRemainingQty = 0;
  let plansWithShortage = 0;
  for (const plan of activePlans) {
    const planId = String(plan.id || '').trim();
    if (!planId || !shortageByPlan.has(planId)) continue;
    plansWithShortage += 1;
    const remaining = Math.max(
      0,
      Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0),
    );
    blockedRemainingQty += remaining;
  }

  const activePlanCount = activePlans.length;
  const readyPlans = Math.max(0, activePlanCount - plansWithShortage);
  const readinessPercent =
    activePlanCount > 0 ? Number(((readyPlans / activePlanCount) * 100).toFixed(1)) : 100;

  return {
    activePlanCount,
    plansWithShortage,
    openShortageRows,
    totalShortageQty: Number(totalShortageQty.toFixed(2)),
    readinessPercent,
    blockedRemainingQty: Number(blockedRemainingQty.toFixed(2)),
  };
}

/**
 * Assemblable coverage for remaining plan qty:
 * Σ min(assemblable, remaining) / Σ remaining × 100
 */
export function assemblableCoveragePercent(
  rows: Array<{ remainingQty: number; maxAssemblable: number }>,
): number {
  let remainingSum = 0;
  let covered = 0;
  for (const row of rows) {
    const remaining = Math.max(0, Number(row.remainingQty || 0));
    const assemblable = Math.max(0, Number(row.maxAssemblable || 0));
    if (!(remaining > 0)) continue;
    remainingSum += remaining;
    covered += Math.min(assemblable, remaining);
  }
  if (!(remainingSum > 0)) return 100;
  return Number(((covered / remainingSum) * 100).toFixed(1));
}

/** Remaining × expected unit cost */
export function costToComplete(remainingQty: number, expectedUnitCost: number): number {
  const rem = Math.max(0, Number(remainingQty || 0));
  const unit = Math.max(0, Number(expectedUnitCost || 0));
  return Number((rem * unit).toFixed(2));
}

/**
 * Calendar-day gap between forecast finish and committed target.
 * Positive = late risk; negative = ahead.
 */
export function forecastGapDays(forecastFinishDate: string, committedDate: string): number | null {
  if (!forecastFinishDate || forecastFinishDate === '—' || !committedDate) return null;
  const a = new Date(forecastFinishDate).getTime();
  const b = new Date(committedDate).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export type QualityRateInput = {
  inspected: number;
  failed: number;
  rework: number;
  fpyTotal?: number;
  fpyCount?: number;
};

export type QualityRates = {
  failRate: number;
  reworkRate: number;
  /** Prefer fail-only so rework is not double-counted into scrap defect %. */
  defectRate: number;
  avgFpy: number;
};

export function qualityRatesFromTotals(input: QualityRateInput): QualityRates {
  const inspected = Math.max(0, Number(input.inspected || 0));
  const failed = Math.max(0, Number(input.failed || 0));
  const rework = Math.max(0, Number(input.rework || 0));
  const failRate = inspected > 0 ? Number(((failed / inspected) * 100).toFixed(2)) : 0;
  const reworkRate = inspected > 0 ? Number(((rework / inspected) * 100).toFixed(2)) : 0;
  const fpyCount = Math.max(0, Number(input.fpyCount || 0));
  const avgFpy =
    fpyCount > 0 ? Number((Number(input.fpyTotal || 0) / fpyCount).toFixed(2)) : 0;
  return {
    failRate,
    reworkRate,
    defectRate: failRate,
    avgFpy,
  };
}

export type HealthScoreInput = {
  yieldEfficiency: number;
  costVarianceAbs: number;
  wastePercent: number;
  planVolumeAchievement: number;
  scheduleAdherence: number;
  openIssueCount?: number;
  packagingAwaitingUnits?: number;
  pendingApprovals?: number;
  qualityFailRate?: number;
};

export type HealthScoreBreakdown = {
  yield: number;
  cost: number;
  waste: number;
  plan: number;
  schedule: number;
  operations: number;
  quality: number;
  total: number;
};

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Weighted production health — includes operational backlog penalties. */
export function computeProductionHealthBreakdown(input: HealthScoreInput): HealthScoreBreakdown {
  const yieldScore = Math.min(100, Math.max(0, Number(input.yieldEfficiency || 0)));
  const varianceAbs = Math.abs(Number(input.costVarianceAbs || 0));
  const costScore = varianceAbs <= 5 ? 100 : varianceAbs <= 15 ? 70 : varianceAbs <= 30 ? 40 : 10;
  const waste = Math.max(0, Number(input.wastePercent || 0));
  const wasteScore = waste <= 2 ? 100 : waste <= 5 ? 75 : waste <= 10 ? 40 : 10;
  const planScore = Math.min(100, Math.max(0, Number(input.planVolumeAchievement || 0)));
  const scheduleScore = Math.min(100, Math.max(0, Number(input.scheduleAdherence || 0)));

  const openIssues = Math.max(0, Number(input.openIssueCount || 0));
  const packagingUnits = Math.max(0, Number(input.packagingAwaitingUnits || 0));
  const pendingApprovals = Math.max(0, Number(input.pendingApprovals || 0));
  let operationsScore = 100;
  if (openIssues > 0) operationsScore -= Math.min(40, openIssues * 8);
  if (packagingUnits > 0) operationsScore -= Math.min(25, packagingUnits > 500 ? 25 : 10);
  if (pendingApprovals > 0) operationsScore -= Math.min(20, pendingApprovals * 4);
  operationsScore = Math.max(0, operationsScore);

  const failRate = Math.max(0, Number(input.qualityFailRate || 0));
  const qualityScore =
    failRate <= 0 ? 100 : failRate <= 2 ? 85 : failRate <= 5 ? 65 : failRate <= 10 ? 40 : 15;

  const weights = {
    yield: 0.2,
    cost: 0.12,
    waste: 0.15,
    plan: 0.18,
    schedule: 0.15,
    operations: 0.12,
    quality: 0.08,
  };

  const total = clampScore(
    yieldScore * weights.yield +
      costScore * weights.cost +
      wasteScore * weights.waste +
      planScore * weights.plan +
      scheduleScore * weights.schedule +
      operationsScore * weights.operations +
      qualityScore * weights.quality,
  );

  return {
    yield: clampScore(yieldScore),
    cost: costScore,
    waste: wasteScore,
    plan: clampScore(planScore),
    schedule: clampScore(scheduleScore),
    operations: operationsScore,
    quality: qualityScore,
    total,
  };
}
