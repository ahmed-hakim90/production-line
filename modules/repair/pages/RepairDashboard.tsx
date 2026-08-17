import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { withTenantPath } from '@/lib/tenantPaths';
import { isFullManufacturerWarrantyJob, sumManufacturerWarrantyPartsCost } from '../lib/repairManufacturerWarranty';
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
import { isDeliveredStatus, isUnrepairableStatus, isCancelledStatus, mapLegacyRepairStatus } from '../utils/repairWorkflowNormalize';
import {
  buildRepairOpenAgingBars,
  isRepairJobOpenStatus,
} from '../lib/repairTechnicianHomeMetrics';
import { getTodayDateString } from '@/utils/calculations';
import { REPAIR_JOB_DASHBOARD_LIMIT } from '../services/repairJobService';
import { StatusBadge } from '../components/StatusBadge';
import { RepairAdminDashboard } from './RepairAdminDashboard';
import { custodyAgeDays } from '../lib/repairCustomerOpsLabels';
import { summarizeCustodyAging } from '../lib/repairCustomerCustody';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';

const num = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const shortDay = (isoDate: string) =>
  new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: '2-digit' }).format(new Date(isoDate));

const CHART_TICK = { fontSize: 10, fill: 'var(--color-text-muted)' };
const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 80%, transparent)';

function shortId(id: string): string {
  const t = String(id || '').trim();
  if (!t || t === 'غير_مسند') return 'غير مسند';
  return t.length > 10 ? `${t.slice(0, 8)}…` : t;
}

const RepairOperationalDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
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
  const [refreshing, setRefreshing] = useState(false);
  const [custodyAging, setCustodyAging] = useState(() =>
    summarizeCustodyAging([], custodyAgeDays),
  );
  const canViewCustody = can('repair.custody.view') || can('repair.custody.handover');
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

  const userBranchKey = userBranchIds.join('|');

  useEffect(() => {
    if (!canViewCustody) {
      setCustodyAging(summarizeCustodyAging([], custodyAgeDays));
      return;
    }
    if (!repairCtx.canViewAllBranches && userBranchIds.length === 0) {
      setCustodyAging(summarizeCustodyAging([], custodyAgeDays));
      return;
    }
    let cancelled = false;
    void repairCustomerOperationsService
      .listCustody(repairCtx.canViewAllBranches ? [] : userBranchIds)
      .then((rows) => {
        if (!cancelled) setCustodyAging(summarizeCustodyAging(rows, custodyAgeDays));
      })
      .catch(() => {
        if (!cancelled) setCustodyAging(summarizeCustodyAging([], custodyAgeDays));
      });
    return () => {
      cancelled = true;
    };
    // userBranchKey stabilizes array identity for branch-scoped operators.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional key
  }, [canViewCustody, repairCtx.canViewAllBranches, userBranchKey]);
  const { rawJobs: jobs, refetch: refetchJobs } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: repairCtx.canViewAllBranches,
    technicianOnly: repairCtx.jobsTechnicianOnly,
    technicianIds,
    listLimit: REPAIR_JOB_DASHBOARD_LIMIT,
  });
  const jobsTruncated = jobs.length >= REPAIR_JOB_DASHBOARD_LIMIT;

  const techLabelById = useMemo(() => {
    const map = new Map<string, string>();
    rawEmployees.forEach((employee) => {
      const name = String(employee.name || '').trim();
      if (!name) return;
      const empId = String(employee.id || '').trim();
      const userId = String(employee.userId || '').trim();
      if (empId) map.set(empId, name);
      if (userId && !map.has(userId)) map.set(userId, name);
    });
    return map;
  }, [rawEmployees]);

  const resolveTechLabel = (id: string) => {
    const key = String(id || '').trim() || 'غير_مسند';
    if (key === 'غير_مسند') return 'غير مسند';
    return techLabelById.get(key) || shortId(key);
  };

  const openStatusIds = repairSettings.workflow.openStatusIds;

  const kpis = useMemo(() => {
    const openJobs = jobs.filter((j) => isRepairJobOpenStatus(j.status, openStatusIds)).length;
    const pendingDelivery = jobs.filter((j) => mapLegacyRepairStatus(j.status) === 'ready').length;
    const delivered = jobs.filter((j) => isDeliveredStatus(j.status)).length;
    const unrepairable = jobs.filter((j) => isUnrepairableStatus(j.status)).length;
    const terminal = delivered + unrepairable;
    const successRate = terminal > 0 ? (delivered / terminal) * 100 : 0;
    return { openJobs, pendingDelivery, successRate };
  }, [jobs, openStatusIds]);

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
    const today = getTodayDateString();
    const todayDate = new Date(`${today}T12:00:00`);
    const days = Array.from({ length: 14 }).map((_, idx) => {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - (13 - idx));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      return { key, day: shortDay(key), created: 0, delivered: 0 };
    });
    const dayMap = new Map(days.map((d) => [d.key, d]));
    jobs.forEach((job) => {
      const createdKey = String(job.createdAt || '').slice(0, 10);
      const createdRow = dayMap.get(createdKey);
      if (createdRow) createdRow.created += 1;
      if (isDeliveredStatus(job.status)) {
        const deliveredKey = String(job.deliveredAt || job.resolvedAt || job.closedAt || '').slice(0, 10);
        const deliveredRow = dayMap.get(deliveredKey);
        if (deliveredRow) deliveredRow.delivered += 1;
      }
    });
    return days;
  }, [jobs]);

  const delayedCount = useMemo(() => {
    const now = Date.now();
    return jobs.filter(
      (j) =>
        isRepairJobOpenStatus(j.status, openStatusIds)
        && j.dueAt
        && Date.parse(String(j.dueAt)) < now,
    ).length;
  }, [jobs, openStatusIds]);

  const workloadRows = useMemo(() => {
    const m = new Map<string, number>();
    jobs.forEach((j) => {
      if (!isRepairJobOpenStatus(j.status, openStatusIds)) return;
      const key = String(j.technicianId || '').trim() || 'غير_مسند';
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([id, count]) => ({ id, name: resolveTechLabel(id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 14);
  }, [jobs, openStatusIds, techLabelById]);

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
      const canonical = mapLegacyRepairStatus(j.status);
      if (!hot.has(canonical)) return;
      const key = `${j.deviceBrand} ${j.deviceModel}`.trim() || 'غير محدد';
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [jobs]);

  const agingBars = useMemo(
    () => buildRepairOpenAgingBars(jobs, openStatusIds),
    [jobs, openStatusIds],
  );

  const unassignedCount = jobs.filter((job) => {
    if (job.technicianId) return false;
    const status = mapLegacyRepairStatus(job.status);
    return !isDeliveredStatus(status) && !isUnrepairableStatus(status) && !isCancelledStatus(status);
  }).length;
  const waitingCustomerCount = jobs.filter((job) => {
    if (isFullManufacturerWarrantyJob(job)) return false;
    if (String(job.approvalStatus || '') === 'not_required') return false;
    const status = mapLegacyRepairStatus(job.status);
    return status === 'estimate_ready' || status === 'waiting_approval';
  }).length;
  const waitingPartsCount = jobs.filter((job) => mapLegacyRepairStatus(job.status) === 'waiting_parts').length;
  const inWorkshopCount = jobs.filter((job) => {
    const status = mapLegacyRepairStatus(job.status);
    return status === 'diagnosing' || status === 'diagnosed' || status === 'repairing' || status === 'testing';
  }).length;

  const handleRefresh = () => {
    setRefreshing(true);
    const custodyReload = canViewCustody
      ? repairCustomerOperationsService
          .listCustody(repairCtx.canViewAllBranches ? [] : userBranchIds)
          .then((rows) => setCustodyAging(summarizeCustodyAging(rows, custodyAgeDays)))
          .catch(() => setCustodyAging(summarizeCustodyAging([], custodyAgeDays)))
      : Promise.resolve();
    void Promise.all([Promise.resolve(refetchJobs()), custodyReload]).finally(() => setRefreshing(false));
  };

  const hero = [
    {
      key: 'open',
      label: 'طلبات مفتوحة',
      value: num(kpis.openJobs),
      accent: true as const,
      onClick: () => navigate(withTenantPath(tenantSlug, '/repair/jobs?focus=open')),
    },
    {
      key: 'delayed',
      label: 'متأخرة',
      value: num(delayedCount),
      toneClassName: delayedCount > 0 ? 'ops-dash-kpi-card--warn' : undefined,
      onClick: () => navigate(withTenantPath(tenantSlug, '/repair/jobs?focus=overdue')),
    },
    {
      key: 'ready',
      label: 'جاهز ولم يُسلَّم',
      value: num(kpis.pendingDelivery),
      onClick: () => navigate(withTenantPath(tenantSlug, '/repair/payments')),
    },
    {
      key: 'success',
      label: 'نسبة النجاح',
      value: `${kpis.successRate.toFixed(1)}%`,
    },
    ...(canViewCustody
      ? [
          {
            key: 'custody7',
            label: 'عهدة +7 أيام',
            value: num(custodyAging.aging7Rows),
            toneClassName: custodyAging.aging7Rows > 0 ? 'ops-dash-kpi-card--warn' : undefined,
            onClick: () => navigate(withTenantPath(tenantSlug, '/repair/custody-stock?age=7')),
          },
          {
            key: 'custody14',
            label: 'عهدة +14 يوم',
            value: num(custodyAging.aging14Rows),
            toneClassName: custodyAging.aging14Rows > 0 ? 'ops-dash-kpi-card--warn' : undefined,
            onClick: () => navigate(withTenantPath(tenantSlug, '/repair/custody-stock?age=14')),
          },
        ]
      : []),
    {
      key: 'unassigned',
      label: 'غير مسند',
      value: num(unassignedCount),
    },
    {
      key: 'workshop',
      label: 'الورشة',
      value: num(inWorkshopCount),
      meta: `قطع ${num(waitingPartsCount)} · عميل ${num(waitingCustomerCount)}`,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة الصيانة"
      hero={hero}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      secondarySummary="إجراءات وروابط الصيانة"
      secondary={(
        <div className="flex flex-wrap gap-2">
          {jobsTruncated ? (
            <p className="w-full text-xs text-[rgb(var(--color-warning))]">
              المؤشرات من أحدث {num(REPAIR_JOB_DASHBOARD_LIMIT)} طلباً — قد تكون الأرقام ناقصة للمستأجرين الكبار.
            </p>
          ) : null}
          {can('repair.jobs.create') && (
            <Button
              size="sm"
              type="button"
              onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs/new'))}
            >
              جهاز جديد
            </Button>
          )}
          <Link to={withTenantPath(tenantSlug, '/repair/call-center')}>
            <Button variant="outline" size="sm">مركز الاتصال</Button>
          </Link>
          <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
            <Button variant="outline" size="sm">عرض الطلبات</Button>
          </Link>
          {(can('repair.customerRequests.view') || can('repair.customerRequests.assign') || can('repair.customerRequests.receive')) && (
            <Link to={withTenantPath(tenantSlug, '/repair/customer-requests')}>
              <Button variant="outline" size="sm">طلبات العملاء</Button>
            </Link>
          )}
          {(can('repair.custody.view') || can('repair.custody.handover')) && (
            <Link to={withTenantPath(tenantSlug, '/repair/custody-stock')}>
              <Button variant="outline" size="sm">العهدة</Button>
            </Link>
          )}
          {(can('repair.replacements.view') || can('repair.replacements.approve') || can('repair.replacements.deliver')) && (
            <Link to={withTenantPath(tenantSlug, '/repair/replacements')}>
              <Button variant="outline" size="sm">الاستبدال</Button>
            </Link>
          )}
          <Link to={withTenantPath(tenantSlug, '/repair/parts')}>
            <Button variant="outline" size="sm">قطع الغيار</Button>
          </Link>
        </div>
      )}
    >
      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">نسبة إنهاء الطلبات</p>
          <p className="ops-module-charts__qty-value">{kpis.successRate.toFixed(1)}%</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">إجمالي الطلبات</p>
          <p className="ops-module-charts__qty-value">{num(jobs.length)}</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">متوسط المدة (ساعة)</p>
          <p className="ops-module-charts__qty-value">{avgResolutionHours.toFixed(1)}</p>
        </div>
        <div className="ops-module-charts__qty">
          <p className="ops-module-charts__qty-label">تكلفة قطع تحت ضمان</p>
          <p className="ops-module-charts__qty-value">{num(warrantyPartsCost)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsDashPanel title="عبء الفنيين (طلبات مفتوحة)" accent="repair">
          <div className="ops-module-charts__chart" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={workloadRows} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={88} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="count" name="العدد" fill="var(--chart-1)" radius={[0, 8, 8, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </OpsDashPanel>
        <OpsDashPanel title="أكثر الموديلات ظهورًا في الورشة" accent="repair">
          <div className="ops-module-charts__chart" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={topModels} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={56} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="count" name="العدد" fill="var(--chart-5)" radius={[8, 8, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </OpsDashPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <OpsDashPanel title="توزيع حالات الطلبات" accent="repair" className="xl:col-span-1">
          <div className="ops-module-charts__chart" dir="ltr">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={78} paddingAngle={2}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.key} fill={repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || 'var(--color-text-muted)'} />
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
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {statusChartData.map((entry) => (
              <Badge key={entry.key} variant="outline" className="gap-1 text-[10px]">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || 'var(--color-text-muted)' }} />
                {entry.name}: {num(entry.value)}
              </Badge>
            ))}
          </div>
        </OpsDashPanel>
        <OpsDashPanel title="وارد وتسليم (آخر 14 يوم)" accent="repair" className="xl:col-span-2">
          <div className="ops-module-charts__chart ops-module-charts__chart--tall" dir="ltr">
            <ResponsiveContainer>
              <LineChart data={dailyTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip formatter={(value: number) => num(value)} />
                <Line type="monotone" dataKey="created" name="وارد" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="delivered" name="تسليم" stroke="var(--color-success-hex)" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </OpsDashPanel>
      </div>

      <OpsDashPanel title="عمر الطلبات المفتوحة" accent="repair">
        <div className="ops-module-charts__chart" dir="ltr">
          <ResponsiveContainer>
            <BarChart data={agingBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={28} />
              <Tooltip formatter={(v: number) => num(v)} />
              <Bar dataKey="value" name="العدد" fill="var(--color-warning-hex)" radius={[8, 8, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </OpsDashPanel>

      <OpsDashPanel
        title="آخر الطلبات"
        accent="repair"
        action={(
          <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
            <Button variant="outline" size="sm" type="button">الكل</Button>
          </Link>
        )}
      >
        <div className="erp-mobile-card-list p-2 md:hidden">
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا توجد طلبات حتى الآن.</p>
          ) : (
            recent.map((job) => (
              <Link
                key={job.id}
                to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm transition-colors active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">#{job.receiptNo}</p>
                    <p className="mt-0.5 truncate text-sm font-medium">{job.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.deviceBrand} {job.deviceModel}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="erp-desktop-table hidden overflow-x-auto md:block">
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا توجد طلبات حتى الآن.</p>
          ) : (
            <table className="table erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-right">الإيصال</th>
                  <th className="erp-th text-right">العميل</th>
                  <th className="erp-th text-right">الجهاز</th>
                  <th className="erp-th text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((job) => (
                  <tr key={job.id} className="border-t hover:bg-muted/40">
                    <td className="p-2 font-mono">
                      <Link
                        className="text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}
                      >
                        #{job.receiptNo}
                      </Link>
                    </td>
                    <td className="p-2 font-medium">{job.customerName}</td>
                    <td className="p-2 text-muted-foreground">
                      {job.deviceBrand} {job.deviceModel}
                    </td>
                    <td className="p-2">
                      <StatusBadge status={job.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </OpsDashPanel>
    </DomainHomeShell>
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
