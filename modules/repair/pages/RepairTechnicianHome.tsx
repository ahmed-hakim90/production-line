import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  type RepairTechnicianHomePeriod,
} from '../lib/repairTechnicianHomeMetrics';
import type { FirestoreUserWithRepair, RepairJobStatus } from '../types';

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
      <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض لوحة أداء الفني.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="لوحة الفني"
        subtitle={`مرحباً ${displayName} — متابعة أدائك والطلبات المسندة إليك`}
        icon="engineering"
        primaryAction={{
          label: 'تحديث',
          icon: 'refresh',
          onClick: () => void refetch(),
          disabled: isFetching,
        }}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    period === opt.value
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link to={withTenantPath(tenantSlug, '/repair/my-jobs')}>
              <Button variant="outline" size="sm" type="button">طلباتي</Button>
            </Link>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">الطلبات ({periodLabel(period)})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{loading ? '…' : num(metrics.requestsCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">تم الإصلاح</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-emerald-600">
              {loading ? '…' : num(metrics.fixedCount)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-rose-900 dark:text-rose-200">غير قابل للإصلاح</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
              {loading ? '…' : num(metrics.unrepairableCount)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-900 dark:text-amber-200">المتأخر</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-amber-800 dark:text-amber-200">
              {loading ? '…' : num(metrics.delayedCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">مفتوحة حالياً</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{loading ? '…' : num(metrics.openCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">نسبة النجاح</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {loading ? '…' : formatPct(metrics.successRate, metrics.completedOutcomesCount > 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
