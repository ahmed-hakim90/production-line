import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button, LoadingSkeleton } from '../components/UI';
import { ProductionWorkerReportPrint } from '../components/ProductionWorkerReportPrint';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { workerDailyPerformanceLogService } from '../services/workerDailyPerformanceLogService';
import { reportService } from '../services/reportService';
import { lineAssignmentService } from '../services/lineAssignmentService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import type { ProductionReport, ProductionWorker, WorkerDailyPerformanceLog } from '@/types';
import { getPresenceLabel } from '../utils/workerPresence';
import {
  buildAssignmentInfoByWorker,
  listDatesInRange,
  monthRange,
} from '../utils/workerAssignmentPresence';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type ReportKind = 'daily' | 'monthly' | 'ranking' | 'low_performance';
type PresenceFilter = 'all' | 'present' | 'absent' | 'no_target';

type ProductionWorkerReportsProps = {
  embedded?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  achieved: 'حقق الهدف',
  below_target: 'أقل من الهدف',
  over_target: 'تجاوز الهدف',
  absent: 'غائب',
  no_output: 'لا يوجد إنتاج',
  no_target: 'غير مكلف بهدف',
  leave: 'إجازة',
};

const joinLabels = (labels?: Set<string>): string => {
  const values = Array.from(labels ?? []).filter(Boolean);
  return values.length > 0 ? values.join('، ') : '—';
};

const workerIdsFromReports = (reports: ProductionReport[]): Set<string> => {
  const ids = new Set<string>();
  for (const report of reports) {
    for (const row of report.workerOutputs ?? []) {
      if (row.workerId) ids.add(row.workerId);
    }
  }
  return ids;
};

const groupLogsByWorkerAndDate = (
  logs: WorkerDailyPerformanceLog[],
): Map<string, Map<string, WorkerDailyPerformanceLog[]>> => {
  const grouped = new Map<string, Map<string, WorkerDailyPerformanceLog[]>>();
  for (const log of logs) {
    const workerId = String(log.workerId || '').trim();
    const date = String(log.date || '').trim();
    if (!workerId || !date) continue;
    const byDate = grouped.get(workerId) ?? new Map<string, WorkerDailyPerformanceLog[]>();
    const bucket = byDate.get(date) ?? [];
    bucket.push(log);
    byDate.set(date, bucket);
    grouped.set(workerId, byDate);
  }
  return grouped;
};

const buildWorkersForDailyReport = (
  workers: ProductionWorker[],
  reports: ProductionReport[],
  logs: WorkerDailyPerformanceLog[],
): ProductionWorker[] => {
  const workersById = new Map(workers.filter((worker) => worker.id).map((worker) => [worker.id!, worker]));
  const activityWorkerIds = new Set<string>([
    ...workerIdsFromReports(reports),
    ...logs.map((log) => log.workerId).filter(Boolean),
  ]);
  const activeWorkers = workers.filter((worker) => worker.isActive !== false && worker.id);
  const inactiveWithActivity = workers.filter(
    (worker) => worker.id && worker.isActive === false && activityWorkerIds.has(worker.id),
  );
  const syntheticWorkers = Array.from(activityWorkerIds)
    .filter((workerId) => !workersById.has(workerId))
    .map((workerId) => {
      const log = logs.find((row) => row.workerId === workerId);
      const reportRow = reports
        .flatMap((report) => report.workerOutputs ?? [])
        .find((row) => row.workerId === workerId);
      return {
        id: workerId,
        employeeId: log?.employeeId,
        name: log?.workerName || reportRow?.workerName || workerId,
        code: log?.workerCode || '',
        isActive: true,
        workerType: 'production' as const,
        lineIds: log?.lineId ? [log.lineId] : reportRow?.lineId ? [reportRow.lineId] : [],
      } satisfies ProductionWorker;
    });

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const pushWorker = (worker?: ProductionWorker | null) => {
    if (!worker?.id || seen.has(worker.id)) return;
    seen.add(worker.id);
    orderedIds.push(worker.id);
  };
  activeWorkers.forEach(pushWorker);
  inactiveWithActivity.forEach(pushWorker);
  syntheticWorkers.forEach(pushWorker);

  return orderedIds
    .map((workerId) => workersById.get(workerId) ?? syntheticWorkers.find((worker) => worker.id === workerId))
    .filter((worker): worker is ProductionWorker => Boolean(worker?.id));
};

