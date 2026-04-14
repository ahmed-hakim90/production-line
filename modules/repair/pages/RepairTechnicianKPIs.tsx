import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileDown } from 'lucide-react';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { employeeService } from '../../hr/employeeService';
import { userService } from '../../../services/userService';
import { toast } from '../../../components/Toast';
import type { FirestoreUserWithRepair, RepairBranch, RepairJob } from '../types';
import { resolveUserRepairBranchIds } from '../types';
import { resolveRepairSettings } from '../config/repairSettings';
import { downloadUtf8Csv } from '../utils/csvExport';

const calcDiffDays = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

export const RepairTechnicianKPIs: React.FC = () => {
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const systemSettings = useAppStore((s) => s.systemSettings);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [technicianQuery, setTechnicianQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const [technicianNameById, setTechnicianNameById] = useState<Map<string, string>>(new Map());
  const [hiddenTechnicianIds, setHiddenTechnicianIds] = useState<string[]>([]);
  const [pendingUnassign, setPendingUnassign] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
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
    setTechnicianQuery('');
    setBranchFilter('all');
    setHiddenTechnicianIds([]);
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
  useEffect(() => {
    void Promise.allSettled([employeeService.getAll(), userService.getAll()]).then((results) => {
      const employees = results[0].status === 'fulfilled' ? results[0].value : [];
      const users = results[1].status === 'fulfilled' ? results[1].value : [];
      const map = new Map<string, string>();

      const usersById = new Map<string, FirestoreUser>();
      users.forEach((user) => {
        const id = String(user.id || '').trim();
        if (id) usersById.set(id, user);
      });

      employees.forEach((employee: FirestoreEmployee) => {
        const employeeId = String(employee.id || '').trim();
        const userId = String(employee.userId || '').trim();
        const user = userId ? usersById.get(userId) : undefined;
        const name = String(employee.name || user?.displayName || user?.email || '').trim();
        if (employeeId && name) map.set(employeeId, name);
        if (userId && name && !map.has(userId)) map.set(userId, name);
      });

      users.forEach((user) => {
        const id = String(user.id || '').trim();
        const name = String(user.displayName || user.email || '').trim();
        if (id && name && !map.has(id)) map.set(id, name);
      });

      setTechnicianNameById(map);
    });
  }, []);

  const filtered = useMemo(() => jobs.filter((j) => {
    if (hiddenTechnicianIds.includes(String(j.technicianId || '').trim())) return false;
    if (technicianQuery) {
      const query = technicianQuery.trim().toLowerCase();
      const currentTechnicianId = String(j.technicianId || '').trim();
      const currentTechnicianName = String(technicianNameById.get(currentTechnicianId) || '').trim().toLowerCase();
      const idMatches = currentTechnicianId.toLowerCase().includes(query);
      const nameMatches = currentTechnicianName.includes(query);
      if (!idMatches && !nameMatches) return false;
    }
    if (branchFilter !== 'all' && j.branchId !== branchFilter) return false;
    if (from && j.createdAt < from) return false;
    if (to && j.createdAt > `${to}T23:59:59`) return false;
    return true;
  }), [jobs, hiddenTechnicianIds, technicianQuery, technicianNameById, branchFilter, from, to]);

  const totals = useMemo(() => {
    const delivered = filtered.filter((j) => j.status === 'delivered');
    const unrepaired = filtered.filter((j) => j.status === 'unrepairable');
    const denominator = delivered.length + unrepaired.length;
    const successRate = denominator ? (delivered.length / denominator) * 100 : 0;
    const avgRepair = delivered.length
      ? delivered.reduce((s, j) => s + calcDiffDays(j.createdAt, j.updatedAt), 0) / delivered.length
      : 0;
    const revenue = delivered.reduce((s, j) => s + Number(j.finalCost || 0), 0);
    const open = filtered.filter((j) => repairSettings.workflow.openStatusIds.includes(j.status)).length;
    return { totalJobs: filtered.length, successRate, avgRepair, revenue, open };
  }, [filtered, repairSettings.workflow.openStatusIds]);

  const deviceBreakdown = useMemo(() => filtered.reduce<Record<string, number>>((acc, j) => {
    acc[j.deviceType] = (acc[j.deviceType] || 0) + 1;
    return acc;
  }, {}), [filtered]);
  const technicianBreakdown = useMemo(
    () =>
      filtered.reduce<Record<string, { total: number; delivered: number; unrepairable: number; revenue: number }>>((acc, job) => {
        const key = job.technicianId || 'غير مسند';
        if (!acc[key]) acc[key] = { total: 0, delivered: 0, unrepairable: 0, revenue: 0 };
        acc[key].total += 1;
        if (job.status === 'delivered') {
          acc[key].delivered += 1;
          acc[key].revenue += Number(job.finalCost || 0);
        } else if (job.status === 'unrepairable') {
          acc[key].unrepairable += 1;
        }
        return acc;
      }, {}),
    [filtered],
  );

  const technicianRows = useMemo(() => {
    const entries = Object.entries(technicianBreakdown).map(([id, row]) => {
      const deliveryRate = row.total > 0 ? (row.delivered / row.total) * 100 : 0;
      const terminal = row.delivered + row.unrepairable;
      const successRate = terminal > 0 ? (row.delivered / terminal) * 100 : null;
      return { id, row, deliveryRate, successRate };
    });
    entries.sort((a, b) => {
      const sa = a.successRate ?? -1;
      const sb = b.successRate ?? -1;
      if (sb !== sa) return sb - sa;
      return b.row.revenue - a.row.revenue;
    });
    return entries;
  }, [technicianBreakdown]);
  const resolveUnassignBranchIds = (technicianId: string): string[] => {
    const normalizedTechnicianId = String(technicianId || '').trim();
    if (!normalizedTechnicianId) return [];
    if (branchFilter !== 'all') return [branchFilter];
    return selectableBranches
      .filter((branch) => (branch.technicianIds || []).map((id) => String(id || '').trim()).includes(normalizedTechnicianId))
      .map((branch) => String(branch.id || '').trim())
      .filter(Boolean);
  };

  return (
    <div className="space-y-4 w-full">
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
          <div>
            <Label>الفني (اسم أو معرف)</Label>
            <Input
              value={technicianQuery}
              onChange={(e) => setTechnicianQuery(e.target.value)}
              placeholder="اكتب اسم الفني أو المعرف"
            />
          </div>
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
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">نسبة النجاح</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">{totals.successRate.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              من الطلبات المنتهية (تم التسليم أو غير قابل للإصلاح)
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-2 rounded-full transition-[width] ${totals.successRate >= 80 ? 'bg-emerald-500' : totals.successRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.max(0, Math.min(100, totals.successRate))}%` }}
              />
            </div>
          </CardContent>
        </Card>
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
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle>ملخص الفنيين</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={technicianRows.length === 0}
            className="gap-1.5"
            onClick={() => {
              const day = new Date().toISOString().slice(0, 10);
              downloadUtf8Csv(
                `repair-technician-kpis-${day}.csv`,
                [
                  'الفني',
                  'معرف الفني',
                  'إجمالي الطلبات',
                  'تم التسليم',
                  'غير قابل للإصلاح',
                  'نسبة النجاح %',
                  'معدل التسليم %',
                  'الإيراد',
                ],
                technicianRows.map(({ id, row, deliveryRate, successRate }) => {
                  const label =
                    id === 'غير مسند' ? id : technicianNameById.get(String(id || '').trim()) || `ID: ${id}`;
                  return [
                    label,
                    id === 'غير مسند' ? '' : id,
                    row.total,
                    row.delivered,
                    row.unrepairable,
                    successRate == null ? '' : Number(successRate.toFixed(2)),
                    Number(deliveryRate.toFixed(2)),
                    Number(row.revenue.toFixed(2)),
                  ];
                }),
              );
            }}
          >
            <FileDown className="h-4 w-4" aria-hidden />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="rounded border overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">الفني</th>
                  <th className="p-2 text-right">إجمالي الطلبات</th>
                  <th className="p-2 text-right">تم التسليم</th>
                  <th className="p-2 text-right">غير قابل للإصلاح</th>
                  <th className="p-2 text-right">نسبة النجاح</th>
                  <th className="p-2 text-right">معدل التسليم</th>
                  <th className="p-2 text-right">الإيراد</th>
                  <th className="p-2 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {technicianRows.map(({ id, row, deliveryRate, successRate }) => {
                  const technicianLabel =
                    id === 'غير مسند' ? id : technicianNameById.get(String(id || '').trim()) || `ID: ${id}`;
                  const isUnassigned = id === 'غير مسند';
                  const selectedBranch = branchFilter !== 'all'
                    ? selectableBranches.find((branch) => (branch.id || '') === branchFilter)
                    : undefined;
                  const successPct = successRate ?? 0;
                  const successBarWidth = successRate == null ? 0 : Math.max(0, Math.min(100, successPct));
                  return (
                    <tr key={id} className="border-t">
                      <td className="p-2">{technicianLabel}</td>
                      <td className="p-2 font-mono">{fmt(row.total)}</td>
                      <td className="p-2 font-mono">{fmt(row.delivered)}</td>
                      <td className="p-2 font-mono">{fmt(row.unrepairable)}</td>
                      <td className="p-2">
                        <div className="space-y-1 min-w-[7rem]">
                          <div>{successRate == null ? '—' : `${successPct.toFixed(1)}%`}</div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${successRate == null ? 'bg-muted-foreground/30' : successPct >= 80 ? 'bg-emerald-500' : successPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${successBarWidth}%` }}
                            />
                          </div>
                          {successRate != null && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {fmt(row.delivered)} / {fmt(row.delivered + row.unrepairable)} منتهية
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="space-y-1 min-w-[6rem]">
                          <div>{deliveryRate.toFixed(1)}%</div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${deliveryRate >= 80 ? 'bg-sky-500' : deliveryRate >= 50 ? 'bg-sky-400' : 'bg-sky-300'}`}
                              style={{ width: `${Math.max(0, Math.min(100, deliveryRate))}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">من إجمالي المسند</div>
                        </div>
                      </td>
                      <td className="p-2 font-mono">{fmt(Number(row.revenue.toFixed(0)))}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          {!isUnassigned && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setHiddenTechnicianIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                            >
                              إخفاء
                            </Button>
                          )}
                          {!isUnassigned && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setPendingUnassign({ id, name: technicianLabel })}
                              disabled={resolveUnassignBranchIds(id).length === 0}
                              title={resolveUnassignBranchIds(id).length === 0 ? 'الفني غير مربوط بأي فرع متاح' : undefined}
                            >
                              إزالة من الفرع
                            </Button>
                          )}
                          {isUnassigned && <span className="text-xs text-muted-foreground">—</span>}
                          {!isUnassigned && branchFilter === 'all' && (
                            <span className="text-xs text-muted-foreground">سيتم الإزالة من كل الفروع المتاحة</span>
                          )}
                          {!isUnassigned && selectedBranch && (
                            <span className="text-xs text-muted-foreground">الفرع: {selectedBranch.name}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {technicianRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-3 text-center text-muted-foreground">لا توجد بيانات للفلاتر الحالية.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(pendingUnassign)} onOpenChange={(next) => { if (!next) setPendingUnassign(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد إزالة الفني من الفرع</DialogTitle>
            <DialogDescription>
              سيتم فك ربط الفني <span className="font-semibold">{pendingUnassign?.name || '—'}</span>
              {' '}
              {branchFilter === 'all' ? 'من كل الفروع المتاحة.' : 'من الفرع المحدد في الفلتر.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={removing} onClick={() => setPendingUnassign(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing || !pendingUnassign}
              onClick={async () => {
                if (!pendingUnassign) return;
                try {
                  setRemoving(true);
                  const targetBranchIds = resolveUnassignBranchIds(pendingUnassign.id);
                  if (targetBranchIds.length === 0) {
                    throw new Error('لا توجد فروع مرتبطة بهذا الفني لإزالته منها.');
                  }
                  for (const targetBranchId of targetBranchIds) {
                    await repairBranchService.removeTechnicianFromBranch(targetBranchId, pendingUnassign.id);
                  }
                  setBranches((prev) => prev.map((branch) => {
                    if (!targetBranchIds.includes(String(branch.id || ''))) return branch;
                    return {
                      ...branch,
                      technicianIds: (branch.technicianIds || []).filter((techId) => String(techId || '').trim() !== pendingUnassign.id),
                    };
                  }));
                  toast.success(
                    targetBranchIds.length > 1
                      ? `تمت إزالة الفني من ${targetBranchIds.length} فروع.`
                      : 'تمت إزالة الفني من الفرع.',
                  );
                  setPendingUnassign(null);
                } catch (error: any) {
                  toast.error(error?.message || 'تعذر إزالة الفني من الفرع.');
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? 'جارٍ الإزالة...' : 'تأكيد الإزالة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairTechnicianKPIs;
