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
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
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
import {
  buildRepairOpenAgingBars,
  isRepairJobOpenStatus,
} from '../lib/repairTechnicianHomeMetrics';
import { StatusBadge } from '../components/StatusBadge';
import { RepairAdminDashboard } from './RepairAdminDashboard';

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
    const all = jobs.length || 1;
    const successRate = (jobs.filter((j) => isDeliveredStatus(j.status)).length / all) * 100;
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
    const days = Array.from({ length: 14 }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - idx));
      const key = d.toISOString().slice(0, 10);
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
      if (!hot.has(j.status)) return;
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

  const unassignedCount = jobs.filter((job) => !job.technicianId && !isDeliveredStatus(job.status)).length;
  const waitingCustomerCount = jobs.filter((job) => ['estimate_ready', 'waiting_approval'].includes(job.status)).length;
  const waitingPartsCount = jobs.filter((job) => job.status === 'waiting_parts').length;
  const inWorkshopCount = jobs.filter((job) => ['diagnosing', 'repairing', 'testing'].includes(job.status)).length;

  const handleRefresh = () => {
    setRefreshing(true);
    void Promise.resolve(refetchJobs()).finally(() => setRefreshing(false));
  };

  const hero = [
    {
      key: 'open',
      label: 'طلبات مفتوحة',
      value: num(kpis.openJobs),
      accent: true as const,
    },
    {
      key: 'delayed',
      label: 'متأخرة',
      value: num(delayedCount),
      toneClassName: delayedCount > 0 ? 'ops-dash-kpi-card--warn' : undefined,
    },
    {
      key: 'ready',
      label: 'جاهز للدفع/التسليم',
      value: num(kpis.pendingDelivery),
    },
    {
      key: 'success',
      label: 'نسبة النجاح',
      value: `${kpis.successRate.toFixed(1)}%`,
    },
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
      hero={hero}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      secondarySummary="إجراءات وروابط الصيانة"
      secondary={(
        <div className="flex flex-wrap gap-2">
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
      <div className="ops-module-charts__qty-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
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
                <Bar dataKey="count" name="العدد" fill="#0ea5e9" radius={[0, 8, 8, 0]} barSize={12} />
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
                <Bar dataKey="count" name="العدد" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={16} />
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
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {statusChartData.map((entry) => (
              <Badge key={entry.key} variant="outline" className="gap-1 text-[10px]">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || '#64748b' }} />
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
                <Line type="monotone" dataKey="created" name="وارد" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="delivered" name="تسليم" stroke="#059669" strokeWidth={2.5} dot={{ r: 2 }} />
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
              <Bar dataKey="value" name="العدد" fill="#d97706" radius={[8, 8, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </OpsDashPanel>

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
