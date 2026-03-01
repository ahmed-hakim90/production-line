import type {
  ProductionReport,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  LaborSettings,
  FirestoreEmployee,
} from '../types';

export interface LineCostData {
  laborCost: number;
  indirectCost: number;
  totalCost: number;
  costPerUnit: number;
}

export interface LineAllocatedCenterCost {
  costCenterId: string;
  costCenterName: string;
  monthlyAllocated: number;
  dailyAllocated: number;
  percentage: number;
}

export interface LineAllocatedCostSummary {
  month: string;
  daysInMonth: number;
  totalMonthlyAllocated: number;
  totalDailyAllocated: number;
  centers: LineAllocatedCenterCost[];
}

/**
 * Daily labor cost for a line =
 * sum(report.workersCount × report.workHours) × hourlyRate
 */
export const calculateDailyLaborCost = (
  lineReports: ProductionReport[],
  hourlyRate: number
): number => {
  const totalLaborHours = lineReports.reduce(
    (sum, r) => sum + (r.workersCount || 0) * (r.workHours || 0),
    0
  );
  return totalLaborHours * hourlyRate;
};

/**
 * Daily indirect cost allocated to a line for a given month.
 * Sums across all indirect cost centers.
 */
export const calculateDailyIndirectCost = (
  lineId: string,
  month: string,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): number => {
  const daysInMonth = getDaysInMonth(month);
  if (daysInMonth <= 0) return 0;

  let totalMonthly = 0;

  const indirectCenters = costCenters.filter(
    (c) => c.type === 'indirect' && c.isActive
  );

  for (const center of indirectCenters) {
    const value = costCenterValues.find(
      (v) => v.costCenterId === center.id && v.month === month
    );
    if (!value || value.amount <= 0) continue;

    const allocation = costAllocations.find(
      (a) => a.costCenterId === center.id && a.month === month
    );
    if (!allocation) continue;

    const lineAlloc = allocation.allocations.find((a) => a.lineId === lineId);
    if (!lineAlloc || lineAlloc.percentage <= 0) continue;

    totalMonthly += value.amount * (lineAlloc.percentage / 100);
  }

  return totalMonthly / daysInMonth;
};

/**
 * Monthly and daily indirect costs allocated to a line
 * with per-cost-center breakdown.
 */
export const buildLineAllocatedCostSummary = (
  lineId: string,
  month: string,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): LineAllocatedCostSummary => {
  const daysInMonth = getDaysInMonth(month);
  if (!lineId || daysInMonth <= 0) {
    return {
      month,
      daysInMonth: Math.max(daysInMonth, 0),
      totalMonthlyAllocated: 0,
      totalDailyAllocated: 0,
      centers: [],
    };
  }

  const centers: LineAllocatedCenterCost[] = [];

  for (const center of costCenters) {
    if (center.type !== 'indirect' || !center.isActive || !center.id) continue;

    const value = costCenterValues.find(
      (v) => v.costCenterId === center.id && v.month === month
    );
    if (!value || value.amount <= 0) continue;

    const allocation = costAllocations.find(
      (a) => a.costCenterId === center.id && a.month === month
    );
    if (!allocation) continue;

    const lineAlloc = allocation.allocations.find((a) => a.lineId === lineId);
    if (!lineAlloc || lineAlloc.percentage <= 0) continue;

    const monthlyAllocated = value.amount * (lineAlloc.percentage / 100);
    if (monthlyAllocated <= 0) continue;

    centers.push({
      costCenterId: center.id,
      costCenterName: center.name,
      monthlyAllocated,
      dailyAllocated: monthlyAllocated / daysInMonth,
      percentage: lineAlloc.percentage,
    });
  }

  centers.sort((a, b) => b.monthlyAllocated - a.monthlyAllocated);
  const totalMonthlyAllocated = centers.reduce((sum, c) => sum + c.monthlyAllocated, 0);

  return {
    month,
    daysInMonth,
    totalMonthlyAllocated,
    totalDailyAllocated: totalMonthlyAllocated / daysInMonth,
    centers,
  };
};

/**
 * Build cost data for every line in a single pass.
 */
export const buildLineCosts = (
  lineIds: string[],
  todayReports: ProductionReport[],
  laborSettings: LaborSettings | null,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): Record<string, LineCostData> => {
  const hourlyRate = laborSettings?.hourlyRate ?? 0;
  const month = getCurrentMonth();
  const result: Record<string, LineCostData> = {};

  for (const lineId of lineIds) {
    const lineReports = todayReports.filter((r) => r.lineId === lineId);
    const laborCost = calculateDailyLaborCost(lineReports, hourlyRate);
    const indirectCost = calculateDailyIndirectCost(
      lineId, month, costCenters, costCenterValues, costAllocations
    );
    const totalCost = laborCost + indirectCost;
    const totalProduced = lineReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0), 0
    );
    const costPerUnit = totalProduced > 0 ? totalCost / totalProduced : 0;

    result[lineId] = { laborCost, indirectCost, totalCost, costPerUnit };
  }

  return result;
};

export interface ProductCostData {
  laborCost: number;
  indirectCost: number;
  totalCost: number;
  quantityProduced: number;
  costPerUnit: number;
}

const getSupervisorHourlyRate = (
  report: ProductionReport,
  supervisorHourlyRates?: Map<string, number>,
  fallbackHourlyRate = 0
): number => {
  if (!report.employeeId) return Math.max(0, fallbackHourlyRate || 0);
  const specificRate = supervisorHourlyRates?.get(report.employeeId) || 0;
  if (specificRate > 0) return specificRate;
  return Math.max(0, fallbackHourlyRate || 0);
};

export const buildSupervisorHourlyRatesMap = (
  employees: FirestoreEmployee[]
): Map<string, number> => {
  const result = new Map<string, number>();
  employees
    .filter((e) => e.id && e.level === 2 && e.isActive)
    .forEach((e) => result.set(e.id!, Math.max(0, e.hourlyRate || 0)));
  return result;
};

/**
 * Build cost data for every product.
 * Indirect cost is split proportionally by the product's share
 * of each line's daily production.
 */
export const buildProductCosts = (
  productIds: string[],
  todayReports: ProductionReport[],
  laborSettings: LaborSettings | null,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): Record<string, ProductCostData> => {
  const hourlyRate = laborSettings?.hourlyRate ?? 0;
  const month = getCurrentMonth();
  const result: Record<string, ProductCostData> = {};

  const lineTotals = new Map<string, number>();
  todayReports.forEach((r) => {
    lineTotals.set(r.lineId, (lineTotals.get(r.lineId) || 0) + (r.quantityProduced || 0));
  });

  const lineIndirectCache = new Map<string, number>();
  for (const [lineId] of lineTotals) {
    lineIndirectCache.set(
      lineId,
      calculateDailyIndirectCost(lineId, month, costCenters, costCenterValues, costAllocations)
    );
  }

  for (const productId of productIds) {
    const productReports = todayReports.filter((r) => r.productId === productId);
    if (productReports.length === 0) {
      result[productId] = { laborCost: 0, indirectCost: 0, totalCost: 0, quantityProduced: 0, costPerUnit: 0 };
      continue;
    }

    const laborCost = calculateDailyLaborCost(productReports, hourlyRate);
    const quantityProduced = productReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);

    let indirectCost = 0;
    const productByLine = new Map<string, number>();
    productReports.forEach((r) => {
      productByLine.set(r.lineId, (productByLine.get(r.lineId) || 0) + (r.quantityProduced || 0));
    });
    for (const [lineId, productQty] of productByLine) {
      const lineTotal = lineTotals.get(lineId) || 0;
      if (lineTotal <= 0) continue;
      indirectCost += (lineIndirectCache.get(lineId) || 0) * (productQty / lineTotal);
    }

    const totalCost = laborCost + indirectCost;
    result[productId] = {
      laborCost,
      indirectCost,
      totalCost,
      quantityProduced,
      costPerUnit: quantityProduced > 0 ? totalCost / quantityProduced : 0,
    };
  }

  return result;
};

/**
 * Compute cost per unit for every report in a batch.
 * Groups reports by (lineId + date) to properly split indirect costs.
 */
export const buildReportsCosts = (
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  supervisorHourlyRates?: Map<string, number>
): Map<string, number> => {
  const result = new Map<string, number>();
  if (hourlyRate <= 0 && costCenters.length === 0) return result;

  const lineDateTotals = new Map<string, number>();
  reports.forEach((r) => {
    const key = `${r.lineId}_${r.date}`;
    lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
  });

  const indirectCache = new Map<string, number>();

  for (const r of reports) {
    if (!r.id || !r.quantityProduced || r.quantityProduced <= 0) continue;

    const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    const savedSupervisorIndirectCost = r.supervisorIndirectCost ?? 0;
    const supervisorIndirectCost = savedSupervisorIndirectCost > 0
      ? savedSupervisorIndirectCost
      : getSupervisorHourlyRate(r, supervisorHourlyRates, hourlyRate) * (r.workHours || 0);

    const month = r.date?.slice(0, 7) || getCurrentMonth();
    if (!indirectCache.has(`${r.lineId}_${month}`)) {
      indirectCache.set(
        `${r.lineId}_${month}`,
        calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations)
      );
    }
    const lineIndirect = indirectCache.get(`${r.lineId}_${month}`) || 0;
    const lineDateKey = `${r.lineId}_${r.date}`;
    const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
    const indirectShare = lineDateTotal > 0
      ? lineIndirect * (r.quantityProduced / lineDateTotal)
      : 0;

    result.set(r.id, (laborCost + indirectShare + supervisorIndirectCost) / r.quantityProduced);
  }

  return result;
};

