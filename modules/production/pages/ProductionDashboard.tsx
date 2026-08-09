import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DashboardProgressGauge } from '@/modules/dashboards/components/DashboardProgressGauge';
import { useHomeModuleCharts } from '@/modules/dashboards/hooks/useHomeModuleCharts';
import { useOperationalDecisionSnapshot } from '@/modules/dashboards/hooks/useOperationalDecisionSnapshot';
import { resolveHomeChartDrilldown } from '@/modules/dashboards/lib/homeChartsDrilldown';
import {
  HOME_CHARTS_PERIOD_LABELS,
  formatLoadedAt,
  getHomeChartsPresetRange,
  type HomeChartsPeriodPreset,
} from '@/modules/dashboards/lib/homeChartsPeriod';
import { useAppStore } from '@/store/useAppStore';
import {
  ProductionLineStatus,
  type LineStatus,
  type ProductionLine,
  type ProductionPlan,
  type WorkOrder,
} from '@/types';
import { formatNumber } from '@/utils/calculations';
import { formatCost } from '@/utils/costCalculations';
import { usePermission } from '@/utils/permissions';

const PERIOD_ORDER: HomeChartsPeriodPreset[] = ['today', 'week', 'month', '3months', 'custom'];

const FLOW_LINE_CARD_LIMIT = 6;

type FlowLineChipKey = 'running' | 'stopped' | 'maintenance' | 'waiting' | 'no-plan';

type FlowLineCardModel = {
  id: string;
  name: string;
  productName: string | null;
  statusKey: FlowLineChipKey;
  statusLabel: string;
  progressPct: number | null;
  progressLabel: string | null;
  efficiencyPct: number | null;
  href: string;
};

function lineHasActivePlan(plans: ProductionPlan[], lineId: string): boolean {
  return plans.some(
    (p) => p.lineId === lineId && (p.status === 'in_progress' || p.status === 'planned' || p.status === 'paused'),
  );
}

function lineHasOpenWorkOrder(workOrders: WorkOrder[], lineId: string): boolean {
  return workOrders.some(
    (w) => w.lineId === lineId && (w.status === 'in_progress' || w.status === 'pending'),
  );
}

function resolveFlowLineChip(
  line: ProductionLine,
  hasPlan: boolean,
  hasOpenWo: boolean,
  hasLineTarget: boolean,
  plans: ProductionPlan[],
  workOrders: WorkOrder[],
): { key: FlowLineChipKey; label: string } {
  if (line.status === ProductionLineStatus.MAINTENANCE) {
    return { key: 'maintenance', label: 'صيانة' };
  }

  const waitingPlan = plans.some((p) => p.lineId === line.id && p.status === 'planned');
  const waitingWo = workOrders.some((w) => w.lineId === line.id && w.status === 'pending');
  const runningPlan = plans.some((p) => p.lineId === line.id && p.status === 'in_progress');
  const runningWo = workOrders.some((w) => w.lineId === line.id && w.status === 'in_progress');

  if (!hasPlan && !hasOpenWo && !hasLineTarget && !(Number(line.target) > 0)) {
    return { key: 'no-plan', label: 'بدون خطة' };
  }

  if (
    line.status === ProductionLineStatus.ACTIVE
    || line.status === ProductionLineStatus.INJECTION
    || runningPlan
    || runningWo
  ) {
    return { key: 'running', label: 'يعمل' };
  }

  if (waitingPlan || waitingWo || line.status === ProductionLineStatus.WARNING) {
    return { key: 'waiting', label: 'انتظار' };
  }

  if (line.status === ProductionLineStatus.IDLE || plans.some((p) => p.lineId === line.id && p.status === 'paused')) {
    return { key: 'stopped', label: 'متوقف' };
  }

  return { key: 'stopped', label: 'متوقف' };
}

