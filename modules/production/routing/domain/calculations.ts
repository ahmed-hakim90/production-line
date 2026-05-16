/**
 * Single source of truth for routing math (plans + executions + cost).
 * All durations are seconds.
 */

export interface StepLike {
  durationSeconds: number;
  workersCount: number;
}

export interface ActualStepLike {
  actualDurationSeconds: number;
  actualWorkersCount: number;
}

export const ROUTING_CALCULATION_VERSION = 2;

export type RoutingValidationWarning =
  | 'missing_product'
  | 'missing_steps'
  | 'step_missing_name'
  | 'step_zero_duration'
  | 'step_zero_workers'
  | 'invalid_quantity'
  | 'invalid_target_seconds'
  | 'execution_incomplete';

export interface RoutingCalculationStep {
  name?: string;
  durationSeconds: number;
  workersCount: number;
  actualDurationSeconds?: number;
  actualWorkersCount?: number;
}

export interface RoutingCalculationInput {
  productId?: string;
  quantity?: number;
  workerHourRate?: number;
  routingTargetUnitSeconds?: number;
  validateActualSteps?: boolean;
  steps: RoutingCalculationStep[];
}

export interface RoutingStepVariance {
  name: string;
  standardDurationSeconds: number;
  actualDurationSeconds: number;
  standardWorkersCount: number;
  actualWorkersCount: number;
  timeVarianceRatio: number;
  workerVarianceRatio: number;
  laborCost: number;
  warnings: RoutingValidationWarning[];
}

export interface RoutingCalculationResult extends ExecutionKpiResult {
  calculationVersion: number;
  routingTargetUnitSeconds?: number;
  varianceBasisSecondsPerUnit: number;
  warnings: RoutingValidationWarning[];
  stepVariances: RoutingStepVariance[];
  isExecutionComplete: boolean;
}

const pushUnique = <T,>(rows: T[], value: T) => {
  if (!rows.includes(value)) rows.push(value);
};