/**
 * Average cost per unit for a product across a set of reports.
 * Uses total cost / total produced for a weighted average.
 */
export const buildProductAvgCost = (
  productId: string,
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): ProductCostData => {
  const productReports = reports.filter((r) => r.productId === productId);
  if (productReports.length === 0) {
    return { laborCost: 0, indirectCost: 0, totalCost: 0, quantityProduced: 0, costPerUnit: 0 };
  }

  const lineDateTotals = new Map<string, number>();
  reports.forEach((r) => {
    const key = `${r.lineId}_${r.date}`;
    lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
  });

  const indirectCache = new Map<string, number>();
  let totalLabor = 0;
  let totalIndirect = 0;
  let totalQty = 0;

  for (const r of productReports) {
    if (!r.quantityProduced || r.quantityProduced <= 0) continue;

    totalLabor += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    totalQty += r.quantityProduced;

    const month = r.date?.slice(0, 7) || getCurrentMonth();
    const cacheKey = `${r.lineId}_${month}`;
    if (!indirectCache.has(cacheKey)) {
      indirectCache.set(cacheKey, calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations));
    }
    const lineIndirect = indirectCache.get(cacheKey) || 0;
    const lineDateKey = `${r.lineId}_${r.date}`;
    const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
    if (lineDateTotal > 0) {
      totalIndirect += lineIndirect * (r.quantityProduced / lineDateTotal);
    }
  }

  const totalCost = totalLabor + totalIndirect;
  return {
    laborCost: totalLabor,
    indirectCost: totalIndirect,
    totalCost,
    quantityProduced: totalQty,
    costPerUnit: totalQty > 0 ? totalCost / totalQty : 0,
  };
};

export interface ProductLineCost {
  lineId: string;
  lineName: string;
  totalProduced: number;
  totalCost: number;
  costPerUnit: number;
}

/**
 * Break down a product's cost across the different lines it was produced on.
 */
export const buildProductCostByLine = (
  productId: string,
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  getLineName: (id: string) => string
): ProductLineCost[] => {
  const productReports = reports.filter((r) => r.productId === productId);
  if (productReports.length === 0) return [];

  const lineDateTotals = new Map<string, number>();
  reports.forEach((r) => {
    const key = `${r.lineId}_${r.date}`;
    lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
  });

  const indirectCache = new Map<string, number>();
  const lineData = new Map<string, { produced: number; cost: number }>();

  for (const r of productReports) {
    if (!r.quantityProduced || r.quantityProduced <= 0) continue;

    const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    const month = r.date?.slice(0, 7) || getCurrentMonth();
    const cacheKey = `${r.lineId}_${month}`;
    if (!indirectCache.has(cacheKey)) {
      indirectCache.set(cacheKey, calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations));
    }
    const lineIndirect = indirectCache.get(cacheKey) || 0;
    const lineDateKey = `${r.lineId}_${r.date}`;
    const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
    const indirectShare = lineDateTotal > 0 ? lineIndirect * (r.quantityProduced / lineDateTotal) : 0;

    const prev = lineData.get(r.lineId) || { produced: 0, cost: 0 };
    lineData.set(r.lineId, {
      produced: prev.produced + r.quantityProduced,
      cost: prev.cost + laborCost + indirectShare,
    });
  }

  return Array.from(lineData.entries()).map(([lineId, data]) => ({
    lineId,
    lineName: getLineName(lineId),
    totalProduced: data.produced,
    totalCost: data.cost,
    costPerUnit: data.produced > 0 ? data.cost / data.produced : 0,
  }));
};

export interface DailyCostPoint {
  date: string;
  costPerUnit: number;
  quantity: number;
}

/**
 * Cost per unit trend over time for a specific product.
 */
