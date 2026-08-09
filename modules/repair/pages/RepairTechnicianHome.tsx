import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { StatusBadge } from '../components/StatusBadge';
import { resolveRepairSettings } from '../config/repairSettings';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import {
  buildRepairTechnicianDailyOutcomes,
  formatRepairTechnicianDeviceLabel,
  resolveRepairTechnicianHomeRange,
  summarizeRepairTechnicianHome,
  type RepairTechnicianHomeJob,
  type RepairTechnicianHomePeriod,
} from '../lib/repairTechnicianHomeMetrics';
import type { FirestoreUserWithRepair, RepairJob, RepairJobStatus } from '../types';

const PERIOD_OPTIONS: { value: RepairTechnicianHomePeriod; label: string }[] = [
  { value: 'daily', label: 'اليوم' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

const CHART_TICK = { fontSize: 10, fill: 'var(--color-text-muted)' };
const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 80%, transparent)';

function num(value: number): string {
  return new Intl.NumberFormat('ar-EG').format(value);
}

function formatPct(value: number, hasOutcomes: boolean): string {
  if (!hasOutcomes || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(value)}%`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('ar-EG');
}

function periodLabel(period: RepairTechnicianHomePeriod): string {
  if (period === 'daily') return 'اليوم';
  if (period === 'weekly') return 'هذا الأسبوع';
  return 'هذا الشهر';
}

function TechJobRowCard({
  job,
  dateValue,
  tenantSlug,
  dateTone,
}: {
  job: RepairJob | RepairTechnicianHomeJob;
  dateValue?: string;
  tenantSlug?: string;
  dateTone?: 'amber' | 'default';
}) {
  if (!job.id) {
    return (
      <div className="rounded-xl border bg-card p-3 opacity-70">
        <div className="font-mono text-sm font-bold">#{job.receiptNo || '—'}</div>
        <div className="mt-1 truncate text-sm font-semibold">
          {formatRepairTechnicianDeviceLabel(job)}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
      className="block rounded-xl border bg-card p-3 shadow-sm transition-colors active:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold text-primary">#{job.receiptNo || '—'}</div>
          <div className="mt-1 truncate text-base font-semibold leading-snug">
            {formatRepairTechnicianDeviceLabel(job)}
          </div>
        </div>
        <ChevronLeft className="mt-1 h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status as RepairJobStatus} />
        <span
          className={`text-xs tabular-nums ${
            dateTone === 'amber'
              ? 'font-semibold text-amber-800 dark:text-amber-200'
              : 'text-muted-foreground'
          }`}
        >
          {formatDate(dateValue)}
        </span>
      </div>
    </Link>
  );
}

/**
 * View-only technician home: period KPIs + daily outcomes chart + fixed/delayed job lists.
 * Routed as `/` portal for repair_technician — not the manager KPI screen.
 */
export const RepairTechnicianHome: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canView = can('repair.jobs.technician') || can('repair.view');

  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const [period, setPeriod] = useState<RepairTechnicianHomePeriod>('monthly');

  const technicianIds = useRepairTechnicianIds(userProfile, currentEmployee?.id);

  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);

  const { jobs, loading, refetch, isFetching } = useRepairJobs({
    technicianOnly: true,
    technicianIds,
  });

  const range = useMemo(() => resolveRepairTechnicianHomeRange(period), [period]);

  const metrics = useMemo(
    () => summarizeRepairTechnicianHome(jobs, {
      range,
      openStatusIds: repairSettings.workflow.openStatusIds,
    }),
    [jobs, range, repairSettings.workflow.openStatusIds],
  );

  const dailyOutcomes = useMemo(
    () => buildRepairTechnicianDailyOutcomes(jobs, range),
    [jobs, range],
  );

  const displayName = String(userDisplayName || '').trim() || 'فني الصيانة';

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-3 md:p-6" dir={dir}>
        <OpsDashPanel title="لوحة أداء الفني" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض لوحة أداء الفني.</p>
        </OpsDashPanel>
      </div>
    );
  }

  const hero = [
    {
      key: 'requests',
      label: `طلبات الفترة`,
      value: loading ? '…' : num(metrics.requestsCount),
      meta: periodLabel(period),
      accent: true as const,
    },
    {
      key: 'fixed',
      label: 'تم الإصلاح',
      value: loading ? '…' : num(metrics.fixedCount),
    },
    {
      key: 'unrepairable',
      label: 'غير قابل',
      value: loading ? '…' : num(metrics.unrepairableCount),
      toneClassName: 'ops-dash-kpi-card--danger',
    },
    {
      key: 'delayed',
      label: 'متأخر',
      value: loading ? '…' : num(metrics.delayedCount),
      toneClassName: metrics.delayedCount > 0 ? 'ops-dash-kpi-card--warn' : undefined,
    },
    {
      key: 'open',
      label: 'مفتوحة',
      value: loading ? '…' : num(metrics.openCount),
    },
    {
      key: 'success',
      label: 'نسبة النجاح',
      value: loading ? '…' : formatPct(metrics.successRate, metrics.completedOutcomesCount > 0),
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      dir={dir}
      eyebrow={`مرحباً ${displayName}`}
      hero={hero}
      periods={PERIOD_OPTIONS}
      activePeriod={period}
      onPeriodChange={(value) => setPeriod(value as RepairTechnicianHomePeriod)}
      onRefresh={() => { void refetch(); }}
      refreshing={isFetching}
      rangeLabel={periodLabel(period)}
      secondarySummary="روابط سريعة"
      secondary={(
        <Link to={withTenantPath(tenantSlug, '/repair/my-jobs')}>
          <Button size="sm" type="button">طلباتي</Button>
        </Link>
      )}
    >
      <OpsDashPanel title="إنجاز يومي" accent="repair">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            جاري التحميل...
          </p>
        ) : dailyOutcomes.every((d) => d.created === 0 && d.fixed === 0 && d.unrepairable === 0) ? (
          <div className="ops-module-charts__empty">
            <span className="ops-module-charts__empty-mark" aria-hidden />
            <p className="ops-module-charts__empty-label">لا توجد حركة في هذه الفترة</p>
          </div>
        ) : (
          <div className="ops-module-charts__chart ops-module-charts__chart--tall" dir="ltr">
            <ResponsiveContainer>
              <ComposedChart data={dailyOutcomes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  formatter={(value: number) => num(value)}
                  contentStyle={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    fontSize: 11,
                    direction: 'rtl',
                  }}
                />
                <Bar dataKey="created" name="وارد" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={10} />
                <Bar dataKey="fixed" name="تم الإصلاح" fill="#059669" radius={[4, 4, 0, 0]} barSize={10} />
                <Bar dataKey="unrepairable" name="غير قابل" fill="#e11d48" radius={[4, 4, 0, 0]} barSize={10} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="المتأخر عن الموعد" accent="repair" className="border-amber-200/80 dark:border-amber-900/40">
        <div className="erp-mobile-card-list p-2 md:hidden">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              جاري التحميل...
            </p>
          ) : metrics.delayedJobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا توجد طلبات متأخرة حالياً.</p>
          ) : (
            metrics.delayedJobs.map((row) => (
              <TechJobRowCard
                key={row.id || row.receiptNo}
                job={row}
                dateValue={row.dueAt}
                tenantSlug={tenantSlug}
                dateTone="amber"
              />
            ))
          )}
        </div>
        <div className="erp-desktop-table hidden overflow-x-auto md:block">
          <table className="table erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-right">الإيصال</th>
                <th className="erp-th text-right">الجهاز</th>
                <th className="erp-th text-right">الحالة</th>
                <th className="erp-th text-right">الاستحقاق</th>
                <th className="erp-th text-right">فتح</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    <span role="status" aria-live="polite">جاري التحميل...</span>
                  </td>
                </tr>
              ) : metrics.delayedJobs.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    لا توجد طلبات متأخرة حالياً.
                  </td>
                </tr>
              ) : metrics.delayedJobs.map((row) => (
                <tr key={row.id || row.receiptNo} className="border-t hover:bg-muted/40">
                  <td className="p-2 font-mono">{row.receiptNo || '—'}</td>
                  <td className="p-2 text-muted-foreground">{formatRepairTechnicianDeviceLabel(row)}</td>
                  <td className="p-2">
                    <StatusBadge status={row.status as RepairJobStatus} />
                  </td>
                  <td className="p-2 tabular-nums text-amber-800 dark:text-amber-200">
                    {formatDate(row.dueAt)}
                  </td>
                  <td className="p-2">
                    {row.id ? (
                      <Link
                        className="text-xs text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${row.id}/workspace`)}
                      >
                        الورشة
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title={`ما تم إصلاحه — ${periodLabel(period)}`} accent="repair">
        <div className="erp-mobile-card-list p-2 md:hidden">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              جاري التحميل...
            </p>
          ) : metrics.fixedJobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا توجد أجهزة تم إصلاحها في هذه الفترة.
            </p>
          ) : (
            metrics.fixedJobs.map((row) => (
              <TechJobRowCard
                key={row.id || row.receiptNo}
                job={row}
                dateValue={row.deliveredAt || row.resolvedAt || row.closedAt || row.updatedAt}
                tenantSlug={tenantSlug}
              />
            ))
          )}
        </div>
        <div className="erp-desktop-table hidden overflow-x-auto md:block">
          <table className="table erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-right">الإيصال</th>
                <th className="erp-th text-right">الجهاز</th>
                <th className="erp-th text-right">الحالة</th>
                <th className="erp-th text-right">التاريخ</th>
                <th className="erp-th text-right">فتح</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    <span role="status" aria-live="polite">جاري التحميل...</span>
                  </td>
                </tr>
              ) : metrics.fixedJobs.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    لا توجد أجهزة تم إصلاحها في هذه الفترة.
                  </td>
                </tr>
              ) : metrics.fixedJobs.map((row) => (
                <tr key={row.id || row.receiptNo} className="border-t hover:bg-muted/40">
                  <td className="p-2 font-mono">{row.receiptNo || '—'}</td>
                  <td className="p-2 text-muted-foreground">{formatRepairTechnicianDeviceLabel(row)}</td>
                  <td className="p-2">
                    <StatusBadge status={row.status as RepairJobStatus} />
                  </td>
                  <td className="p-2 tabular-nums">
                    {formatDate(row.deliveredAt || row.resolvedAt || row.closedAt || row.updatedAt)}
                  </td>
                  <td className="p-2">
                    {row.id ? (
                      <Link
                        className="text-xs text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${row.id}/workspace`)}
                      >
                        الورشة
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      <OpsDashPanel
        title={`غير قابل للإصلاح — ${periodLabel(period)}`}
        accent="repair"
        className="border-rose-200/80 dark:border-rose-900/40"
      >
        <div className="erp-mobile-card-list p-2 md:hidden">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              جاري التحميل...
            </p>
          ) : metrics.unrepairableJobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا توجد طلبات غير قابلة للإصلاح في هذه الفترة.
            </p>
          ) : (
            metrics.unrepairableJobs.map((row) => (
              <TechJobRowCard
                key={row.id || row.receiptNo}
                job={row}
                dateValue={row.resolvedAt || row.closedAt || row.updatedAt}
                tenantSlug={tenantSlug}
              />
            ))
          )}
        </div>
        <div className="erp-desktop-table hidden overflow-x-auto md:block">
          <table className="table erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-right">الإيصال</th>
                <th className="erp-th text-right">الجهاز</th>
                <th className="erp-th text-right">الحالة</th>
                <th className="erp-th text-right">التاريخ</th>
                <th className="erp-th text-right">فتح</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    <span role="status" aria-live="polite">جاري التحميل...</span>
                  </td>
                </tr>
              ) : metrics.unrepairableJobs.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                    لا توجد طلبات غير قابلة للإصلاح في هذه الفترة.
                  </td>
                </tr>
              ) : metrics.unrepairableJobs.map((row) => (
                <tr key={row.id || row.receiptNo} className="border-t hover:bg-muted/40">
                  <td className="p-2 font-mono">{row.receiptNo || '—'}</td>
                  <td className="p-2 text-muted-foreground">{formatRepairTechnicianDeviceLabel(row)}</td>
                  <td className="p-2">
                    <StatusBadge status={row.status as RepairJobStatus} />
                  </td>
                  <td className="p-2 tabular-nums">
                    {formatDate(row.resolvedAt || row.closedAt || row.updatedAt)}
                  </td>
                  <td className="p-2">
                    {row.id ? (
                      <Link
                        className="text-xs text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${row.id}/workspace`)}
                      >
                        عرض
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      {!loading && technicianIds.length === 0 && (
        <OpsDashPanel title="ربط الحساب" accent="repair">
          <p className="text-sm text-muted-foreground">
            لا يمكن حساب الأداء — حسابك غير مربوط بموظف أو معرّف فني.
          </p>
        </OpsDashPanel>
      )}
    </DomainHomeShell>
  );
};

export default RepairTechnicianHome;
