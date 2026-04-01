import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { exportTreasuryMonthlyExcel } from '../../../utils/treasuryExcelExport';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairTreasuryEntry,
  type RepairTreasuryMonthlyReportData,
  type RepairTreasurySessionStatusFilter,
} from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Number(n || 0));
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const ALL_BRANCHES_VALUE = '__ALL_ALLOWED__';

export const RepairTreasuryMonthlyReport: React.FC = () => {
  const { dir } = useAppDirection();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [month, setMonth] = useState(THIS_MONTH);
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairTreasurySessionStatusFilter>('all');
  const [report, setReport] = useState<RepairTreasuryMonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState('');
  const [sessionEntriesMap, setSessionEntriesMap] = useState<Record<string, RepairTreasuryEntry[]>>({});
  const [sessionLoadingId, setSessionLoadingId] = useState('');

  const allowedBranches = useMemo(() => {
    if (can('repair.branches.manage')) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, can, currentEmployee?.id, user]);

  const branchNameMap = useMemo(
    () => Object.fromEntries(allowedBranches.map((branch) => [String(branch.id || ''), branch.name || 'فرع غير معروف'])),
    [allowedBranches],
  );

  const loadReport = async (opts?: { silent?: boolean }) => {
    const allowedBranchIds = allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean);
    if (!allowedBranchIds.length) {
      setReport(null);
      return;
    }
    const selectedIsAll = branchFilter === ALL_BRANCHES_VALUE;
    const selectedBranchId = selectedIsAll ? '' : branchFilter;
    try {
      setLoading(true);
      const data = await repairTreasuryService.getMonthlyReport({
        month,
        allowedBranchIds,
        branchId: selectedBranchId,
        includeAllBranches: selectedIsAll,
        sessionStatus: statusFilter,
        branchNameMap,
      });
      setReport(data);
      if (!opts?.silent) {
        setExpandedSessionId('');
      }
    } catch (e: any) {
      setReport(null);
      toast.error(e?.message || 'تعذر تحميل التقرير الشهري.');
    } finally {
      setLoading(false);
    }
  };

  const openSessionDetails = async (sessionId: string, branchId: string) => {
    if (!sessionId || !branchId) return;
    if (expandedSessionId === sessionId) {
      setExpandedSessionId('');
      return;
    }
    if (sessionEntriesMap[sessionId]) {
      setExpandedSessionId(sessionId);
      return;
    }
    try {
      setSessionLoadingId(sessionId);
      const branchEntries = await repairTreasuryService.listEntries(branchId);
      const details = branchEntries.filter((entry) => String(entry.sessionId || '') === sessionId);
      setSessionEntriesMap((prev) => ({ ...prev, [sessionId]: details }));
      setExpandedSessionId(sessionId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل تفاصيل الجلسة.');
    } finally {
      setSessionLoadingId('');
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const rows = await repairBranchService.list();
        if (!mounted) return;
        setBranches(rows);
      } catch (e: any) {
        if (!mounted) return;
        setBranches([]);
        toast.error(e?.message || 'تعذر تحميل الفروع.');
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchFilter('');
      setReport(null);
      return;
    }
    const branchIds = allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean);
    if (!branchFilter || (branchFilter !== ALL_BRANCHES_VALUE && !branchIds.includes(branchFilter))) {
      setBranchFilter(branchIds[0] || '');
    }
  }, [allowedBranches, branchFilter]);

  useEffect(() => {
    if (!branchFilter || !allowedBranches.length) return;
    void loadReport();
  }, [month, branchFilter, statusFilter, allowedBranches.length]);

  const branchScopeLabel = useMemo(() => {
    if (branchFilter === ALL_BRANCHES_VALUE) return 'كل-الفروع-المصرح-بها';
    return branchNameMap[branchFilter] || 'فرع';
  }, [branchFilter, branchNameMap]);

  const statusLabel = statusFilter === 'all' ? 'الكل' : statusFilter === 'open' ? 'مفتوحة' : 'مقفلة';
  const totals = useMemo(() => {
    const data = report?.summaries || [];
    return data.reduce(
      (acc, row) => {
        acc.sessions += row.sessionsCount;
        acc.opening += row.totalOpening;
        acc.net += row.netMovement;
        acc.closing += row.totalClosing;
        return acc;
      },
      { sessions: 0, opening: 0, net: 0, closing: 0 },
    );
  }, [report]);

  return (
    <div className="space-y-5 md:space-y-6" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">تقرير الخزائن الشهري</h1>
              <p className="mt-1 text-sm text-muted-foreground">ملخص وتفصيل يومي للجلسات مع تصدير Excel حسب صلاحيات المستخدم.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/repair/treasury')}>العودة للخزينة</Button>
              <Button
                disabled={!report}
                onClick={() => {
                  if (!report) return;
                  exportTreasuryMonthlyExcel({
                    month,
                    branchScopeLabel,
                    statusLabel,
                    summaries: report.summaries,
                    dailyBreakdown: report.dailyBreakdown,
                    sessions: report.sessions,
                  });
                }}
              >
                تصدير Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-4">
          <div>
            <Label>الشهر</Label>
            <Input className="mt-2" type="month" value={month} onChange={(e) => setMonth(e.target.value || THIS_MONTH)} />
          </div>
          <div>
            <Label>الفرع</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES_VALUE}>كل الفروع المصرح بها</SelectItem>
                {allowedBranches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id || '')}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>حالة الجلسة</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RepairTreasurySessionStatusFilter)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="open">مفتوحة</SelectItem>
                <SelectItem value="closed">مقفلة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => { void loadReport(); }} disabled={loading}>
              {loading ? 'جارٍ التحميل...' : 'تحديث التقرير'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">عدد الجلسات</div><div className="text-xl font-bold mt-1">{fmt(totals.sessions)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">إجمالي الافتتاح</div><div className="text-xl font-bold mt-1">{fmt(totals.opening)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">صافي الحركة</div><div className="text-xl font-bold mt-1">{fmt(totals.net)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">إجمالي الإقفال</div><div className="text-xl font-bold mt-1 text-emerald-700">{fmt(totals.closing)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>ملخص الفروع</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 rounded border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>الفرع</span><span>جلسات</span><span>افتتاح</span><span>إيراد</span><span>مصروف</span><span>إقفال</span>
          </div>
          {(report?.summaries || []).map((row) => (
            <div key={row.branchId} className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 rounded border px-3 py-2 text-sm">
              <span className="font-medium">{row.branchName}</span>
              <span>{fmt(row.sessionsCount)}</span>
              <span>{fmt(row.totalOpening)}</span>
              <span className="text-emerald-700">{fmt(row.totalIncome)}</span>
              <span className="text-rose-700">{fmt(row.totalExpense)}</span>
              <span className="font-semibold">{fmt(row.totalClosing)}</span>
            </div>
          ))}
          {(report?.summaries || []).length === 0 && <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">لا توجد بيانات ملخص لهذا الشهر.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>التفصيل اليومي</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-[1fr_120px_repeat(4,minmax(0,1fr))] gap-2 rounded border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>الفرع</span><span>اليوم</span><span>جلسات</span><span>افتتاح</span><span>الصافي</span><span>إقفال</span>
          </div>
          {(report?.dailyBreakdown || []).map((row) => (
            <div key={`${row.branchId}-${row.day}`} className="grid grid-cols-[1fr_120px_repeat(4,minmax(0,1fr))] gap-2 rounded border px-3 py-2 text-sm">
              <span>{row.branchName}</span>
              <span>{row.day}</span>
              <span>{fmt(row.sessionsCount)}</span>
              <span>{fmt(row.opening)}</span>
              <span className={row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{fmt(row.net)}</span>
              <span className="font-semibold">{fmt(row.closing)}</span>
            </div>
          ))}
          {(report?.dailyBreakdown || []).length === 0 && <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">لا توجد بيانات يومية.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>تفاصيل الجلسات</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-[1fr_120px_90px_120px_auto] gap-2 rounded border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>الفرع</span><span>تاريخ الجلسة</span><span>الحالة</span><span>الإقفال</span><span>الإجراء</span>
          </div>
          {(report?.sessions || []).map((session) => {
            const isExpanded = expandedSessionId === session.sessionId;
            const isLoading = sessionLoadingId === session.sessionId;
            const entryRows = sessionEntriesMap[session.sessionId] || [];
            return (
              <div key={session.sessionId} className="rounded border">
                <div className="grid grid-cols-[1fr_120px_90px_120px_auto] items-center gap-2 px-3 py-2 text-sm">
                  <span>{session.branchName}</span>
                  <span>{session.openedAt.slice(0, 10)}</span>
                  <span>
                    <Badge variant="outline" className={session.status === 'closed' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}>
                      {session.status === 'closed' ? 'مقفلة' : 'مفتوحة'}
                    </Badge>
                  </span>
                  <span className="font-mono">{session.status === 'closed' ? fmt(session.closingBalance || 0) : '—'}</span>
                  <Button variant="outline" size="sm" onClick={() => { void openSessionDetails(session.sessionId, session.branchId); }}>
                    {isLoading ? 'جارٍ التحميل...' : isExpanded ? 'إخفاء' : 'فتح التفاصيل'}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-3 py-3">
                    <div className="mb-2 text-xs text-muted-foreground">حركات الجلسة ({fmt(entryRows.length)})</div>
                    <div className="space-y-2">
                      {entryRows.map((entry) => (
                        <div key={entry.id} className="grid grid-cols-[120px_1fr_120px_150px] gap-2 rounded border bg-background px-2 py-2 text-sm">
                          <span>{entry.entryType}</span>
                          <span className="truncate">{entry.note || '—'}</span>
                          <span className="font-mono">{fmt(entry.amount)}</span>
                          <span className="text-xs text-muted-foreground">{entry.createdAt || '—'}</span>
                        </div>
                      ))}
                      {entryRows.length === 0 && <div className="rounded border border-dashed p-3 text-center text-sm text-muted-foreground">لا توجد حركات داخل الجلسة.</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(report?.sessions || []).length === 0 && <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">لا توجد جلسات ضمن الفلاتر الحالية.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairTreasuryMonthlyReport;
