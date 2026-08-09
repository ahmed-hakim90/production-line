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
import { repairBranchService } from '../services/repairBranchService';
import {
  REPAIR_JOB_STATUSES,
  REPAIR_JOB_STATUS_COLORS,
  REPAIR_JOB_STATUS_LABELS,
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairJob,
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
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);

  useEffect(() => {
    if (can('repair.branches.manage') || !userProfile?.id) {
      setAssignedBranchIds([]);
      return;
    }
    void repairBranchService.list().then((branchRows) => {
      const uid = String(userProfile.id || '').trim();
      const eid = String(currentEmployee?.id || '').trim();
      const ids = branchRows
        .filter((branch) => {
          const t = branch.technicianIds || [];
          return (uid && t.includes(uid)) || (eid && t.includes(eid));
        })
        .map((branch) => branch.id || '')
        .filter(Boolean);
      setAssignedBranchIds(ids);
    });
  }, [can, userProfile?.id, currentEmployee?.id]);

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


  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6">
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
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              type="button"
              size="sm"
              onClick={() => {
                void refetchJobs();
              }}
            >
              تحديث
            </Button>
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
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">طلبات مفتوحة</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{num(kpis.openJobs)}</p></CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader><CardTitle className="text-sm text-amber-900">متأخرة عن الموعد</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-800">{num(delayedCount)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">جاهز للدفع/التسليم</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{num(kpis.pendingDelivery)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">غير مسند</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{num(jobs.filter((job) => !job.technicianId && !isDeliveredStatus(job.status)).length)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">انتظار العميل</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-violet-700">{num(jobs.filter((job) => ['estimate_ready', 'waiting_approval'].includes(job.status)).length)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">انتظار قطع</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-orange-700">{num(jobs.filter((job) => job.status === 'waiting_parts').length)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">قيد الإصلاح/الاختبار</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-sky-700">{num(jobs.filter((job) => ['diagnosing', 'repairing', 'testing'].includes(job.status)).length)}</p></CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">نسبة إنهاء الطلبات</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{kpis.successRate.toFixed(1)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الطلبات</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{num(jobs.length)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">متوسط مدة الإصلاح (ساعة)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{avgResolutionHours.toFixed(1)}</p></CardContent>
        </Card>
        <Card className="md:col-span-3 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">تكلفة قطع تحت ضمان</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{num(warrantyPartsCost)} ج.م</p>
            <p className="mt-1 text-xs text-muted-foreground">من تكلفة الصرف الفعلية (ليس سعر البيع)</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>عبء الفنيين (طلبات مفتوحة)</CardTitle></CardHeader>
          <CardContent className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadRows} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="id" width={88} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>أكثر الموديلات ظهورًا في الورشة</CardTitle></CardHeader>
          <CardContent className="h-64 min-w-0">
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle>توزيع حالات الطلبات</CardTitle></CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>
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
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {statusChartData.map((entry) => (
                <Badge key={entry.key} variant="outline" className="gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: repairSettings.statusMap[entry.key]?.color || REPAIR_JOB_STATUS_COLORS[entry.key] || '#64748b' }} />
                  {entry.name}: {num(entry.value)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>اتجاه الطلبات اليومية (آخر 14 يوم)</CardTitle></CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value: number) => num(value)} />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>آخر الطلبات</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {recent.map((job) => (
            <div key={job.id} className="flex items-center justify-between border rounded px-2 py-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">#{job.receiptNo}</Badge>
                <span>{job.customerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{job.deviceBrand} {job.deviceModel}</span>
                <StatusBadge status={job.status} />
              </div>
            </div>
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
