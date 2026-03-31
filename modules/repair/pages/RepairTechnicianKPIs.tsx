import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import type { FirestoreUserWithRepair, RepairBranch, RepairJob } from '../types';
import { resolveUserRepairBranchIds } from '../types';

const calcDiffDays = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

export const RepairTechnicianKPIs: React.FC = () => {
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const userBranchIds = useMemo(() => resolveUserRepairBranchIds(user), [user]);
  const assignedBranchIds = useMemo(() => {
    if (!user?.id) return [];
    return branches
      .filter((branch) => (branch.technicianIds || []).includes(user.id || ''))
      .map((branch) => branch.id || '')
      .filter(Boolean);
  }, [branches, user?.id]);
  const accessibleBranchIds = useMemo(
    () => Array.from(new Set([...userBranchIds, ...assignedBranchIds])),
    [userBranchIds, assignedBranchIds],
  );
  const resetFilters = () => {
    setFrom('');
    setTo('');
    setTechnicianId('');
    setBranchFilter('all');
  };

  useEffect(() => {
    const unsub = can('repair.branches.manage')
      ? repairJobService.subscribeAll(setJobs)
      : accessibleBranchIds.length > 1
        ? repairJobService.subscribeByBranches(accessibleBranchIds, setJobs)
        : repairJobService.subscribeByBranch(accessibleBranchIds[0] || '', setJobs);
    return () => unsub();
  }, [can, JSON.stringify(accessibleBranchIds)]);
  const selectableBranches = useMemo(() => {
    if (can('repair.branches.manage')) return branches;
    const set = new Set(accessibleBranchIds);
    return branches.filter((branch) => set.has(branch.id || ''));
  }, [can, branches, accessibleBranchIds]);
  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);

  const filtered = useMemo(() => jobs.filter((j) => {
    if (technicianId && j.technicianId !== technicianId) return false;
    if (branchFilter !== 'all' && j.branchId !== branchFilter) return false;
    if (from && j.createdAt < from) return false;
    if (to && j.createdAt > `${to}T23:59:59`) return false;
    return true;
  }), [jobs, technicianId, branchFilter, from, to]);

  const totals = useMemo(() => {
    const delivered = filtered.filter((j) => j.status === 'delivered');
    const unrepaired = filtered.filter((j) => j.status === 'unrepairable');
    const denominator = delivered.length + unrepaired.length;
    const successRate = denominator ? (delivered.length / denominator) * 100 : 0;
    const avgRepair = delivered.length
      ? delivered.reduce((s, j) => s + calcDiffDays(j.createdAt, j.updatedAt), 0) / delivered.length
      : 0;
    const revenue = delivered.reduce((s, j) => s + Number(j.finalCost || 0), 0);
    const open = filtered.filter((j) => !['delivered', 'unrepairable'].includes(j.status)).length;
    return { totalJobs: filtered.length, successRate, avgRepair, revenue, open };
  }, [filtered]);

  const deviceBreakdown = useMemo(() => filtered.reduce<Record<string, number>>((acc, j) => {
    acc[j.deviceType] = (acc[j.deviceType] || 0) + 1;
    return acc;
  }, {}), [filtered]);
  const technicianBreakdown = useMemo(
    () =>
      filtered.reduce<Record<string, { total: number; delivered: number; revenue: number }>>((acc, job) => {
        const key = job.technicianId || 'غير مسند';
        if (!acc[key]) acc[key] = { total: 0, delivered: 0, revenue: 0 };
        acc[key].total += 1;
        if (job.status === 'delivered') {
          acc[key].delivered += 1;
          acc[key].revenue += Number(job.finalCost || 0);
        }
        return acc;
      }, {}),
    [filtered],
  );

  return (
    <div className="space-y-4 w-full" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold">أداء الفنيين</h1>
          <p className="text-sm text-muted-foreground mt-1">تحليل الإنجاز والإيراد حسب الفني والفترة الزمنية.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>فلاتر التحليل</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-2">
          <div><Label>من</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>إلى</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>معرف الفني (اختياري)</Label><Input value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} /></div>
          <div>
            <Label>الفرع</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {selectableBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id || ''}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={resetFilters}>إعادة تعيين</Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الأجهزة</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{fmt(totals.totalJobs)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">نسبة النجاح</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{totals.successRate.toFixed(1)}%</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">متوسط وقت الإصلاح</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{totals.avgRepair.toFixed(1)}</p><span className="text-xs text-muted-foreground">يوم</span></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">إيرادات الفني</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-emerald-600">{fmt(Number(totals.revenue.toFixed(0)))}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">الأجهزة الجارية</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{fmt(totals.open)}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>توزيع الأعطال حسب نوع الجهاز</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-2 text-sm">
          {Object.entries(deviceBreakdown).map(([k, v]) => (
            <div key={k} className="rounded border p-2 flex items-center justify-between">
              <span>{k}</span>
              <Badge variant="secondary">{v}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>ملخص الفنيين</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <div className="rounded border overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">الفني</th>
                  <th className="p-2 text-right">إجمالي الطلبات</th>
                  <th className="p-2 text-right">المنجزة</th>
                  <th className="p-2 text-right">نسبة الإنجاز</th>
                  <th className="p-2 text-right">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(technicianBreakdown).map(([id, row]) => {
                  const rate = row.total > 0 ? (row.delivered / row.total) * 100 : 0;
                  return (
                    <tr key={id} className="border-t">
                      <td className="p-2">{id}</td>
                      <td className="p-2 font-mono">{fmt(row.total)}</td>
                      <td className="p-2 font-mono">{fmt(row.delivered)}</td>
                      <td className="p-2">
                        <div className="space-y-1">
                          <div>{rate.toFixed(1)}%</div>
                          <div className="h-2 rounded bg-muted overflow-hidden">
                            <div
                              className={`h-2 ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-2 font-mono">{fmt(Number(row.revenue.toFixed(0)))}</td>
                    </tr>
                  );
                })}
                {Object.keys(technicianBreakdown).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-muted-foreground">لا توجد بيانات للفلاتر الحالية.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairTechnicianKPIs;
