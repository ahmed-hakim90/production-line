/**
 * Business calculations for Production ERP
 * All derived values live here or in Zustand selectors — never in Firestore.
 */

import type {
  ProductionReport,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreSupervisor,
  LineProductConfig,
  LineStatus,
  Product,
  ProductionLine,
  ProductionLineStatus,
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
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('ar-EG').format(num);
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
 */
export const buildProductionLines = (
  rawLines: FirestoreProductionLine[],
  rawProducts: FirestoreProduct[],
  rawSupervisors: FirestoreSupervisor[],
  todayReports: ProductionReport[],
  lineStatuses: LineStatus[],
  configs: LineProductConfig[]
): ProductionLine[] => {
  return rawLines.map((line) => {
    const status = lineStatuses.find((s) => s.lineId === line.id);
    const lineReports = todayReports.filter((r) => r.lineId === line.id);

    const achievement = lineReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0),
      0
    );
    const target = status?.targetTodayQty ?? 0;
    const workersCount = lineReports.length
      ? lineReports[lineReports.length - 1].workersCount
      : 0;
    const hoursUsed = lineReports.reduce(
      (sum, r) => sum + (r.workHours || 0),
      0
    );

    // Find product name via line_status → product
    const currentProduct =
      rawProducts.find((p) => p.id === status?.currentProductId)?.name ?? '—';

    // Find supervisor name (first config that maps to this line → supervisor from reports, or fallback)
    const supervisorId = lineReports.length
      ? lineReports[0].supervisorId
      : undefined;
    const supervisorName =
      rawSupervisors.find((s) => s.id === supervisorId)?.name ?? '—';

    return {
      id: line.id!,
      name: line.name,
      code: line.id!,
      supervisorName,
      status: line.status as ProductionLineStatus,
      currentProduct,
      achievement,
      target,
      workersCount,
      efficiency: calculateEfficiency(achievement, target),
      hoursUsed,
    };
  });
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
