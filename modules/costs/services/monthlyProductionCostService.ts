import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { IPayrollProvider, MonthlyPayrollData } from '../../shared/contracts/IPayrollProvider';
import type { IProductionProvider, ProductionReportData } from '../../shared/contracts/IProductionProvider';
import { payrollAdapter } from '../adapters/PayrollAdapter';
import { productionAdapter } from '../adapters/ProductionAdapter';
import type {
  MonthlyProductionCost,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  Asset,
  AssetDepreciation,
  ProductionReport,
} from '../../../types';
import {
  buildSupervisorIndirectShareMap,
  calculateDailyIndirectCost,
  getWorkingDaysForMonth,
} from '../../../utils/costCalculations';

const COLLECTION = 'monthly_production_costs';
type CalculateAllProgress = {
  done: number;
  total: number;
  productId: string;
};

type QtyCenterRule = {
  entry: CenterResolvedValue;
  allowedProductIds: Set<string>;
  denominator: number;
};

type CostPayrollRow = MonthlyPayrollData & {
  departmentId?: string;
};

type CostProductionReport = ProductionReportData & {
  employeeId?: string;
  supervisorIndirectCost?: number;
  productCategory?: string;
};

type CostServiceProviders = {
  payrollProvider: IPayrollProvider;
  productionProvider: IProductionProvider;
};

export type CostServiceProviderOverrides = {
  payrollProvider?: IPayrollProvider;
  productionProvider?: IProductionProvider;
};

type MonthCalculationContext = {
  allReports: CostProductionReport[];
  productReportsByProduct: Map<string, CostProductionReport[]>;
  centerValues: Map<string, CenterResolvedValue>;
  lineDateQtyTotals: Map<string, number>;
  lineDateHoursTotals: Map<string, number>;
  qtyCenterRules: QtyCenterRule[];
};

export type MonthlyDashboardProductCost = {
  productId: string;
  producedQty: number;
  directCost: number;
  indirectCost: number;
  totalCost: number;
  averageUnitCost: number;
};

export type MonthlyDashboardCostTotals = {
  producedQty: number;
  directCost: number;
  indirectCost: number;
  totalCost: number;
  averageUnitCost: number;
};

export type MonthlyDashboardCostSummary = {
  month: string;
  perProduct: Record<string, MonthlyDashboardProductCost>;
  totals: MonthlyDashboardCostTotals;
  centerSnapshotTotals: Record<string, number>;
};

function docId(productId: string, month: string): string {
  return `${productId}_${month}`;
}

function resolveProviders(overrides?: CostServiceProviderOverrides): CostServiceProviders {
  return {
    payrollProvider: overrides?.payrollProvider || payrollAdapter,
    productionProvider: overrides?.productionProvider || productionAdapter,
  };
}

function toLegacyProductionReports(reports: CostProductionReport[]): ProductionReport[] {
  return reports.map((report) => ({
    id: report.id,
    employeeId: report.employeeId || '',
    productId: report.productId,
    lineId: report.lineId,
    date: report.date,
    quantityProduced: Number(report.quantity || 0),
    workersCount: Number(report.workers || 0),
    workHours: Number(report.hours || 0),
    supervisorIndirectCost: Number(report.supervisorIndirectCost || 0),
    workOrderId: report.workOrderId,
  }));
}

async function buildPayrollNetMap(
  month: string,
  payrollProvider: IPayrollProvider,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const records = await payrollProvider.getMonthlyPayroll(month);
  records.forEach((record) => {
    if (!record.employeeId) return;
    map.set(record.employeeId, Number(record.netSalary || 0));
  });
  return map;
}

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

async function persistResolvedCenterValues(
  month: string,
  centerValues: Map<string, CenterResolvedValue>,
  existingValues: CostCenterValue[],
): Promise<void> {
  const existingByCenterId = new Map<string, CostCenterValue>();
  existingValues.forEach((value) => {
    if (value.month !== month) return;
    existingByCenterId.set(String(value.costCenterId || ''), value);
  });
  let batch = writeBatch(db);
  let pendingOps = 0;
  const commitChunk = async () => {
    if (pendingOps === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    pendingOps = 0;
  };

  for (const [centerId, entry] of centerValues.entries()) {
    const existing = existingByCenterId.get(centerId);
    const valueSource = entry.center.valueSource || 'manual';
    const snapshotBaseAmount = valueSource === 'manual'
      ? Number(entry.manualAmount || 0)
      : valueSource === 'salaries'
        ? Number(entry.salariesAmount || 0)
        : Number(entry.manualAmount || 0) + Number(entry.salariesAmount || 0);
    const payload: Omit<CostCenterValue, 'id'> = {
      costCenterId: centerId,
      month,
      amount: snapshotBaseAmount,
      manualAmount: entry.manualAmount,
      salariesAmount: entry.salariesAmount,
      valueSource,
      employeeScopeSnapshot: entry.employeeScope,
      employeeIdsSnapshot: entry.employeeIds,
      employeeDepartmentIdsSnapshot: entry.employeeDepartmentIds,
      productScopeSnapshot: entry.productScope,
      productIdsSnapshot: entry.productIds,
      productCategoriesSnapshot: entry.productCategories,
      allocationBasisSnapshot: entry.allocationBasis,
      workingDays: entry.workingDays || getDaysInMonth(month),
    };
    const ref = existing?.id
      ? doc(db, 'cost_center_values', String(existing.id))
      : doc(collection(db, 'cost_center_values'));
    batch.set(ref, payload, { merge: true });
    pendingOps += 1;
    if (pendingOps >= 450) {
      await commitChunk();
    }
  }
  await commitChunk();
}

type CenterResolvedValue = {
  center: CostCenter;
  manualAmount: number;
  salariesAmount: number;
  resolvedAmount: number;
  workingDays: number;
  allocationBasis: 'line_percentage' | 'by_qty';
  productScope: 'all' | 'selected' | 'category';
  productIds: string[];
  productCategories: string[];
  employeeScope: 'selected' | 'department';
  employeeIds: string[];
  employeeDepartmentIds: string[];
};

async function resolveCenterValuesForMonth(
  month: string,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  assets: Asset[],
  assetDepreciations: AssetDepreciation[],
  payrollProvider: IPayrollProvider,
  workingDaysByMonth?: Record<string, number>,
): Promise<Map<string, CenterResolvedValue>> {
  const resolved = new Map<string, CenterResolvedValue>();
  const activeIndirect = costCenters.filter((c) => c.type === 'indirect' && c.isActive && c.id);
  const monthValueByCenterId = new Map<string, CostCenterValue>();
  costCenterValues.forEach((value) => {
    if (value.month !== month) return;
    monthValueByCenterId.set(String(value.costCenterId || ''), value);
  });
  const missingSnapshotCenters = activeIndirect.filter((center) => !monthValueByCenterId.has(String(center.id || '')));
  const needsPayroll = missingSnapshotCenters.some((c) => (c.valueSource || 'manual') !== 'manual');
  const payrollRows = needsPayroll
    ? (await payrollProvider.getMonthlyPayroll(month)) as CostPayrollRow[]
    : [];
  const payrollNetMap = needsPayroll
    ? await buildPayrollNetMap(month, payrollProvider)
    : new Map<string, number>();
  const baseSalaryCache = new Map<string, number>();
  const assetById = new Map(assets.map((asset) => [String(asset.id || ''), asset]));
  const depreciationByCenter = new Map<string, number>();
  assetDepreciations.forEach((entry) => {
    if (entry.period !== month) return;
    const asset = assetById.get(String(entry.assetId || ''));
    const centerId = String(asset?.centerId || '');
    if (!centerId) return;
    depreciationByCenter.set(centerId, (depreciationByCenter.get(centerId) || 0) + Number(entry.depreciationAmount || 0));
  });

  const sumBaseSalaries = async (employeeIds: string[]): Promise<number> => {
    const normalized = Array.from(new Set(employeeIds.map((id) => String(id || '')).filter(Boolean)));
    if (normalized.length === 0) return 0;

    const missingIds = normalized.filter((id) => !baseSalaryCache.has(id));
    if (missingIds.length > 0) {
      const fetched = await payrollProvider.getEmployeeBaseSalaries(missingIds);
      missingIds.forEach((id) => {
        baseSalaryCache.set(id, Number(fetched[id] || 0));
      });
    }

    return normalized.reduce((sum, id) => sum + Number(baseSalaryCache.get(id) || 0), 0);
  };

  for (const center of activeIndirect) {
    const centerId = String(center.id || '');
    const monthValue = monthValueByCenterId.get(centerId);
    const valueSource = monthValue?.valueSource || center.valueSource || 'manual';
    const employeeScope = center.employeeScope || 'selected';
    const employeeIds = center.employeeIds || [];
    const employeeDepartmentIds = center.employeeDepartmentIds || [];
    const fallbackFromBaseSalary = async () => {
      if (employeeScope === 'department') {
        const departmentSet = new Set(employeeDepartmentIds);
        const departmentEmployeeIds = payrollRows
          .filter((row) => departmentSet.has(String(row.departmentId || '')))
          .map((row) => String(row.employeeId || ''))
          .filter(Boolean);
        return sumBaseSalaries(departmentEmployeeIds);
      }
      return sumBaseSalaries(employeeIds);
    };
    const hasSavedBreakdown = monthValue?.manualAmount !== undefined || monthValue?.salariesAmount !== undefined;
    let manualAmount = 0;
    let salariesAmount = 0;
    if (monthValue) {
      if (hasSavedBreakdown) {
        manualAmount = Number(monthValue.manualAmount || 0);
        salariesAmount = Number(monthValue.salariesAmount || 0);
      } else {
        const snapshotBase = Number(monthValue.amount || 0);
        if (valueSource === 'manual') {
          manualAmount = snapshotBase;
        } else if (valueSource === 'salaries') {
          salariesAmount = snapshotBase;
        } else {
          manualAmount = snapshotBase;
        }
      }
    } else {
      const baseManual = 0;
      const fixedAdjustment = Number(center.manualAdjustment || 0);
      manualAmount = valueSource === 'combined' ? baseManual + fixedAdjustment : baseManual;
      if (valueSource === 'salaries' || valueSource === 'combined') {
        if (employeeScope === 'department' && employeeDepartmentIds.length > 0) {
          const departmentSet = new Set(employeeDepartmentIds);
          salariesAmount = payrollRows
            .filter((record) => departmentSet.has(String(record.departmentId || '')))
            .reduce((sum, record) => sum + Number(record.netSalary || 0), 0);
        } else {
          salariesAmount = employeeIds.reduce((sum, employeeId) => sum + Number(payrollNetMap.get(employeeId) || 0), 0);
        }
        if (salariesAmount <= 0) {
          salariesAmount = await fallbackFromBaseSalary();
        }
      }
    }
    const depreciationAmount = Number(depreciationByCenter.get(centerId) || 0);
    const snapshotBaseAmount = valueSource === 'manual'
      ? manualAmount
      : valueSource === 'salaries'
        ? salariesAmount
        : manualAmount + salariesAmount;
    const resolvedAmount = snapshotBaseAmount + depreciationAmount;

    resolved.set(centerId, {
      center,
      manualAmount,
      salariesAmount,
      resolvedAmount,
      workingDays: getWorkingDaysForMonth(monthValue, month, workingDaysByMonth),
      allocationBasis: center.allocationBasis || 'line_percentage',
      productScope: center.productScope || 'all',
      productIds: center.productIds || [],
      productCategories: center.productCategories || [],
      employeeScope,
      employeeIds,
      employeeDepartmentIds,
    });
  }

  return resolved;
}

async function isMonthClosedForAnyProduct(month: string): Promise<boolean> {
  const monthClosedQuery = query(
    collection(db, COLLECTION),
    where('month', '==', month),
    where('isClosed', '==', true),
    limit(1),
  );
  const snap = await getDocs(monthClosedQuery);
  return !snap.empty;
}

async function buildMonthCalculationContext(
  month: string,
  costCenters: CostCenter[],
  costCenterValues: CostCenterValue[],
  costAllocations: CostAllocation[],
  assets: Asset[],
  assetDepreciations: AssetDepreciation[],
  providers: CostServiceProviders,
  workingDaysByMonth?: Record<string, number>,
): Promise<MonthCalculationContext> {
  const [allReports, centerValues] = await Promise.all([
    providers.productionProvider.getMonthlyReports(month) as Promise<CostProductionReport[]>,
    resolveCenterValuesForMonth(
      month,
      costCenters,
      costCenterValues,
      assets,
      assetDepreciations,
      providers.payrollProvider,
      workingDaysByMonth,
    ),
  ]);

  const productCategoryById = new Map<string, string>();
  allReports.forEach((report) => {
    const productId = String(report.productId || '');
    if (!productId) return;
    productCategoryById.set(productId, String(report.productCategory || '').trim());
  });

  const lineDateQtyTotals = new Map<string, number>();
  const lineDateHoursTotals = new Map<string, number>();
  const monthProductQtyTotals = new Map<string, number>();
  const productReportsByProduct = new Map<string, CostProductionReport[]>();

  allReports.forEach((report) => {
    const lineDateKey = `${report.lineId}_${report.date}`;
    lineDateQtyTotals.set(lineDateKey, (lineDateQtyTotals.get(lineDateKey) || 0) + Number(report.quantity || 0));
    lineDateHoursTotals.set(lineDateKey, (lineDateHoursTotals.get(lineDateKey) || 0) + Math.max(0, Number(report.hours || 0)));
    if ((report.quantity || 0) > 0 && report.productId) {
      monthProductQtyTotals.set(
        report.productId,
        (monthProductQtyTotals.get(report.productId) || 0) + Number(report.quantity || 0),
      );
    }
    const key = String(report.productId || '');
    if (!key) return;
    const existing = productReportsByProduct.get(key) || [];
    existing.push(report);
    productReportsByProduct.set(key, existing);
  });

  const qtyCenters = Array.from(centerValues.values()).filter(
    (entry) => entry.allocationBasis === 'by_qty' && entry.resolvedAmount > 0,
  );
  const qtyCenterRules = qtyCenters.map((entry) => {
    const allReportProductIds = Array.from(monthProductQtyTotals.keys());
    const allowedProductIds = entry.productScope === 'selected'
      ? entry.productIds
      : entry.productScope === 'category'
        ? allReportProductIds.filter((pid) => entry.productCategories.includes(String(productCategoryById.get(pid) || '')))
        : allReportProductIds;
    const denominator = allowedProductIds.reduce(
      (sum, pid) => sum + Number(monthProductQtyTotals.get(pid) || 0),
      0,
    );
    return {
      entry,
      allowedProductIds: new Set(allowedProductIds),
      denominator,
    };
  });

  return {
    allReports,
    productReportsByProduct,
    centerValues,
    lineDateQtyTotals,
    lineDateHoursTotals,
    qtyCenterRules,
  };
}

export const monthlyProductionCostService = {
  async getByProduct(productId: string): Promise<MonthlyProductionCost[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('productId', '==', productId),
        orderBy('month', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthlyProductionCost));
    } catch (error) {
      console.error('monthlyProductionCostService.getByProduct error:', error);
      throw error;
    }
  },

  async getByMonth(month: string): Promise<MonthlyProductionCost[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('month', '==', month),
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MonthlyProductionCost))
        .sort((a, b) => String(a.productId || '').localeCompare(String(b.productId || '')));
    } catch (error) {
      console.error('monthlyProductionCostService.getByMonth error:', error);
      throw error;
    }
  },

  async getDashboardMonthlySummary(month: string): Promise<MonthlyDashboardCostSummary> {
    const rows = await this.getByMonth(month);
    const perProduct: Record<string, MonthlyDashboardProductCost> = {};
    const centerSnapshotTotals = new Map<string, number>();
    let producedQty = 0;
    let directCost = 0;
    let indirectCost = 0;
    let totalCost = 0;

    rows.forEach((row) => {
      const qty = Number(row.totalProducedQty || 0);
      const rowDirect = Number(row.directCost || 0);
      const rowIndirect = Number(row.indirectCost || 0);
      const rowTotal = Number(row.totalProductionCost || (rowDirect + rowIndirect));
      const rowAvg = qty > 0 ? (rowTotal / qty) : Number(row.averageUnitCost || 0);
      const pid = String(row.productId || '');
      if (!pid) return;

      perProduct[pid] = {
        productId: pid,
        producedQty: qty,
        directCost: rowDirect,
        indirectCost: rowIndirect,
        totalCost: rowTotal,
        averageUnitCost: rowAvg,
      };

      producedQty += qty;
      directCost += rowDirect;
      indirectCost += rowIndirect;
      totalCost += rowTotal;

      (row.indirectCenterSnapshots || []).forEach((snapshot) => {
        const key = String(snapshot.costCenterId || '');
        if (!key) return;
        // Snapshot payload is repeated in each product row for the same month.
        // Keep one value per center to avoid multiplying by product count.
        if (!centerSnapshotTotals.has(key)) {
          centerSnapshotTotals.set(key, Number(snapshot.resolvedAmount || 0));
        }
      });
    });

    return {
      month,
      perProduct,
      totals: {
        producedQty,
        directCost,
        indirectCost,
        totalCost,
        averageUnitCost: producedQty > 0 ? (totalCost / producedQty) : 0,
      },
      centerSnapshotTotals: Object.fromEntries(centerSnapshotTotals.entries()),
    };
  },

  async getByProductAndMonth(productId: string, month: string): Promise<MonthlyProductionCost | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, docId(productId, month)));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as MonthlyProductionCost;
    } catch (error) {
      console.error('monthlyProductionCostService.getByProductAndMonth error:', error);
      throw error;
    }
  },

  async isMonthClosed(month: string): Promise<boolean> {
    if (!isConfigured) return false;
    return isMonthClosedForAnyProduct(month);
  },

  async calculate(
    productId: string,
    month: string,
    hourlyRate: number,
    costCenters: CostCenter[],
    costCenterValues: CostCenterValue[],
    costAllocations: CostAllocation[],
    supervisorHourlyRates?: Map<string, number>,
    assets: Asset[] = [],
    assetDepreciations: AssetDepreciation[] = [],
    workingDaysByMonth?: Record<string, number>,
    precomputedContext?: MonthCalculationContext,
    providerOverrides?: CostServiceProviderOverrides,
  ): Promise<MonthlyProductionCost | null> {
    if (!isConfigured) return null;

    const existing = await this.getByProductAndMonth(productId, month);
    if (existing?.isClosed) return existing;
    if (!existing) {
      const monthClosed = await isMonthClosedForAnyProduct(month);
      if (monthClosed) return null;
    }
    const providers = resolveProviders(providerOverrides);
    const context = precomputedContext || await buildMonthCalculationContext(
      month,
      costCenters,
      costCenterValues,
      costAllocations,
      assets,
      assetDepreciations,
      providers,
      workingDaysByMonth,
    );
    const allReports = context.allReports;
    const productReports = context.productReportsByProduct.get(productId) || [];
    const centerValues = context.centerValues;

    if (productReports.length === 0) {
      const emptyDoc: Omit<MonthlyProductionCost, 'id'> = {
        productId,
        month,
        totalProducedQty: 0,
        directCost: 0,
        indirectCost: 0,
        totalProductionCost: 0,
        averageUnitCost: 0,
        isClosed: false,
        calculatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, COLLECTION, docId(productId, month)), emptyDoc);
      return { id: docId(productId, month), ...emptyDoc };
    }

    const indirectCache = new Map<string, number>();
    const supervisorShareMap = buildSupervisorIndirectShareMap(
      toLegacyProductionReports(allReports),
      supervisorHourlyRates,
      hourlyRate,
    );
    let totalLabor = 0;
    let totalIndirect = 0;
    let totalQty = 0;
    const qtyCenterRules = context.qtyCenterRules;

    for (const r of productReports) {
      if (!r.quantity || r.quantity <= 0) continue;

      totalLabor += (r.workers || 0) * (r.hours || 0) * hourlyRate;
      totalQty += r.quantity;

      const rMonth = r.date?.slice(0, 7) || month;
      const cacheKey = `${r.lineId}_${rMonth}`;
      if (!indirectCache.has(cacheKey)) {
        indirectCache.set(
          cacheKey,
          calculateDailyIndirectCost(r.lineId, rMonth, costCenters, costCenterValues, costAllocations, assets, assetDepreciations, workingDaysByMonth),
        );
      }
      const lineIndirect = indirectCache.get(cacheKey) || 0;
      const lineDateKey = `${r.lineId}_${r.date}`;
      const lineDateTotalHours = context.lineDateHoursTotals.get(lineDateKey) || 0;
      const reportHours = Math.max(0, r.hours || 0);
      if (lineDateTotalHours > 0 && reportHours > 0) {
        totalIndirect += lineIndirect * (reportHours / lineDateTotalHours);
      } else {
        const lineDateTotalQty = context.lineDateQtyTotals.get(lineDateKey) || 0;
        if (lineDateTotalQty > 0) {
          totalIndirect += lineIndirect * (r.quantity / lineDateTotalQty);
        }
      }
      if (r.id) {
        totalIndirect += supervisorShareMap.get(r.id) || 0;
      }

      for (const rule of qtyCenterRules) {
        if (!rule.allowedProductIds.has(r.productId) || rule.denominator <= 0) continue;
        totalIndirect += rule.entry.resolvedAmount * (r.quantity / rule.denominator);
      }
    }

    const totalCost = totalLabor + totalIndirect;
    const avgUnitCost = totalQty > 0 ? totalCost / totalQty : 0;
    const indirectCenterSnapshots = Array.from(centerValues.values()).map((entry) => ({
      costCenterId: String(entry.center.id || ''),
      centerName: entry.center.name,
      valueSource: entry.center.valueSource || 'manual',
      allocationBasis: entry.allocationBasis,
      productScope: entry.productScope,
      productIds: entry.productIds,
      productCategories: entry.productCategories,
      employeeScope: entry.employeeScope,
      employeeIds: entry.employeeIds,
      employeeDepartmentIds: entry.employeeDepartmentIds,
      manualAmount: entry.manualAmount,
      salariesAmount: entry.salariesAmount,
      resolvedAmount: entry.resolvedAmount,
    }));

    const record: Omit<MonthlyProductionCost, 'id'> = {
      productId,
      month,
      totalProducedQty: totalQty,
      directCost: totalLabor,
      indirectCost: totalIndirect,
      indirectCenterSnapshots,
      totalProductionCost: totalCost,
      averageUnitCost: avgUnitCost,
      isClosed: false,
      calculatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, COLLECTION, docId(productId, month)), record);
    return { id: docId(productId, month), ...record };
  },

  async calculateAll(
    productIds: string[],
    month: string,
    hourlyRate: number,
    costCenters: CostCenter[],
    costCenterValues: CostCenterValue[],
    costAllocations: CostAllocation[],
    supervisorHourlyRates?: Map<string, number>,
    assets: Asset[] = [],
    assetDepreciations: AssetDepreciation[] = [],
    workingDaysByMonth?: Record<string, number>,
    onProgress?: (progress: CalculateAllProgress) => void,
    providerOverrides?: CostServiceProviderOverrides,
  ): Promise<MonthlyProductionCost[]> {
    if (await isMonthClosedForAnyProduct(month)) {
      return this.getByMonth(month);
    }
    const providers = resolveProviders(providerOverrides);
    const context = await buildMonthCalculationContext(
      month,
      costCenters,
      costCenterValues,
      costAllocations,
      assets,
      assetDepreciations,
      providers,
      workingDaysByMonth,
    );
    await persistResolvedCenterValues(month, context.centerValues, costCenterValues);

    const results: MonthlyProductionCost[] = [];
    const total = productIds.length;
    let done = 0;
    for (const pid of productIds) {
      const result = await this.calculate(
        pid,
        month,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        supervisorHourlyRates,
        assets,
        assetDepreciations,
        workingDaysByMonth,
        context,
        providerOverrides,
      );
      if (result) results.push(result);
      done += 1;
      onProgress?.({ done, total, productId: pid });
    }
    return results;
  },

  async closeMonth(productId: string, month: string): Promise<void> {
    if (!isConfigured) return;
    const id = docId(productId, month);
    const existing = await this.getByProductAndMonth(productId, month);
    if (!existing) return;
    await setDoc(
      doc(db, COLLECTION, id),
      { ...existing, isClosed: true, calculatedAt: serverTimestamp() },
      { merge: true },
    );
  },

  async closeMonthForAll(productIds: string[], month: string): Promise<void> {
    if (!isConfigured || productIds.length === 0) return;
    const uniqueProductIds = Array.from(new Set(productIds.map((pid) => String(pid || '').trim()).filter(Boolean)));
    let batch = writeBatch(db);
    let pendingOps = 0;
    const commitChunk = async () => {
      if (pendingOps === 0) return;
      await batch.commit();
      batch = writeBatch(db);
      pendingOps = 0;
    };
    for (const pid of uniqueProductIds) {
      batch.set(
        doc(db, COLLECTION, docId(pid, month)),
        { productId: pid, month, isClosed: true, calculatedAt: serverTimestamp() },
        { merge: true },
      );
      pendingOps += 1;
      if (pendingOps >= 450) {
        await commitChunk();
      }
    }
    await commitChunk();
  },
};
