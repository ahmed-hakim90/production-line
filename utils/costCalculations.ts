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
 * Line-percentage indirect: prorate monthly line share by (active / standard working days),
 * then spread the prorated amount across active production days.
 */
export const linePercentageDailyIndirectPool = (
  monthlyLineShare: number,
  workingDays: number,
  activeDays: number,
): number => {
  if (monthlyLineShare <= 0) return 0;
  const wd = Math.max(1, Math.round(Number(workingDays) || 0));
  const ad = Math.max(0, Math.round(Number(activeDays) || 0));
  if (ad <= 0) {
    return monthlyLineShare / wd;
  }
  const timeFactor = Math.min(1, ad / wd);
  const effectiveMonthly = monthlyLineShare * timeFactor;
  return effectiveMonthly / ad;
};

export const buildActiveReportDaysByLineMonthMap = (
  reports: ProductionReport[],
): Map<string, number> => {
  const datesByKey = new Map<string, Set<string>>();
  reports.forEach((r) => {
    const lineId = String(r.lineId || '').trim();
    const dateStr = String(r.date || '').trim();
    if (!lineId || !dateStr || dateStr.length < 7) return;
    const month = dateStr.slice(0, 7);
    const key = `${lineId}_${month}`;
    if (!datesByKey.has(key)) datesByKey.set(key, new Set<string>());
    datesByKey.get(key)!.add(dateStr);
  });
  const result = new Map<string, number>();
  datesByKey.forEach((set, key) => result.set(key, set.size));
  return result;
};

export type CostCenterProductScope = NonNullable<CostCenter['productScope']>;

export interface ByQtyAllocationRule {
  costCenterId: string;
  costCenterName: string;
  productScope: CostCenterProductScope;
  monthlyAmount: number;
  allowedProductIds: Set<string>;
  denominator: number;
}

