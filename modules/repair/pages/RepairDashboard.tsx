import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { withTenantPath } from '@/lib/tenantPaths';
import { sumManufacturerWarrantyPartsCost } from '../lib/repairManufacturerWarranty';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { repairBranchService } from '../services/repairBranchService';
import {
  REPAIR_JOB_STATUSES,
  REPAIR_JOB_STATUS_COLORS,
  REPAIR_JOB_STATUS_LABELS,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJobStatus,
} from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveRepairSettings } from '../config/repairSettings';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { isDeliveredStatus, mapLegacyRepairStatus } from '../utils/repairWorkflowNormalize';
import { isRepairJobOpenStatus } from '../lib/repairTechnicianHomeMetrics';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { RepairAdminDashboard } from './RepairAdminDashboard';

const num = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const shortDay = (isoDate: string) =>
  new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: '2-digit' }).format(new Date(isoDate));

const RepairOperationalDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [userProfile, userRoleName, systemSettings, userPermissions],
  );
  const technicianIds = useRepairTechnicianIds(userProfile, currentEmployee?.id);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const userBranchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user: userProfile,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: repairCtx.canViewAllBranches,
      }),
    [userProfile, branches, currentEmployee?.id, repairCtx.canViewAllBranches],
  );

  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);

  const { rawJobs: jobs, refetch: refetchJobs } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: repairCtx.canViewAllBranches,
    technicianOnly: repairCtx.jobsTechnicianOnly,
    technicianIds,
  });

  const kpis = useMemo(() => {
    const openIds = repairSettings.workflow.openStatusIds;
    const openJobs = jobs.filter((j) => isRepairJobOpenStatus(j.status, openIds)).length;
    const pendingDelivery = jobs.filter((j) => mapLegacyRepairStatus(j.status) === 'ready').length;
    const all = jobs.length || 1;
    const successRate = (jobs.filter((j) => isDeliveredStatus(j.status)).length / all) * 100;
    return { openJobs, pendingDelivery, successRate };
  }, [jobs, repairSettings.workflow.openStatusIds]);
  const recent = useMemo(() => jobs.slice(0, 6), [jobs]);
  const statusChartData = useMemo(
    () =>
      (repairSettings.workflow.statuses.map((s) => s.id).length > 0
        ? repairSettings.workflow.statuses.map((s) => s.id)
        : REPAIR_JOB_STATUSES).map((status) => {
        const canonical = mapLegacyRepairStatus(status);
        return {
          key: canonical,
          name: repairSettings.statusMap[canonical]?.label || REPAIR_JOB_STATUS_LABELS[canonical] || canonical,
          value: jobs.filter((job) => mapLegacyRepairStatus(job.status) === canonical).length,
        };
      }).filter((row) => row.value > 0),
    [jobs, repairSettings.workflow.statuses, repairSettings.statusMap],
  );
  const dailyTrendData = useMemo(() => {
    const days = Array.from({ length: 14 }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - idx));
      const key = d.toISOString().slice(0, 10);
      return { key, day: shortDay(key), total: 0 };
    });
    const dayMap = new Map(days.map((d) => [d.key, d]));
    jobs.forEach((job) => {
      const key = String(job.createdAt || '').slice(0, 10);
      const row = dayMap.get(key);
      if (row) row.total += 1;
    });
    return days;
  }, [jobs]);

  const delayedCount = useMemo(() => {
    const now = Date.now();
    const openIds = repairSettings.workflow.openStatusIds;
    return jobs.filter(
      (j) =>
        isRepairJobOpenStatus(j.status, openIds)
        && j.dueAt
        && Date.parse(String(j.dueAt)) < now,
    ).length;
  }, [jobs, repairSettings.workflow.openStatusIds]);

  const workloadRows = useMemo(() => {
    const m = new Map<string, number>();
    const openIds = repairSettings.workflow.openStatusIds;
    jobs.forEach((j) => {
      if (!isRepairJobOpenStatus(j.status, openIds)) return;
      const key = String(j.technicianId || '').trim() || 'غير_مسند';
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 14);
  }, [jobs, repairSettings.workflow.openStatusIds]);

  const avgResolutionHours = useMemo(() => {
    const rows = jobs.filter((j) => isDeliveredStatus(j.status) && typeof j.resolutionMinutes === 'number');
    if (rows.length === 0) return 0;
    const sum = rows.reduce((s, j) => s + Number(j.resolutionMinutes || 0), 0);
    return sum / rows.length / 60;
  }, [jobs]);

  const warrantyPartsCost = useMemo(
    () => sumManufacturerWarrantyPartsCost(jobs),
    [jobs],
  );

  const topModels = useMemo(() => {
    const m = new Map<string, number>();
    const hot = new Set(['repairing', 'testing', 'ready', 'delivered', 'unrepairable']);
    jobs.forEach((j) => {
      if (!hot.has(j.status)) return;
      const key = `${j.deviceBrand} ${j.deviceModel}`.trim() || 'غير محدد';
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [jobs]);


  const unassignedCount = jobs.filter((job) => !job.technicianId && !isDeliveredStatus(job.status)).length;
  const waitingCustomerCount = jobs.filter((job) => ['estimate_ready', 'waiting_approval'].includes(job.status)).length;
  const waitingPartsCount = jobs.filter((job) => job.status === 'waiting_parts').length;
  const inWorkshopCount = jobs.filter((job) => ['diagnosing', 'repairing', 'testing'].includes(job.status)).length;

  const kpiCards = [
    { key: 'open', label: 'طلبات مفتوحة', value: kpis.openJobs, tone: '' },
    {
      key: 'delayed',
      label: 'متأخرة عن الموعد',
      value: delayedCount,
      tone: 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20',
      titleTone: 'text-amber-900 dark:text-amber-200',
      valueTone: 'text-amber-800 dark:text-amber-200',
    },
    { key: 'ready', label: 'جاهز للدفع/التسليم', value: kpis.pendingDelivery, tone: '' },
    { key: 'unassigned', label: 'غير مسند', value: unassignedCount, tone: '' },
    {
      key: 'waiting_customer',
      label: 'انتظار العميل',
      value: waitingCustomerCount,
      tone: '',
      valueTone: 'text-violet-700 dark:text-violet-300',
    },
    {
      key: 'waiting_parts',
      label: 'انتظار قطع',
      value: waitingPartsCount,
      tone: '',
      valueTone: 'text-orange-700 dark:text-orange-300',
    },
    {
      key: 'workshop',
      label: 'قيد الإصلاح/الاختبار',
      value: inWorkshopCount,
      tone: '',
      valueTone: 'text-sky-700 dark:text-sky-300',
    },
  ] as const;

  const metricCards = [
    { key: 'success', label: 'نسبة إنهاء الطلبات', value: `${kpis.successRate.toFixed(1)}%` },
    { key: 'total', label: 'إجمالي الطلبات', value: num(jobs.length) },
    { key: 'avg', label: 'متوسط مدة الإصلاح (ساعة)', value: avgResolutionHours.toFixed(1) },
    {
      key: 'warranty',
      label: 'تكلفة قطع تحت ضمان',
      value: `${num(warrantyPartsCost)} ج.م`,
      hint: 'من تكلفة الصرف الفعلية (ليس سعر البيع)',
    },
  ] as const;

  return (
    <div className="erp-ds-clean space-y-3 p-3 sm:p-4 md:space-y-4 md:p-6">
      <PageHeader
        title="لوحة الصيانة"
        subtitle="لوحة تشغيل الاستقبال: الوارد والإسناد والانتظار والإصلاح والتحصيل والتسليم."
        icon="layout_dashboard"
        primaryAction={can('repair.jobs.create') ? {
          label: 'جهاز جديد',
          icon: 'add',
          onClick: () => navigate(withTenantPath(tenantSlug, '/repair/jobs/new')),
        } : undefined}
        actions={(
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button
              variant="secondary"
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => {
                void refetchJobs();
              }}
            >
              تحديث
            </Button>
            <Link to={withTenantPath(tenantSlug, '/repair/call-center')} className="shrink-0">
              <Button variant="outline" size="sm">مركز الاتصال</Button>
            </Link>
            <Link to={withTenantPath(tenantSlug, '/repair/jobs')} className="shrink-0">
              <Button variant="outline" size="sm">عرض الطلبات</Button>
            </Link>
            {(can('repair.customerRequests.view') || can('repair.customerRequests.assign') || can('repair.customerRequests.receive')) && (
              <Link to={withTenantPath(tenantSlug, '/repair/customer-requests')} className="shrink-0">
                <Button variant="outline" size="sm">طلبات العملاء</Button>
              </Link>
            )}
            {(can('repair.custody.view') || can('repair.custody.handover')) && (
              <Link to={withTenantPath(tenantSlug, '/repair/custody-stock')} className="shrink-0">
                <Button variant="outline" size="sm">العهدة</Button>
              </Link>
            )}
            {(can('repair.replacements.view') || can('repair.replacements.approve') || can('repair.replacements.deliver')) && (
              <Link to={withTenantPath(tenantSlug, '/repair/replacements')} className="shrink-0">
                <Button variant="outline" size="sm">الاستبدال</Button>
              </Link>
            )}
            <Link to={withTenantPath(tenantSlug, '/repair/parts')} className="shrink-0">
              <Button variant="outline" size="sm">قطع الغيار</Button>
            </Link>
          </div>
        )}
      />

      {/* KPI cards: 2 per row on mobile/tablet, denser on desktop */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {kpiCards.map((card) => (
          <Card key={card.key} className={`shadow-sm ${card.tone}`}>
            <CardHeader className="space-y-0 p-3 pb-1 md:p-4 md:pb-2">
              <CardTitle className={`text-[11px] leading-snug text-muted-foreground sm:text-xs md:text-sm ${'titleTone' in card ? card.titleTone : ''}`}>
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <p className={`text-2xl font-bold tabular-nums md:text-3xl ${'valueTone' in card ? card.valueTone : ''}`}>
                {num(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary metrics: 2 per row until large screens */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.key} className="shadow-sm">
            <CardHeader className="space-y-0 p-3 pb-1 md:p-4 md:pb-2">
              <CardTitle className="text-[11px] leading-snug text-muted-foreground sm:text-xs md:text-sm">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <p className="text-xl font-semibold tabular-nums md:text-2xl">{card.value}</p>
              {'hint' in card && card.hint ? (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground md:text-xs">{card.hint}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="p-3 pb-2 md:p-6 md:pb-4">
            <CardTitle className="text-sm md:text-base">عبء الفنيين (طلبات مفتوحة)</CardTitle>
          </CardHeader>
          <CardContent className="h-56 min-w-0 px-2 pb-3 md:h-64 md:px-6 md:pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadRows} layout="vertical" margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="id" width={72} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="p-3 pb-2 md:p-6 md:pb-4">
            <CardTitle className="text-sm md:text-base">أكثر الموديلات ظهورًا في الورشة</CardTitle>
          </CardHeader>
          <CardContent className="h-56 min-w-0 px-2 pb-3 md:h-64 md:px-6 md:pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topModels}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="shadow-sm xl:col-span-1">
          <CardHeader className="p-3 pb-2 md:p-6 md:pb-4">
            <CardTitle className="text-sm md:text-base">توزيع حالات الطلبات</CardTitle>
          </CardHeader>
          <CardContent className="h-60 min-w-0 px-2 md:h-72 md:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={78} paddingAngle={2}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.key} fill={repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item: { payload?: { key: RepairJobStatus } }) => [
                    num(value),
                    item?.payload?.key ? (repairSettings.statusMap[item.payload.key]?.label || REPAIR_JOB_STATUS_LABELS[item.payload.key] || item.payload.key) : 'الحالة',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
          <CardContent className="px-3 pb-3 pt-0 md:px-6 md:pb-6">
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {statusChartData.map((entry) => (
                <Badge key={entry.key} variant="outline" className="gap-1 text-[10px] md:text-xs">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || '#64748b' }} />
                  {entry.name}: {num(entry.value)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="p-3 pb-2 md:p-6 md:pb-4">
            <CardTitle className="text-sm md:text-base">اتجاه الطلبات اليومية (آخر 14 يوم)</CardTitle>
          </CardHeader>
          <CardContent className="h-60 min-w-0 px-2 pb-3 md:h-72 md:px-6 md:pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value: number) => num(value)} />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 md:p-6">
          <CardTitle className="text-sm md:text-base">آخر الطلبات</CardTitle>
          <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
            <Button variant="outline" size="sm" type="button">الكل</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0 text-sm md:p-6 md:pt-0">
          {recent.map((job) => (
            <Link
              key={job.id}
              to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
              className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline" className="shrink-0">#{job.receiptNo}</Badge>
                <span className="truncate font-medium">{job.customerName}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-muted-foreground">{job.deviceBrand} {job.deviceModel}</span>
                <StatusBadge status={job.status} />
              </div>
            </Link>
          ))}
          {recent.length === 0 && <div className="text-muted-foreground">لا توجد طلبات حتى الآن.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export const RepairDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const technicianOnly = can('repair.jobs.technician')
    && !can('repair.view')
    && !can('repair.adminDashboard.view');
  if (technicianOnly) {
    return <Navigate replace to={withTenantPath(tenantSlug, '/repair/technician')} />;
  }
  if (can('repair.adminDashboard.view')) return <RepairAdminDashboard />;
  return <RepairOperationalDashboard />;
};

export default RepairDashboard;
