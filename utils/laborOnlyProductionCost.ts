export interface LaborOnlyProductionCostInput {
  hourlyRate: number;
  workersCount: number;
  workHours: number;
  quantityProduced: number;
}

export interface LaborOnlyProductionCostResult {
  hourlyRateApplied: number;
  workersCount: number;
  workHours: number;
  quantityProduced: number;
  laborCost: number;
  totalCost: number;
  unitCost: number;
}

const nonNegativeFinite = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

/** The single source of truth for production costing in the client application. */
export function calculateLaborOnlyProductionCost(
  input: LaborOnlyProductionCostInput,
): LaborOnlyProductionCostResult {
  const hourlyRateApplied = nonNegativeFinite(input.hourlyRate);
  const workersCount = nonNegativeFinite(input.workersCount);
  const workHours = nonNegativeFinite(input.workHours);
  const quantityProduced = nonNegativeFinite(input.quantityProduced);
  const laborCost = Math.round((workersCount * workHours * hourlyRateApplied + Number.EPSILON) * 100) / 100;
  return {
    hourlyRateApplied,
    workersCount,
    workHours,
    quantityProduced,
    laborCost,
    totalCost: laborCost,
    unitCost: quantityProduced > 0 ? laborCost / quantityProduced : 0,
  };
}