export const buildByQtyAllocationRulesForMonth = (
  month: string,
  reports: ProductionReport[],
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  _costAllocations: CostAllocation[],
  options: {
    workingDaysByMonth?: Record<string, number>;
    assets?: Asset[];
    assetDepreciations?: AssetDepreciation[];
    productCategoryById?: Map<string, string>;
  } = {},
): ByQtyAllocationRule[] => {
  const assets = options.assets || [];
  const assetDepreciations = options.assetDepreciations || [];
  const productCategoryById = options.productCategoryById || new Map<string, string>();

  const valueByCenterMonth = new Map<string, CostCenterValue>();
  costCenterValues.forEach((value) => {
    valueByCenterMonth.set(`${String(value.costCenterId || '')}__${String(value.month || '')}`, value);
  });

  const depreciationByMonthCenter = new Map<string, Map<string, number>>();
  if (assets.length > 0 && assetDepreciations.length > 0) {
    const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
    assetDepreciations.forEach((entry) => {
      const m = String(entry.period || '');
      if (!m) return;
      const asset = assetById.get(String(entry.assetId || ''));
      const centerId = String(asset?.centerId || '');
      if (!centerId) return;
      if (!depreciationByMonthCenter.has(m)) depreciationByMonthCenter.set(m, new Map<string, number>());
      const monthMap = depreciationByMonthCenter.get(m)!;
      monthMap.set(centerId, (monthMap.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
    });
  }

  const monthTotals = new Map<string, number>();
  const monthDates = new Set<string>();
  reports.forEach((report) => {
    const reportMonth = String(report.date?.slice(0, 7) || '');
    if (reportMonth !== month) return;
    const date = String(report.date || '');
    if (date) monthDates.add(date);
    if ((report.quantityProduced || 0) > 0 && report.productId) {
      const pid = String(report.productId);
      monthTotals.set(pid, (monthTotals.get(pid) || 0) + Number(report.quantityProduced || 0));
    }
  });

  const allProductIds = Array.from(monthTotals.keys());
  const monthActiveDays = monthDates.size;

  const activeIndirectCenters = costCenters.filter(
    (center) => center.type === 'indirect' && center.isActive && center.id,
  );

  return activeIndirectCenters
    .filter((center) => (center.allocationBasis || 'line_percentage') === 'by_qty')
    .map((center) => {
      const centerId = String(center.id || '');
      const { resolvedAmount, workingDays } = getCenterResolvedAmount(
        center,
        month,
        valueByCenterMonth,
        depreciationByMonthCenter,
        options.workingDaysByMonth,
      );
      const monthlyAmount = getByQtyEffectiveMonthlyAmount(
        resolvedAmount,
        workingDays,
        monthActiveDays,
      );
      const scope: CostCenterProductScope = center.productScope || 'all';
      const allowedProductIds = scope === 'selected'
        ? (center.productIds || []).map((id) => String(id))
        : scope === 'category'
          ? allProductIds.filter((productId) =>
            (center.productCategories || []).includes(String(productCategoryById.get(productId) || '')),
          )
          : allProductIds;
      const denominator = Array.from(new Set(allowedProductIds))
        .reduce((sum, productId) => sum + Number(monthTotals.get(productId) || 0), 0);
      return {
        costCenterId: centerId,
        costCenterName: String(center.name || ''),
        productScope: scope,
        monthlyAmount,
        allowedProductIds: new Set(allowedProductIds),
        denominator,
      };
    })
    .filter((rule) => rule.monthlyAmount > 0 && rule.denominator > 0);
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
  workingDaysByMonth?: Record<string, number>,
  activeReportDaysByLineMonth?: Map<string, number>,
): number => {
  let totalDaily = 0;

  const indirectCenters = costCenters.filter(
    (c) => c.type === 'indirect' && c.isActive && (c.allocationBasis || 'line_percentage') === 'line_percentage'
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
    const activeDays = Number(activeReportDaysByLineMonth?.get(`${lineId}_${month}`) || 0);
    const workingDays = getWorkingDaysForMonth(value, month, workingDaysByMonth);
    totalDaily += linePercentageDailyIndirectPool(monthlyAllocated, workingDays, activeDays);
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
      const activeDays = Number(activeReportDaysByLineMonth?.get(`${lineId}_${month}`) || 0);
      const workingDays = getWorkingDaysForMonth(value, month, workingDaysByMonth);
      const lineMonthlyDep = monthlyDep * (lineAlloc.percentage / 100);
      totalDaily += linePercentageDailyIndirectPool(lineMonthlyDep, workingDays, activeDays);
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
  workingDaysByMonth?: Record<string, number>,
  activeReportDaysByLineMonth?: Map<string, number>,
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
    if (
      center.type !== 'indirect'
      || !center.isActive
      || !center.id
      || (center.allocationBasis || 'line_percentage') !== 'line_percentage'
    ) continue;

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
    const activeDays = Number(activeReportDaysByLineMonth?.get(`${lineId}_${month}`) || 0);
    const workingDays = getWorkingDaysForMonth(value, month, workingDaysByMonth);
    if (monthlyAllocated <= 0) continue;

    centers.push({
      costCenterId: center.id,
      costCenterName: center.name,
      monthlyAllocated,
      dailyAllocated: linePercentageDailyIndirectPool(monthlyAllocated, workingDays, activeDays),
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

export interface LiveCostComputationOptions {
  assets?: Asset[];
  assetDepreciations?: AssetDepreciation[];
  productCategoryById?: Map<string, string>;
  supervisorHourlyRates?: Map<string, number>;
  payrollNetByEmployee?: Map<string, number>;
  payrollNetByDepartment?: Map<string, number>;
  workingDaysByMonth?: Record<string, number>;
}

export interface LiveCostComputationResult {
  totalProduction: number;
  totalLaborCost: number;
  totalIndirectCost: number;
  totalCost: number;
  byProduct: Record<string, ProductCostData>;
  byProductCenter: Record<string, Record<string, number>>;
  reportUnitCost: Map<string, number>;
}

const getCenterResolvedAmount = (
  center: CostCenter,
  month: string,
  valueByCenterMonth: Map<string, CostCenterValue>,
  depreciationByMonthCenter: Map<string, Map<string, number>>,
  workingDaysByMonth?: Record<string, number>,
): { resolvedAmount: number; workingDays: number } => {
  const centerId = String(center.id || '');
  if (!centerId) return { resolvedAmount: 0, workingDays: 0 };
  const key = `${centerId}__${month}`;
  const value = valueByCenterMonth.get(key);
  const valueSource = value?.valueSource || center.valueSource || 'manual';
  const hasSavedBreakdown = value?.manualAmount !== undefined || value?.salariesAmount !== undefined;
  const manualAmount = hasSavedBreakdown
    ? Number(value?.manualAmount || 0)
    : Number(value?.amount || 0);
  const salariesAmount = hasSavedBreakdown
    ? Number(value?.salariesAmount || 0)
    : 0;
  const snapshotBaseAmount = valueSource === 'manual'
    ? manualAmount
    : valueSource === 'salaries'
      ? (hasSavedBreakdown ? salariesAmount : Number(value?.amount || 0))
      : (hasSavedBreakdown ? (manualAmount + salariesAmount) : Number(value?.amount || 0));
  const depreciation = Number(depreciationByMonthCenter.get(month)?.get(centerId) || 0);
  const resolvedAmount = snapshotBaseAmount + depreciation;
  return { resolvedAmount, workingDays: getWorkingDaysForMonth(value, month, workingDaysByMonth) };
};

export const computeLiveProductCosts = (
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  options: LiveCostComputationOptions = {},
): LiveCostComputationResult => {
  const assets = options.assets || [];
  const assetDepreciations = options.assetDepreciations || [];
  const productCategoryById = options.productCategoryById || new Map<string, string>();
  const result: LiveCostComputationResult = {
    totalProduction: 0,
    totalLaborCost: 0,
    totalIndirectCost: 0,
    totalCost: 0,
    byProduct: {},
    byProductCenter: {},
    reportUnitCost: new Map<string, number>(),
  };
  if (reports.length === 0) return result;

  const valueByCenterMonth = new Map<string, CostCenterValue>();
  costCenterValues.forEach((value) => {
    valueByCenterMonth.set(`${String(value.costCenterId || '')}__${String(value.month || '')}`, value);
  });
  const allocationByCenterMonth = new Map<string, CostAllocation>();
  costAllocations.forEach((allocation) => {
    allocationByCenterMonth.set(`${String(allocation.costCenterId || '')}__${String(allocation.month || '')}`, allocation);
  });

  const depreciationByMonthCenter = new Map<string, Map<string, number>>();
  if (assets.length > 0 && assetDepreciations.length > 0) {
    const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
    assetDepreciations.forEach((entry) => {
      const month = String(entry.period || '');
      if (!month) return;
      const asset = assetById.get(String(entry.assetId || ''));
      const centerId = String(asset?.centerId || '');
      if (!centerId) return;
      if (!depreciationByMonthCenter.has(month)) depreciationByMonthCenter.set(month, new Map<string, number>());
      const monthMap = depreciationByMonthCenter.get(month)!;
      monthMap.set(centerId, (monthMap.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
    });
  }

  const activeIndirectCenters = costCenters.filter((center) => center.type === 'indirect' && center.isActive && center.id);

  const monthProductQtyTotals = new Map<string, Map<string, number>>();
  const lineDateQtyTotals = new Map<string, number>();
  const lineDateHoursTotals = new Map<string, number>();
  const lineMonthDates = new Map<string, Set<string>>();
  reports.forEach((report) => {
    const key = `${report.lineId}_${report.date}`;
    lineDateQtyTotals.set(key, (lineDateQtyTotals.get(key) || 0) + Number(report.quantityProduced || 0));
    lineDateHoursTotals.set(key, (lineDateHoursTotals.get(key) || 0) + Math.max(0, Number(report.workHours || 0)));
    const month = String(report.date?.slice(0, 7) || getCurrentMonth());
    const lineMonthKey = `${report.lineId}_${month}`;
    if (!lineMonthDates.has(lineMonthKey)) lineMonthDates.set(lineMonthKey, new Set<string>());
    lineMonthDates.get(lineMonthKey)!.add(String(report.date || ''));
    if (!monthProductQtyTotals.has(month)) monthProductQtyTotals.set(month, new Map<string, number>());
    const monthMap = monthProductQtyTotals.get(month)!;
    if ((report.quantityProduced || 0) > 0 && report.productId) {
      monthMap.set(report.productId, (monthMap.get(report.productId) || 0) + Number(report.quantityProduced || 0));
    }
  });

  const lineMonthDailyCache = new Map<string, { totalDaily: number; centerDaily: Map<string, number> }>();
  const lineMonthActiveDays = new Map<string, number>();
  lineMonthDates.forEach((dates, key) => lineMonthActiveDays.set(key, dates.size));
  const getLineMonthDaily = (lineId: string, month: string) => {
    const cacheKey = `${lineId}_${month}`;
    const cached = lineMonthDailyCache.get(cacheKey);
    if (cached) return cached;
    let totalDaily = 0;
    const centerDaily = new Map<string, number>();
    activeIndirectCenters.forEach((center) => {
      if ((center.allocationBasis || 'line_percentage') !== 'line_percentage') return;
      const centerId = String(center.id || '');
      const allocation = allocationByCenterMonth.get(`${centerId}__${month}`);
      if (!allocation) return;
      const lineAllocation = allocation.allocations.find((item) => item.lineId === lineId);
      if (!lineAllocation || Number(lineAllocation.percentage || 0) <= 0) return;
      const { resolvedAmount, workingDays } = getCenterResolvedAmount(
        center,
        month,
        valueByCenterMonth,
        depreciationByMonthCenter,
        options.workingDaysByMonth,
      );
      const activeDays = Number(lineMonthActiveDays.get(`${lineId}_${month}`) || 0);
      const monthlyLineShare = resolvedAmount * (Number(lineAllocation.percentage || 0) / 100);
      const dailyShare = linePercentageDailyIndirectPool(monthlyLineShare, workingDays, activeDays);
      if (dailyShare <= 0) return;
      totalDaily += dailyShare;
      centerDaily.set(centerId, (centerDaily.get(centerId) || 0) + dailyShare);
    });
    const built = { totalDaily, centerDaily };
    lineMonthDailyCache.set(cacheKey, built);
    return built;
  };

  const monthActiveDays = new Map<string, number>();
  monthProductQtyTotals.forEach((_, month) => {
    const dates = new Set<string>();
    reports.forEach((report) => {
      const reportMonth = String(report.date?.slice(0, 7) || getCurrentMonth());
      if (reportMonth !== month) return;
      const date = String(report.date || '');
      if (date) dates.add(date);
    });
    monthActiveDays.set(month, dates.size);
  });

  const qtyRulesByMonth = new Map<string, Array<{ centerId: string; monthlyAmount: number; allowedProductIds: Set<string>; denominator: number }>>();
  const getQtyRulesForMonth = (month: string) => {
    const cached = qtyRulesByMonth.get(month);
    if (cached) return cached;
    const monthTotals = monthProductQtyTotals.get(month) || new Map<string, number>();
    const allProductIds = Array.from(monthTotals.keys());
    const rules = activeIndirectCenters
      .filter((center) => (center.allocationBasis || 'line_percentage') === 'by_qty')
      .map((center) => {
        const centerId = String(center.id || '');
        const { resolvedAmount, workingDays } = getCenterResolvedAmount(
          center,
          month,
          valueByCenterMonth,
          depreciationByMonthCenter,
          options.workingDaysByMonth,
        );
        const monthlyAmount = getByQtyEffectiveMonthlyAmount(
          resolvedAmount,
          workingDays,
          Number(monthActiveDays.get(month) || 0),
        );
        const allowedProductIds = center.productScope === 'selected'
          ? (center.productIds || []).map((id) => String(id))
          : center.productScope === 'category'
            ? allProductIds.filter((productId) => (center.productCategories || []).includes(String(productCategoryById.get(productId) || '')))
            : allProductIds;
        const denominator = Array.from(new Set(allowedProductIds))
          .reduce((sum, productId) => sum + Number(monthTotals.get(productId) || 0), 0);
        return {
          centerId,
          monthlyAmount,
          allowedProductIds: new Set(allowedProductIds),
          denominator,
        };
      })
      .filter((rule) => rule.monthlyAmount > 0 && rule.denominator > 0);
    qtyRulesByMonth.set(month, rules);
    return rules;
  };

  const supervisorShareMap = options.supervisorHourlyRates
    ? buildSupervisorIndirectShareMap(reports, options.supervisorHourlyRates, hourlyRate)
    : new Map<string, number>();

  reports.forEach((report) => {
    const qty = Number(report.quantityProduced || 0);
    if (qty <= 0 || !report.productId) return;
    const laborCost = Number(report.workersCount || 0) * Number(report.workHours || 0) * hourlyRate;
    const month = String(report.date?.slice(0, 7) || getCurrentMonth());
    const lineDateKey = `${report.lineId}_${report.date}`;
    const lineDateTotalHours = Number(lineDateHoursTotals.get(lineDateKey) || 0);
    const lineDateTotalQty = Number(lineDateQtyTotals.get(lineDateKey) || 0);
    const reportHours = Math.max(0, Number(report.workHours || 0));
    let shareRatio = 0;
    if (lineDateTotalHours > 0 && reportHours > 0) {
      shareRatio = reportHours / lineDateTotalHours;
    } else if (lineDateTotalQty > 0) {
      shareRatio = qty / lineDateTotalQty;
    }

    const lineMonthDaily = getLineMonthDaily(report.lineId, month);
    let indirectCost = lineMonthDaily.totalDaily * shareRatio;
    if (!result.byProductCenter[report.productId]) result.byProductCenter[report.productId] = {};
    lineMonthDaily.centerDaily.forEach((dailyCenterCost, centerId) => {
      const share = dailyCenterCost * shareRatio;
      if (share <= 0) return;
      result.byProductCenter[report.productId][centerId] = (result.byProductCenter[report.productId][centerId] || 0) + share;
    });

    const qtyRules = getQtyRulesForMonth(month);
    qtyRules.forEach((rule) => {
      if (!rule.allowedProductIds.has(report.productId)) return;
      const share = rule.monthlyAmount * (qty / rule.denominator);
      if (share <= 0) return;
      indirectCost += share;
      result.byProductCenter[report.productId][rule.centerId] = (result.byProductCenter[report.productId][rule.centerId] || 0) + share;
    });

    if (report.id) {
      indirectCost += Number(supervisorShareMap.get(report.id) || 0);
    }

    result.totalProduction += qty;
    result.totalLaborCost += laborCost;
    result.totalIndirectCost += indirectCost;
    const totalCost = laborCost + indirectCost;
    if (report.id) {
      result.reportUnitCost.set(report.id, totalCost / qty);
    }

    const existing = result.byProduct[report.productId] || {
      laborCost: 0,
      indirectCost: 0,
      totalCost: 0,
      quantityProduced: 0,
      costPerUnit: 0,
    };
    existing.laborCost += laborCost;
    existing.indirectCost += indirectCost;
    existing.totalCost += totalCost;
    existing.quantityProduced += qty;
    existing.costPerUnit = existing.quantityProduced > 0 ? existing.totalCost / existing.quantityProduced : 0;
    result.byProduct[report.productId] = existing;
  });

  result.totalCost = result.totalLaborCost + result.totalIndirectCost;
  return result;
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

/** Internal pieces of report cost before dividing by quantity (matches buildReportsCosts). */
type ReportCostParts = {
  laborCost: number;
  indirectShare: number;
  byQtyIndirectShare: number;
  supervisorIndirectCost: number;
  lineIndirect: number;
  lineDateTotal: number;
  qty: number;
};

function ensureLineMonthIndirectCached(
  lineId: string,
  month: string,
  indirectCache: Map<string, number>,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  workingDaysByMonth?: Record<string, number>,
  activeReportDaysByLineMonth?: Map<string, number>,
): void {
  const cacheKey = `${lineId}_${month}`;
  if (!indirectCache.has(cacheKey)) {
    indirectCache.set(
      cacheKey,
      calculateDailyIndirectCost(
        lineId,
        month,
        costCenters,
        costCenterValues,
        costAllocations,
        [],
        [],
        workingDaysByMonth,
        activeReportDaysByLineMonth,
      ),
    );
  }
}

function computeReportCostParts(
  r: ProductionReport,
  lineDateTotals: Map<string, number>,
  indirectCache: Map<string, number>,
  supervisorShareMap: Map<string, number>,
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  workingDaysByMonth?: Record<string, number>,
  activeReportDaysByLineMonth?: Map<string, number>,
  byQtyRulesByMonth?: Map<string, ByQtyAllocationRule[]>,
): ReportCostParts | null {
  if (!r.id || !r.quantityProduced || r.quantityProduced <= 0) return null;

  const qty = r.quantityProduced;
  const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
  const supervisorIndirectCost = supervisorShareMap.get(r.id) || 0;

  const month = r.date?.slice(0, 7) || getCurrentMonth();
  ensureLineMonthIndirectCached(
    r.lineId,
    month,
    indirectCache,
    costCenters,
    costCenterValues,
    costAllocations,
    workingDaysByMonth,
    activeReportDaysByLineMonth,
  );
  const lineIndirect = indirectCache.get(`${r.lineId}_${month}`) || 0;
  const lineDateKey = `${r.lineId}_${r.date}`;
  const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
  const indirectShare = lineDateTotal > 0 ? lineIndirect * (qty / lineDateTotal) : 0;

  let byQtyIndirectShare = 0;
  const rules = byQtyRulesByMonth?.get(month);
  const productId = String(r.productId || '');
  if (rules && productId) {
    for (const rule of rules) {
      if (!rule.allowedProductIds.has(productId)) continue;
      if (rule.denominator <= 0) continue;
      byQtyIndirectShare += rule.monthlyAmount * (qty / rule.denominator);
    }
  }

  return {
    laborCost,
    indirectShare,
    byQtyIndirectShare,
    supervisorIndirectCost,
    lineIndirect,
    lineDateTotal,
    qty,
  };
}

/**
 * Detailed cost breakdown for one production report, consistent with {@link buildReportsCosts}
 * when using the same batch of `reports` and cost inputs.
 */
/** Per indirect cost center: line share from center, then this report's share of that daily line pool. */
export interface ProductionReportIndirectCenterRow {
  costCenterId: string;
  costCenterName: string;
  /** Line's percentage of this center's monthly amount (from allocations). */
  linePercentage: number;
  /** This center's contribution to the line's daily indirect total (ج.م/يوم). */
  dailyAllocatedToLine: number;
  /** This report's share of that daily amount for the report day (ج.م). */
  shareForThisReport: number;
}

export interface ProductionReportByQtyCenterRow {
  costCenterId: string;
  costCenterName: string;
  productScope: CostCenterProductScope;
  /** Effective monthly pool for this scope after time proration (ج.م). */
  monthlyPoolForScope: number;
  /** Total produced qty in scope for the month (denominator). */
  scopeDenominatorQty: number;
  shareForThisReport: number;
}

export interface ProductionReportCostBreakdown {
  quantityProduced: number;
  workersCount: number;
  workHours: number;
  hourlyRate: number;
  laborCostTotal: number;
  /** Daily indirect cost allocated to the line for the report month (before splitting by day qty). */
  lineDailyIndirect: number;
  /** Total produced qty on this line on this calendar day (all reports in batch). */
  lineDateTotalQty: number;
  /** Line_percentage indirect only (ج.م). */
  indirectShareTotal: number;
  /** Indirect cost centers allocated to this line (basis: line_percentage), with this report's share each. */
  indirectCenters: ProductionReportIndirectCenterRow[];
  byQtyShareTotal: number;
  byQtyCenters: ProductionReportByQtyCenterRow[];
  supervisorIndirectTotal: number;
  totalCost: number;
  costPerUnit: number;
}

/**
 * Pre-compute by_qty rules for each month present in `reports`.
 */
export const buildByQtyRulesByMonthFromReports = (
  reports: ProductionReport[],
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  workingDaysByMonth?: Record<string, number>,
  productCategoryById?: Map<string, string>,
): Map<string, ByQtyAllocationRule[]> => {
  const months = new Set<string>();
  reports.forEach((r) => {
    const m = String(r.date?.slice(0, 7) || '');
    if (m) months.add(m);
  });
  const map = new Map<string, ByQtyAllocationRule[]>();
  months.forEach((month) => {
    map.set(
      month,
      buildByQtyAllocationRulesForMonth(month, reports, costCenters, costCenterValues, costAllocations, {
        workingDaysByMonth,
        productCategoryById,
      }),
    );
  });
  return map;
};

/**
 * @returns `null` if cost settings are disabled, the report cannot be costed, or batch context is empty.
 */
export const getProductionReportCostBreakdown = (
  report: ProductionReport,
  reports: ProductionReport[],
  hourlyRate: number,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  supervisorHourlyRates?: Map<string, number>,
  workingDaysByMonth?: Record<string, number>,
  productCategoryById?: Map<string, string>,
): ProductionReportCostBreakdown | null => {
  if (hourlyRate <= 0 && costCenters.length === 0) return null;

  const activeReportDaysByLineMonth = buildActiveReportDaysByLineMonthMap(reports);
  const byQtyRulesByMonth = buildByQtyRulesByMonthFromReports(
    reports,
    costCenters,
    costCenterValues,
    costAllocations,
    workingDaysByMonth,
    productCategoryById,
  );

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

  const parts = computeReportCostParts(
    report,
    lineDateTotals,
    indirectCache,
    supervisorShareMap,
    hourlyRate,
    costCenters,
    costCenterValues,
    costAllocations,
    workingDaysByMonth,
    activeReportDaysByLineMonth,
    byQtyRulesByMonth,
  );
  if (!parts) return null;

  const month = report.date?.slice(0, 7) || getCurrentMonth();
  const lineAllocated = buildLineAllocatedCostSummary(
    report.lineId,
    month,
    costCenters,
    costCenterValues,
    costAllocations,
    [],
    [],
    workingDaysByMonth,
    activeReportDaysByLineMonth,
  );

  const qtyRatio =
    parts.lineDateTotal > 0 ? parts.qty / parts.lineDateTotal : 0;
  const indirectCenters: ProductionReportIndirectCenterRow[] = lineAllocated.centers.map((c) => ({
    costCenterId: c.costCenterId,
    costCenterName: c.costCenterName,
    linePercentage: c.percentage,
    dailyAllocatedToLine: c.dailyAllocated,
    shareForThisReport: c.dailyAllocated * qtyRatio,
  }));

  const rules = byQtyRulesByMonth.get(month) || [];
  const productId = String(report.productId || '');
  const byQtyCenters: ProductionReportByQtyCenterRow[] = [];
  for (const rule of rules) {
    if (!productId || !rule.allowedProductIds.has(productId)) continue;
    if (rule.denominator <= 0) continue;
    byQtyCenters.push({
      costCenterId: rule.costCenterId,
      costCenterName: rule.costCenterName,
      productScope: rule.productScope,
      monthlyPoolForScope: rule.monthlyAmount,
      scopeDenominatorQty: rule.denominator,
      shareForThisReport: rule.monthlyAmount * (parts.qty / rule.denominator),
    });
  }

  const totalCost =
    parts.laborCost
    + parts.indirectShare
    + parts.byQtyIndirectShare
    + parts.supervisorIndirectCost;
  return {
    quantityProduced: parts.qty,
    workersCount: report.workersCount || 0,
    workHours: report.workHours || 0,
    hourlyRate,
    laborCostTotal: parts.laborCost,
    lineDailyIndirect: parts.lineIndirect,
    lineDateTotalQty: parts.lineDateTotal,
    indirectShareTotal: parts.indirectShare,
    indirectCenters,
    byQtyShareTotal: parts.byQtyIndirectShare,
    byQtyCenters,
    supervisorIndirectTotal: parts.supervisorIndirectCost,
    totalCost,
    costPerUnit: totalCost / parts.qty,
  };
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
  supervisorHourlyRates?: Map<string, number>,
  workingDaysByMonth?: Record<string, number>,
  productCategoryById?: Map<string, string>,
): Map<string, number> => {
  const result = new Map<string, number>();
  if (hourlyRate <= 0 && costCenters.length === 0) return result;

  const activeReportDaysByLineMonth = buildActiveReportDaysByLineMonthMap(reports);
  const byQtyRulesByMonth = buildByQtyRulesByMonthFromReports(
    reports,
    costCenters,
    costCenterValues,
    costAllocations,
    workingDaysByMonth,
    productCategoryById,
  );

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
    const parts = computeReportCostParts(
      r,
      lineDateTotals,
      indirectCache,
      supervisorShareMap,
      hourlyRate,
      costCenters,
      costCenterValues,
      costAllocations,
      workingDaysByMonth,
      activeReportDaysByLineMonth,
      byQtyRulesByMonth,
    );
    if (!parts) continue;
    const total =
      parts.laborCost
      + parts.indirectShare
      + parts.byQtyIndirectShare
      + parts.supervisorIndirectCost;
    result.set(r.id!, total / parts.qty);
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

export const getWorkingDaysExcludingFriday = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return getDaysInMonth(month);
  }
  const daysInMonth = getDaysInMonth(month);
  let workingDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    // Factory weekly holiday: Friday only.
    const weekDay = new Date(y, m - 1, day).getDay();
    if (weekDay !== 5) {
      workingDays += 1;
    }
  }
  return workingDays;
};

export const getWorkingDaysForMonth = (
  value: Pick<CostCenterValue, 'workingDays'> | undefined | null,
  month: string,
  workingDaysByMonth?: Record<string, number>,
): number => {
  const globalDays = Number(workingDaysByMonth?.[month] ?? 0);
  if (Number.isFinite(globalDays) && globalDays > 0) {
    return Math.round(globalDays);
  }
  void value;
  return getWorkingDaysExcludingFriday(month);
};

export const getByQtyEffectiveMonthlyAmount = (
  resolvedAmount: number,
  workingDays: number,
  elapsedActiveDays: number,
  isMonthClosed = false,
): number => {
  const monthlyAmount = Number(resolvedAmount || 0);
  if (monthlyAmount <= 0) return 0;
  if (isMonthClosed) return monthlyAmount;
  const totalWorkingDays = Math.max(0, Math.round(Number(workingDays || 0)));
  if (totalWorkingDays <= 0) return 0;
  const elapsedDays = Math.min(
    totalWorkingDays,
    Math.max(0, Math.round(Number(elapsedActiveDays || 0))),
  );
  if (elapsedDays <= 0) return 0;
  return monthlyAmount * (elapsedDays / totalWorkingDays);
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

export type ProductionReportCostSnapshotPatch = Pick<
  ProductionReport,
  | 'costSnapshotAt'
  | 'unitCostSnapshot'
  | 'laborCostSnapshot'
  | 'lineIndirectShareSnapshot'
  | 'supervisorIndirectSnapshot'
  | 'indirectByCenterSnapshot'
>;

/**
 * Snapshot fields to persist on a production report document (same logic as the reports UI).
 */
export const buildProductionReportCostSnapshotPatch = (
  report: ProductionReport,
  contextReports: ProductionReport[],
  args: {
    hourlyRate: number;
    costCenters: CostCenter[];
    costCenterValues: CostCenterValue[];
    costAllocations: CostAllocation[];
    supervisorHourlyRates?: Map<string, number>;
    workingDaysByMonth?: Record<string, number>;
    productCategoryById?: Map<string, string>;
  },
): ProductionReportCostSnapshotPatch | null => {
  if (!report.id) return null;
  const breakdown = getProductionReportCostBreakdown(
    report,
    contextReports,
    args.hourlyRate,
    args.costCenters,
    args.costCenterValues,
    args.costAllocations,
    args.supervisorHourlyRates,
    args.workingDaysByMonth,
    args.productCategoryById,
  );
  if (!breakdown) return null;
  const indirectByCenterSnapshot: Record<string, number> = {};
  for (const row of breakdown.indirectCenters) {
    indirectByCenterSnapshot[row.costCenterId] =
      (indirectByCenterSnapshot[row.costCenterId] || 0) + row.shareForThisReport;
  }
  for (const row of breakdown.byQtyCenters) {
    indirectByCenterSnapshot[row.costCenterId] =
      (indirectByCenterSnapshot[row.costCenterId] || 0) + row.shareForThisReport;
  }
  return {
    costSnapshotAt: new Date().toISOString(),
    unitCostSnapshot: breakdown.costPerUnit,
    laborCostSnapshot: breakdown.laborCostTotal,
    lineIndirectShareSnapshot: breakdown.indirectShareTotal,
    supervisorIndirectSnapshot: breakdown.supervisorIndirectTotal,
    indirectByCenterSnapshot,
  };
};
