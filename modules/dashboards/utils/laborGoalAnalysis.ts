import type { LineProductConfig, ProductionReport } from '@/types';

export type LaborGoalPeriodKey = 'day' | 'week' | 'month';

export interface LaborGoalPeriod {
  key: LaborGoalPeriodKey;
  label: string;
  targetQty: number;
  actualQty: number;
  previousQty: number;
  achievement: number;
  remainingQty: number;
  deltaPercent: number | null;
  productivity: number;
  activeDays: number;
  status: {
    label: string;
    variant: 'success' | 'warning' | 'danger' | 'neutral';
  };
  comparisonLabel: string;
  recommendation: string;
}

export interface LaborGoalsAnalysis {
  periods: LaborGoalPeriod[];
  averageAchievement: number;
  weakestPeriod: LaborGoalPeriod | undefined;
  totalRemainingQty: number;
  totalTargetQty: number;
  totalActualQty: number;
  hasConfiguredTargets: boolean;
  summary: string;
}

const formatDateISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDate = (date: string) => new Date(`${date}T00:00:00`);

const addDays = (date: string, days: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
};

const filterBetween = (rows: ProductionReport[], start: string, end: string) => rows.filter((row) => {
  const rowDate = String(row.date || '');
  return rowDate >= start && rowDate <= end;
});

const formatQty = (value: number) => new Intl.NumberFormat('ar-EG').format(value);

function resolveReportGoal(report: ProductionReport, lineProductConfigs: LineProductConfig[]) {
  const workerOutputRows = (report.workerOutputs ?? []).filter((row) => Number(row.dailyTargetQty || 0) > 0);
  if (workerOutputRows.length > 0) {
    return workerOutputRows.reduce(
      (acc, row) => ({
        targetQty: acc.targetQty + Number(row.dailyTargetQty || 0),
        actualQty: acc.actualQty + Number(row.outputQty || 0),
      }),
      { targetQty: 0, actualQty: 0 },
    );
  }

  const lineProductTarget = Number(
    lineProductConfigs.find((config) => config.lineId === report.lineId && config.productId === report.productId)
      ?.dailyWorkerTargetQty || 0,
  );
  if (lineProductTarget <= 0) return { targetQty: 0, actualQty: 0 };

  return {
    targetQty: lineProductTarget * Number(report.workersCount || 0),
    actualQty: Number(report.quantityProduced || 0),
  };
}

function summarizeRows(rows: ProductionReport[], lineProductConfigs: LineProductConfig[]) {
  return rows.reduce(
    (acc, report) => {
      const goal = resolveReportGoal(report, lineProductConfigs);
      acc.targetQty += goal.targetQty;
      acc.actualQty += goal.actualQty;
      return acc;
    },
    { targetQty: 0, actualQty: 0 },
  );
}

function buildPeriod(
  key: LaborGoalPeriodKey,
  label: string,
  currentRows: ProductionReport[],
  previousRows: ProductionReport[],
  lineProductConfigs: LineProductConfig[],
): LaborGoalPeriod {
  const current = summarizeRows(currentRows, lineProductConfigs);
  const previous = summarizeRows(previousRows, lineProductConfigs);
  const achievement = current.targetQty > 0 ? Math.round((current.actualQty / current.targetQty) * 100) : 0;
  const remainingQty = Math.max(0, current.targetQty - current.actualQty);
  const deltaPercent = previous.actualQty > 0
    ? Math.round(((current.actualQty - previous.actualQty) / previous.actualQty) * 100)
    : null;
  const productivity = current.targetQty > 0
    ? Number((current.actualQty / current.targetQty).toFixed(2))
    : 0;
  const activeDays = new Set(currentRows.map((report) => report.date)).size;
  const status = current.targetQty <= 0
    ? { label: 'غير مهيأ', variant: 'neutral' as const }
    : achievement >= 100
      ? { label: 'مكتمل', variant: 'success' as const }
      : achievement >= 85
        ? { label: 'قريب من الهدف', variant: 'warning' as const }
        : { label: 'يحتاج متابعة', variant: 'danger' as const };
  const comparisonLabel = deltaPercent === null
    ? 'لا توجد بيانات كافية للمقارنة السابقة'
    : deltaPercent === 0
      ? 'مطابق للفترة السابقة'
      : `${deltaPercent > 0 ? 'أعلى' : 'أقل'} ${Math.abs(deltaPercent)}% من الفترة السابقة`;
  const recommendation = current.targetQty <= 0
    ? 'أضف هدف عامل يومي للخط/المنتج أو فعّل مخرجات العمال في التقارير لاحتساب الإنجاز.'
    : achievement >= 100
      ? 'حافظ على نفس توزيع العمالة وراقب الإنتاج مقابل الهدف لكل عامل.'
      : achievement >= 85
        ? 'الفجوة بسيطة؛ راجع العمال الأقل تحقيقاً قبل نهاية الفترة.'
        : 'راجع توزيع العمال على الخطوط النشطة وأسباب انخفاض الإنتاج مقابل الهدف.';

  return {
    key,
    label,
    targetQty: current.targetQty,
    actualQty: current.actualQty,
    previousQty: previous.actualQty,
    achievement,
    remainingQty,
    deltaPercent,
    productivity,
    activeDays,
    status,
    comparisonLabel,
    recommendation,
  };
}