export function normalizeRoutingTargetUnitSeconds(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

export function resolveRoutingVarianceBasisSeconds(params: {
  routingTargetUnitSeconds?: number;
  totalTimeSeconds?: number;
}): number {
  const target = normalizeRoutingTargetUnitSeconds(params.routingTargetUnitSeconds);
  if (target != null) return target;
  const total = Number(params.totalTimeSeconds || 0);
  return total > 0 ? Math.round(total) : 0;
}

/**
 * Wall-clock time for one routing step (seconds). Workers on the same step work in parallel:
 * the stage duration does not multiply by headcount (3 people doing one 10s stage ≈ 10s on the line).
 * `workersCount` is kept for API/storage compatibility and for labor-cost rules elsewhere.
 */
export function manTimeForStep(durationSeconds: number, _workersCount: number): number {
  void _workersCount;
  return Math.max(0, durationSeconds);
}

export function totalTimeSecondsFromSteps(steps: Pick<StepLike, "durationSeconds">[]): number {
  return steps.reduce((s, r) => s + Math.max(0, r.durationSeconds), 0);
}

export function totalManTimeSecondsFromSteps(steps: StepLike[]): number {
  return steps.reduce((s, r) => s + manTimeForStep(r.durationSeconds, r.workersCount), 0);
}

export function actualTotalTimeSeconds(steps: Pick<ActualStepLike, "actualDurationSeconds">[]): number {
  return steps.reduce((s, r) => s + Math.max(0, r.actualDurationSeconds ?? 0), 0);
}

export function actualManTimeSeconds(steps: ActualStepLike[]): number {
  return steps.reduce(
    (s, r) => s + manTimeForStep(r.actualDurationSeconds ?? 0, r.actualWorkersCount ?? 0),
    0,
  );
}

export function ratioEfficiency(standard: number, actual: number): number {
  if (actual <= 0 || standard <= 0) return 0;
  return standard / actual;
}

export function efficiencyPercent(standard: number, actual: number): number {
  const r = ratioEfficiency(standard, actual);
  return Math.round(r * 1000) / 10;
}

export function costPerSecondFromHourlyRate(workerHourRate: number): number {
  const rate = Math.max(0, workerHourRate);
  return rate / 3600;
}

export function stepLaborCost(
  actualDurationSeconds: number,
  actualWorkersCount: number,
  workerHourRate: number,
): number {
  const cps = costPerSecondFromHourlyRate(workerHourRate);
  return Math.max(0, actualDurationSeconds) * Math.max(0, actualWorkersCount) * cps;
}

export function totalLaborCostFromActualSteps(
  steps: ActualStepLike[],
  workerHourRate: number,
): number {
  return steps.reduce(
    (sum, row) =>
      sum +
      stepLaborCost(
        row.actualDurationSeconds ?? 0,
        row.actualWorkersCount ?? 0,
        workerHourRate,
      ),
    0,
  );
}

export function timeVarianceRatio(standardSeconds: number, actualSeconds: number): number {
  if (standardSeconds <= 0) return actualSeconds > 0 ? 1 : 0;
  return (actualSeconds - standardSeconds) / standardSeconds;
}

export function workerVarianceRatio(standardWorkers: number, actualWorkers: number): number {
  if (standardWorkers <= 0) return actualWorkers > 0 ? 1 : 0;
  return (actualWorkers - standardWorkers) / standardWorkers;
}

export interface ExecutionKpiInput {
  quantity: number;
  workerHourRate: number;
  standardSteps: StepLike[];
  actualSteps: ActualStepLike[];
}

export interface ExecutionKpiResult {
  standardTotalTimeSeconds: number;
  actualTotalTimeSeconds: number;
  standardManTimeSeconds: number;
  actualManTimeSeconds: number;
  timeEfficiency: number;
  laborEfficiency: number;
  timeEfficiencyPercent: number;
  laborEfficiencyPercent: number;
  totalCost: number;
  costPerUnit: number;
  workerHourRateUsed: number;
}

export function computeExecutionKpis(input: ExecutionKpiInput): ExecutionKpiResult {
  const standardTotalTimeSeconds = totalTimeSecondsFromSteps(input.standardSteps);
  const standardManTimeSeconds = totalManTimeSecondsFromSteps(input.standardSteps);
  const actTotalSeconds = actualTotalTimeSeconds(input.actualSteps);
  const actManSeconds = actualManTimeSeconds(input.actualSteps);
  const timeEfficiency = ratioEfficiency(standardTotalTimeSeconds, actTotalSeconds);
  const laborEfficiency = ratioEfficiency(standardManTimeSeconds, actManSeconds);
  const totalCost = totalLaborCostFromActualSteps(input.actualSteps, input.workerHourRate);
  const qty = Math.max(1, input.quantity);
  const costPerUnit = totalCost / qty;

  return {
    standardTotalTimeSeconds,
    actualTotalTimeSeconds: actTotalSeconds,
    standardManTimeSeconds,
    actualManTimeSeconds: actManSeconds,
    timeEfficiency,
    laborEfficiency,
    timeEfficiencyPercent: efficiencyPercent(standardTotalTimeSeconds, actTotalSeconds),
    laborEfficiencyPercent: efficiencyPercent(standardManTimeSeconds, actManSeconds),
    totalCost,
    costPerUnit,
    workerHourRateUsed: input.workerHourRate,
  };
}

export function computeRoutingCalculation(input: RoutingCalculationInput): RoutingCalculationResult {
  const warnings: RoutingValidationWarning[] = [];
  const productId = String(input.productId || '').trim();
  const validateActualSteps = input.validateActualSteps !== false;
  if (!productId) pushUnique(warnings, 'missing_product');

  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length === 0) pushUnique(warnings, 'missing_steps');

  const normalizedSteps = steps.map((step, index) => {
    const stepWarnings: RoutingValidationWarning[] = [];
    const name = String(step.name || '').trim() || `خطوة ${index + 1}`;
    const durationSeconds = Math.max(0, Number(step.durationSeconds) || 0);
    const workersCount = Math.max(0, Number(step.workersCount) || 0);
    const actualDurationSeconds = Math.max(0, Number(step.actualDurationSeconds) || 0);
    const actualWorkersCount = Math.max(0, Number(step.actualWorkersCount) || 0);

    if (!String(step.name || '').trim()) {
      pushUnique(warnings, 'step_missing_name');
      pushUnique(stepWarnings, 'step_missing_name');
    }
    if (durationSeconds <= 0) {
      pushUnique(warnings, 'step_zero_duration');
      pushUnique(stepWarnings, 'step_zero_duration');
    }
    if (workersCount <= 0) {
      pushUnique(warnings, 'step_zero_workers');
      pushUnique(stepWarnings, 'step_zero_workers');
    }
    if (validateActualSteps && (actualDurationSeconds <= 0 || actualWorkersCount <= 0)) {
      pushUnique(warnings, 'execution_incomplete');
      pushUnique(stepWarnings, 'execution_incomplete');
    }

    return {
      name,
      durationSeconds,
      workersCount,
      actualDurationSeconds,
      actualWorkersCount,
      warnings: stepWarnings,
    };
  });

  const quantity = Number(input.quantity || 0);
  if (!(quantity > 0)) pushUnique(warnings, 'invalid_quantity');
  const target = normalizeRoutingTargetUnitSeconds(input.routingTargetUnitSeconds);
  if (input.routingTargetUnitSeconds != null && target == null) {
    pushUnique(warnings, 'invalid_target_seconds');
  }

  const standardSteps = normalizedSteps.map((step) => ({
    durationSeconds: step.durationSeconds,
    workersCount: step.workersCount,
  }));
  const actualSteps = normalizedSteps.map((step) => ({
    actualDurationSeconds: step.actualDurationSeconds,
    actualWorkersCount: step.actualWorkersCount,
  }));
  const kpis = computeExecutionKpis({
    quantity,
    workerHourRate: Math.max(0, Number(input.workerHourRate) || 0),
    standardSteps,
    actualSteps,
  });
  const varianceBasisSecondsPerUnit = resolveRoutingVarianceBasisSeconds({
    routingTargetUnitSeconds: target,
    totalTimeSeconds: kpis.standardTotalTimeSeconds,
  });
  const stepVariances = normalizedSteps.map((step) => ({
    name: step.name,
    standardDurationSeconds: step.durationSeconds,
    actualDurationSeconds: step.actualDurationSeconds,
    standardWorkersCount: step.workersCount,
    actualWorkersCount: step.actualWorkersCount,
    timeVarianceRatio: timeVarianceRatio(step.durationSeconds, step.actualDurationSeconds),
    workerVarianceRatio: workerVarianceRatio(step.workersCount, step.actualWorkersCount),
    laborCost: stepLaborCost(step.actualDurationSeconds, step.actualWorkersCount, Math.max(0, Number(input.workerHourRate) || 0)),
    warnings: step.warnings,
  }));

  return {
    ...kpis,
    calculationVersion: ROUTING_CALCULATION_VERSION,
    ...(target != null ? { routingTargetUnitSeconds: target } : {}),
    varianceBasisSecondsPerUnit,
    warnings,
    stepVariances,
    isExecutionComplete: !warnings.includes('execution_incomplete') && normalizedSteps.length > 0,
  };
}

export function routingWarningLabel(warning: RoutingValidationWarning): string {
  switch (warning) {
    case 'missing_product':
      return 'لم يتم اختيار منتج.';
    case 'missing_steps':
      return 'لا توجد خطوات صالحة.';
    case 'step_missing_name':
      return 'توجد خطوة بلا اسم.';
    case 'step_zero_duration':
      return 'توجد خطوة بزمن قياسي صفر.';
    case 'step_zero_workers':
      return 'توجد خطوة بعدد عمال صفر.';
    case 'invalid_quantity':
      return 'الكمية غير صالحة.';
    case 'invalid_target_seconds':
      return 'تارجت المسار غير صالح.';
    case 'execution_incomplete':
      return 'توجد خطوات تنفيذ غير مكتملة.';
    default:
      return warning;
  }
}

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${sec}ث`;
  return `${sec}ث`;
}
