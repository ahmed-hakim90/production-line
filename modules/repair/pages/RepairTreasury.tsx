import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
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
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairTreasuryEntry,
  type RepairTreasurySession,
  type RepairTreasurySettlement,
} from '../types';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
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
  SETTLEMENT_OUT: {
    amountClass: 'text-orange-700',
    signed: (n) => `−${fmt(n)}`,
  },
  SETTLEMENT_IN: {
    amountClass: 'text-emerald-800',
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
  const [settlements, setSettlements] = useState<RepairTreasurySettlement[]>([]);
  const [settleCounted, setSettleCounted] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settleVarianceReason, setSettleVarianceReason] = useState('');
  const canApproveSettlements = canManage && (
    can('repair.branches.manage')
    || can('repair.callCenter.viewAll')
  );

  const allowedBranches = useMemo(() => {
    if (repairCtx.canViewAllBranches) return branches;
    const accessibleIds = new Set(
      resolveAccessibleRepairBranchIds({
        user,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: false,
      }),
    );
    return branches.filter((branch) => accessibleIds.has(String(branch.id || '')));
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
      if (
        entry.entryType === 'INCOME'
        || entry.entryType === 'TRANSFER_IN'
        || entry.entryType === 'SETTLEMENT_IN'
      ) return sum + Number(entry.amount || 0);
      if (
        entry.entryType === 'EXPENSE'
        || entry.entryType === 'TRANSFER_OUT'
        || entry.entryType === 'SETTLEMENT_OUT'
      ) return sum - Number(entry.amount || 0);
      return sum;
    }, 0);
  }, [openSession, sessionEntries]);

  const todayTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    sessionEntries.forEach((entry) => {
      const amount = Number(entry.amount || 0);
      if (
        entry.entryType === 'INCOME'
        || entry.entryType === 'TRANSFER_IN'
        || entry.entryType === 'SETTLEMENT_IN'
      ) income += amount;
      if (
        entry.entryType === 'EXPENSE'
        || entry.entryType === 'TRANSFER_OUT'
        || entry.entryType === 'SETTLEMENT_OUT'
      ) expense += amount;
    });
    return { income, expense, count: sessionEntries.length };
  }, [sessionEntries]);

  const mainBranch = useMemo(
    () => branches.find((branch) => branch.isMain) || null,
    [branches],
  );
  const isMainBranchSelected = Boolean(activeBranch?.isMain);
  const pendingSettlements = useMemo(
    () => settlements.filter((row) => row.status === 'submitted'),
    [settlements],
  );
  const branchSettlements = useMemo(
    () => settlements.filter((row) => row.fromBranchId === branchId || row.toBranchId === branchId).slice(0, 12),
    [settlements, branchId],
  );

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

  const loadSettlements = async () => {
    try {
      const rows = await repairTreasuryService.listSettlements({ limitCount: 80 });
      setSettlements(rows);
    } catch {
      setSettlements([]);
    }
  };

  const refreshAll = async (selectedBranchId = branchId) => {
    await load(selectedBranchId, { force: true });
    await Promise.all([
      loadAllBranchSessions(allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean)),
      loadSettlements(),
    ]);
  };

  useEffect(() => {
    void loadSettlements();
  }, []);

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

  const handleSubmitSettlement = async () => {
    if (!canMutate || busy || !branchId || isMainBranchSelected) return;
    const counted = Number(settleCounted);
    if (!Number.isFinite(counted) || counted <= 0) {
      toast.error('أدخل مبلغ التسوية الفعلي.');
      return;
    }
    const variance = Math.abs(counted - computedBalance);
    if (variance > 0.01 && settleVarianceReason.trim().length < 3) {
      toast.error('اكتب سبب فرق العدّ عن رصيد النظام.');
      return;
    }
    if (!mainBranch?.id) {
      toast.error('عيّن فرعًا رئيسيًا واحدًا قبل إرسال التسوية.');
      return;
    }
    setBusy(true);
    try {
      await repairTreasuryService.submitSettlement({
        branchId,
        countedAmount: counted,
        expectedAmount: computedBalance,
        note: settleNote.trim() || `تسوية نقدية إلى ${mainBranch.name}`,
        varianceReason: settleVarianceReason.trim() || undefined,
      });
      setSettleCounted('');
      setSettleNote('');
      setSettleVarianceReason('');
      toast.success('تم إرسال طلب التسوية لاعتماد الإدارة.');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إرسال التسوية.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSettlement = async (settlementId: string) => {
    if (!canApproveSettlements || busy || !settlementId) return;
    if (!window.confirm('اعتماد التسوية وترحيل النقدية من الفرع إلى الخزينة الرئيسية؟')) return;
    setBusy(true);
    try {
      await repairTreasuryService.approveSettlement(settlementId);
      toast.success('تم اعتماد التسوية وترحيل القيود.');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر اعتماد التسوية.');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSettlement = async (settlementId: string) => {
    if (!canApproveSettlements || busy || !settlementId) return;
    const reason = window.prompt('سبب رفض التسوية:');
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await repairTreasuryService.rejectSettlement(settlementId, reason.trim());
      toast.success('تم رفض طلب التسوية.');
      await refreshAll(branchId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر رفض التسوية.');
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="خزينة الصيانة" dir={dir}>
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض خزينة الصيانة.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow="خزينة الصيانة"
      dir={dir}
      hero={[
        {
          key: 'balance',
          label: 'الرصيد الحسابي',
          value: openSession ? fmt(computedBalance) : '—',
          meta: openSession ? `${selectedBranchName || ''} ج.م`.trim() : selectedBranchName || undefined,
        },
        {
          key: 'session',
          label: 'حالة الجلسة',
          value: openSession ? 'مفتوحة' : 'مقفلة',
          meta: openSession?.needsManualClose ? 'تحتاج إقفال يدوي' : undefined,
          toneClassName: openSession ? 'ops-dash-kpi-card--tone-emerald' : 'ops-dash-kpi-card--tone-rose',
        },
        { key: 'income', label: 'إيراد الجلسة', value: fmt(todayTotals.income), meta: 'ج.م' },
        {
          key: 'expense',
          label: 'مصروف الجلسة',
          value: fmt(todayTotals.expense),
          meta: `${todayTotals.count} حركة`,
        },
      ]}
      onRefresh={() => { if (branchId) void refreshAll(branchId); }}
      refreshing={busy || loading}
      actions={(
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/repair/treasury-report')}>
          التقرير الشهري
        </Button>
      )}
    >

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

      {canApproveSettlements && pendingSettlements.length > 0 ? (
        <OpsDashPanel title={`طلبات تسوية بانتظار الاعتماد (${pendingSettlements.length})`} accent="repair">
          <div className="space-y-2">
            {pendingSettlements.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {branchNameMap[row.fromBranchId] || row.fromBranchId}
                    {' → '}
                    {row.toBranchName || branchNameMap[row.toBranchId] || 'الرئيسي'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    معدود {fmt(Number(row.countedAmount || 0))} ج.م
                    {Math.abs(Number(row.variance || 0)) > 0.01
                      ? ` · فرق ${fmt(Number(row.variance || 0))} · ${row.varianceReason || '—'}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" disabled={busy} onClick={() => void handleApproveSettlement(String(row.id || ''))}>
                    اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void handleRejectSettlement(String(row.id || ''))}
                  >
                    رفض
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </OpsDashPanel>
      ) : null}

      {branchSettlements.length > 0 ? (
        <OpsDashPanel title="آخر تسويات هذا الفرع" accent="repair">
          <div className="space-y-1.5 text-sm">
            {branchSettlements.map((row) => (
              <div key={`hist-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span>
                  {fmt(Number(row.countedAmount || row.amount || 0))} ج.م
                  <span className="ms-2 text-xs text-muted-foreground">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString('ar-EG') : '—'}
                  </span>
                </span>
                <ErpStatusBadge
                  label={
                    row.status === 'approved' ? 'معتمدة'
                      : row.status === 'rejected' ? 'مرفوضة'
                        : 'بانتظار الاعتماد'
                  }
                  type={
                    row.status === 'approved' ? 'success'
                      : row.status === 'rejected' ? 'danger'
                        : 'warning'
                  }
                />
              </div>
            ))}
          </div>
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel title="الفرع والحالة" accent="repair">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
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
          <div className="px-1 py-2.5">
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
          <div className="px-1 py-2.5">
            <div className="text-xs text-muted-foreground">صلاحية الإدارة</div>
            <div className="mt-1 text-sm font-semibold">
              {!canManage ? 'عرض فقط' : monthClosed ? 'مقفول شهريًا' : 'متاحة'}
            </div>
          </div>
        </div>
      </OpsDashPanel>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-5">
          <OpsDashPanel title={openSession ? 'تقفيل الخزينة' : 'فتح الخزينة'} accent="repair">
            <div className="space-y-4">
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
            </div>
          </OpsDashPanel>

          <OpsDashPanel title="إضافة حركة" accent="repair">
            <div className="space-y-3">
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
                        <SelectItem value="INCOME">إيراد يدوي</SelectItem>
                        <SelectItem value="EXPENSE">مصروف</SelectItem>
                        <SelectItem value="TRANSFER_OUT">تحويل بنكي داخلي (نقد → بنك)</SelectItem>
                        <SelectItem value="TRANSFER_IN">وارد بنكي داخلي (بنك → نقد)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      التحويل البنكي الداخلي ليس تسوية للإدارة. استخدم لوحة «تسوية للإدارة» أدناه.
                    </p>
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
            </div>
          </OpsDashPanel>

          {!isMainBranchSelected && canManage ? (
            <OpsDashPanel title="تسوية للإدارة (الفرع الرئيسي)" accent="repair">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  يُرسل مبلغًا نقديًا للاعتماد ثم يُخصم من خزينة هذا الفرع ويُضاف لخزينة{' '}
                  <span className="font-semibold">{mainBranch?.name || 'الفرع الرئيسي'}</span>.
                </p>
                {!openSession ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    افتح الخزينة أولًا قبل إرسال تسوية.
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                      رصيد النظام الحالي:{' '}
                      <span className="font-semibold tabular-nums">{fmt(computedBalance)} ج.م</span>
                    </div>
                    <div>
                      <Label>المبلغ المعدود / المُسلَّم</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        min={0}
                        value={settleCounted}
                        onChange={(e) => setSettleCounted(e.target.value)}
                        placeholder={String(computedBalance || 0)}
                        disabled={!canMutate || busy}
                      />
                    </div>
                    {Math.abs(Number(settleCounted || 0) - computedBalance) > 0.01 ? (
                      <div>
                        <Label>سبب فرق العدّ</Label>
                        <Input
                          className="mt-2"
                          value={settleVarianceReason}
                          onChange={(e) => setSettleVarianceReason(e.target.value)}
                          placeholder="مثال: نقص عهدة / فرق صرف"
                          disabled={!canMutate || busy}
                        />
                      </div>
                    ) : null}
                    <div>
                      <Label>ملاحظة</Label>
                      <Input
                        className="mt-2"
                        value={settleNote}
                        onChange={(e) => setSettleNote(e.target.value)}
                        placeholder="اختياري"
                        disabled={!canMutate || busy}
                      />
                    </div>
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={!canMutate || busy || !branchId}
                      onClick={() => void handleSubmitSettlement()}
                    >
                      {busy ? 'جارٍ الإرسال…' : 'إرسال تسوية للاعتماد'}
                    </Button>
                  </>
                )}
              </div>
            </OpsDashPanel>
          ) : null}
        </div>

        <OpsDashPanel title="حركات الجلسة الحالية" accent="repair" bodyClassName="p-0" className="xl:col-span-7">
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">مرتبة من الأحدث — تشمل افتتاح اليوم والتحصيلات والمصروفات</p>
          <div className="erp-mobile-card-list p-2">
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <div key={`entry-m-skel-${i}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                <Skeleton className="h-5 w-full rounded-md" />
              </div>
            ))}
            {!loading && pagedEntries.map((entry) => {
              const entryChip = repairTreasuryEntryTypeChip(entry.entryType);
              const meta = entryTypeMeta[entry.entryType] || {
                amountClass: 'text-foreground',
                signed: (n: number) => fmt(n),
              };
              const note = entry.entryType === 'EXPENSE' && entry.expenseType
                ? `${REPAIR_TREASURY_EXPENSE_TYPES.find((row) => row.key === entry.expenseType)?.label || entry.expenseType} — ${entry.note || '—'}`
                : (entry.note || '—');
              return (
                <div
                  key={`m-${entry.id}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <ErpStatusBadge label={entryChip.label} type={entryChip.type} />
                    <span className={`font-mono text-sm font-semibold tabular-nums ${meta.amountClass}`}>
                      {meta.signed(Number(entry.amount || 0))}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{note}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt className="text-[10px]">الوقت</dt>
                      <dd className="tabular-nums text-[var(--color-text)]">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px]">بواسطة</dt>
                      <dd className="text-[var(--color-text)]">{entry.createdByName || '—'}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
            {!loading && sortedSessionEntries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {openSession ? 'لا توجد حركات في الجلسة الحالية.' : 'لا توجد جلسة مفتوحة — افتح الخزينة لبدء التسجيل.'}
              </p>
            )}
          </div>
          <div className="erp-desktop-table erp-table-wrap overflow-x-auto erp-table-scroll">
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
        </OpsDashPanel>
      </div>

      <OpsDashPanel title="سجل الجلسات" accent="repair" bodyClassName="p-0">
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
        <div className="erp-mobile-card-list p-2">
          {pagedSessions.map((session) => {
            const sessionId = String(session.id || '');
            const isExpanded = expandedSessionId === sessionId;
            const isLoading = loadingSessionId === sessionId;
            return (
              <div
                key={`m-${sessionId || `${session.branchId}-${session.openedAt}`}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {branchNameMap[String(session.branchId || '')] || '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      فتح: {session.openedAt ? new Date(session.openedAt).toLocaleString('ar-EG') : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      إقفال: {session.closedAt ? new Date(session.closedAt).toLocaleString('ar-EG') : '—'}
                    </p>
                  </div>
                  <ErpStatusBadge
                    label={session.status === 'closed' ? 'مقفلة' : 'مفتوحة'}
                    type={repairOpenClosedChipType(session.status !== 'closed')}
                  />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-muted-foreground">افتتاحي</dt>
                    <dd className="font-mono tabular-nums">{fmt(Number(session.openingBalance || 0))}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">إقفال</dt>
                    <dd className={`font-mono font-semibold tabular-nums ${session.status === 'closed' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {session.status === 'closed' && Number.isFinite(Number(session.closingBalance))
                        ? fmt(Number(session.closingBalance || 0))
                        : '—'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-2">
                  <Button variant="outline" size="sm" onClick={() => { void openSessionDetails(session); }} disabled={!session.id}>
                    {isLoading ? '...' : isExpanded ? 'إخفاء' : 'تفاصيل'}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="mt-3 space-y-1.5 border-t pt-2">
                    <div className="text-xs font-semibold text-muted-foreground">حركات الجلسة</div>
                    {(sessionDetailsEntriesMap[sessionId] || []).map((entry) => {
                      const entryChip = repairTreasuryEntryTypeChip(entry.entryType);
                      const meta = entryTypeMeta[entry.entryType] || {
                        amountClass: 'text-foreground',
                        signed: (n: number) => fmt(n),
                      };
                      return (
                        <div key={entry.id} className="rounded border bg-background px-2.5 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <ErpStatusBadge label={entryChip.label} type={entryChip.type} />
                            <span className={`font-mono font-semibold tabular-nums ${meta.amountClass}`}>
                              {meta.signed(Number(entry.amount || 0))}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs">{entry.note || '—'}</p>
                        </div>
                      );
                    })}
                    {(sessionDetailsEntriesMap[sessionId] || []).length === 0 && (
                      <div className="rounded border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
                        لا توجد حركات داخل هذه الجلسة.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredSessions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد جلسات مطابقة للفلاتر الحالية.
            </p>
          )}
        </div>
        <div className="erp-desktop-table erp-table-wrap overflow-x-auto erp-table-scroll">
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
      </OpsDashPanel>

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
    </RepairOpsPageShell>
  );
};

export default RepairTreasury;
