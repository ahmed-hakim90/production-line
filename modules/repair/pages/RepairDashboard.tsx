import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { repairJobService } from '../services/repairJobService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import type { RepairSalesInvoice } from '../types';
import { resolveRepairAccessContext, resolveRepairTechnicianIds } from '../utils/repairAccessContext';
import { resolveRepairSettings } from '../config/repairSettings';

const num = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const shortDay = (isoDate: string) =>
  new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: '2-digit' }).format(new Date(isoDate));
const shortMonth = (isoDate: string) =>
  new Intl.DateTimeFormat('ar-EG', { month: 'short' }).format(new Date(isoDate));

export const RepairDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
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
  const technicianIds = useMemo(
    () => resolveRepairTechnicianIds(userProfile, currentEmployee?.id),
    [userProfile, currentEmployee?.id],
  );
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<RepairSalesInvoice[]>([]);
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

  useEffect(() => {
    let unsub: () => void = () => {};
    if (repairCtx.canViewAllBranches) {
      unsub = repairJobService.subscribeAll(setJobs);
    } else if (repairCtx.jobsTechnicianOnly) {
      unsub = repairJobService.subscribeByTechnicianIds(technicianIds, setJobs);
    } else if (userBranchIds.length > 1) {
      unsub = repairJobService.subscribeByBranches(userBranchIds, setJobs);
    } else {
      unsub = repairJobService.subscribeByBranch(userBranchIds[0] || '', setJobs);
    }
    return () => unsub();
  }, [repairCtx.canViewAllBranches, repairCtx.jobsTechnicianOnly, JSON.stringify(userBranchIds), JSON.stringify(technicianIds)]);

  useEffect(() => {
    let unsub: () => void = () => {};
    if (repairCtx.canViewAllBranches) {
      unsub = repairSalesInvoiceService.subscribeAll(setSalesInvoices);
    } else if (userBranchIds.length > 1) {
      unsub = repairSalesInvoiceService.subscribeByBranches(userBranchIds, setSalesInvoices);
    } else {
      unsub = repairSalesInvoiceService.subscribeByBranch(userBranchIds[0] || '', setSalesInvoices);
    }
    return () => unsub();
  }, [repairCtx.canViewAllBranches, JSON.stringify(userBranchIds)]);

  const kpis = useMemo(() => {
    const openJobs = jobs.filter((j) => repairSettings.workflow.openStatusIds.includes(j.status)).length;
    const pendingDelivery = jobs.filter((j) => j.status === 'ready').length;
    const repairRevenue = jobs
      .filter((j) => j.status === 'delivered')
      .reduce((sum, j) => sum + Number(j.finalCost || 0), 0);
    const partsRevenue = salesInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
    const totalRevenue = repairRevenue + partsRevenue;
    const all = jobs.length || 1;
    const successRate = (jobs.filter((j) => j.status === 'delivered').length / all) * 100;
    return { openJobs, pendingDelivery, repairRevenue, partsRevenue, totalRevenue, successRate };
  }, [jobs, salesInvoices, repairSettings.workflow.openStatusIds]);
  const recent = useMemo(() => jobs.slice(0, 6), [jobs]);
  const avgTicket = useMemo(() => {
    const delivered = jobs.filter((job) => job.status === 'delivered');
    if (delivered.length === 0) return 0;
    const total = delivered.reduce((sum, row) => sum + Number(row.finalCost || 0), 0);
    return total / delivered.length;
  }, [jobs]);
  const statusChartData = useMemo(
    () =>
      (repairSettings.workflow.statuses.map((s) => s.id).length > 0
        ? repairSettings.workflow.statuses.map((s) => s.id)
        : REPAIR_JOB_STATUSES).map((status) => ({
        key: status,
        name: repairSettings.statusMap[status]?.label || REPAIR_JOB_STATUS_LABELS[status] || status,
        value: jobs.filter((job) => job.status === status).length,
      })).filter((row) => row.value > 0),
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
  const monthlyRevenueData = useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - idx));
      const key = d.toISOString().slice(0, 7);
      return { key, month: shortMonth(`${key}-01`), revenue: 0, delivered: 0 };
    });
    const monthMap = new Map(months.map((m) => [m.key, m]));
    jobs
      .filter((job) => job.status === 'delivered')
      .forEach((job) => {
        const key = String(job.createdAt || '').slice(0, 7);
        const row = monthMap.get(key);
        if (!row) return;
        row.delivered += 1;
        row.revenue += Number(job.finalCost || 0);
      });
    return months;
  }, [jobs]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">لوحة الصيانة</h1>
              <p className="text-sm text-muted-foreground mt-1">متابعة حالة الطلبات، الأداء، والإيرادات في مكان واحد.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={withTenantPath(tenantSlug, '/repair/jobs/new')}>
                <Button>جهاز جديد</Button>
              </Link>
              <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
                <Button variant="outline">عرض الطلبات</Button>
              </Link>
              <Link to={withTenantPath(tenantSlug, '/repair/parts')}>
                <Button variant="outline">قطع الغيار</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">طلبات مفتوحة</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{num(kpis.openJobs)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">بانتظار التسليم</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{num(kpis.pendingDelivery)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إيرادات الصيانة</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-emerald-600">{num(kpis.repairRevenue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">مبيعات قطع الغيار (فواتير)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-sky-600">{num(kpis.partsRevenue)}</p></CardContent>
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
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الإيراد التشغيلي</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-emerald-700">{num(kpis.totalRevenue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">متوسط قيمة الطلب المنجز</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-primary">{num(Math.round(avgTicket))}</p></CardContent>
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
        <CardHeader><CardTitle>إيراد الصيانة الشهري (آخر 6 أشهر)</CardTitle></CardHeader>
        <CardContent className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => [num(value), name === 'revenue' ? 'الإيراد' : 'طلبات منجزة']} />
              <Bar dataKey="revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
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
                <Badge variant="secondary">{repairSettings.statusMap[job.status]?.label || REPAIR_JOB_STATUS_LABELS[job.status] || job.status}</Badge>
              </div>
            </div>
          ))}
          {recent.length === 0 && <div className="text-muted-foreground">لا توجد طلبات حتى الآن.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairDashboard;
