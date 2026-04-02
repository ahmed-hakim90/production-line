import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairTreasuryEntry, type RepairTreasurySession } from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const entryTypeOptions = ['INCOME', 'EXPENSE', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;
type TreasuryEntryType = (typeof entryTypeOptions)[number];

const entryTypeMeta: Record<string, { label: string; amountClass: string; badgeClass: string }> = {
  OPENING: { label: 'افتتاح', amountClass: 'text-sky-700', badgeClass: 'border-sky-300 text-sky-700' },
  INCOME: { label: 'إيراد', amountClass: 'text-emerald-700', badgeClass: 'border-emerald-300 text-emerald-700' },
  EXPENSE: { label: 'مصروف', amountClass: 'text-rose-700', badgeClass: 'border-rose-300 text-rose-700' },
  TRANSFER_OUT: { label: 'تحويل صادر', amountClass: 'text-amber-700', badgeClass: 'border-amber-300 text-amber-700' },
  TRANSFER_IN: { label: 'تحويل وارد', amountClass: 'text-violet-700', badgeClass: 'border-violet-300 text-violet-700' },
};

export const RepairTreasury: React.FC = () => {
  const { dir } = useAppDirection();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [sessions, setSessions] = useState<RepairTreasurySession[]>([]);
  const [allBranchSessions, setAllBranchSessions] = useState<RepairTreasurySession[]>([]);
  const [activeOpenSession, setActiveOpenSession] = useState<RepairTreasurySession | null>(null);
  const [entries, setEntries] = useState<RepairTreasuryEntry[]>([]);
  const [sessionDetailsEntriesMap, setSessionDetailsEntriesMap] = useState<Record<string, RepairTreasuryEntry[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState('');
  const [loadingSessionId, setLoadingSessionId] = useState('');
  const [sessionScope, setSessionScope] = useState<'selected' | 'all'>('selected');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('0');
  const [closingDifferenceReason, setClosingDifferenceReason] = useState('');
  const [entryType, setEntryType] = useState<TreasuryEntryType>('INCOME');
  const [entryAmount, setEntryAmount] = useState('0');
  const [entryNote, setEntryNote] = useState('');
  const [showPrevDayCloseModal, setShowPrevDayCloseModal] = useState(false);
  const allowedBranches = useMemo(() => {
    if (repairCtx.canViewAllBranches) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && (branch.technicianIds || []).includes(employeeId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, repairCtx.canViewAllBranches, currentEmployee?.id, user]);

  const load = async (selectedBranchId: string, options?: { suppressToast?: boolean }) => {
    if (!selectedBranchId) return;
    try {
      const [rowsSessions, rowsEntries] = await Promise.all([
        repairTreasuryService.listSessions(selectedBranchId),
        repairTreasuryService.listEntries(selectedBranchId),
      ]);
      setSessions(rowsSessions);
      setEntries(rowsEntries);
      const liveOpenSession = await repairTreasuryService.getOpenSession(selectedBranchId);
      setActiveOpenSession(liveOpenSession);
    } catch (e: any) {
      setSessions([]);
      setEntries([]);
      setActiveOpenSession(null);
      if (!options?.suppressToast) {
        toast.error(e?.message || 'تعذر تحميل بيانات خزينة الصيانة.');
      }
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
        setBranchId('');
        setSessions([]);
        setEntries([]);
        setActiveOpenSession(null);
        toast.error(e?.message || 'ليس لديك صلاحية للوصول إلى بيانات خزينة الصيانة.');
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchId('');
      setSessions([]);
      setEntries([]);
      setAllBranchSessions([]);
      setActiveOpenSession(null);
      return;
    }
    const isCurrentAllowed = allowedBranches.some((branch) => branch.id === branchId);
    if (isCurrentAllowed) return;
    const next = String(allowedBranches[0].id || '');
    setBranchId(next);
    void load(next, { suppressToast: true });
  }, [allowedBranches, branchId]);

  useEffect(() => {
    const allowedBranchIds = allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean);
    void loadAllBranchSessions(allowedBranchIds);
  }, [allowedBranches]);

  useEffect(() => {
    if (!branchId) return;
    void (async () => {
      try {
        const prevDayOpen = await repairTreasuryService.getPreviousDayOpenSession(branchId);
        if (prevDayOpen?.id) setShowPrevDayCloseModal(true);
      } catch {
        // no-op
      }
    })();
  }, [branchId]);

  const openSession = useMemo(
    () => activeOpenSession || sessions.find((s) => s.status === 'open') || null,
    [activeOpenSession, sessions],
  );

  const sessionEntries = useMemo(
    () => entries.filter((entry) => !openSession?.id || entry.sessionId === openSession.id),
    [entries, openSession?.id],
  );

  const computedBalance = useMemo(() => {
    if (!openSession) return 0;
    const deltas = sessionEntries.reduce((sum, entry) => {
      if (entry.entryType === 'OPENING') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'INCOME' || entry.entryType === 'TRANSFER_IN') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'EXPENSE' || entry.entryType === 'TRANSFER_OUT') return sum - Number(entry.amount || 0);
      return sum;
    }, 0);
    return deltas;
  }, [openSession, sessionEntries]);
  const parsedClosingBalance = Number(closingBalance);
  const hasClosingBalanceInput = String(closingBalance).trim() !== '';
  const closingDifference = Math.abs(parsedClosingBalance - computedBalance);
  const missingDifferenceReason = closingDifference > 0.01 && !String(closingDifferenceReason).trim();
  const closeActionDisabled = !hasClosingBalanceInput || !Number.isFinite(parsedClosingBalance) || missingDifferenceReason;
  const selectedBranchName = allowedBranches.find((branch) => branch.id === branchId)?.name || 'غير محدد';
  const branchNameMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [String(branch.id || ''), branch.name || 'فرع غير معروف'])),
    [branches],
  );
  const allSessionsSorted = useMemo(
    () => [...allBranchSessions].sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || ''))),
    [allBranchSessions],
  );
  const displayedSessions = useMemo(() => {
    if (sessionScope === 'all') return allSessionsSorted;
    return allSessionsSorted.filter((session) => String(session.branchId || '') === branchId);
  }, [allSessionsSorted, branchId, sessionScope]);

  async function loadAllBranchSessions(allowedBranchIds: string[]) {
    if (!allowedBranchIds.length) {
      setAllBranchSessions([]);
      return;
    }
    try {
      const grouped = await Promise.all(allowedBranchIds.map((id) => repairTreasuryService.listSessions(id)));
      setAllBranchSessions(grouped.flat());
    } catch {
      setAllBranchSessions([]);
    }
  }

  const openSessionDetails = async (session: RepairTreasurySession) => {
    const sessionId = String(session.id || '');
    const sessionBranchId = String(session.branchId || '');
    if (!sessionId || !sessionBranchId) return;
    if (expandedSessionId === sessionId) {
      setExpandedSessionId('');
      return;
    }
    if (sessionDetailsEntriesMap[sessionId]) {
      setExpandedSessionId(sessionId);
      return;
    }
    try {
      setLoadingSessionId(sessionId);
      const branchEntries = await repairTreasuryService.listEntries(sessionBranchId);
      const details = branchEntries.filter((entry) => entry.sessionId === sessionId);
      setSessionDetailsEntriesMap((prev) => ({ ...prev, [sessionId]: details }));
      setExpandedSessionId(sessionId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل تفاصيل الجلسة.');
    } finally {
      setLoadingSessionId('');
    }
  };

  return (
    <div className="space-y-5 md:space-y-6" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">خزينة الصيانة</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                إدارة يومية واضحة لفتح وتقفيل الخزينة وتسجيل الحركات والتحويلات.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={openSession ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-rose-600 hover:bg-rose-600'}>
                {openSession ? 'الخزينة مفتوحة' : 'الخزينة مقفلة'}
              </Badge>
              <Button variant="outline" onClick={() => navigate('/repair/treasury-report')}>
                التقرير الشهري
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Label>الفرع</Label>
            <Select value={branchId} onValueChange={(value) => { setBranchId(value); void load(value); }}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {allowedBranches.map((branch) => <SelectItem key={branch.id} value={branch.id || ''}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">الفرع الحالي</div>
            <div className="mt-1 text-base font-semibold">{selectedBranchName}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">الرصيد الحسابي</div>
            <div className="mt-1 text-lg font-bold text-emerald-700">{fmt(computedBalance)}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">حالة الجلسة</div>
            <div className="mt-1 text-base font-semibold">{openSession ? 'مفتوحة' : 'مقفلة'}</div>
            {openSession?.needsManualClose && (
              <div className="mt-1 text-xs text-amber-700">تحتاج إقفال يدوي بسبب فرق رصيد.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>الإجراء الحالي</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!openSession ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold">فتح خزينة جديدة</h3>
                    <p className="text-sm text-muted-foreground mt-1">ابدأ يوم العمل بتسجيل الرصيد الافتتاحي للفرع المحدد.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <Label>رصيد افتتاحي</Label>
                      <Input className="mt-2" type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
                    </div>
                    <Button className="w-full sm:w-auto" onClick={async () => {
                      try {
                        await repairTreasuryService.openSession({
                          branchId,
                          openingBalance: Number(openingBalance || 0),
                          openedBy: user?.id || '',
                          openedByName: user?.displayName || user?.email || 'system',
                        });
                        toast.success('تم فتح الخزينة.');
                        await load(branchId);
                        await loadAllBranchSessions(allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean));
                      } catch (e: any) {
                        toast.error(e?.message || 'تعذر فتح الخزينة.');
                      }
                    }} disabled={!branchId}>
                      فتح الخزينة
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold">تقفيل الخزينة</h3>
                    <p className="text-sm text-muted-foreground mt-1">أدخل الرصيد الفعلي ثم سجل سبب الفرق إذا وُجد.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>رصيد الإقفال الفعلي</Label>
                      <Input className="mt-2" type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} />
                    </div>
                    <div>
                      <Label>سبب الفرق {closingDifference > 0.01 ? '(إلزامي)' : '(اختياري)'}</Label>
                      <Input
                        className="mt-2"
                        value={closingDifferenceReason}
                        onChange={(e) => setClosingDifferenceReason(e.target.value)}
                        placeholder="اكتب سبب الفرق إن وجد"
                      />
                      {missingDifferenceReason && (
                        <div className="mt-1 text-xs text-amber-700">سبب الفرق مطلوب لتفعيل زر التقفيل.</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="rounded border bg-background px-3 py-2 text-sm">
                      <div className="text-muted-foreground">فرق الإقفال</div>
                      <div className={`font-bold ${closingDifference > 0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {hasClosingBalanceInput && Number.isFinite(parsedClosingBalance) ? fmt(closingDifference) : '—'}
                      </div>
                    </div>
                    <Button variant="destructive" className="w-full sm:w-auto" disabled={closeActionDisabled} onClick={async () => {
                      try {
                        if (!hasClosingBalanceInput || !Number.isFinite(parsedClosingBalance)) {
                          toast.error('يرجى إدخال رصيد الإقفال الفعلي بشكل صحيح.');
                          return;
                        }
                        if (closingDifference > 0.01 && !String(closingDifferenceReason).trim()) {
                          toast.error('يوجد فرق بين الرصيد الحسابي والفعلي. اكتب سبب الفرق قبل التقفيل.');
                          return;
                        }
                        await repairTreasuryService.closeSession({
                          branchId,
                          closingBalance: parsedClosingBalance,
                          differenceReason: String(closingDifferenceReason || '').trim(),
                          closedBy: user?.id || '',
                          closedByName: user?.displayName || user?.email || 'system',
                        });
                        setClosingDifferenceReason('');
                        toast.success('تم تقفيل الخزينة.');
                        await load(branchId);
                        await loadAllBranchSessions(allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean));
                      } catch (e: any) {
                        toast.error(e?.message || 'تعذر تقفيل الخزينة.');
                      }
                    }}>
                      تقفيل الخزينة
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>إضافة حركة خزينة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
              <div>
                <Label>نوع الحركة</Label>
                <Select value={entryType} onValueChange={(value) => setEntryType(value as TreasuryEntryType)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">إيراد</SelectItem>
                    <SelectItem value="EXPENSE">مصروف</SelectItem>
                    <SelectItem value="TRANSFER_OUT">تحويل للخزينة الرئيسية</SelectItem>
                    <SelectItem value="TRANSFER_IN">تحويل وارد من الرئيسي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input className="mt-2" type="number" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} />
              </div>
              <div className="xl:col-span-2">
                <Label>ملاحظة</Label>
                <Input className="mt-2" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} placeholder="مثال: تحصيل فاتورة، تحويل عهدة..." />
              </div>
              <Button className="w-full md:w-auto xl:justify-self-start" onClick={async () => {
                try {
                  const prevDayOpen = await repairTreasuryService.getPreviousDayOpenSession(branchId);
                  if (prevDayOpen?.id) {
                    setShowPrevDayCloseModal(true);
                    return;
                  }
                  await repairTreasuryService.addEntry({
                    branchId,
                    entryType,
                    amount: Number(entryAmount || 0),
                    note: entryNote,
                    createdBy: user?.id || '',
                    createdByName: user?.displayName || user?.email || 'system',
                  });
                  setEntryNote('');
                  toast.success('تم تسجيل الحركة.');
                  await load(branchId);
                  await loadAllBranchSessions(allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean));
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر تسجيل الحركة.');
                }
              }}>
                إضافة الحركة
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>آخر الحركات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_auto] gap-2 rounded border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>النوع</span>
              <span>البيان</span>
              <span>القيمة</span>
            </div>
            {entries.slice(0, 20).map((entry) => {
              const meta = entryTypeMeta[entry.entryType] || {
                label: entry.entryType,
                amountClass: 'text-foreground',
                badgeClass: '',
              };
              return (
                <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border px-3 py-2 text-sm">
                  <Badge variant="outline" className={meta.badgeClass}>{meta.label}</Badge>
                  <span className="truncate">{entry.note || '—'}</span>
                  <span className={`font-mono font-semibold ${meta.amountClass}`}>{fmt(entry.amount)}</span>
                </div>
              );
            })}
            {entries.length === 0 && <div className="rounded border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">لا توجد حركات بعد.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل جلسات الخزينة اليومية (كل الفروع)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <div className="w-full max-w-xs">
              <Label>نطاق العرض</Label>
              <Select value={sessionScope} onValueChange={(value) => setSessionScope(value as 'selected' | 'all')}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected">الفرع المختار فقط</SelectItem>
                  <SelectItem value="all">كل الفروع المصرح بها</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 rounded border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>الفرع</span>
            <span>التاريخ</span>
            <span>الحالة</span>
            <span>رصيد الإقفال</span>
            <span>الإجراء</span>
          </div>
          {displayedSessions.slice(0, 50).map((session) => {
            const sessionId = String(session.id || '');
            const isExpanded = expandedSessionId === sessionId;
            const isLoading = loadingSessionId === sessionId;
            const closeDate = session.closedAt || session.openedAt;
            return (
              <div key={sessionId || `${session.branchId}-${session.openedAt}`} className="rounded border">
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{branchNameMap[String(session.branchId || '')] || '—'}</span>
                  <span>{closeDate ? new Date(closeDate).toLocaleDateString('ar-EG') : '—'}</span>
                  <span>
                    <Badge
                      variant="outline"
                      className={session.status === 'closed' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}
                    >
                      {session.status === 'closed' ? 'مقفلة' : 'مفتوحة'}
                    </Badge>
                  </span>
                  <span className={`font-mono font-semibold ${session.status === 'closed' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {session.status === 'closed' && Number.isFinite(Number(session.closingBalance))
                      ? fmt(Number(session.closingBalance || 0))
                      : 'غير متاح'}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => { void openSessionDetails(session); }} disabled={!session.id}>
                    {isLoading ? 'جارٍ التحميل...' : isExpanded ? 'إخفاء' : 'تفاصيل'}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-3 py-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                      تفاصيل حركات الجلسة
                    </div>
                    <div className="space-y-2">
                      {(sessionDetailsEntriesMap[sessionId] || []).map((entry) => {
                        const meta = entryTypeMeta[entry.entryType] || {
                          label: entry.entryType,
                          amountClass: 'text-foreground',
                          badgeClass: '',
                        };
                        return (
                          <div key={entry.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded border bg-background px-2 py-2 text-sm">
                            <Badge variant="outline" className={meta.badgeClass}>{meta.label}</Badge>
                            <span className="truncate">{entry.note || '—'}</span>
                            <span className={`font-mono font-semibold ${meta.amountClass}`}>{fmt(entry.amount)}</span>
                            <span className="text-xs text-muted-foreground">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : '—'}
                            </span>
                          </div>
                        );
                      })}
                      {(sessionDetailsEntriesMap[sessionId] || []).length === 0 && (
                        <div className="rounded border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
                          لا توجد حركات داخل هذه الجلسة.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {displayedSessions.length === 0 && (
            <div className="rounded border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              لا توجد جلسات خزينة متاحة للفروع المسموح بها.
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={showPrevDayCloseModal} onOpenChange={setShowPrevDayCloseModal}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إغلاق خزينة يوم سابق</DialogTitle>
            <DialogDescription>
              يوجد جلسة خزينة مفتوحة من يوم سابق. يجب إغلاقها قبل تنفيذ أي حركة جديدة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>رصيد الإقفال الفعلي</Label>
              <Input className="mt-1" type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} />
            </div>
            <div>
              <Label>سبب الفرق</Label>
              <Input className="mt-1" value={closingDifferenceReason} onChange={(e) => setClosingDifferenceReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrevDayCloseModal(false)}>إلغاء</Button>
            <Button onClick={async () => {
              try {
                await repairTreasuryService.closeSession({
                  branchId,
                  closingBalance: Number(closingBalance || 0),
                  differenceReason: String(closingDifferenceReason || ''),
                  closedBy: user?.id || '',
                  closedByName: user?.displayName || user?.email || 'system',
                  note: 'إغلاق إلزامي لجلسة يوم سابق',
                });
                setShowPrevDayCloseModal(false);
                toast.success('تم إغلاق خزينة اليوم السابق.');
                await load(branchId);
              } catch (e: any) {
                toast.error(e?.message || 'تعذر إغلاق خزينة اليوم السابق.');
              }
            }}>إغلاق الخزينة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairTreasury;
