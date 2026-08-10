import React, { useMemo, useState } from 'react';
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
import { RefreshCw } from 'lucide-react';
import { formatCost } from '@/utils/costCalculations';
import { formatNumber } from '@/utils/calculations';
import { OpsDashPanel } from './OperationsDashboardBoard';
import { DashboardProgressGauge } from './DashboardProgressGauge';
import { useHomeModuleCharts } from '../hooks/useHomeModuleCharts';
import { resolveHomeChartDrilldown } from '../lib/homeChartsDrilldown';
import {
  HOME_CHARTS_PERIOD_LABELS,
  formatLoadedAt,
  getHomeChartsPresetRange,
  type HomeChartsPeriodPreset,
} from '../lib/homeChartsPeriod';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { useTenantNavigate } from '@/lib/useTenantNavigate';

type Props = {
  /** Optional small eyebrow above KPIs — avoid large page titles here. */
  title?: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  showPeriodFilter?: boolean;
};

type ModuleAccent = 'production' | 'inventory' | 'costs' | 'hr' | 'quality' | 'repair' | 'customers' | 'plans';

const CHART_TICK = { fontSize: 10, fill: 'var(--color-text-muted)' };
const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 80%, transparent)';

const PERIOD_ORDER: HomeChartsPeriodPreset[] = ['today', 'week', 'month', '3months', 'custom'];

