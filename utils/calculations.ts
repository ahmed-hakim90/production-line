/**
 * Business calculations for Production ERP
 * All derived values live here or in Zustand selectors — never in Firestore.
 */

import type {
  ProductionReport,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreEmployee,
  LineProductConfig,
  LineStatus,
  Product,
  ProductionLine,
  ProductionLineStatus,
  ProductionPlan,
  SmartStatus,
  WorkOrder,
} from '../types';

// ─── Core Metrics ───────────────────────────────────────────────────────────

export const calculateEfficiency = (current: number, target: number): number => {
  if (target === 0) return 0;
  return Math.min(Math.round((current / target) * 100), 100);
};

export const calculateWasteRatio = (waste: number, total: number): number => {
  if (total === 0) return 0;
  return Number(((waste / total) * 100).toFixed(1));
};

// ─── Formatting ─────────────────────────────────────────────────────────────

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num);
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-emerald-500';
    case 'maintenance': return 'bg-slate-400';
    case 'idle': return 'bg-slate-200';
    case 'warning': return 'bg-amber-500';
    case 'available': return 'text-emerald-500';
    case 'low': return 'text-amber-500';
    case 'out': return 'text-rose-500';
    default: return 'bg-slate-500';
  }
};

/** Returns today as "YYYY-MM-DD" */
export const getTodayDateString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Returns the first day of the current month and today as { start, end } */
export const getMonthDateRange = (): { start: string; end: string } => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return { start: `${y}-${m}-01`, end: getTodayDateString() };
};

// ─── Advanced Metrics ────────────────────────────────────────────────────────

/**
 * Average Assembly Time = sum(workers × hours) / sum(quantityProduced)
 * Returns minutes per unit.
 */
export const calculateAvgAssemblyTime = (reports: ProductionReport[]): number => {
  const totalWorkerHours = reports.reduce(
    (sum, r) => sum + (r.workersCount || 0) * (r.workHours || 0),
    0
  );
  const totalProduced = reports.reduce(
    (sum, r) => sum + (r.quantityProduced || 0),
    0
  );
  if (totalProduced === 0) return 0;
  return Number(((totalWorkerHours * 60) / totalProduced).toFixed(2));
};

/**
 * Daily Capacity = (maxWorkers × dailyWorkingHours × 60) / avgAssemblyTime
 * avgAssemblyTime in minutes.
 */
export const calculateDailyCapacity = (
  maxWorkers: number,
  dailyWorkingHours: number,
  avgAssemblyTimeMinutes: number
): number => {
  if (avgAssemblyTimeMinutes <= 0) return 0;
  return Math.floor(
    (maxWorkers * dailyWorkingHours * 60) / avgAssemblyTimeMinutes
  );
};

/**
 * Estimated Days = quantity / dailyCapacity
 */
export const calculateEstimatedDays = (
  quantity: number,
  dailyCapacity: number
): number => {
  if (dailyCapacity <= 0) return 0;
  return Number((quantity / dailyCapacity).toFixed(1));
};

/**
 * Efficiency based on standard vs actual assembly time.
 * standardAssemblyTime / actualAssemblyTime × 100
 */
export const calculateTimeEfficiency = (
  standardTime: number,
  actualTime: number
): number => {
  if (actualTime <= 0) return 0;
  return Number(((standardTime / actualTime) * 100).toFixed(1));
};

/**
 * Utilization % = actual working hours / available hours × 100
 */
export const calculateUtilization = (
  actualHours: number,
  availableHours: number
): number => {
  if (availableHours <= 0) return 0;
  return Number(((actualHours / availableHours) * 100).toFixed(1));
};

/**
 * Find the best performing line for a product (highest quantity).
 */
export const findBestLine = (
  reports: ProductionReport[],
  rawLines: FirestoreProductionLine[]
): string => {
  const lineMap = new Map<string, number>();
  reports.forEach((r) => {
    lineMap.set(r.lineId, (lineMap.get(r.lineId) || 0) + (r.quantityProduced || 0));
  });
  let bestId = '';
  let bestQty = 0;
  lineMap.forEach((qty, id) => {
    if (qty > bestQty) {
      bestQty = qty;
      bestId = id;
    }
  });
  return rawLines.find((l) => l.id === bestId)?.name ?? '—';
};

/**
 * Group reports by date for chart data.
 */
