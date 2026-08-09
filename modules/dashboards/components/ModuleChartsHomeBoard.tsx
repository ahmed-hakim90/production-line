import React from 'react';
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
import { formatCost } from '@/utils/costCalculations';
import { formatNumber } from '@/utils/calculations';
import { OpsDashPanel } from './OperationsDashboardBoard';
import { DashboardProgressGauge } from './DashboardProgressGauge';
import { useHomeModuleCharts } from '../hooks/useHomeModuleCharts';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { useTenantNavigate } from '@/lib/useTenantNavigate';

type Props = {
  title?: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
};

function ModulePanel({
  title,
  path,
  children,
  wide,
}: {
  title: string;
  path?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const navigate = useTenantNavigate();
  return (
    <div className={wide ? 'ops-module-charts__wide' : undefined}>
      <OpsDashPanel
        title={title}
        action={
          path ? (
            <button
              type="button"
              className="text-[11px] font-bold text-primary"
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
    <div className="h-[220px] flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)]">
      {label}
    </div>
  );
}

/**
 * Donezo-like home: 4 KPI cards + one chart panel per permitted module.
 */
export const ModuleChartsHomeBoard: React.FC<Props> = ({
  title = 'لوحة التحكم',
  subtitle = 'مؤشرات ورسوم لكل موديول',
  headerExtra,
}) => {
  const data = useHomeModuleCharts();
  const { hero, modules } = data;

  if (data.loading && data.productionDaily.length === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  const showTitle = Boolean(title?.trim());

  return (
    <div className="erp-dashboard-theme ops-dash-board">
      {(showTitle || headerExtra) && (
        <div className="ops-dash-header flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          {showTitle ? (
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text)]">{title}</h1>
              {subtitle ? (
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] font-medium mt-1">{subtitle}</p>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          {headerExtra}
        </div>
      )}

      {/* Hero KPI row — Donezo style */}
      <div className="ops-dash-kpi-grid">
        <div className="ops-dash-kpi-card ops-dash-kpi-card--accent">
          <p className="ops-dash-kpi-card__label">إنتاج اليوم</p>
          <p className="ops-dash-kpi-card__value">{formatNumber(hero.todayProduction)}</p>
          <p className="ops-dash-kpi-card__meta">الشهر: {formatNumber(hero.monthlyProduction)}</p>
        </div>
        <div className="ops-dash-kpi-card">
          <p className="ops-dash-kpi-card__label">كفاءة الإنتاج</p>
          <p className="ops-dash-kpi-card__value">{hero.efficiency}%</p>
          <p className="ops-dash-kpi-card__meta">هالك {hero.wasteRatio}%</p>
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
          <ModulePanel title="الإنتاج — يومي" path="/production-plans" wide>
            {data.productionDaily.length > 0 ? (
              <div className="h-[260px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <ComposedChart data={data.productionDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                    {modules.costs && (
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                    )}
                    <Tooltip />
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
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        {modules.inventory && (
          <ModulePanel title="المخازن" path="/inventory">
            {data.inventoryBars.some((b) => b.value > 0) ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={data.inventoryBars} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="العدد" fill="rgb(var(--color-success))" radius={[0, 8, 8, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        {modules.costs && (
          <ModulePanel title="التكاليف" path="/monthly-costs">
            <div className="h-[220px] flex flex-col justify-center gap-4 px-1">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-[10px] text-[var(--color-text-muted)] font-bold">تكلفة الوحدة</p>
                  <p className="text-lg font-black tabular-nums text-primary mt-1">
                    {data.costSummary ? formatCost(data.costSummary.averageUnitCost) : '—'}
                  </p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-[10px] text-[var(--color-text-muted)] font-bold">إجمالي التكلفة</p>
                  <p className="text-lg font-black tabular-nums mt-1">
                    {data.costSummary ? formatCost(data.costSummary.totalCost) : '—'}
                  </p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-[10px] text-[var(--color-text-muted)] font-bold">إنتاج الشهر</p>
                  <p className="text-lg font-black tabular-nums mt-1">
                    {data.costSummary ? formatNumber(data.costSummary.producedQty) : '—'}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] font-medium text-center">
                ملخص التكلفة الشهرية المعتمدة — الرسم اليومي يظهر أعلى مع الإنتاج
              </p>
            </div>
          </ModulePanel>
        )}

        {modules.hr && (
          <ModulePanel title="الموارد البشرية" path="/hr/dashboard">
            {data.hrBars.some((b) => b.value > 0) ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={data.hrBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip />
                    <Bar dataKey="value" name="العدد" fill="rgb(var(--color-primary))" radius={[8, 8, 0, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="لا بيانات حضور لهذا اليوم" />
            )}
          </ModulePanel>
        )}

        {modules.quality && (
          <ModulePanel title="الجودة" path="/quality/reports">
            {data.qualityBars.some((b) => b.value > 0) ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={data.qualityBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip />
                    <Bar dataKey="value" name="قيمة" fill="#8b5cf6" radius={[8, 8, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        {modules.repair && (
          <ModulePanel title="الصيانة / التشغيل" path="/repair">
            {data.repairBars.some((b) => b.value > 0) ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={data.repairBars} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="العدد" fill="#f59e0b" radius={[0, 8, 8, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="لا طوابير معلّقة" />
            )}
          </ModulePanel>
        )}

        {modules.customers && (
          <ModulePanel title="العملاء" path="/customers/kpi">
            {data.customersBars.some((b) => b.value > 0) ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={data.customersBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip />
                    <Bar dataKey="value" name="العدد" fill="#06b6d4" radius={[8, 8, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ModulePanel>
        )}

        <ModulePanel title="تقدم الخطة">
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
        </ModulePanel>
      </div>
    </div>
  );
};
