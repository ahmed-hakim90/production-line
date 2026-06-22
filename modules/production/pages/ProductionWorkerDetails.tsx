import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '@/components/PageHeader';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { reportService } from '../services/reportService';
import { lineAssignmentService } from '../services/lineAssignmentService';
import { getPresenceLabel, summarizeWorkerPresenceDays } from '../utils/workerPresence';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  isProductionLaborRole,
  resolveLineWorkerLaborRole,
} from '../utils/lineWorkerLaborRoles';
import {
  DEFAULT_PRODUCTION_WORKER_SETTINGS,
  type LineWorkerAssignment,
  type ProductionReport,
  type ProductionWorker,
  type ProductionWorkerTarget,
  type WorkerDailyAchievement,
  type WorkerDailyAchievementStatus,
} from '@/types';
import { ProductionWorkerLineAssignmentsSection } from '../components/ProductionWorkerLineAssignmentsSection';

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

const STATUS_LABELS: Record<WorkerDailyAchievementStatus, string> = {
  achieved: 'حقق الهدف',
  below_target: 'أقل من الهدف',
  over_target: 'تجاوز الهدف',
  absent: 'غائب',
  no_output: 'لا يوجد إنتاج',
  no_target: 'غير مكلف بهدف',
  leave: 'إجازة',
};

const STATUS_BADGE_VARIANTS: Record<WorkerDailyAchievementStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  achieved: 'success',
  below_target: 'warning',
  over_target: 'success',
  absent: 'danger',
  no_output: 'warning',
  no_target: 'neutral',
  leave: 'info',
};

type WorkerDailyBreakdownRow = {
  date: string;
  presenceLabel: string;
  lineLabel: string;
  roleLabel: string;
  productionBehavior: string;
  presentDays: number;
  absentDays: number;
  noTargetDays: number;
  targetLabel: string;
  outputLabel: string;
  achievementLabel: string;
  status: WorkerDailyAchievementStatus;
};

const joinLabels = (labels: Iterable<string | undefined>): string => {
  const values = Array.from(new Set(Array.from(labels).filter(Boolean) as string[]));
  return values.length > 0 ? values.join('، ') : '—';
};

