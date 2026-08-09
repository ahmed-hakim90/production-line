import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { StatusBadge } from '../components/StatusBadge';
import { resolveRepairSettings } from '../config/repairSettings';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import {
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
 * View-only technician home: monthly (default) KPIs + fixed/delayed job lists.
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

  const displayName = String(userDisplayName || '').trim() || 'فني الصيانة';

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-3 md:p-6" dir={dir}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض لوحة أداء الفني.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-3 md:p-6" dir={dir}>
      <PageHeader
        title="لوحة الفني"
        subtitle={`مرحباً ${displayName}`}
        icon="engineering"
        primaryAction={{
          label: 'تحديث',
          icon: 'refresh',
          onClick: () => void refetch(),
          disabled: isFetching,
        }}
        actions={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full items-center gap-1 rounded-lg bg-muted p-1 sm:w-auto">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors sm:flex-none ${
                    period === opt.value
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link to={withTenantPath(tenantSlug, '/repair/my-jobs')} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" size="sm" type="button">طلباتي</Button>
            </Link>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-2 md:gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-muted-foreground md:text-sm">
              الطلبات ({periodLabel(period)})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums md:text-3xl">
              {loading ? '…' : num(metrics.requestsCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-muted-foreground md:text-sm">تم الإصلاح</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums text-emerald-600 md:text-3xl">
              {loading ? '…' : num(metrics.fixedCount)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20">
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-rose-900 dark:text-rose-200 md:text-sm">
              غير قابل للإصلاح
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300 md:text-3xl">
              {loading ? '…' : num(metrics.unrepairableCount)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-amber-900 dark:text-amber-200 md:text-sm">المتأخر</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-200 md:text-3xl">
              {loading ? '…' : num(metrics.delayedCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-muted-foreground md:text-sm">مفتوحة حالياً</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums md:text-3xl">
              {loading ? '…' : num(metrics.openCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="text-xs text-muted-foreground md:text-sm">نسبة النجاح</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <p className="text-2xl font-bold tabular-nums md:text-3xl">
              {loading ? '…' : formatPct(metrics.successRate, metrics.completedOutcomesCount > 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile: card sections — delayed first, then fixed, then unrepairable */}
      <div className="space-y-4 md:hidden">
        <Card className="border-amber-200/80 dark:border-amber-900/40">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-base text-amber-900 dark:text-amber-200">
              المتأخر عن الموعد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-base">ما تم إصلاحه — {periodLabel(period)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
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
          </CardContent>
        </Card>

        <Card className="border-rose-200/80 dark:border-rose-900/40">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-base text-rose-900 dark:text-rose-200">
              غير قابل للإصلاح — {periodLabel(period)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
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
          </CardContent>
        </Card>
      </div>

      {/* Desktop: existing three tables */}
      <div className="hidden gap-4 md:grid md:grid-cols-1 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ما تم إصلاحه — {periodLabel(period)}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
          </CardContent>
        </Card>

        <Card className="border-rose-200/80 dark:border-rose-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-rose-900 dark:text-rose-200">
              غير قابل للإصلاح — {periodLabel(period)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 dark:border-amber-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900 dark:text-amber-200">المتأخر عن الموعد</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
          </CardContent>
        </Card>
      </div>

      {!loading && technicianIds.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              لا يمكن حساب الأداء — حسابك غير مربوط بموظف أو معرّف فني.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RepairTechnicianHome;