export const groupReportsByDate = (
  reports: ProductionReport[]
): { date: string; produced: number; waste: number }[] => {
  const map = new Map<string, { produced: number; waste: number }>();
  reports.forEach((r) => {
    const existing = map.get(r.date) || { produced: 0, waste: 0 };
    existing.produced += r.quantityProduced || 0;
    existing.waste += r.quantityWaste || 0;
    map.set(r.date, existing);
  });
  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Count unique dates in reports (for average daily calculations).
 */
export const countUniqueDays = (reports: ProductionReport[]): number => {
  const dates = new Set(reports.map((r) => r.date));
  return dates.size;
};

// ─── Aggregation Helpers (derive UI data from raw Firestore data) ───────────

/**
 * Build UI-ready Product[] from Firestore products + reports + configs.
 */
export const buildProducts = (
  raw: FirestoreProduct[],
  reports: ProductionReport[],
  configs: LineProductConfig[]
): Product[] => {
  return raw.map((p) => {
    const prodReports = reports.filter((r) => r.productId === p.id);
    const totalProduction = prodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0),
      0
    );
    const totalWaste = prodReports.reduce(
      (sum, r) => sum + (r.quantityWaste || 0),
      0
    );
    const config = configs.find((c) => c.productId === p.id);
    const balance = p.openingBalance + totalProduction - totalWaste;

    return {
      id: p.id!,
      name: p.name,
      code: p.code,
      imageUrl: p.imageUrl,
      category: p.model || '',
      stockLevel: balance,
      stockStatus:
        balance > 100 ? 'available' : balance > 0 ? 'low' : ('out' as const),
      openingStock: p.openingBalance,
      totalProduction,
      wasteUnits: totalWaste,
      avgAssemblyTime: config?.standardAssemblyTime ?? 0,
    };
  });
};

/**
 * Build UI-ready ProductionLine[] from Firestore lines + supporting data.
 * When productionPlans & planReports are provided, active plans drive
 * achievement/target/progress instead of today-only data.
 */
export const buildProductionLines = (
  rawLines: FirestoreProductionLine[],
  rawProducts: FirestoreProduct[],
  rawEmployees: FirestoreEmployee[],
  todayReports: ProductionReport[],
  lineStatuses: LineStatus[],
  configs: LineProductConfig[],
  productionPlans: ProductionPlan[] = [],
  planReports: Record<string, ProductionReport[]> = {},
  workOrders: WorkOrder[] = []
): ProductionLine[] => {
  return rawLines.map((line) => {
    const activePlan = productionPlans.find(
      (p) => p.lineId === line.id && (p.status === 'in_progress' || p.status === 'planned')
    );

    if (activePlan) {
      const key = `${line.id}_${activePlan.productId}`;
      const historical = planReports[key] || [];

      const todayForPlan = todayReports.filter(
        (r) => r.lineId === line.id && r.productId === activePlan.productId
      );
      const historicalIds = new Set(historical.map((r) => r.id));
      const merged = [
        ...historical,
        ...todayForPlan.filter((r) => !historicalIds.has(r.id)),
      ];

      const actualProduced = merged.reduce(
        (sum, r) => sum + (r.quantityProduced || 0), 0
      );
      const plannedQty = activePlan.plannedQuantity;
      const progress = calculatePlanProgress(actualProduced, plannedQty);

      const currentProduct =
        rawProducts.find((p) => p.id === activePlan.productId)?.name ?? '—';

      const sorted = [...merged].sort(
        (a, b) => (b.date || '').localeCompare(a.date || '')
      );
      const latest = sorted[0];
      const employeeName = latest
        ? rawEmployees.find((s) => s.id === latest.employeeId)?.name ?? '—'
        : '—';

      return {
        id: line.id!,
        name: line.name,
        code: line.id!,
        employeeName,
        status: line.status as ProductionLineStatus,
        currentProduct,
        currentProductId: activePlan.productId,
        achievement: actualProduced,
        target: plannedQty,
        workersCount: latest?.workersCount ?? 0,
        efficiency: progress,
        hoursUsed: merged.reduce((sum, r) => sum + (r.workHours || 0), 0),
      };
    }

    // Fallback: no active plan — use work order or lineStatus target
    const status = lineStatuses.find((s) => s.lineId === line.id);
    const lineReports = todayReports.filter((r) => r.lineId === line.id);

    const activeWO = workOrders.find(
      (w) => w.lineId === line.id && (w.status === 'in_progress' || w.status === 'pending')
    );

    const achievement = activeWO
      ? (activeWO.producedQuantity ?? 0)
      : lineReports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0);
    const target = activeWO ? activeWO.quantity : (status?.targetTodayQty ?? 0);
    const workersCount = lineReports.length
      ? lineReports[lineReports.length - 1].workersCount
      : 0;
    const hoursUsed = lineReports.reduce(
      (sum, r) => sum + (r.workHours || 0), 0
    );

    const currentProduct = activeWO
      ? (rawProducts.find((p) => p.id === activeWO.productId)?.name ?? '—')
      : (rawProducts.find((p) => p.id === status?.currentProductId)?.name ?? '—');

    const employeeId = lineReports.length
      ? lineReports[0].employeeId
      : undefined;
    const employeeName =
      rawEmployees.find((s) => s.id === employeeId)?.name ?? '—';

    return {
      id: line.id!,
      name: line.name,
      code: line.id!,
      employeeName,
      status: line.status as ProductionLineStatus,
      currentProduct,
      currentProductId: activeWO ? activeWO.productId : (status?.currentProductId ?? ''),
      achievement,
      target,
      workersCount,
      efficiency: calculateEfficiency(achievement, target),
      hoursUsed,
    };
  });
};

