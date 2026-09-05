const nonNegativeFinite = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
/** Server-side twin of the mandatory labor-only production costing formula. */
export function calculateLaborOnlyProductionCost(input) {
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