const DAILY_EMPTY_MESSAGE =
  'لا توجد بيانات لهذه الفترة. لعرض الإنجاز اليومي: سجّل عمال الإنتاج واربطهم بالموظفين، عيّنهم على خطوط الإنتاج، ثم احفظ تقرير إنتاج منتج تام (وضع individual) يتضمن إنجاز العمال مع تفعيل أهداف العمال على خط/المنتج.';

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const ProductionWorkerReports: React.FC<ProductionWorkerReportsProps> = ({ embedded = false }) => {
  const { can } = usePermission();
  const canView = can('production.workerReports.view') || can('productionWorkers.view') || can('production.workers.view');
  const products = useAppStore((s) => s.products);
  const productionLines = useAppStore((s) => s.productionLines);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const rawWorkerSettings = useAppStore((s) => s.systemSettings.productionWorkerSettings);
  const workerSettings = useMemo(() => ({
    performance: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
      ...(rawWorkerSettings?.performance ?? {}),
    },
    bonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
      ...(rawWorkerSettings?.bonus ?? {}),
    },
    supervisorBonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
      ...(rawWorkerSettings?.supervisorBonus ?? {}),
      tiers: rawWorkerSettings?.supervisorBonus?.tiers?.length
        ? rawWorkerSettings.supervisorBonus.tiers
        : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
    },
  }), [rawWorkerSettings]);

  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<ReportKind>('daily');
  const [date, setDate] = useState(getTodayDateString());
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [periodPresenceSummary, setPeriodPresenceSummary] = useState({ present: 0, absent: 0, noTarget: 0 });

  const getLineName = useCallback((lineId?: string) => (
    productionLines.find((line) => line.id === lineId)?.name ?? lineId ?? '—'
  ), [productionLines]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setLoadError(null);
    try {
      const workers = await productionWorkerService.getAll();
      const activeWorkers = workers.filter((worker) => worker.isActive !== false);
      if (kind === 'daily') {
        const rangeStart = startDate <= endDate ? startDate : endDate;
        const rangeEnd = startDate <= endDate ? endDate : startDate;
        const periodDates = listDatesInRange(rangeStart, rangeEnd);
        const assignmentPromise = Promise.all(periodDates.map(async (periodDate) => {
          const assignments = productionLines.length > 0
            ? (await Promise.all(
              productionLines
                .filter((line) => line.id)
                .map((line) => lineAssignmentService.getByLineAndDate(line.id!, periodDate)),
            )).flat()
            : await lineAssignmentService.getByDate(periodDate);
          return assignments;
        })).then((groups) => groups.flat());
        const [targets, reports, dailyAssignments, performanceLogs] = await Promise.all([
          productionWorkerTargetService.getAll(),
          reportService.getByDateRange(rangeStart, rangeEnd),
          assignmentPromise,
          workerDailyPerformanceLogService.getByDateRange(rangeStart, rangeEnd),
        ]);
        const workersForReport = buildWorkersForDailyReport(workers, reports, performanceLogs);
        const logsByWorkerAndDate = groupLogsByWorkerAndDate(performanceLogs);
        const assignmentInfoByWorkerId = buildAssignmentInfoByWorker(dailyAssignments, workers, reports, getLineName);

        const dailyRows = await Promise.all(workersForReport.map(async (worker) => {
          if (!worker.id) return null;
          const workerTargets = targets.filter((target) => target.workerId === worker.id);
          const workerLogsByDate = logsByWorkerAndDate.get(worker.id);
          const achievements = await Promise.all(periodDates.map(async (periodDate) => {
            try {
              return await productionWorkerPerformanceService.getDailyAchievement(worker.id!, periodDate, {
                worker,
                targets: workerTargets,
                reports,
                products: products as never[],
                settings: workerSettings,
                lineProductConfigs,
                dailyLogs: workerLogsByDate?.get(periodDate) ?? [],
              });
            } catch (error) {
              console.error('getDailyAchievement error:', { workerId: worker.id, periodDate, error });
              return {
                workerId: worker.id!,
                date: periodDate,
                targetQty: 0,
                outputQty: 0,
                achievementPercent: 0,
                status: 'no_output' as const,
              };
            }
          }));
          const targetQty = achievements.reduce((sum, achievement) => sum + Number(achievement.targetQty || 0), 0);
          const outputQty = achievements.reduce((sum, achievement) => sum + Number(achievement.outputQty || 0), 0);
          const achievementPercent = targetQty > 0 ? Math.round((outputQty / targetQty) * 1000) / 10 : 0;
          const assignmentInfo = assignmentInfoByWorkerId.get(worker.id);
          const presentDays = assignmentInfo?.presentDays ?? 0;
          const absentDays = assignmentInfo?.absentDays ?? 0;
          const noTargetDays = assignmentInfo?.noTargetDays ?? 0;
          const rowStatus = absentDays > 0 && presentDays === 0
            ? 'absent'
            : noTargetDays > 0 && (targetQty <= 0 || !assignmentInfo?.hasProductionTarget)
              ? 'no_target'
              : outputQty > targetQty && targetQty > 0
                ? 'over_target'
                : targetQty > 0 && outputQty >= targetQty
                  ? 'achieved'
                  : outputQty > 0
                    ? 'below_target'
                    : 'no_output';
          return {
            العامل: worker.name,
            الكود: worker.code,
            الفترة: rangeStart === rangeEnd ? rangeStart : `${rangeStart} إلى ${rangeEnd}`,
            الخط: joinLabels(assignmentInfo?.lineLabels) || joinLabels(new Set(achievements.map((achievement) => getLineName(achievement.lineId)).filter(Boolean))),
            'وظيفة الخط': joinLabels(assignmentInfo?.laborRoleLabels),
            'حالة الحضور': assignmentInfo
              ? getPresenceLabel(presentDays > 0)
              : getPresenceLabel(achievements.some((achievement) => achievement.isPresent !== false)),
            الهدف: rowStatus === 'absent' || rowStatus === 'no_target' ? 'غير مطبق' : targetQty,
            الإنتاج: outputQty,
            'الإنجاز %': rowStatus === 'absent' || rowStatus === 'no_target' ? 'غير مطبق' : achievementPercent,
            الحالة: STATUS_LABELS[rowStatus] ?? rowStatus,
            'أيام حضور': presentDays,
            'أيام غياب': absentDays,
            'أيام بدون هدف': noTargetDays,
          };
        }));
        const representedWorkerIds = new Set(workersForReport.map((worker) => worker.id).filter(Boolean));
        const assignedOnlyRows = Array.from(assignmentInfoByWorkerId.entries())
          .filter(([workerId]) => !representedWorkerIds.has(workerId))
          .map(([, assignmentInfo]) => {
            const absentOnly = assignmentInfo.presentDays === 0 && assignmentInfo.absentDays > 0;
            return {
              العامل: assignmentInfo.workerName,
              الكود: assignmentInfo.workerCode,
              الفترة: rangeStart === rangeEnd ? rangeStart : `${rangeStart} إلى ${rangeEnd}`,
              الخط: joinLabels(assignmentInfo.lineLabels),
              'وظيفة الخط': joinLabels(assignmentInfo.laborRoleLabels),
              'حالة الحضور': absentOnly ? 'غائب' : 'حاضر',
              الهدف: 'غير مطبق',
              الإنتاج: 0,
              'الإنجاز %': 'غير مطبق',
              الحالة: absentOnly ? STATUS_LABELS.absent : STATUS_LABELS.no_target,
              'أيام حضور': assignmentInfo.presentDays,
              'أيام غياب': assignmentInfo.absentDays,
              'أيام بدون هدف': assignmentInfo.noTargetDays,
            };
          });
        const nextRows = [
          ...(dailyRows.filter(Boolean) as Record<string, unknown>[]),
          ...assignedOnlyRows,
        ];
        setRows(nextRows);
        setPeriodPresenceSummary({
          present: nextRows.reduce((sum, row) => sum + Number(row['أيام حضور'] || 0), 0),
          absent: nextRows.reduce((sum, row) => sum + Number(row['أيام غياب'] || 0), 0),
          noTarget: nextRows.reduce((sum, row) => sum + Number(row['أيام بدون هدف'] || 0), 0),
        });
      } else {
        const { start, end } = monthRange(month);
        const today = getTodayDateString();
        const rangeEnd = end > today ? today : end;
        const periodDates = start <= rangeEnd ? listDatesInRange(start, rangeEnd) : [];
        const monthlyAssignmentsPromise = Promise.all(periodDates.map(async (periodDate) => {
          const assignments = productionLines.length > 0
            ? (await Promise.all(
              productionLines
                .filter((line) => line.id)
                .map((line) => lineAssignmentService.getByLineAndDate(line.id!, periodDate)),
            )).flat()
            : await lineAssignmentService.getByDate(periodDate);
          return assignments;
        })).then((groups) => groups.flat());
        const [targets, monthlyAssignments, monthlyReports] = await Promise.all([
          productionWorkerTargetService.getAll(),
          monthlyAssignmentsPromise,
          periodDates.length > 0 ? reportService.getByDateRange(start, rangeEnd) : Promise.resolve([]),
        ]);
        const { monthlyByWorkerId } =
          await productionWorkerPerformanceService.getWorkersListPerformanceSnapshot({
            workers: activeWorkers,
            targets,
            month,
            date,
            settings: workerSettings,
            products: products as never[],
            lineProductConfigs,
          });
        const assignmentInfoByWorkerId = buildAssignmentInfoByWorker(monthlyAssignments, workers, monthlyReports, getLineName);
        let result = activeWorkers
          .filter((worker) => worker.id && monthlyByWorkerId.has(worker.id))
          .map((worker) => {
            const stats = monthlyByWorkerId.get(worker.id!)!;
            const assignmentInfo = assignmentInfoByWorkerId.get(worker.id!);
            const presentDays = assignmentInfo?.presentDays ?? stats.presentDays;
            const absentDays = assignmentInfo?.absentDays ?? stats.absentDays;
            const attendanceDenominator = presentDays + absentDays;
            const attendanceRate = attendanceDenominator > 0
              ? Math.round((presentDays / attendanceDenominator) * 1000) / 10
              : 0;
            return {
              العامل: worker.name,
              الكود: worker.code,
              الشهر: month,
              'أيام العمل': stats.workingDays,
              'أيام حضور': presentDays,
              'أيام غياب': absentDays,
              'أيام بدون هدف': assignmentInfo?.noTargetDays ?? 0,
              'هدف الشهر': stats.monthlyTarget,
              'إنتاج الشهر': stats.monthlyOutput,
              'إنجاز الشهر %': stats.monthlyAchievement,
              'نسبة الحضور %': attendanceRate,
              الدرجة: stats.performanceScore,
              'تقدير المكافأة': stats.bonusEstimate,
            };
          });
        if (kind === 'ranking') {
          result = [...result].sort((a, b) => Number(b['إنجاز الشهر %'] || 0) - Number(a['إنجاز الشهر %'] || 0));
        }
        if (kind === 'low_performance') {
          const threshold = workerSettings.performance.achievementWarningThreshold ?? 80;
          result = result.filter((row) => Number(row['إنجاز الشهر %'] || 0) < threshold);
        }
        setRows(result);
        setPeriodPresenceSummary({
          present: result.reduce((sum, row) => sum + Number(row['أيام حضور'] || 0), 0),
          absent: result.reduce((sum, row) => sum + Number(row['أيام غياب'] || 0), 0),
          noTarget: result.reduce((sum, row) => sum + Number(row['أيام بدون هدف'] || 0), 0),
        });
      }
    } catch (error) {
      console.error('ProductionWorkerReports load error:', error);
      setLoadError('تعذر تحميل التقرير. حاول التحديث مرة أخرى.');
      setRows([]);
      setPeriodPresenceSummary({ present: 0, absent: 0, noTarget: 0 });
    } finally {
      setLoading(false);
    }
  }, [canView, kind, date, startDate, endDate, month, products, productionLines, getLineName, lineProductConfigs, workerSettings]);

  useEffect(() => { void load(); }, [load]);

  const title = useMemo(() => {
    switch (kind) {
      case 'daily': return 'تقرير الإنجاز اليومي للعمال';
      case 'monthly': return 'تقرير الإنجاز الشهري للعمال';
      case 'ranking': return 'ترتيب العمال الشهري';
      case 'low_performance': return 'تقرير الأداء المنخفض';
      default: return 'تقارير عمال الإنتاج';
    }
  }, [kind]);

  const filteredRows = useMemo(() => {
    if (presenceFilter === 'all') return rows;
    return rows.filter((row) => {
      const present = Number(row['أيام حضور'] || 0);
      const absent = Number(row['أيام غياب'] || 0);
      const noTarget = Number(row['أيام بدون هدف'] || 0);
      if (presenceFilter === 'present') return present > 0;
      if (presenceFilter === 'absent') return absent > 0;
      return noTarget > 0;
    });
  }, [presenceFilter, rows]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const suffix = kind === 'daily' ? `${startDate}_to_${endDate}` : month;
    saveAs(new Blob([buf]), `worker_report_${kind}_${suffix}.xlsx`);
  };

  const exportPdf = async () => {
    if (!printRef.current || filteredRows.length === 0) return;
    setExportingPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const { exportToPDF } = await import('../../../utils/reportExport');
      const suffix = kind === 'daily' ? `${startDate}_to_${endDate}` : month;
      await exportToPDF(printRef.current, `worker_report_${kind}_${suffix}`, {
        paperSize: 'a4',
        orientation: 'landscape',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const printColumns = useMemo(() => (filteredRows[0] ? Object.keys(filteredRows[0]) : []), [filteredRows]);
  const periodLabel = kind === 'daily'
    ? `الفترة: ${startDate} إلى ${endDate}`
    : `الشهر: ${month}`;
  const printSubtitle = `${periodLabel} | أيام حضور: ${formatNumber(periodPresenceSummary.present)} | أيام غياب: ${formatNumber(periodPresenceSummary.absent)} | أيام بدون هدف: ${formatNumber(periodPresenceSummary.noTarget)}`;
  const emptyMessage = loadError
    ?? (kind === 'daily' ? DAILY_EMPTY_MESSAGE : 'لا توجد بيانات للفترة المحددة.');

  if (!canView) {
    return <Card><p className="p-4 text-sm">غير مصرح بعرض تقارير عمال الإنتاج</p></Card>;
  }

  return (
    <div className="space-y-4">
      {embedded ? (
        <Card>
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-[var(--color-text)]">{title}</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">تقارير الأداء والمكافآت من نفس مساحة العمال.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportExcel}>تصدير Excel</Button>
              <Button
                onClick={() => void exportPdf()}
                disabled={exportingPdf || loading || filteredRows.length === 0}
              >
                {exportingPdf ? 'جاري التصدير...' : 'تصدير PDF'}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <PageHeader
          title={title}
          subtitle="تقارير الأداء والمكافآت"
          secondaryAction={{ label: 'تصدير Excel', onClick: exportExcel }}
          primaryAction={{
            label: exportingPdf ? 'جاري التصدير...' : 'تصدير PDF',
            onClick: () => void exportPdf(),
            disabled: exportingPdf || loading || filteredRows.length === 0,
          }}
        />
      )}
      <Card>
        <div className="flex flex-wrap gap-3 p-4 border-b border-[var(--color-border)]">
          <select className="border rounded-lg p-2" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            <option value="daily">إنجاز يومي</option>
            <option value="monthly">إنجاز شهري</option>
            <option value="ranking">ترتيب شهري</option>
            <option value="low_performance">أداء منخفض</option>
          </select>
          {kind === 'daily' ? (
            <>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                من
                <input type="date" className="border rounded-lg p-2 text-[var(--color-text)]" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                إلى
                <input type="date" className="border rounded-lg p-2 text-[var(--color-text)]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </>
          ) : (
            <input type="month" className="border rounded-lg p-2" value={month} onChange={(e) => setMonth(e.target.value)} />
          )}
          <select className="border rounded-lg p-2" value={presenceFilter} onChange={(e) => setPresenceFilter(e.target.value as PresenceFilter)}>
            <option value="all">كل الحضور</option>
            <option value="present">حاضر</option>
            <option value="absent">غائب</option>
            <option value="no_target">غير مكلف بهدف</option>
          </select>
          <Button onClick={() => void load()}>تحديث</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 border-b border-[var(--color-border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-xs font-bold text-[var(--color-text-muted)]">الصفوف المعروضة</div>
            <div className="mt-1 text-xl font-black text-[var(--color-text)]">{formatNumber(filteredRows.length)}</div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-center">
            <div className="text-xs font-bold text-emerald-700">أيام حضور</div>
            <div className="mt-1 text-xl font-black text-emerald-700">{formatNumber(periodPresenceSummary.present)}</div>
          </div>
          <div className="rounded-xl bg-rose-50 p-3 text-center">
            <div className="text-xs font-bold text-rose-700">أيام غياب</div>
            <div className="mt-1 text-xl font-black text-rose-700">{formatNumber(periodPresenceSummary.absent)}</div>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-center">
            <div className="text-xs font-bold text-amber-700">أيام بدون هدف</div>
            <div className="mt-1 text-xl font-black text-amber-700">{formatNumber(periodPresenceSummary.noTarget)}</div>
          </div>
        </div>
        {loading ? <LoadingSkeleton rows={6} /> : (
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  {filteredRows[0] ? Object.keys(filteredRows[0]).map((key) => <th key={key} className="text-right py-2 px-2">{key}</th>) : null}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-[var(--color-border)]">
                    {Object.values(row).map((val, i) => (
                      <td key={i} className="py-2 px-2 tabular-nums">{typeof val === 'number' ? formatNumber(val) : String(val ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <p className="text-sm leading-6 text-[var(--color-text-muted)]">{emptyMessage}</p>
            )}
          </div>
        )}
      </Card>

      <ProductionWorkerReportPrint
        ref={printRef}
        title={title}
        subtitle={printSubtitle}
        columns={printColumns}
        rows={filteredRows}
      />
    </div>
  );
};