function buildFlowLineCards(
  lines: ProductionLine[],
  plans: ProductionPlan[],
  workOrders: WorkOrder[],
  lineStatuses: LineStatus[],
  canViewLines: boolean,
  canViewWorkOrders: boolean,
): FlowLineCardModel[] {
  const statusByLineId = new Map(lineStatuses.map((row) => [row.lineId, row]));

  const ranked = lines.map((line) => {
    const hasPlan = lineHasActivePlan(plans, line.id);
    const hasOpenWo = lineHasOpenWorkOrder(workOrders, line.id);
    const lineStatus = statusByLineId.get(line.id);
    const hasLineTarget = Number(lineStatus?.targetTodayQty) > 0;
    const score =
      (line.status === ProductionLineStatus.ACTIVE || line.status === ProductionLineStatus.INJECTION ? 100 : 0)
      + (line.status === ProductionLineStatus.MAINTENANCE ? 70 : 0)
      + (line.status === ProductionLineStatus.WARNING ? 60 : 0)
      + (hasPlan ? 50 : 0)
      + (hasOpenWo ? 40 : 0)
      + (hasLineTarget || Number(line.target) > 0 ? 20 : 0)
      + (Number(line.achievement) > 0 ? 10 : 0);
    return { line, hasPlan, hasOpenWo, hasLineTarget, score };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (Number(a.line.sortOrder) || 0) - (Number(b.line.sortOrder) || 0);
  });

  return ranked.slice(0, FLOW_LINE_CARD_LIMIT).map(({ line, hasPlan, hasOpenWo, hasLineTarget }) => {
    const chip = resolveFlowLineChip(line, hasPlan, hasOpenWo, hasLineTarget, plans, workOrders);
    const target = Number(line.target) || 0;
    const achievement = Number(line.achievement) || 0;
    const hasProgress = target > 0;
    const progressPct = hasProgress
      ? Math.min(100, Math.max(0, Math.round((achievement / target) * 100)))
      : null;
    const efficiencyRaw = Number(line.efficiency);
    const efficiencyPct = hasProgress && Number.isFinite(efficiencyRaw)
      ? Math.min(100, Math.max(0, Math.round(efficiencyRaw)))
      : null;
    const productName =
      line.currentProduct && line.currentProduct !== '—'
        ? line.currentProduct
        : null;

    let href = '/lines';
    if (canViewLines) {
      href = `/lines/${line.id}`;
    } else if (canViewWorkOrders) {
      href = '/work-orders';
    }

    return {
      id: line.id,
      name: line.name,
      productName,
      statusKey: chip.key,
      statusLabel: chip.label,
      progressPct,
      progressLabel: hasProgress
        ? `${formatNumber(achievement)} / ${formatNumber(target)}`
        : null,
      efficiencyPct,
      href,
    };
  });
}

const PERIODS = PERIOD_ORDER.map((value) => ({
  value,
  label: HOME_CHARTS_PERIOD_LABELS[value],
}));