export const buildProductCostHistory = (
  productId: string,
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): DailyCostPoint[] => {
  const productReports = reports.filter((r) => r.productId === productId && r.quantityProduced > 0);
  if (productReports.length === 0) return [];

  const allReportsByDate = new Map<string, ProductionReport[]>();
  reports.forEach((r) => {
    const list = allReportsByDate.get(r.date) || [];
    list.push(r);
    allReportsByDate.set(r.date, list);
  });

  const indirectCache = new Map<string, number>();
  const dailyData = new Map<string, { totalCost: number; totalQty: number }>();

  for (const r of productReports) {
    const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    const month = r.date?.slice(0, 7) || getCurrentMonth();
    const cacheKey = `${r.lineId}_${month}`;
    if (!indirectCache.has(cacheKey)) {
      indirectCache.set(cacheKey, calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations));
    }
    const lineIndirect = indirectCache.get(cacheKey) || 0;
    const dayReports = allReportsByDate.get(r.date) || [];
    const lineDayTotal = dayReports.filter((dr) => dr.lineId === r.lineId).reduce((s, dr) => s + (dr.quantityProduced || 0), 0);
    const indirectShare = lineDayTotal > 0 ? lineIndirect * (r.quantityProduced / lineDayTotal) : 0;

    const prev = dailyData.get(r.date) || { totalCost: 0, totalQty: 0 };
    dailyData.set(r.date, {
      totalCost: prev.totalCost + laborCost + indirectShare,
      totalQty: prev.totalQty + r.quantityProduced,
    });
  }

  return Array.from(dailyData.entries())
    .map(([date, d]) => ({
      date,
      costPerUnit: d.totalQty > 0 ? d.totalCost / d.totalQty : 0,
      quantity: d.totalQty,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Estimate cost per unit from report form data (live preview).
 */
export const estimateReportCost = (
  workersCount: number,
  workHours: number,
  quantityProduced: number,
  hourlyRate: number,
  supervisorHourlyRate: number,
  lineId: string,
  reportDate: string | undefined,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): { laborCost: number; indirectCost: number; totalCost: number; costPerUnit: number } => {
  if (quantityProduced <= 0) return { laborCost: 0, indirectCost: 0, totalCost: 0, costPerUnit: 0 };

  const laborCost = workersCount * workHours * hourlyRate;
  const supervisorIndirectCost = Math.max(0, supervisorHourlyRate || 0) * workHours;
  const month = reportDate?.slice(0, 7) || getCurrentMonth();
  const sharedIndirectCost = lineId
    ? calculateDailyIndirectCost(lineId, month, costCenters, costCenterValues, costAllocations)
    : 0;
  const indirectCost = sharedIndirectCost + supervisorIndirectCost;
  const totalCost = laborCost + indirectCost;
  return { laborCost, indirectCost, totalCost, costPerUnit: totalCost / quantityProduced };
};

export const getCurrentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getDaysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const formatCost = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export interface DailyProductionCostPoint {
  date: string;
  day: string;
  production: number;
  laborCost: number;
  indirectCost: number;
  totalCost: number;
  costPerUnit: number;
}

export const buildDailyProductionCostChart = (
  reports: ProductionReport[],
  productId: string,
  lineId: string,
  month: string,
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[]
): DailyProductionCostPoint[] => {
  let filtered = reports;
  if (productId) filtered = filtered.filter((r) => r.productId === productId);
  if (lineId) filtered = filtered.filter((r) => r.lineId === lineId);
  if (filtered.length === 0) return [];

  const byDate = new Map<string, ProductionReport[]>();
  filtered.forEach((r) => {
    const list = byDate.get(r.date) || [];
    list.push(r);
    byDate.set(r.date, list);
  });

  const allByDateLine = new Map<string, number>();
  reports.forEach((r) => {
    const key = `${r.date}_${r.lineId}`;
    allByDateLine.set(key, (allByDateLine.get(key) || 0) + (r.quantityProduced || 0));
  });

  const indirectCache = new Map<string, number>();
  const result: DailyProductionCostPoint[] = [];

  for (const [date, dayReports] of byDate) {
    const production = dayReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const laborCost = dayReports.reduce(
      (s, r) => s + (r.workersCount || 0) * (r.workHours || 0) * hourlyRate, 0
    );

    let indirectCost = 0;
    const lineQty = new Map<string, number>();
    dayReports.forEach((r) => {
      lineQty.set(r.lineId, (lineQty.get(r.lineId) || 0) + (r.quantityProduced || 0));
    });

    for (const [lid, qty] of lineQty) {
      if (!indirectCache.has(lid)) {
        indirectCache.set(lid, calculateDailyIndirectCost(lid, month, costCenters, costCenterValues, costAllocations));
      }
      const lineIndirect = indirectCache.get(lid) || 0;
      const lineDayTotal = allByDateLine.get(`${date}_${lid}`) || 0;
      if (lineDayTotal > 0) {
        indirectCost += lineIndirect * (qty / lineDayTotal);
      }
    }

    const totalCost = laborCost + indirectCost;
    result.push({
      date,
      day: date.slice(8),
      production,
      laborCost,
      indirectCost,
      totalCost,
      costPerUnit: production > 0 ? totalCost / production : 0,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
};
