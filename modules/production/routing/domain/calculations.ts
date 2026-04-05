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

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${sec}ث`;
  return `${sec}ث`;
}
