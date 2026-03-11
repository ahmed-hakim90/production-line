import type {
  ProductionReport,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  LaborSettings,
  FirestoreEmployee,
  Asset,
  AssetDepreciation,
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
  costAllocations: CostAllocation[],
  assets: Asset[] = [],
  assetDepreciations: AssetDepreciation[] = [],
): number => {
  let totalDaily = 0;

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

    const monthlyAllocated = value.amount * (lineAlloc.percentage / 100);
    const workingDays = getWorkingDaysForMonth(value, month);
    totalDaily += workingDays > 0 ? monthlyAllocated / workingDays : 0;
  }

  if (assets.length > 0 && assetDepreciations.length > 0) {
    const depByCenter = new Map<string, number>();
    const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
    assetDepreciations.forEach((entry) => {
      if (entry.period !== month) return;
      const asset = assetById.get(String(entry.assetId || ''));
      const centerId = String(asset?.centerId || '');
      if (!centerId) return;
      depByCenter.set(centerId, (depByCenter.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
    });
    depByCenter.forEach((monthlyDep, centerId) => {
      if (monthlyDep <= 0) return;
      const allocation = costAllocations.find((a) => a.costCenterId === centerId && a.month === month);
      if (!allocation) return;
      const lineAlloc = allocation.allocations.find((a) => a.lineId === lineId);
      if (!lineAlloc || lineAlloc.percentage <= 0) return;
      const value = costCenterValues.find((v) => v.costCenterId === centerId && v.month === month);
      const workingDays = getWorkingDaysForMonth(value, month);
      const lineMonthlyDep = monthlyDep * (lineAlloc.percentage / 100);
      totalDaily += workingDays > 0 ? lineMonthlyDep / workingDays : 0;
    });
  }

  return totalDaily;
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
  costAllocations: CostAllocation[],
  assets: Asset[] = [],
  assetDepreciations: AssetDepreciation[] = [],
): LineAllocatedCostSummary => {
  if (!lineId) {
    return {
      month,
      daysInMonth: 0,
      totalMonthlyAllocated: 0,
      totalDailyAllocated: 0,
      centers: [],
    };
  }

  const centers: LineAllocatedCenterCost[] = [];
  const depreciationByCenter = new Map<string, number>();

  if (assets.length > 0 && assetDepreciations.length > 0) {
    const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
    assetDepreciations.forEach((entry) => {
      if (entry.period !== month) return;
      const asset = assetById.get(String(entry.assetId || ''));
      const centerId = String(asset?.centerId || '');
      if (!centerId) return;
      depreciationByCenter.set(
        centerId,
        (depreciationByCenter.get(centerId) || 0) + Number(entry.depreciationAmount || 0),
      );
    });
  }

  for (const center of costCenters) {
    if (center.type !== 'indirect' || !center.isActive || !center.id) continue;

    const allocation = costAllocations.find(
      (a) => a.costCenterId === center.id && a.month === month
    );
    if (!allocation) continue;

    const lineAlloc = allocation.allocations.find((a) => a.lineId === lineId);
    if (!lineAlloc || lineAlloc.percentage <= 0) continue;

    const value = costCenterValues.find(
      (v) => v.costCenterId === center.id && v.month === month
    );

    const monthlyAllocatedFromValue = (value?.amount || 0) * (lineAlloc.percentage / 100);
    const centerMonthlyDep = depreciationByCenter.get(center.id) || 0;
    const monthlyAllocatedFromDep = centerMonthlyDep * (lineAlloc.percentage / 100);
    const monthlyAllocated = monthlyAllocatedFromValue + monthlyAllocatedFromDep;
    const workingDays = getWorkingDaysForMonth(value, month);
    if (monthlyAllocated <= 0) continue;

    centers.push({
      costCenterId: center.id,
      costCenterName: center.name,
      monthlyAllocated,
      dailyAllocated: workingDays > 0 ? monthlyAllocated / workingDays : 0,
      percentage: lineAlloc.percentage,
    });
  }

  centers.sort((a, b) => b.monthlyAllocated - a.monthlyAllocated);
  const totalMonthlyAllocated = centers.reduce((sum, c) => sum + c.monthlyAllocated, 0);
  const totalDailyAllocated = centers.reduce((sum, c) => sum + c.dailyAllocated, 0);
  const fallbackDays = getDaysInMonth(month) || 0;
  const daysInMonth = totalDailyAllocated > 0
    ? totalMonthlyAllocated / totalDailyAllocated
    : fallbackDays;

  return {
    month,
    daysInMonth,
    totalMonthlyAllocated,
    totalDailyAllocated,
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
 * Distribute supervisor daily indirect cost across reports of the same
 * (line + date + supervisor) instead of adding it to each report بالكامل.
 * This prevents multiplying the supervisor daily cost by report count.
 */
export const buildSupervisorIndirectShareMap = (
  reports: ProductionReport[],
  supervisorHourlyRates?: Map<string, number>,
  fallbackHourlyRate = 0
): Map<string, number> => {
  const result = new Map<string, number>();
  if (reports.length === 0) return result;

  type GroupData = {
    reportIds: string[];
    totalQty: number;
    maxWorkHours: number;
    maxSavedSupervisorCost: number;
    employeeId: string;
  };

  const groups = new Map<string, GroupData>();

  for (const report of reports) {
    if (!report.id || !report.employeeId || (report.quantityProduced || 0) <= 0) continue;
    const groupKey = `${report.lineId}__${report.date}__${report.employeeId}`;
    const current = groups.get(groupKey) ?? {
      reportIds: [],
      totalQty: 0,
      maxWorkHours: 0,
      maxSavedSupervisorCost: 0,
      employeeId: report.employeeId,
    };
    current.reportIds.push(report.id);
    current.totalQty += report.quantityProduced || 0;
    current.maxWorkHours = Math.max(current.maxWorkHours, Math.max(0, report.workHours || 0));
    current.maxSavedSupervisorCost = Math.max(current.maxSavedSupervisorCost, Math.max(0, report.supervisorIndirectCost || 0));
    groups.set(groupKey, current);
  }

  // Fast lookup for qty by report id.
  const qtyById = new Map<string, number>();
  for (const report of reports) {
    if (!report.id) continue;
    qtyById.set(report.id, Math.max(0, report.quantityProduced || 0));
  }

  for (const [, group] of groups) {
    if (group.totalQty <= 0) continue;
    const hourlyRate = Math.max(0, supervisorHourlyRates?.get(group.employeeId) || fallbackHourlyRate || 0);
    const computedDailyCost = hourlyRate * group.maxWorkHours;
    const dailySupervisorCost = group.maxSavedSupervisorCost > 0
      ? group.maxSavedSupervisorCost
      : computedDailyCost;

    if (dailySupervisorCost <= 0) continue;

    for (const reportId of group.reportIds) {
      const qty = qtyById.get(reportId) || 0;
      if (qty <= 0) continue;
      result.set(reportId, dailySupervisorCost * (qty / group.totalQty));
    }
  }

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

  const supervisorShareMap = buildSupervisorIndirectShareMap(
    reports,
    supervisorHourlyRates,
    hourlyRate
  );

  for (const r of reports) {
    if (!r.id || !r.quantityProduced || r.quantityProduced <= 0) continue;

    const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    const supervisorIndirectCost = supervisorShareMap.get(r.id) || 0;

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

export const getWorkingDaysForMonth = (
  value: Pick<CostCenterValue, 'workingDays'> | undefined | null,
  month: string
): number => {
  const customDays = Number(value?.workingDays ?? 0);
  if (Number.isFinite(customDays) && customDays > 0) {
    return customDays;
  }
  return getDaysInMonth(month);
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