export const ProductionWorkerDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManageTargets = can('production.workerTargets.manage') || can('production.workers.manage');
  const canManageWorkers = can('production.workers.manage');

  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
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
  const [worker, setWorker] = useState<ProductionWorker | null>(null);
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof productionLineWorkerAssignmentService.getByWorker>>>([]);
  const [targets, setTargets] = useState<ProductionWorkerTarget[]>([]);
  const [dailyHistory, setDailyHistory] = useState<WorkerDailyAchievement[]>([]);
  const [monthStats, setMonthStats] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getMonthlyAchievement>> | null>(null);
  const [todayStats, setTodayStats] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getDailyAchievement>> | null>(null);
  const initialMonth = searchParams.get('month') || searchParams.get('date')?.slice(0, 7) || currentMonth();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [lineAssignmentsByDate, setLineAssignmentsByDate] = useState<Map<string, LineWorkerAssignment[]>>(new Map());
  const [targetForm, setTargetForm] = useState({
    productId: '',
    lineId: '',
    dailyTargetQty: 0,
    effectiveFrom: getTodayDateString(),
  });

  const activeTab = searchParams.get('tab') === 'targets' ? 'targets' : 'overview';
  const today = getTodayDateString();
  const selectedRange = useMemo(() => monthRange(selectedMonth), [selectedMonth]);
  const selectedRangeEnd = selectedRange.end > today ? today : selectedRange.end;
  const periodDates = useMemo(
    () => (selectedRange.start <= selectedRangeEnd ? listDatesInRange(selectedRange.start, selectedRangeEnd) : []),
    [selectedRange.start, selectedRangeEnd],
  );

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [w, a, t, monthly, daily, reports] = await Promise.all([
          productionWorkerService.getById(id),
          productionLineWorkerAssignmentService.getByWorker(id),
          productionWorkerTargetService.getByWorker(id),
          productionWorkerPerformanceService.getMonthlyAchievement(id, selectedMonth, {
            settings: workerSettings,
            products: products as never[],
            lineProductConfigs,
          }),
          productionWorkerPerformanceService.getDailyAchievement(id, today, {
            products: products as never[],
            settings: workerSettings,
            lineProductConfigs,
          }),
          reportService.getByDateRange(selectedRange.start, selectedRange.end),
        ]);
        if (cancelled) return;
        const lineAssignmentGroups = await Promise.all(periodDates.map(async (date) => {
          const rows = productionLines.length > 0
            ? (await Promise.all(
              productionLines
                .filter((line) => line.id)
                .map((line) => lineAssignmentService.getByLineAndDate(line.id!, date)),
            )).flat()
            : await lineAssignmentService.getByDate(date);
          return [date, rows] as const;
        }));
        if (cancelled) return;
        setWorker(w);
        setAssignments(a);
        setTargets(t);
        setMonthStats(monthly);
        setTodayStats(daily);
        setPeriodReports(reports);
        setLineAssignmentsByDate(new Map(lineAssignmentGroups));
        const history: WorkerDailyAchievement[] = [];
        for (const date of periodDates) {
          history.push(await productionWorkerPerformanceService.getDailyAchievement(id, date, {
            worker: w ?? undefined,
            targets: t,
            reports: reports.filter((report) => report.date === date),
            settings: workerSettings,
            products: products as never[],
            lineProductConfigs,
          }));
        }
        setDailyHistory(history);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, selectedMonth, today, products, productionLines, lineProductConfigs, workerSettings, periodDates, selectedRange.end, selectedRange.start]);

  const linkedEmployee = useMemo(
    () => _rawEmployees.find((e) => e.id === worker?.employeeId) ?? null,
    [_rawEmployees, worker?.employeeId],
  );

  const getLineName = (lineId: string) => productionLines.find((l) => l.id === lineId)?.name ?? lineId;
  const getProductName = (productId: string) => products.find((p) => p.id === productId)?.name ?? productId;

  const dailyBreakdown = useMemo<WorkerDailyBreakdownRow[]>(() => {
    if (!worker) return [];
    const achievementsByDate = new Map(dailyHistory.map((row) => [row.date, row]));
    return dailyHistory.map((achievement) => {
      const dayAssignments = worker.employeeId
        ? (lineAssignmentsByDate.get(achievement.date) ?? []).filter((row) => row.employeeId === worker.employeeId)
        : [];
      const dayReports = periodReports.filter((report) => report.date === achievement.date);
      const outputRows = dayReports.flatMap((report) => (
        report.workerOutputs ?? []
      ).filter((row) => row.workerId === worker.id));
      const fallbackPresenceRows = outputRows.map((row) => ({ workerId: row.workerId, date: achievement.date, isPresent: row.isPresent }));
      const presence = summarizeWorkerPresenceDays(
        dayAssignments.length > 0
          ? dayAssignments.map((row) => ({ workerId: worker.id, date: row.date || achievement.date, isPresent: row.isPresent }))
          : fallbackPresenceRows,
      );
      const lineLabels = joinLabels([
        ...dayAssignments.map((row) => getLineName(row.lineId)),
        ...outputRows.map((row) => row.lineName || getLineName(row.lineId)),
        achievement.lineId ? getLineName(achievement.lineId) : undefined,
      ]);
      const roleEntries = dayAssignments.map((row) => resolveLineWorkerLaborRole(row.laborRole));
      const roleLabels = joinLabels(roleEntries.map((role) => LINE_WORKER_LABOR_ROLE_LABELS[role]));
      const hasApplicableTarget = outputRows.some((row) => row.isPresent !== false && Number(row.dailyTargetQty || 0) > 0)
        || (presence.totalDays === 0 && achievement.targetQty > 0);
      const hasNoTargetAssignment = dayAssignments.length > 0
        ? dayAssignments.some((assignment) => {
          if (assignment.isPresent === false) return false;
          const role = resolveLineWorkerLaborRole(assignment.laborRole);
          const lineHasTarget = outputRows.some((row) => row.lineId === assignment.lineId && row.isPresent !== false && Number(row.dailyTargetQty || 0) > 0);
          return !isProductionLaborRole(role) || !lineHasTarget;
        })
        : (presence.presentDays > 0 && !hasApplicableTarget);
      const noTargetDays = presence.presentDays > 0 && !hasApplicableTarget && hasNoTargetAssignment ? 1 : 0;
      const status = achievement.status === 'absent'
        ? achievement.status
        : noTargetDays > 0 && !hasApplicableTarget
          ? 'no_target'
          : achievement.status;
      const hasTeamReport = dayReports.some((report) => {
        const assignmentLines = new Set(dayAssignments.map((assignment) => assignment.lineId));
        const sameLine = assignmentLines.size === 0 || assignmentLines.has(report.lineId);
        const product = (products as Array<{ id?: string; assemblyMode?: string }>).find((p) => p.id === report.productId);
        return sameLine && product?.assemblyMode === 'team';
      });
      const productionBehavior = hasApplicableTarget
        ? 'إنتاج فردي'
        : hasTeamReport
          ? 'إنتاج جماعي'
          : 'غير مكلف بهدف';
      const targetApplies = !['absent', 'leave', 'no_target'].includes(status);
      return {
        date: achievement.date,
        presenceLabel: presence.totalDays === 0 ? 'لا يوجد تكليف' : getPresenceLabel(presence.presentDays > 0),
        lineLabel: lineLabels,
        roleLabel: roleLabels,
        productionBehavior,
        presentDays: presence.presentDays,
        absentDays: presence.absentDays,
        noTargetDays,
        targetLabel: targetApplies ? formatNumber(achievement.targetQty) : 'غير مطبق',
        outputLabel: targetApplies || achievement.outputQty > 0 ? formatNumber(achievement.outputQty) : 'غير مطبق',
        achievementLabel: targetApplies ? `${achievement.achievementPercent}%` : 'غير مطبق',
        status,
      };
    }).filter((row) => achievementsByDate.has(row.date));
  }, [dailyHistory, getLineName, lineAssignmentsByDate, periodReports, products, worker]);

  const periodPresence = useMemo(() => {
    const totalDays = dailyBreakdown.reduce((sum, row) => sum + row.presentDays + row.absentDays, 0);
    const present = dailyBreakdown.reduce((sum, row) => sum + row.presentDays, 0);
    const absent = dailyBreakdown.reduce((sum, row) => sum + row.absentDays, 0);
    const noTarget = dailyBreakdown.reduce((sum, row) => sum + row.noTargetDays, 0);
    return {
      present,
      absent,
      noTarget,
      percentage: totalDays > 0 ? Math.round((present / totalDays) * 1000) / 10 : 0,
    };
  }, [dailyBreakdown]);

  const roleSummary = useMemo(() => {
    const counts = new Map<string, number>();
    dailyBreakdown.forEach((row) => {
      row.roleLabel.split('،').map((label) => label.trim()).filter((label) => label && label !== '—').forEach((label) => {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [dailyBreakdown]);

  const saveTarget = async () => {
    if (!id || !targetForm.productId || !targetForm.dailyTargetQty) return;
    await productionWorkerTargetService.create({
      workerId: id,
      productId: targetForm.productId,
      lineId: targetForm.lineId || undefined,
      dailyTargetQty: targetForm.dailyTargetQty,
      unit: 'piece',
      isActive: true,
      effectiveFrom: targetForm.effectiveFrom,
    });
    const refreshed = await productionWorkerTargetService.getByWorker(id);
    setTargets(refreshed);
    setTargetForm({ productId: '', lineId: '', dailyTargetQty: 0, effectiveFrom: today });
  };

  if (loading) return <LoadingSkeleton rows={8} />;
  if (!worker) {
    return (
      <Card>
        <p className="p-4">العامل غير موجود</p>
        <Button variant="outline" onClick={() => navigate('/production-workers')}>رجوع</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={worker.name}
        subtitle={`كود: ${worker.code}`}
        secondaryAction={{ label: 'رجوع', onClick: () => navigate('/production-workers') }}
      />

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">فترة تحليل الحضور والإنتاج</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">تُعرض الأهداف فقط عند وجود تكليف إنتاج فردي قابل للقياس.</p>
          </div>
          <input
            type="month"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-sm md:w-56"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value || currentMonth())}
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIBox label="إنتاج اليوم" value={formatNumber(todayStats?.outputQty ?? 0)} icon="today" />
        <KPIBox label="إنجاز اليوم" value={`${todayStats?.achievementPercent ?? 0}%`} icon="speed" />
        <KPIBox label="إنجاز الشهر" value={`${monthStats?.monthlyAchievement ?? 0}%`} icon="calendar_month" />
        <KPIBox label="تقدير المكافأة" value={formatNumber(monthStats?.bonusEstimate ?? 0)} icon="payments" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPIBox label="أيام حضور" value={formatNumber(periodPresence.present)} icon="check_circle" colorClass="bg-emerald-50 text-emerald-600" />
        <KPIBox label="أيام غياب" value={formatNumber(periodPresence.absent)} icon="cancel" colorClass="bg-rose-50 text-rose-600" />
        <KPIBox label="نسبة الحضور" value={`${periodPresence.percentage}%`} icon="groups" colorClass="bg-blue-50 text-blue-600" />
        <KPIBox label="أيام بدون هدف" value={formatNumber(periodPresence.noTarget)} icon="flag" colorClass="bg-amber-50 text-amber-600" />
      </div>

      <Card title="الملف الشخصي">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p><strong>الموظف المرتبط:</strong> {linkedEmployee?.name ?? '—'}</p>
          <p><strong>الحالة:</strong> <Badge variant={worker.isActive === false ? 'danger' : 'success'}>{worker.isActive === false ? 'غير نشط' : 'نشط'}</Badge></p>
          <p><strong>الخط الافتراضي:</strong> {worker.defaultLineId ? getLineName(worker.defaultLineId) : '—'}</p>
          <p><strong>نسبة الحضور:</strong> {periodPresence.percentage}%</p>
          <p><strong>وظائف الخط خلال الفترة:</strong> {roleSummary.length > 0 ? roleSummary.map(([label, count]) => `${label} (${formatNumber(count)})`).join('، ') : '—'}</p>
        </div>
      </Card>

      <ProductionWorkerLineAssignmentsSection
        workerId={id!}
        assignments={assignments}
        productionLines={productionLines}
        canManage={canManageWorkers}
        onAssignmentsChange={setAssignments}
      />

      {(activeTab === 'targets' || canManageTargets) && (
        <Card title="أهداف المنتجات">
          {canManageTargets && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <select className="border rounded-lg p-2" value={targetForm.productId} onChange={(e) => setTargetForm({ ...targetForm, productId: e.target.value })}>
                <option value="">المنتج</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="border rounded-lg p-2" value={targetForm.lineId} onChange={(e) => setTargetForm({ ...targetForm, lineId: e.target.value })}>
                <option value="">كل الخطوط</option>
                {productionLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input type="number" min={0} className="border rounded-lg p-2" placeholder="الهدف اليومي" value={targetForm.dailyTargetQty || ''} onChange={(e) => setTargetForm({ ...targetForm, dailyTargetQty: Number(e.target.value) || 0 })} />
              <Button onClick={() => void saveTarget()}>إضافة هدف</Button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-right py-2">المنتج</th>
                <th className="text-right py-2">الخط</th>
                <th className="text-center py-2">الهدف</th>
                <th className="text-right py-2">من</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id} className="border-t border-[var(--color-border)]">
                  <td className="py-2">{getProductName(t.productId)}</td>
                  <td className="py-2">{t.lineId ? getLineName(t.lineId) : 'عام'}</td>
                  <td className="py-2 text-center">{formatNumber(t.dailyTargetQty)}</td>
                  <td className="py-2">{t.effectiveFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="تفصيل الحضور والإنتاج اليومي">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-right py-2 px-2">التاريخ</th>
                <th className="text-right py-2 px-2">الحضور</th>
                <th className="text-right py-2 px-2">الخط</th>
                <th className="text-right py-2 px-2">وظيفة الخط</th>
                <th className="text-right py-2 px-2">نوع الإنتاج</th>
                <th className="text-center py-2 px-2">أيام حضور/غياب</th>
                <th className="text-center py-2 px-2">الهدف</th>
                <th className="text-center py-2 px-2">الإنتاج</th>
                <th className="text-center py-2 px-2">الإنجاز</th>
                <th className="text-right py-2 px-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.map((row) => (
                <tr key={row.date} className="border-t border-[var(--color-border)]">
                  <td className="py-2 px-2 tabular-nums">{row.date}</td>
                  <td className="py-2 px-2">{row.presenceLabel}</td>
                  <td className="py-2 px-2">{row.lineLabel}</td>
                  <td className="py-2 px-2">{row.roleLabel}</td>
                  <td className="py-2 px-2">{row.productionBehavior}</td>
                  <td className="py-2 px-2 text-center tabular-nums">{formatNumber(row.presentDays)} / {formatNumber(row.absentDays)}</td>
                  <td className="py-2 px-2 text-center tabular-nums">{row.targetLabel}</td>
                  <td className="py-2 px-2 text-center tabular-nums">{row.outputLabel}</td>
                  <td className="py-2 px-2 text-center tabular-nums">{row.achievementLabel}</td>
                  <td className="py-2 px-2"><Badge variant={STATUS_BADGE_VARIANTS[row.status]}>{STATUS_LABELS[row.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {dailyBreakdown.length === 0 && (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">لا توجد تكليفات أو تقارير إنتاج لهذه الفترة.</p>
          )}
        </div>
      </Card>
    </div>
  );
};