function ChartTooltip({ active, payload, label }: {
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

function ModulePanel({
  title,
  path,
  children,
  wide,
  accent,
}: {
  title: string;
  path?: string;
  children: React.ReactNode;
  wide?: boolean;
  accent?: ModuleAccent;
}) {
  const navigate = useTenantNavigate();
  return (
    <div className={wide ? 'ops-module-charts__wide' : undefined}>
      <OpsDashPanel
        title={title}
        accent={accent}
        action={
          path ? (
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => navigate(path)}
            >
              فتح
            </button>
          ) : undefined
        }
      >
        {children}
      </OpsDashPanel>
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

function ModuleBarChart({
  data,
  layout = 'vertical',
  fill,
  categoryWidth = 78,
  compact,
  onBarClick,
}: {
  data: Array<{ name: string; value: number }>;
  layout?: 'vertical' | 'horizontal';
  fill: string;
  categoryWidth?: number;
  compact?: boolean;
  onBarClick?: (name: string) => void;
}) {
  const handleClick = (entry: unknown) => {
    if (!onBarClick) return;
    const row = entry as { name?: string; payload?: { name?: string } } | undefined;
    const name = row?.name ?? row?.payload?.name;
    if (name) onBarClick(String(name));
  };

  const heightClass = compact ? 'ops-module-charts__chart--compact' : '';

  if (layout === 'horizontal') {
    return (
      <div className={`ops-module-charts__chart ${heightClass} ${onBarClick ? 'cursor-pointer' : ''}`} dir="ltr">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_TICK} width={32} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="value"
              name="العدد"
              fill={fill}
              radius={[8, 8, 0, 0]}
              barSize={compact ? 16 : 20}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={handleClick}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className={`ops-module-charts__chart ${heightClass} ${onBarClick ? 'cursor-pointer' : ''}`} dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={CHART_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={categoryWidth} tick={CHART_TICK} axisLine={false} tickLine={false} />
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

/**
 * Data-first home board: KPIs + module charts up front; period tools stay compact below.
 */
export const ModuleChartsHomeBoard: React.FC<Props> = ({
  title,
  subtitle,
  headerExtra,
  showPeriodFilter = true,
}) => {
  const navigate = useTenantNavigate();
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
  const { hero, modules } = data;

  const drill = (
    module: Parameters<typeof resolveHomeChartDrilldown>[0],
    barName?: string,
  ) => {
    navigate(resolveHomeChartDrilldown(module, { ...period, barName }));
  };

  if (data.loading && data.productionDaily.length === 0 && refreshToken === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  const showEyebrow = Boolean(title?.trim());
  const showPlanGauge = hero.planAchievement > 0 || data.planTotalCount > 0;

  return (
    <div className="erp-dashboard-theme ops-dash-board ops-dash-board--data-first">
      {showEyebrow ? (
        <p className="ops-dash-eyebrow">
          {title}
          {subtitle?.trim() ? ` · ${subtitle}` : ''}
        </p>
      ) : null}

      <div className="ops-dash-kpi-grid">
        <div className="ops-dash-kpi-card ops-dash-kpi-card--accent">
          <p className="ops-dash-kpi-card__label">إنتاج الفترة</p>
          <p className="ops-dash-kpi-card__value">{formatNumber(hero.periodProduction)}</p>
          <p className="ops-dash-kpi-card__meta">اليوم: {formatNumber(hero.todayProduction)}</p>
        </div>
        <div className="ops-dash-kpi-card">
          <p className="ops-dash-kpi-card__label">كفاءة الإنتاج</p>
          <p className="ops-dash-kpi-card__value">{hero.efficiency}%</p>
          <p className="ops-dash-kpi-card__meta">هالك الفترة {hero.wasteRatio}%</p>
        </div>
        <div className="ops-dash-kpi-card">
          <p className="ops-dash-kpi-card__label">تحقيق الخطة</p>
          <p className="ops-dash-kpi-card__value">{hero.planAchievement}%</p>
          <p className="ops-dash-kpi-card__meta">جدول {hero.scheduleAdherence}%</p>
        </div>
        <div className="ops-dash-kpi-card">
          <p className="ops-dash-kpi-card__label">يحتاج متابعة</p>
          <p className="ops-dash-kpi-card__value">{formatNumber(hero.openRepairLike)}</p>
          <p className="ops-dash-kpi-card__meta">
            مخزون تحت الحد: {formatNumber(hero.lowStockCount)}
          </p>
        </div>
      </div>

      <div className="ops-module-charts">
        {modules.production && (
          <ModulePanel
            title="الإنتاج — يومي"
            path={resolveHomeChartDrilldown('production', period)}
            wide
            accent="production"
          >
            {data.productionDaily.length > 0 ? (
              <div className="ops-module-charts__chart ops-module-charts__chart--tall cursor-pointer" dir="ltr">
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
                      <YAxis yAxisId="right" orientation="right" tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
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
                        stroke="var(--color-warning-hex)"
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
          </ModulePanel>
        )}

        {modules.inventory && (
          <ModulePanel title="المخازن" path="/inventory" accent="inventory">
            {data.inventoryBars.length > 0 ? (
              <div>
                <ModuleBarChart
                  data={data.inventoryBars}
                  fill="rgb(var(--color-success))"
                  categoryWidth={78}
                  onBarClick={(name) => drill('inventory', name)}
                />
                <div className="ops-module-charts__qty-row">
                  <div className="ops-module-charts__qty">
                    <p className="ops-module-charts__qty-label">WIP</p>
                    <p className="ops-module-charts__qty-value">{formatNumber(data.inventoryQty.wip)}</p>
                  </div>
                  <div className="ops-module-charts__qty">
                    <p className="ops-module-charts__qty-label">تام</p>
                    <p className="ops-module-charts__qty-value">{formatNumber(data.inventoryQty.finished)}</p>
                  </div>
                  <div className="ops-module-charts__qty">
                    <p className="ops-module-charts__qty-label">تغليف معلّق</p>
                    <p className="ops-module-charts__qty-value">{formatNumber(data.inventoryQty.packaging)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        {modules.costs && (
          <ModulePanel title="التكاليف" path={resolveHomeChartDrilldown('costs', period)} accent="costs">
            <div className="flex h-[210px] flex-col justify-center gap-3">
              <div className="ops-module-charts__metrics">
                <div className="ops-module-charts__metric">
                  <p className="ops-module-charts__metric-label">تكلفة الوحدة</p>
                  <p className="ops-module-charts__metric-value ops-module-charts__metric-value--accent">
                    {formatCost(data.costSummary?.averageUnitCost ?? 0)}
                  </p>
                </div>
                <div className="ops-module-charts__metric">
                  <p className="ops-module-charts__metric-label">إجمالي التكلفة</p>
                  <p className="ops-module-charts__metric-value">
                    {formatCost(data.costSummary?.totalCost ?? 0)}
                  </p>
                </div>
                <div className="ops-module-charts__metric">
                  <p className="ops-module-charts__metric-label">إنتاج الفترة</p>
                  <p className="ops-module-charts__metric-value">
                    {formatNumber(data.costSummary?.producedQty ?? 0)}
                  </p>
                </div>
              </div>
              <p className="ops-module-charts__foot">
                {data.costSummary?.source === 'approved'
                  ? 'ملخص التكلفة الشهرية المعتمدة — الرسم اليومي يظهر أعلى مع الإنتاج'
                  : data.costSummary?.source === 'live'
                    ? 'حساب لحظي من تقارير الإنتاج للفترة المحددة'
                    : 'لا يوجد حساب شهري معتمد ولا إنتاج محسوب لهذه الفترة'}
              </p>
            </div>
          </ModulePanel>
        )}

        {modules.hr && (
          <ModulePanel title="الموارد البشرية" path={resolveHomeChartDrilldown('hr', period)} accent="hr">
            {data.hrBars.length > 0 ? (
              <div>
                <p className="ops-module-charts__hint">
                  نشطون: {formatNumber(data.hrActiveCount)} · حضور الفترة
                </p>
                <ModuleBarChart
                  data={data.hrBars}
                  layout="horizontal"
                  fill="rgb(var(--color-primary))"
                  onBarClick={(name) => drill('hr', name)}
                />
              </div>
            ) : (
              <EmptyChart label="لا بيانات حضور لهذه الفترة" />
            )}
          </ModulePanel>
        )}

        {modules.quality && (
          <ModulePanel title="الجودة" path={resolveHomeChartDrilldown('quality', period)} accent="quality">
            {data.qualityBars.length > 0 ? (
              <div>
                {data.qualitySource === 'production' ? (
                  <p className="ops-module-charts__hint">
                    من هالك تقارير الإنتاج (لا ملخص جودة على أوامر العمل)
                  </p>
                ) : null}
                {data.qualitySource === 'work_orders' && data.qualityRates ? (
                  <p className="ops-module-charts__hint">
                    فشل {data.qualityRates.failRate}% · إعادة {data.qualityRates.reworkRate}% · FPY{' '}
                    {data.qualityRates.avgFpy}%
                  </p>
                ) : null}
                <ModuleBarChart
                  data={data.qualityBars}
                  layout="horizontal"
                  fill="var(--chart-7)"
                  onBarClick={() => drill('quality')}
                />
              </div>
            ) : (
              <EmptyChart label="لا بيانات جودة في الفترة" />
            )}
          </ModulePanel>
        )}

        {modules.repair && (
          <ModulePanel
            title="الصيانة / التشغيل"
            path={resolveHomeChartDrilldown('repair', { ...period, barName: 'مفتوح' })}
            accent="repair"
          >
            {data.repairBars.length > 0 ? (
              <ModuleBarChart
                data={data.repairBars}
                fill="var(--chart-3)"
                categoryWidth={72}
                onBarClick={(name) => drill('repair', name)}
              />
            ) : (
              <EmptyChart label="لا أوامر صيانة" />
            )}
          </ModulePanel>
        )}

        {modules.customers && (
          <ModulePanel title="العملاء" path={resolveHomeChartDrilldown('customers', period)} accent="customers">
            {data.customersBars.length > 0 ? (
              <ModuleBarChart
                data={data.customersBars}
                layout="horizontal"
                fill="var(--chart-1)"
                onBarClick={(name) => drill('customers', name)}
              />
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        <ModulePanel title="تقدم الخطة" path={resolveHomeChartDrilldown('plans', period)} accent="plans">
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
              <ModuleBarChart
                data={data.planStatusBars}
                layout="horizontal"
                fill="rgb(var(--color-primary))"
                compact={hero.planAchievement > 0}
                onBarClick={(name) => drill('plans', name)}
              />
            </div>
          )}
        </ModulePanel>
      </div>

      {(showPeriodFilter || headerExtra) && (
        <div className="ops-dash-toolbar">
          {showPeriodFilter ? (
            <div className="ops-dash-toolbar__periods">
              {PERIOD_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`ops-dash-period-chip${preset === key ? ' is-active' : ''}`}
                  onClick={() => setPreset(key)}
                >
                  {HOME_CHARTS_PERIOD_LABELS[key]}
                </button>
              ))}
              {preset === 'custom' ? (
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
              ) : null}
            </div>
          ) : (
            <span />
          )}
          <div className="ops-dash-toolbar__meta">
            <span className="ops-dash-toolbar__range">
              {period.start} → {period.end}
            </span>
            <div className="ops-dash-refresh">
              <span className="ops-dash-refresh__time">{formatLoadedAt(data.loadedAt)}</span>
              <button
                type="button"
                className="ops-dash-refresh__btn"
                disabled={data.loading}
                onClick={() => setRefreshToken((n) => n + 1)}
                title="تحديث البيانات"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${data.loading ? 'animate-spin' : ''}`} />
                تحديث
              </button>
            </div>
            {headerExtra}
          </div>
        </div>
      )}
    </div>
  );
};