export function buildLaborGoalsAnalysis(params: {
  productionReports: ProductionReport[];
  previousMonthProductionReports: ProductionReport[];
  lineProductConfigs: LineProductConfig[];
  endDate?: string;
}): LaborGoalsAnalysis {
  const { productionReports, previousMonthProductionReports, lineProductConfigs } = params;
  const endDate = params.endDate || formatDateISO(new Date());
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const dayPrevious = addDays(endDate, -1);
  const weekStart = addDays(endDate, -6);
  const previousWeekStart = addDays(endDate, -13);
  const previousWeekEnd = addDays(endDate, -7);
  const monthPreviousRows = previousMonthProductionReports.length > 0
    ? previousMonthProductionReports
    : filterBetween(productionReports, addDays(monthStart, -31), addDays(monthStart, -1));

  const periods = [
    buildPeriod(
      'day',
      'اليوم',
      filterBetween(productionReports, endDate, endDate),
      filterBetween(productionReports, dayPrevious, dayPrevious),
      lineProductConfigs,
    ),
    buildPeriod(
      'week',
      'الأسبوع',
      filterBetween(productionReports, weekStart, endDate),
      filterBetween(productionReports, previousWeekStart, previousWeekEnd),
      lineProductConfigs,
    ),
    buildPeriod(
      'month',
      'الشهر حتى الآن',
      filterBetween(productionReports, monthStart, endDate),
      monthPreviousRows,
      lineProductConfigs,
    ),
  ];

  const configuredPeriods = periods.filter((period) => period.targetQty > 0);
  const averageAchievement = configuredPeriods.length > 0
    ? Math.round(configuredPeriods.reduce((sum, period) => sum + period.achievement, 0) / configuredPeriods.length)
    : 0;
  const weakestPeriod = configuredPeriods.slice().sort((a, b) => a.achievement - b.achievement)[0];
  const totalRemainingQty = configuredPeriods.reduce((sum, period) => sum + period.remainingQty, 0);
  const totalTargetQty = configuredPeriods.reduce((sum, period) => sum + period.targetQty, 0);
  const totalActualQty = configuredPeriods.reduce((sum, period) => sum + period.actualQty, 0);
  const hasConfiguredTargets = configuredPeriods.length > 0;
  const summary = !hasConfiguredTargets
    ? 'لا توجد أهداف إنتاج عمال مهيأة لهذه الفترة؛ أضف أهداف الخط/المنتج أو سجّل مخرجات العمال حتى تظهر نسبة الإنجاز.'
    : weakestPeriod && weakestPeriod.achievement < 85
      ? `أضعف نقطة حالياً في ${weakestPeriod.label} بنسبة ${weakestPeriod.achievement}%؛ الأولوية لتعويض ${formatQty(Math.round(weakestPeriod.remainingQty))} وحدة إنتاج.`
      : `متوسط تحقيق أهداف العمالة ${averageAchievement}% بناءً على ${formatQty(Math.round(totalTargetQty))} وحدة مستهدفة.`;

  return {
    periods,
    averageAchievement,
    weakestPeriod,
    totalRemainingQty,
    totalTargetQty,
    totalActualQty,
    hasConfiguredTargets,
    summary,
  };
}
