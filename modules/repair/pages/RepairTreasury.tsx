import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { KPICard } from '@/src/components/erp/KPICard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import {
  repairMonthCloseChipType,
  repairOpenClosedChipType,
  repairTreasuryEntryTypeChip,
} from '../lib/repairSemanticStatus';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairTreasuryEntry, type RepairTreasurySession } from '../types';
import { REPAIR_TREASURY_EXPENSE_TYPES, type RepairTreasuryExpenseTypeKey } from '../lib/repairTreasuryExpenseTypes';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const PAGE_SIZE = 20;
const entryTypeOptions = ['INCOME', 'EXPENSE', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;
type TreasuryEntryType = (typeof entryTypeOptions)[number];

const entryTypeMeta: Record<string, { amountClass: string; signed: (n: number) => string }> = {
  OPENING: {
    amountClass: 'text-sky-700',
    signed: (n) => fmt(n),
  },
  INCOME: {
    amountClass: 'text-emerald-700',
    signed: (n) => `+${fmt(n)}`,
  },
  EXPENSE: {
    amountClass: 'text-rose-700',
    signed: (n) => `−${fmt(n)}`,
  },
  TRANSFER_OUT: {
    amountClass: 'text-amber-700',
    signed: (n) => `−${fmt(n)}`,
  },
  TRANSFER_IN: {
    amountClass: 'text-violet-700',
    signed: (n) => `+${fmt(n)}`,
  },
  CLOSING: {
    amountClass: 'text-muted-foreground',
    signed: (n) => fmt(n),
  },
};

export const RepairTreasury: React.FC = () => {
  const { dir } = useAppDirection();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canView = can('repair.treasury.view') || can('repair.treasury.manage');
  const canManage = can('repair.treasury.manage');
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
  const activeBranch = useMemo(() => branches.find((branch) => String(branch.id || '') === branchId) || null, [branches, branchId]);
  const [sessions, setSessions] = useState<RepairTreasurySession[]>([]);
  const [allBranchSessions, setAllBranchSessions] = useState<RepairTreasurySession[]>([]);
  const [activeOpenSession, setActiveOpenSession] = useState<RepairTreasurySession | null>(null);
  const [entries, setEntries] = useState<RepairTreasuryEntry[]>([]);
  const [sessionDetailsEntriesMap, setSessionDetailsEntriesMap] = useState<Record<string, RepairTreasuryEntry[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState('');
  const [loadingSessionId, setLoadingSessionId] = useState('');
  const [sessionScope, setSessionScope] = useState<'selected' | 'all'>('selected');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [sessionSearch, setSessionSearch] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('0');
  const [closingDifferenceReason, setClosingDifferenceReason] = useState('');
  const [entryType, setEntryType] = useState<TreasuryEntryType>('EXPENSE');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [entryExpenseType, setEntryExpenseType] = useState<RepairTreasuryExpenseTypeKey | ''>('');
  const [showPrevDayCloseModal, setShowPrevDayCloseModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [monthClosed, setMonthClosed] = useState(false);
  const [currentMonthKey, setCurrentMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [entriesPage, setEntriesPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);

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

  const load = async (selectedBranchId: string, options?: { suppressToast?: boolean; force?: boolean }) => {
    if (!selectedBranchId) return;
    const treasuryCacheKey = `repair:treasury:${selectedBranchId}`;
    type TreasuryPageData = {
      sessions: typeof sessions;
      entries: typeof entries;
      activeOpenSession: typeof activeOpenSession;
    };
    if (options?.force) invalidatePageDataCache(treasuryCacheKey);
    const cached = peekPageDataCache<TreasuryPageData>(treasuryCacheKey);
    if (cached) {
      setSessions(cached.sessions);
      setEntries(cached.entries);
      setActiveOpenSession(cached.activeOpenSession);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        treasuryCacheKey,
        async () => {
          const [rowsSessions, rowsEntries] = await Promise.all([
            repairTreasuryService.listSessions(selectedBranchId),
            repairTreasuryService.listEntries(selectedBranchId),
          ]);
          const liveOpenSession = await repairTreasuryService.getOpenSession(selectedBranchId);
          return {
            sessions: rowsSessions,
            entries: rowsEntries,
            activeOpenSession: liveOpenSession,
          };
        },
        { force: options?.force === true, maxAgeMs: 45_000 },
      );
      setSessions(data.sessions);
      setEntries(data.entries);
      setActiveOpenSession(data.activeOpenSession);
    } catch (e: any) {
      setSessions([]);
      setEntries([]);
      setActiveOpenSession(null);
      if (!options?.suppressToast) {
        toast.error(e?.message || 'تعذر تحميل بيانات خزينة الصيانة.');
      }
    } finally {
      setLoading(false);
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
        setLoading(false);
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
      setLoading(false);
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

  useEffect(() => {
    if (!branchId) {
      setMonthClosed(false);
      return;
    }
    const month = new Date().toISOString().slice(0, 7);
    setCurrentMonthKey(month);
    void repairTreasuryService.isMonthClosed(branchId, month)
      .then(setMonthClosed)
      .catch(() => setMonthClosed(false));
  }, [branchId, sessions, activeOpenSession]);

  const canMutate = canManage && !monthClosed;

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
    return sessionEntries.reduce((sum, entry) => {
      if (entry.entryType === 'OPENING') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'INCOME' || entry.entryType === 'TRANSFER_IN') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'EXPENSE' || entry.entryType === 'TRANSFER_OUT') return sum - Number(entry.amount || 0);
      return sum;
    }, 0);
  }, [openSession, sessionEntries]);

  const todayTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    sessionEntries.forEach((entry) => {
      const amount = Number(entry.amount || 0);
      if (entry.entryType === 'INCOME' || entry.entryType === 'TRANSFER_IN') income += amount;
      if (entry.entryType === 'EXPENSE' || entry.entryType === 'TRANSFER_OUT') expense += amount;
    });
    return { income, expense, count: sessionEntries.length };
  }, [sessionEntries]);

  const parsedClosingBalance = Number(closingBalance);
  const hasClosingBalanceInput = String(closingBalance).trim() !== '';
  const closingDifference = Math.abs(parsedClosingBalance - computedBalance);
  const missingDifferenceReason = closingDifference > 0.01 && !String(closingDifferenceReason).trim();
  const closeActionDisabled =
    busy || !canMutate || !hasClosingBalanceInput || !Number.isFinite(parsedClosingBalance) || missingDifferenceReason;
  const selectedBranchName = allowedBranches.find((branch) => branch.id === branchId)?.name || 'غير محدد';
  const branchNameMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [String(branch.id || ''), branch.name || 'فرع غير معروف'])),
    [branches],
  );
  const allSessionsSorted = useMemo(
    () => [...allBranchSessions].sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || ''))),
    [allBranchSessions],
  );
  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    return allSessionsSorted.filter((session) => {
      if (sessionScope === 'selected' && String(session.branchId || '') !== branchId) return false;
      if (sessionStatusFilter !== 'all' && session.status !== sessionStatusFilter) return false;
      if (!q) return true;
      const branchName = String(branchNameMap[String(session.branchId || '')] || '').toLowerCase();
      const dateLabel = session.closedAt || session.openedAt || '';
      return branchName.includes(q) || String(dateLabel).toLowerCase().includes(q) || String(session.id || '').toLowerCase().includes(q);
    });
  }, [allSessionsSorted, branchId, branchNameMap, sessionScope, sessionSearch, sessionStatusFilter]);

  const sortedSessionEntries = useMemo(
    () => [...sessionEntries].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [sessionEntries],
  );

  const entriesTotalPages = Math.max(1, Math.ceil(sortedSessionEntries.length / PAGE_SIZE));
  const safeEntriesPage = Math.min(entriesPage, entriesTotalPages);
  const pagedEntries = sortedSessionEntries.slice((safeEntriesPage - 1) * PAGE_SIZE, safeEntriesPage * PAGE_SIZE);

  const sessionsTotalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safeSessionsPage = Math.min(sessionsPage, sessionsTotalPages);
  const pagedSessions = filteredSessions.slice((safeSessionsPage - 1) * PAGE_SIZE, safeSessionsPage * PAGE_SIZE);

  useEffect(() => {
    setEntriesPage(1);
  }, [branchId, openSession?.id]);

  useEffect(() => {
    setSessionsPage(1);
  }, [sessionScope, sessionStatusFilter, sessionSearch, branchId]);

  async function loadAllBranchSessions(allowedBranchIds: string[]) {
    if (!allowedBranchIds.length) {
      setAllBranchSessions([]);
      return;
    }
    try {
      const grouped = await repairTreasuryService.listSessionsForBranches(allowedBranchIds);
      setAllBranchSessions(grouped);
    } catch {
      setAllBranchSessions([]);
    }
  }

  const refreshAll = async (selectedBranchId = branchId) => {
    await load(selectedBranchId, { force: true });
    await loadAllBranchSessions(allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean));
  };

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

  const handleOpenSession = async () => {
    if (!canMutate || !branchId || busy) return;
    setBusy(true);
    try {
      await repairTreasuryService.openSession({
        branchId,
        openingBalance: Number(openingBalance || 0),
        openedBy: user?.id || '',
        openedByName: user?.displayName || user?.email || 'system',
      });
      toast.success('تم فتح الخزينة.');
      setOpeningBalance('0');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر فتح الخزينة.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseSession = async () => {
    if (!canMutate || busy) return;
    if (!hasClosingBalanceInput || !Number.isFinite(parsedClosingBalance)) {
      toast.error('يرجى إدخال رصيد الإقفال الفعلي بشكل صحيح.');
      return;
    }
    if (closingDifference > 0.01 && !String(closingDifferenceReason).trim()) {
      toast.error('يوجد فرق بين الرصيد الحسابي والفعلي. اكتب سبب الفرق قبل التقفيل.');
      return;
    }
    setBusy(true);
    try {
      await repairTreasuryService.closeSession({
        branchId,
        closingBalance: parsedClosingBalance,
        differenceReason: String(closingDifferenceReason || '').trim(),
        closedBy: user?.id || '',
        closedByName: user?.displayName || user?.email || 'system',
      });
      setClosingDifferenceReason('');
      setClosingBalance('0');
      toast.success('تم تقفيل الخزينة.');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تقفيل الخزينة.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddEntry = async () => {
    if (!canMutate || busy) return;
    const amount = Number(entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغًا صحيحًا أكبر من صفر.');
      return;
    }
    if (entryNote.trim().length < 3) {
      toast.error('اكتب سبب الحركة بوضوح.');
      return;
    }
    if (entryType === 'EXPENSE' && !entryExpenseType) {
      toast.error('اختر نوع المصروف ليُرحَّل للحساب الصحيح.');
      return;
    }
    const branchCostCenterId = String(activeBranch?.costCenterId || '').trim();
    if (!branchCostCenterId) {
      toast.error('اربط الفرع بمركز تكلفة قبل تسجيل حركة يدوية.');
      return;
    }
    setBusy(true);
    try {
      const prevDayOpen = await repairTreasuryService.getPreviousDayOpenSession(branchId);
      if (prevDayOpen?.id) {
        setShowPrevDayCloseModal(true);
        return;
      }
      await repairTreasuryService.addEntry({
        branchId,
        entryType,
        amount,
        note: entryNote,
        paymentMethod: entryPaymentMethod,
        costCenterId: branchCostCenterId,
        expenseType: entryType === 'EXPENSE' ? entryExpenseType : undefined,
        createdBy: user?.id || '',
        createdByName: user?.displayName || user?.email || 'system',
      });
      setEntryNote('');
      setEntryAmount('');
      setEntryExpenseType('');
      toast.success(entryType === 'EXPENSE' ? 'تم تسجيل المصروف وترحيله محاسبياً.' : 'تم تسجيل الحركة وترحيلها محاسبياً.');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تسجيل الحركة.');
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-5 p-4 md:p-6" dir={dir}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض خزينة الصيانة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="خزينة الصيانة"
        subtitle="فتح وتقفل يومي، تسجيل الإيرادات والمصروفات والتحويلات لكل فرع"
        icon="wallet"
        primaryAction={{
          label: 'تحديث',
          icon: 'refresh',
          onClick: () => {
            void refreshAll(branchId);
          },
          disabled: !branchId || busy,
        }}
        moreActions={[
          {
            label: 'التقرير الشهري',
            icon: 'bar_chart',
            group: 'تقارير',
            onClick: () => navigate('/repair/treasury-report'),
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="الرصيد الحسابي"
          value={openSession ? fmt(computedBalance) : '—'}
          unit="ج.م"
          iconType="money"
          color={openSession ? 'green' : 'gray'}
          loading={loading}
          subValue={selectedBranchName}
        />
        <KPICard
          label="حالة الجلسة"
          value={openSession ? 'مفتوحة' : 'مقفلة'}
          iconType="metric"
          color={openSession ? 'green' : 'red'}
          loading={loading}
          subValue={openSession?.needsManualClose ? 'تحتاج إقفال يدوي' : undefined}
        />
        <KPICard
          label="إيراد الجلسة"
          value={fmt(todayTotals.income)}
          unit="ج.م"
          iconType="trend"
          color="indigo"
          loading={loading}
        />
        <KPICard
          label="مصروف الجلسة"
          value={fmt(todayTotals.expense)}
          unit="ج.م"
          iconType="metric"
          color="amber"
          loading={loading}
          subValue={`${todayTotals.count} حركة`}
        />
      </div>

      {monthClosed && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">شهر {currentMonthKey} مقفول لهذا الفرع</div>
            <p className="text-xs mt-0.5">لا يمكن فتح جلسة أو تسجيل حركات أو تقفيل يومي حتى إعادة فتح الشهر من التقرير الشهري.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/repair/treasury-report')}>
            التقرير الشهري
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="sm:col-span-2 lg:col-span-2">
            <Label>الفرع</Label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                void load(value, { force: true });
              }}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {allowedBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id || ''}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <div className="text-xs text-muted-foreground">الحالة الحالية</div>
            <div className="mt-1 flex items-center gap-2">
              <ErpStatusBadge
                label={openSession ? 'مفتوحة' : 'مقفلة'}
                type={repairOpenClosedChipType(Boolean(openSession))}
              />
              {monthClosed && (
                <ErpStatusBadge label="شهر مقفول" type={repairMonthCloseChipType(true)} />
              )}
              {openSession?.needsManualClose && (
                <span className="text-xs text-amber-700">فرق رصيد</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <div className="text-xs text-muted-foreground">صلاحية الإدارة</div>
            <div className="mt-1 text-sm font-semibold">
              {!canManage ? 'عرض فقط' : monthClosed ? 'مقفول شهريًا' : 'متاحة'}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{openSession ? 'تقفيل الخزينة' : 'فتح الخزينة'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!openSession ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">ابدأ يوم العمل بتسجيل الرصيد الافتتاحي للفرع المحدد.</p>
                  <div>
                    <Label>رصيد افتتاحي</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={0}
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      disabled={!canMutate || busy}
                    />
                  </div>
                  <Button className="w-full" onClick={() => void handleOpenSession()} disabled={!branchId || !canMutate || busy}>
                    {busy ? 'جارٍ الفتح...' : 'فتح الخزينة'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">أدخل الرصيد الفعلي ثم سجّل سبب الفرق إن وُجد.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>رصيد الإقفال الفعلي</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        value={closingBalance}
                        onChange={(e) => setClosingBalance(e.target.value)}
                        disabled={!canMutate || busy}
                      />
                    </div>
                    <div>
                      <Label>سبب الفرق {closingDifference > 0.01 ? '(إلزامي)' : '(اختياري)'}</Label>
                      <Input
                        className="mt-2"
                        value={closingDifferenceReason}
                        onChange={(e) => setClosingDifferenceReason(e.target.value)}
                        placeholder="اكتب سبب الفرق إن وجد"
                        disabled={!canMutate || busy}
                      />
                      {missingDifferenceReason && (
                        <div className="mt-1 text-xs text-amber-700">سبب الفرق مطلوب قبل التقفيل.</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">فرق الإقفال</span>
                    <span className={`font-bold tabular-nums ${closingDifference > 0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {hasClosingBalanceInput && Number.isFinite(parsedClosingBalance) ? fmt(closingDifference) : '—'}
                    </span>
                  </div>
                  <Button variant="destructive" className="w-full" disabled={closeActionDisabled} onClick={() => void handleCloseSession()}>
                    {busy ? 'جارٍ التقفيل...' : 'تقفيل الخزينة'}
                  </Button>
                </div>
              )}
              {!canManage && (
                <p className="text-xs text-muted-foreground">عرض فقط — لا تملك صلاحية إدارة الخزينة.</p>
              )}
              {canManage && monthClosed && (
                <p className="text-xs text-rose-700">الشهر مقفول — أعد فتحه من التقرير الشهري لتسجيل حركات.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">إضافة حركة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!openSession ? (
                <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                  افتح الخزينة أولًا لتسجيل الحركات.
                </div>
              ) : (
                <>
                  <div>
                    <Label>نوع الحركة</Label>
                    <Select
                      value={entryType}
                      onValueChange={(value) => {
                        setEntryType(value as TreasuryEntryType);
                        if (value !== 'EXPENSE') setEntryExpenseType('');
                      }}
                      disabled={!canMutate || busy}
                    >
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
                  {entryType === 'EXPENSE' ? (
                    <div>
                      <Label>نوع المصروف</Label>
                      <Select
                        value={entryExpenseType || undefined}
                        onValueChange={(value) => setEntryExpenseType(value as RepairTreasuryExpenseTypeKey)}
                        disabled={!canMutate || busy}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="اختر التصنيف المحاسبي" />
                        </SelectTrigger>
                        <SelectContent>
                          {REPAIR_TREASURY_EXPENSE_TYPES.map((row) => (
                            <SelectItem key={row.key} value={row.key}>
                              {row.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        يُرحَّل المصروف تلقائياً لحسابه في دفتر الحسابات.
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <Label>المبلغ</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={0}
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(e.target.value)}
                      placeholder="0"
                      disabled={!canMutate || busy}
                    />
                  </div>
                  <div>
                    <Label>وسيلة الدفع</Label>
                    <Select value={entryPaymentMethod} onValueChange={(value) => setEntryPaymentMethod(value as typeof entryPaymentMethod)} disabled={!canMutate || busy}>
                      <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="card">بطاقة</SelectItem>
                        <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>ملاحظة</Label>
                    <Input
                      className="mt-2"
                      value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      placeholder="مثال: تحصيل فاتورة، تحويل عهدة..."
                      disabled={!canMutate || busy}
                    />
                  </div>
                  <Button className="w-full" onClick={() => void handleAddEntry()} disabled={!canMutate || busy || !branchId}>
                    {busy ? 'جارٍ التسجيل...' : 'تسجيل الحركة'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:col-span-7 !p-0 overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">حركات الجلسة الحالية</h2>
            <p className="text-xs text-muted-foreground mt-0.5">مرتبة من الأحدث — تشمل افتتاح اليوم والتحصيلات والمصروفات</p>
          </div>
          <div className="overflow-x-auto erp-table-scroll">
            <table className="erp-table w-full min-w-[640px] text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">البيان</th>
                  <th className="erp-th text-center">المبلغ</th>
                  <th className="erp-th">الوقت</th>
                  <th className="erp-th">بواسطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`entry-skel-${i}`}>
                    <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full rounded-md" /></td>
                  </tr>
                ))}
                {!loading && pagedEntries.map((entry) => {
                  const entryChip = repairTreasuryEntryTypeChip(entry.entryType);
                  const meta = entryTypeMeta[entry.entryType] || {
                    amountClass: 'text-foreground',
                    signed: (n: number) => fmt(n),
                  };
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2.5">
                        <ErpStatusBadge label={entryChip.label} type={entryChip.type} />
                      </td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate">
                        {entry.entryType === 'EXPENSE' && entry.expenseType
                          ? `${REPAIR_TREASURY_EXPENSE_TYPES.find((row) => row.key === entry.expenseType)?.label || entry.expenseType} — ${entry.note || '—'}`
                          : (entry.note || '—')}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold tabular-nums ${meta.amountClass}`}>
                        {meta.signed(Number(entry.amount || 0))}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm">{entry.createdByName || '—'}</td>
                    </tr>
                  );
                })}
                {!loading && sortedSessionEntries.length === 0 && (
                  <tr>
                    <td className="px-4 py-12 text-center text-muted-foreground" colSpan={5}>
                      {openSession ? 'لا توجد حركات في الجلسة الحالية.' : 'لا توجد جلسة مفتوحة — افتح الخزينة لبدء التسجيل.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={safeEntriesPage}
            totalPages={entriesTotalPages}
            totalItems={sortedSessionEntries.length}
            onPageChange={setEntriesPage}
            itemLabel="حركة"
          />
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <SmartFilterBar
          pageId="repair-treasury-sessions"
          searchPlaceholder="بحث بالفرع أو التاريخ..."
          searchValue={sessionSearch}
          onSearchChange={setSessionSearch}
          quickFilters={[
            {
              key: 'scope',
              placeholder: 'نطاق العرض',
              options: [
                { value: 'selected', label: 'الفرع المختار فقط' },
                { value: 'all', label: 'كل الفروع المصرح بها' },
              ],
            },
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'open', label: 'مفتوحة' },
                { value: 'closed', label: 'مقفلة' },
              ],
            },
          ]}
          quickFilterValues={{
            scope: sessionScope,
            status: sessionStatusFilter,
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'scope') setSessionScope(value === 'all' ? 'all' : 'selected');
            if (key === 'status') setSessionStatusFilter(value === 'open' || value === 'closed' ? value : 'all');
          }}
          className="mb-0 border-0 rounded-none"
        />
        <div className="overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[900px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الفرع</th>
                <th className="erp-th">الفتح</th>
                <th className="erp-th">الإقفال</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">افتتاحي</th>
                <th className="erp-th text-center">إقفال</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pagedSessions.map((session) => {
                const sessionId = String(session.id || '');
                const isExpanded = expandedSessionId === sessionId;
                const isLoading = loadingSessionId === sessionId;
                return (
                  <React.Fragment key={sessionId || `${session.branchId}-${session.openedAt}`}>
                    <tr className={isExpanded ? 'bg-muted/20' : undefined}>
                      <td className="px-4 py-2.5 font-medium">{branchNameMap[String(session.branchId || '')] || '—'}</td>
                      <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                        {session.openedAt ? new Date(session.openedAt).toLocaleString('ar-EG') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                        {session.closedAt ? new Date(session.closedAt).toLocaleString('ar-EG') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <ErpStatusBadge
                          label={session.status === 'closed' ? 'مقفلة' : 'مفتوحة'}
                          type={repairOpenClosedChipType(session.status !== 'closed')}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(Number(session.openingBalance || 0))}</td>
                      <td className={`px-4 py-2.5 text-center font-mono font-semibold tabular-nums ${session.status === 'closed' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                        {session.status === 'closed' && Number.isFinite(Number(session.closingBalance))
                          ? fmt(Number(session.closingBalance || 0))
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Button variant="outline" size="sm" onClick={() => { void openSessionDetails(session); }} disabled={!session.id}>
                          {isLoading ? '...' : isExpanded ? 'إخفاء' : 'تفاصيل'}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-muted/10 px-4 py-3">
                          <div className="mb-2 text-xs font-semibold text-muted-foreground">حركات الجلسة</div>
                          <div className="space-y-1.5">
                            {(sessionDetailsEntriesMap[sessionId] || []).map((entry) => {
                              const entryChip = repairTreasuryEntryTypeChip(entry.entryType);
                              const meta = entryTypeMeta[entry.entryType] || {
                                amountClass: 'text-foreground',
                                signed: (n: number) => fmt(n),
                              };
                              return (
                                <div key={entry.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded border bg-background px-2.5 py-2 text-sm">
                                  <ErpStatusBadge label={entryChip.label} type={entryChip.type} />
                                  <span className="truncate">{entry.note || '—'}</span>
                                  <span className={`font-mono font-semibold tabular-nums ${meta.amountClass}`}>
                                    {meta.signed(Number(entry.amount || 0))}
                                  </span>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : '—'}
                                  </span>
                                </div>
                              );
                            })}
                            {(sessionDetailsEntriesMap[sessionId] || []).length === 0 && (
                              <div className="rounded border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                                لا توجد حركات داخل هذه الجلسة.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredSessions.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={7}>
                    لا توجد جلسات مطابقة للفلاتر الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeSessionsPage}
          totalPages={sessionsTotalPages}
          totalItems={filteredSessions.length}
          onPageChange={setSessionsPage}
          itemLabel="جلسة"
        />
      </Card>

      <Dialog open={showPrevDayCloseModal} onOpenChange={setShowPrevDayCloseModal}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إغلاق خزينة يوم سابق</DialogTitle>
            <DialogDescription>
              يوجد جلسة خزينة مفتوحة من يوم سابق. يجب إغلاقها قبل تنفيذ أي حركة جديدة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
            <Button
              disabled={!canMutate || busy}
              onClick={async () => {
                if (!canManage) return;
                setBusy(true);
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
                  await refreshAll(branchId);
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر إغلاق خزينة اليوم السابق.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              إغلاق الخزينة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairTreasury;
