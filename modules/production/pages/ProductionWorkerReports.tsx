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
import { reportService } from '../services/reportService';
import { lineAssignmentService } from '../services/lineAssignmentService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, type LineWorkerAssignment, type ProductionReport, type ProductionWorker } from '@/types';
import { getPresenceLabel } from '../utils/workerPresence';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  isProductionLaborRole,
  resolveLineWorkerLaborRole,
} from '../utils/lineWorkerLaborRoles';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type ReportKind = 'daily' | 'monthly' | 'ranking' | 'low_performance';
type PresenceFilter = 'all' | 'present' | 'absent' | 'no_target';

type ProductionWorkerReportsProps = {
  embedded?: boolean;
};

type DailyAssignmentInfo = {
  workerName: string;
  workerCode: string;
  laborRoleLabels: Set<string>;
  lineLabels: Set<string>;
  presentDays: number;
  absentDays: number;
  noTargetDays: number;
  hasProductionTarget: boolean;
};

const monthRange = (month: string): { start: string; end: string } => {
  const [year, rawMonth] = month.split('-').map(Number);
  const lastDay = new Date(year, rawMonth, 0).getDate();
  const mm = String(rawMonth).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
};

const listDatesInRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
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

const buildAssignmentInfoByWorker = (
  assignments: LineWorkerAssignment[],
  workers: ProductionWorker[],
  reports: ProductionReport[],
  getLineName: (lineId?: string) => string,
): Map<string, DailyAssignmentInfo> => {
  const workerByEmployeeId = new Map(
    workers
      .filter((worker) => worker.employeeId)
      .map((worker) => [worker.employeeId!, worker]),
  );
  const assignmentInfoByWorkerId = new Map<string, DailyAssignmentInfo>();
  const dayPresenceByWorkerId = new Map<string, Map<string, { hasPresent: boolean; hasAbsent: boolean; hasTarget: boolean; hasNoTargetCandidate: boolean }>>();
  assignments.forEach((assignment) => {
    const worker = workerByEmployeeId.get(assignment.employeeId);
    const workerId = worker?.id;
    const workerKey = workerId || `employee:${assignment.employeeId || assignment.id || assignment.employeeName}`;
    const role = resolveLineWorkerLaborRole(assignment.laborRole);
    const isPresent = assignment.isPresent !== false;
    const hasTargetOutput = Boolean(workerId) && reports.some((report) => (
      report.date === assignment.date
      && report.lineId === assignment.lineId
      && (report.workerOutputs ?? []).some((row) => (
        row.workerId === workerId
        && row.isPresent !== false
        && Number(row.dailyTargetQty || 0) > 0
      ))
    ));
    const noTarget = isPresent && (!isProductionLaborRole(role) || !hasTargetOutput);
    const current = assignmentInfoByWorkerId.get(workerKey) ?? {
      workerName: worker?.name || assignment.employeeName || assignment.employeeId || '—',
      workerCode: worker?.code || assignment.employeeCode || '',
      laborRoleLabels: new Set<string>(),
      lineLabels: new Set<string>(),
      presentDays: 0,
      absentDays: 0,
      noTargetDays: 0,
      hasProductionTarget: false,
    };
    current.workerName = current.workerName || worker?.name || assignment.employeeName || '—';
    current.workerCode = current.workerCode || worker?.code || assignment.employeeCode || '';
    current.laborRoleLabels.add(LINE_WORKER_LABOR_ROLE_LABELS[role]);
    current.lineLabels.add(getLineName(assignment.lineId));
    current.hasProductionTarget = current.hasProductionTarget || hasTargetOutput;
    assignmentInfoByWorkerId.set(workerKey, current);

    const workerDays = dayPresenceByWorkerId.get(workerKey) ?? new Map<string, { hasPresent: boolean; hasAbsent: boolean; hasTarget: boolean; hasNoTargetCandidate: boolean }>();
    const dateKey = assignment.date || assignment.id || `${workerKey}:${workerDays.size}`;
    const day = workerDays.get(dateKey) ?? { hasPresent: false, hasAbsent: false, hasTarget: false, hasNoTargetCandidate: false };
    if (isPresent) day.hasPresent = true;
    else day.hasAbsent = true;
    day.hasTarget = day.hasTarget || hasTargetOutput;
    day.hasNoTargetCandidate = day.hasNoTargetCandidate || noTarget;
    workerDays.set(dateKey, day);
    dayPresenceByWorkerId.set(workerKey, workerDays);
  });

  dayPresenceByWorkerId.forEach((workerDays, workerKey) => {
    const current = assignmentInfoByWorkerId.get(workerKey);
    if (!current) return;
    workerDays.forEach((day) => {
      if (day.hasPresent) {
        current.presentDays += 1;
        if (!day.hasTarget && day.hasNoTargetCandidate) current.noTargetDays += 1;
      } else if (day.hasAbsent) {
        current.absentDays += 1;
      }
    });
  });
  return assignmentInfoByWorkerId;
};

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
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [periodPresenceSummary, setPeriodPresenceSummary] = useState({ present: 0, absent: 0, noTarget: 0 });

  const getLineName = useCallback((lineId?: string) => (
    productionLines.find((line) => line.id === lineId)?.name ?? lineId ?? '—'
  ), [productionLines]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const workers = await productionWorkerService.getAll();
      const activeWorkers = workers.filter((w) => w.isActive !== false);
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
        const [targets, reports, dailyAssignments] = await Promise.all([
          productionWorkerTargetService.getAll(),
          reportService.getByDateRange(rangeStart, rangeEnd),
          assignmentPromise,
        ]);
        const assignmentInfoByWorkerId = buildAssignmentInfoByWorker(dailyAssignments, workers, reports, getLineName);

        const dailyRows = await Promise.all(activeWorkers.map(async (worker) => {
          if (!worker.id) return null;
          const workerTargets = targets.filter((target) => target.workerId === worker.id);
          const achievements = await Promise.all(periodDates.map((periodDate) => (
            productionWorkerPerformanceService.getDailyAchievement(worker.id!, periodDate, {
              worker,
              targets: workerTargets,
              reports,
              products: products as never[],
              settings: workerSettings,
              lineProductConfigs,
            })
          )));
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
        const representedWorkerIds = new Set(activeWorkers.map((worker) => worker.id).filter(Boolean));
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
            {filteredRows.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">لا توجد بيانات</p>}
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