/**
 * Plan progress = (actualProduced / plannedQuantity) × 100, capped at 100.
 */
export const calculatePlanProgress = (
  actualProduced: number,
  plannedQuantity: number
): number => {
  if (plannedQuantity <= 0) return 0;
  return Math.min(Math.round((actualProduced / plannedQuantity) * 100), 100);
};

// ─── Plan-Level Computed Metrics (never stored in Firestore) ────────────────

const daysBetween = (a: string, b: string): number => {
  const msPerDay = 86_400_000;
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay
  );
};

/**
 * Progress ratio — can exceed 100 % for over-production.
 */
export const calculateProgressRatio = (
  producedQuantity: number,
  plannedQuantity: number,
): number => {
  if (plannedQuantity <= 0) return 0;
  return Number(((producedQuantity / plannedQuantity) * 100).toFixed(1));
};

/**
 * Time ratio = elapsed days / total planned days (0 – 100+).
 */
export const calculateTimeRatio = (
  startDate: string,
  plannedEndDate: string,
): number => {
  const totalDays = daysBetween(startDate, plannedEndDate);
  if (totalDays <= 0) return 100;
  const elapsed = daysBetween(startDate, getTodayDateString());
  return Number(((Math.max(elapsed, 0) / totalDays) * 100).toFixed(1));
};

/**
 * Project a forecast finish date based on current daily throughput.
 */
export const calculateForecastFinishDate = (
  startDate: string,
  producedQuantity: number,
  plannedQuantity: number,
  avgDailyTarget: number,
): string => {
  const remaining = plannedQuantity - producedQuantity;
  if (remaining <= 0) return getTodayDateString();

  const elapsed = daysBetween(startDate, getTodayDateString());
  const actualDailyRate =
    elapsed > 0 ? producedQuantity / elapsed : avgDailyTarget;
  const rate = actualDailyRate > 0 ? actualDailyRate : avgDailyTarget;
  if (rate <= 0) return '—';

  const daysToGo = Math.ceil(remaining / rate);
  const forecast = new Date();
  forecast.setDate(forecast.getDate() + daysToGo);
  const y = forecast.getFullYear();
  const m = String(forecast.getMonth() + 1).padStart(2, '0');
  const d = String(forecast.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Calendar days remaining until the planned end date.
 */
export const calculateRemainingDays = (plannedEndDate: string): number => {
  return Math.max(daysBetween(getTodayDateString(), plannedEndDate), 0);
};

/**
 * Derive a human-readable smart status from progress vs time ratios.
 */
export const calculateSmartStatus = (
  progressRatio: number,
  timeRatio: number,
  status: ProductionPlan['status'],
): SmartStatus => {
  if (status === 'completed') return 'completed';
  if (status === 'paused' || status === 'cancelled') return 'at_risk';

  const gap = timeRatio - progressRatio;
  if (gap <= 5) return 'on_track';
  if (gap <= 20) return 'at_risk';
  if (gap <= 40) return 'delayed';
  return 'critical';
};

/**
 * Add business days to a date string and return a new "YYYY-MM-DD".
 */
export const addDaysToDate = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Math.ceil(days));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Aggregate KPI values from today's reports and (optionally) monthly reports.
 */
export const buildDashboardKPIs = (
  todayReports: ProductionReport[],
  monthlyReports?: ProductionReport[]
) => {
  const todayProduction = todayReports.reduce(
    (sum, r) => sum + (r.quantityProduced || 0),
    0
  );
  const monthlyProduction = (monthlyReports ?? todayReports).reduce(
    (sum, r) => sum + (r.quantityProduced || 0),
    0
  );
  const totalWaste = todayReports.reduce(
    (sum, r) => sum + (r.quantityWaste || 0),
    0
  );
  const totalTarget = todayProduction + totalWaste;
  const efficiency =
    totalTarget > 0
      ? Number(((todayProduction / totalTarget) * 100).toFixed(1))
      : 0;
  const wasteRatio = calculateWasteRatio(totalWaste, todayProduction + totalWaste);

  return { todayProduction, monthlyProduction, totalProduction: todayProduction, efficiency, wasteRatio };
};