const CHART_TICK = { fontSize: 10, fill: 'var(--color-text-muted)' };
const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 80%, transparent)';

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.1)',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--color-text)',
        direction: 'rtl',
      }}
    >
      {label != null ? <div style={{ marginBottom: 4, color: 'var(--color-text-muted)' }}>{label}</div> : null}
      {payload.map((row) => (
        <div key={String(row.name)} style={{ color: row.color || 'var(--color-text)' }}>
          {row.name}: {typeof row.value === 'number' ? formatNumber(row.value) : row.value}
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label = 'لا توجد بيانات' }: { label?: string }) {
  return (
    <div className="ops-module-charts__empty">
      <span className="ops-module-charts__empty-mark" aria-hidden />
      <p className="ops-module-charts__empty-label">{label}</p>
    </div>
  );
}

function StatusBarChart({
  data,
  fill,
  compact,
  onBarClick,
}: {
  data: Array<{ name: string; value: number }>;
  fill: string;
  compact?: boolean;
  onBarClick?: (name: string) => void;
}) {
  const handleClick = (entry: unknown) => {
    if (!onBarClick) return;
    const row = entry as { name?: string; payload?: { name?: string } } | undefined;
    const name = row?.name ?? row?.payload?.name;
    if (name) onBarClick(String(name));
  };

  return (
    <div
      className={`ops-module-charts__chart ${compact ? 'ops-module-charts__chart--compact' : ''} ${onBarClick ? 'cursor-pointer' : ''}`}
      dir="ltr"
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={CHART_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={72} tick={CHART_TICK} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            dataKey="value"
            name="العدد"
            fill={fill}
            radius={[0, 8, 8, 0]}
            barSize={compact ? 10 : 12}
            cursor={onBarClick ? 'pointer' : undefined}
            onClick={handleClick}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const ProductionDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  const workOrders = useAppStore((s) => s.workOrders);
  const productionLines = useAppStore((s) => s.productionLines);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const lineStatuses = useAppStore((s) => s.lineStatuses);

  const [preset, setPreset] = useState<HomeChartsPeriodPreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const period = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd && customStart <= customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getHomeChartsPresetRange(preset === 'custom' ? 'month' : preset);
  }, [preset, customStart, customEnd]);

  const data = useHomeModuleCharts({ period, refreshToken });
  const { snapshot, refresh: refreshDecision } = useOperationalDecisionSnapshot();
  const { hero, modules } = data;

  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

  useEffect(() => {
    if (!can('workOrders.view') && !can('factoryDashboard.view') && !can('adminDashboard.view')) return;
    void fetchWorkOrders({ maxAgeMs: refreshToken > 0 ? 0 : 5 * 60 * 1000, silent: true, force: refreshToken > 0 }).catch(
      () => undefined,
    );
  }, [can, fetchWorkOrders, refreshToken]);

  const activeWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress').length,
    [workOrders],
  );

  const canViewLines = can('lines.view');
  const canViewWorkOrders = can('workOrders.view');

  const flowLineCards = useMemo(
    () =>
      buildFlowLineCards(
        productionLines,
        productionPlans,
        workOrders,
        lineStatuses,
        canViewLines,
        canViewWorkOrders,
      ),
    [productionLines, productionPlans, workOrders, lineStatuses, canViewLines, canViewWorkOrders],
  );

  const drill = (
    module: Parameters<typeof resolveHomeChartDrilldown>[0],
    barName?: string,
  ) => {
    navigate(resolveHomeChartDrilldown(module, { ...period, barName }));
  };

  const handleRefresh = () => {
    setRefreshToken((n) => n + 1);
    void refreshDecision();
  };

  if (data.loading && data.productionDaily.length === 0 && refreshToken === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={6} />;
  }

  const showPlanGauge = hero.planAchievement > 0 || data.planTotalCount > 0;
  const activePlans =
    data.planStatusBars.find((r) => r.name === 'جاري')?.value
    ?? 0;
  const plannedPlans =
    data.planStatusBars.find((r) => r.name === 'مخطط')?.value
    ?? 0;

  const heroCards = [
    {
      key: 'period-prod',
      label: 'إنتاج الفترة',
      value: data.loading ? '…' : formatNumber(hero.periodProduction),
      meta: `اليوم: ${formatNumber(hero.todayProduction)}`,
      accent: true as const,
    },
    {
      key: 'efficiency',
      label: 'كفاءة الإنتاج',
      value: data.loading ? '…' : `${hero.efficiency}%`,
      meta: `هالك ${hero.wasteRatio}%`,
    },
    {
      key: 'plan',
      label: 'تحقيق الخطة',
      value: data.loading ? '…' : `${hero.planAchievement}%`,
      meta: `جدول ${hero.scheduleAdherence}%`,
    },
    {
      key: 'behind',
      label: 'متأخر عن الجدول',
      value: data.loading ? '…' : formatNumber(snapshot.behindScheduleCount),
      meta: `خطط نشطة ${formatNumber(activePlans + plannedPlans)}`,
    },
    {
      key: 'issues',
      label: 'صرف إنتاج مفتوح',
      value: data.loading ? '…' : formatNumber(snapshot.issues.openCount),
      meta: `جاهزية مواد ${snapshot.materials.readinessPercent}%`,
    },
    {
      key: 'packaging',
      label: 'تغليف بانتظار',
      value: data.loading ? '…' : formatNumber(snapshot.packaging.awaitingUnits),
      meta: `أصناف ${formatNumber(snapshot.packaging.skuCount)}`,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة الإنتاج"
      hero={heroCards}
      periods={PERIODS}
      activePeriod={preset}
      onPeriodChange={(value) => setPreset(value as HomeChartsPeriodPreset)}
      onRefresh={handleRefresh}
      refreshing={data.loading}
      rangeLabel={`${period.start} → ${period.end} · ${formatLoadedAt(data.loadedAt)}`}
      periodExtra={
        preset === 'custom' ? (
          <div className="ops-dash-custom-dates">
            <input
              type="date"
              value={customStart || period.start}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setPreset('custom');
              }}
              aria-label="من تاريخ"
            />
            <input
              type="date"
              value={customEnd || period.end}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setPreset('custom');
              }}
              aria-label="إلى تاريخ"
            />
          </div>
        ) : null
      }
      secondarySummary="إجراءات وروابط الإنتاج"
      secondary={(
        <div className="flex flex-wrap gap-2">
          {can('quickAction.view') && (
            <Link to={tenantPath('/quick-action')}>
              <PrimaryButton iconName="bolt" tone="execute">إدخال سريع</PrimaryButton>
            </Link>
          )}
          {can('plans.view') && (
            <Link to={tenantPath('/production-plans')}>
              <GhostButton iconName="event_note" tone="view">خطط الإنتاج</GhostButton>
            </Link>
          )}
          {can('workOrders.view') && (
            <Link to={tenantPath('/work-orders')}>
              <GhostButton iconName="assignment" tone="edit">أوامر الشغل</GhostButton>
            </Link>
          )}
          {(can('productionIssue.request') || can('plans.view') || can('workOrders.view')) && (
            <Link to={tenantPath('/production/issue-requests')}>
              <GhostButton iconName="fact_check" tone="approve">طلبات الصرف</GhostButton>
            </Link>
          )}
          {(can('reports.view') || can('reports.packaging.create')) && (
            <Link to={tenantPath('/production/packaging/control')}>
              <GhostButton iconName="package_2" tone="share">تحكم التغليف</GhostButton>
            </Link>
          )}
          {can('reports.view') && (
            <Link to={tenantPath('/reports')}>
              <GhostButton iconName="bar_chart" tone="view">التقارير</GhostButton>
            </Link>
          )}
          {can('lines.view') && (
            <Link to={tenantPath('/lines')}>
              <GhostButton iconName="precision_manufacturing" tone="print">الخطوط</GhostButton>
            </Link>
          )}
          {(can('production.attendance.view') || can('production.attendance.manage') || can('reports.view')) && (
            <Link to={tenantPath('/production/attendance')}>
              <GhostButton iconName="fact_check" tone="save">حضور الإنتاج</GhostButton>
            </Link>
          )}
          {can('routing.view') && (
            <Link to={tenantPath('/production/routing')}>
              <GhostButton iconName="alt_route" tone="export">مسارات الإنتاج</GhostButton>
            </Link>
          )}
        </div>
      )}
    >
      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate('/work-orders')}
        >
          <p className="ops-module-charts__qty-label">أوامر شغل نشطة</p>
          <p className="ops-module-charts__qty-value">{formatNumber(activeWorkOrders)}</p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => drill('plans', 'جاري')}
        >
          <p className="ops-module-charts__qty-label">خطط جارية / مخطط</p>
          <p className="ops-module-charts__qty-value">
            {formatNumber(activePlans)} / {formatNumber(plannedPlans)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => drill('plans', 'جاري')}
        >
          <p className="ops-module-charts__qty-label">نقص مواد (خطط)</p>
          <p className="ops-module-charts__qty-value">
            {formatNumber(snapshot.materials.plansWithShortage)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => {
            if (can('inventory.view')) navigate('/inventory/production-floor');
            else if (can('plans.view')) drill('plans');
          }}
        >
          <p className="ops-module-charts__qty-label">WIP</p>
          <p className="ops-module-charts__qty-value">{formatNumber(snapshot.inventory.wipQty)}</p>
        </button>
      </div>

      <div className="ops-module-charts">
        <div className="ops-module-charts__wide">
          <OpsDashPanel
            title="الإنتاج — يومي"
            accent="production"
            action={(
              <button
                type="button"
                className="ops-dash-panel__action"
                onClick={() => drill('production')}
              >
                فتح
              </button>
            )}
          >
            {data.productionDaily.length > 0 ? (
              <div
                className="ops-module-charts__chart ops-module-charts__chart--tall cursor-pointer"
                dir="ltr"
              >
                <ResponsiveContainer>
                  <ComposedChart
                    data={data.productionDaily}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    onClick={() => drill('production')}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    {modules.costs && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                    )}
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      yAxisId="left"
                      dataKey="production"
                      name="الإنتاج"
                      fill="rgb(var(--color-primary))"
                      radius={[8, 8, 0, 0]}
                      barSize={18}
                    />
                    {modules.costs && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="costPerUnit"
                        name="تكلفة الوحدة"
                        stroke="#d97706"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="لا تقارير إنتاج في الفترة" />
            )}
          </OpsDashPanel>
        </div>

        <OpsDashPanel
          title="تقدم الخطة"
          accent="plans"
          action={(
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => drill('plans')}
            >
              فتح
            </button>
          )}
        >
          {data.planTotalCount === 0 ? (
            <EmptyChart label="لا خطط إنتاج مسجّلة" />
          ) : (
            <div>
              {showPlanGauge && hero.planAchievement > 0 ? (
                <DashboardProgressGauge
                  value={hero.planAchievement}
                  label="تحقيق الخطة"
                  sublabel={`كفاءة ${hero.efficiency}% · جدول ${hero.scheduleAdherence}%`}
                  legend={[
                    { label: 'مكتمل', color: 'rgb(var(--color-success))' },
                    { label: 'متابعة', color: 'rgb(var(--color-warning))' },
                    { label: 'حرج', color: 'rgb(var(--color-danger))' },
                  ]}
                />
              ) : (
                <p className="ops-module-charts__hint" style={{ textAlign: 'center' }}>
                  توزيع حالات الخطط
                  {hero.planAchievement === 0 ? ' · لا إنجاز حجم محسوب بعد' : ''}
                </p>
              )}
              <StatusBarChart
                data={data.planStatusBars}
                fill="rgb(var(--color-primary))"
                compact={hero.planAchievement > 0}
                onBarClick={(name) => drill('plans', name)}
              />
            </div>
          )}
        </OpsDashPanel>

        {modules.quality && (
          <OpsDashPanel
            title="الجودة / الهالك"
            accent="quality"
            action={(
              <button
                type="button"
                className="ops-dash-panel__action"
                onClick={() => drill('quality')}
              >
                فتح
              </button>
            )}
          >
            {data.qualityBars.length > 0 ? (
              <div>
                {data.qualitySource === 'production' ? (
                  <p className="ops-module-charts__hint">
                    من هالك تقارير الإنتاج (لا ملخص جودة على أوامر العمل)
                  </p>
                ) : null}
                <StatusBarChart
                  data={data.qualityBars}
                  fill="#0d9488"
                  onBarClick={() => drill('quality')}
                />
              </div>
            ) : (
              <EmptyChart label="لا بيانات جودة في الفترة" />
            )}
          </OpsDashPanel>
        )}

        {modules.costs && data.costSummary && (
          <OpsDashPanel
            title="تكلفة الإنتاج"
            accent="costs"
            action={(
              <button
                type="button"
                className="ops-dash-panel__action"
                onClick={() => drill('costs')}
              >
                فتح
              </button>
            )}
          >
            <div className="ops-module-charts__metrics">
              <div className="ops-module-charts__metric">
                <p className="ops-module-charts__metric-label">تكلفة الوحدة</p>
                <p className="ops-module-charts__metric-value ops-module-charts__metric-value--accent">
                  {formatCost(data.costSummary.averageUnitCost)}
                </p>
              </div>
              <div className="ops-module-charts__metric">
                <p className="ops-module-charts__metric-label">إجمالي التكلفة</p>
                <p className="ops-module-charts__metric-value">
                  {formatCost(data.costSummary.totalCost)}
                </p>
              </div>
              <div className="ops-module-charts__metric">
                <p className="ops-module-charts__metric-label">إنتاج محسوب</p>
                <p className="ops-module-charts__metric-value">
                  {formatNumber(data.costSummary.producedQty)}
                </p>
              </div>
            </div>
            <p className="ops-module-charts__foot">
              {data.costSummary.source === 'approved'
                ? 'ملخص شهري معتمد'
                : data.costSummary.source === 'live'
                  ? 'حساب لحظي من تقارير الفترة'
                  : 'لا تكلفة محسوبة لهذه الفترة'}
            </p>
          </OpsDashPanel>
        )}
      </div>

      <OpsDashPanel
        title="خطوط الإنتاج"
        accent="production"
        action={
          canViewLines ? (
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => navigate('/lines')}
            >
              فتح
            </button>
          ) : canViewWorkOrders ? (
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => navigate('/work-orders')}
            >
              أوامر الشغل
            </button>
          ) : undefined
        }
      >
        {flowLineCards.length === 0 ? (
          <EmptyChart label="لا خطوط إنتاج لعرضها" />
        ) : (
          <div className="hakimo-flow-line-grid" dir="rtl">
            {flowLineCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="hakimo-flow-line-card text-start"
                onClick={() => navigate(card.href)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[var(--color-text)] truncate">{card.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                      {card.productName || '—'}
                    </p>
                  </div>
                  <span
                    className={`hakimo-flow-status hakimo-flow-status--${card.statusKey} shrink-0`}
                  >
                    {card.statusLabel}
                  </span>
                </div>

                {card.progressPct != null ? (
                  <div className="hakimo-flow-progress mt-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold mb-1">
                      <span className="text-[var(--color-text-muted)]">التقدم</span>
                      <span className="tabular-nums text-[var(--color-text)]">
                        {card.progressLabel} · {card.progressPct}%
                      </span>
                    </div>
                    <div className="hakimo-flow-progress__track" aria-hidden>
                      <div
                        className="hakimo-flow-progress__bar"
                        style={{ width: `${card.progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] font-bold text-[var(--color-text-muted)]">
                    التقدم: —
                  </p>
                )}

                {card.efficiencyPct != null ? (
                  <p className="mt-2 text-[11px] font-bold text-[var(--color-text-muted)]">
                    الكفاءة: <span className="tabular-nums text-[var(--color-text)]">{card.efficiencyPct}%</span>
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </OpsDashPanel>
    </DomainHomeShell>
  );
};
