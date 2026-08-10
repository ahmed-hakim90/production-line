import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateRepairTreasuryCallable } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import {
  REPAIR_TREASURY_ENTRIES_COLLECTION,
  REPAIR_TREASURY_MONTH_CLOSES_COLLECTION,
  REPAIR_TREASURY_SESSIONS_COLLECTION,
  REPAIR_TREASURY_SETTLEMENTS_COLLECTION,
} from '../collections';
import type {
  RepairTreasuryBranchDailyBreakdown,
  RepairTreasuryBranchMonthlySummary,
  RepairTreasuryEntry,
  RepairTreasuryEntryType,
  RepairTreasuryMonthClose,
  RepairTreasuryMonthCloseSnapshot,
  RepairTreasuryMonthlyReportData,
  RepairTreasurySession,
  RepairTreasurySessionDetailsRow,
  RepairTreasurySessionStatusFilter,
  RepairTreasurySettlement,
} from '../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { resolveRepairSettings } from '../config/repairSettings';
import {
  assertCanCloseRepairTreasuryMonth,
  assertCanReopenRepairTreasuryMonth,
  assertMonthWritableOrThrow,
  buildRepairTreasuryMonthCloseDocId,
  isRepairTreasuryMonthClosedStatus,
  monthKeyFromIso,
  normalizeTreasuryMonth,
} from '../lib/repairTreasuryMonthlyClose';
import { toRepairTreasuryErrorMessage } from '../lib/repairTreasuryErrors';

const nowIso = () => new Date().toISOString();
const utcDay = (isoLike: string) => String(isoLike || '').slice(0, 10);
const emptyMonthlyReport = (
  month: string,
  sessionStatus: RepairTreasurySessionStatusFilter = 'all',
  branchFilter = '',
): RepairTreasuryMonthlyReportData => ({
  month,
  sessionStatus,
  branchFilter,
  visibleBranchIds: [],
  summaries: [],
  dailyBreakdown: [],
  sessions: [],
  monthCloseByBranchId: {},
  paymentMethodSummaries: [],
  reconciliation: { entriesCount: 0, missingPaymentMethod: 0, missingCostCenter: 0, missingJournalReference: 0 },
});
const computeSessionBalance = (entries: RepairTreasuryEntry[]): number => entries.reduce((sum, entry) => {
  const amount = Number(entry.amount || 0);
  if (entry.entryType === 'OPENING') return sum + amount;
  if (
    entry.entryType === 'INCOME'
    || entry.entryType === 'TRANSFER_IN'
    || entry.entryType === 'SETTLEMENT_IN'
  ) return sum + amount;
  if (
    entry.entryType === 'EXPENSE'
    || entry.entryType === 'TRANSFER_OUT'
    || entry.entryType === 'SETTLEMENT_OUT'
  ) return sum - amount;
  return sum;
}, 0);
const normalizeTreasuryError = (error: any, fallbackMessage: string): Error => (
  new Error(toRepairTreasuryErrorMessage(error, fallbackMessage))
);

const getMonthRange = (month: string): { startIso: string; endIso: string } => {
  const safeMonth = normalizeTreasuryMonth(month);
  const [y, m] = safeMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

export const repairTreasuryService = {
  async getMonthlyReport(input: {
    month: string;
    allowedBranchIds: string[];
    branchId?: string;
    includeAllBranches?: boolean;
    sessionStatus?: RepairTreasurySessionStatusFilter;
    branchNameMap?: Record<string, string>;
  }): Promise<RepairTreasuryMonthlyReportData> {
    if (!isConfigured) {
      return emptyMonthlyReport(input.month, input.sessionStatus || 'all', input.branchId || '');
    }
    try {
      const visibleBranchIds = Array.from(
        new Set((input.allowedBranchIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
      );
      if (!visibleBranchIds.length) {
        return emptyMonthlyReport(input.month, input.sessionStatus || 'all', '');
      }
      const includeAllBranches = Boolean(input.includeAllBranches);
      const requestedBranchId = String(input.branchId || '').trim();
      if (requestedBranchId && !visibleBranchIds.includes(requestedBranchId)) {
        throw new Error('ليس لديك صلاحية للوصول إلى بيانات هذا الفرع.');
      }
      const targetBranchIds = includeAllBranches
        ? visibleBranchIds
        : (requestedBranchId ? [requestedBranchId] : [visibleBranchIds[0]]);
      const month = normalizeTreasuryMonth(input.month);
      const { startIso, endIso } = getMonthRange(month);
      const sessionStatus = input.sessionStatus || 'all';
      const [branchSessions, branchEntries, monthCloses] = await Promise.all([
        this.listSessionsForBranches(targetBranchIds),
        this.listEntriesForBranches(targetBranchIds),
        this.listMonthCloses(targetBranchIds, month),
      ]);
      const monthCloseByBranchId: Record<string, RepairTreasuryMonthClose | null> = {};
      targetBranchIds.forEach((branchId) => {
        monthCloseByBranchId[branchId] = monthCloses.find((row) => row.branchId === branchId) || null;
      });
      const allSessions = branchSessions.filter((session) => {
        const openedAt = String(session.openedAt || '');
        if (!openedAt || openedAt < startIso || openedAt > endIso) return false;
        if (sessionStatus !== 'all' && session.status !== sessionStatus) return false;
        return true;
      });
      const entriesBySessionId = new Map<string, RepairTreasuryEntry[]>();
      branchEntries.forEach((entry) => {
        const sid = String(entry.sessionId || '');
        if (!sid) return;
        const list = entriesBySessionId.get(sid) || [];
        list.push(entry);
        entriesBySessionId.set(sid, list);
      });

      const summaryByBranch = new Map<string, RepairTreasuryBranchMonthlySummary>();
      const dailyByBranchDay = new Map<string, RepairTreasuryBranchDailyBreakdown>();
      const sessionRows: RepairTreasurySessionDetailsRow[] = [];

      allSessions.forEach((session) => {
        const branchId = String(session.branchId || '');
        const branchName = String(input.branchNameMap?.[branchId] || branchId || 'فرع غير معروف');
        const openedAt = String(session.openedAt || '');
        const day = openedAt.slice(0, 10);
        const sessionEntries = entriesBySessionId.get(String(session.id || '')) || [];
        const sums = sessionEntries.reduce(
          (acc, entry) => {
            const amount = Number(entry.amount || 0);
            if (entry.entryType === 'OPENING') acc.opening += amount;
            if (entry.entryType === 'INCOME') acc.income += amount;
            if (entry.entryType === 'EXPENSE') acc.expense += amount;
            if (entry.entryType === 'TRANSFER_IN' || entry.entryType === 'SETTLEMENT_IN') acc.transferIn += amount;
            if (entry.entryType === 'TRANSFER_OUT' || entry.entryType === 'SETTLEMENT_OUT') acc.transferOut += amount;
            return acc;
          },
          { opening: 0, income: 0, expense: 0, transferIn: 0, transferOut: 0 },
        );
        const closing = Number(session.closingBalance || 0);
        const net = sums.income + sums.transferIn - sums.expense - sums.transferOut;

        const branchSummary = summaryByBranch.get(branchId) || {
          branchId,
          branchName,
          sessionsCount: 0,
          totalOpening: 0,
          totalIncome: 0,
          totalExpense: 0,
          totalTransferIn: 0,
          totalTransferOut: 0,
          netMovement: 0,
          totalClosing: 0,
        };
        branchSummary.sessionsCount += 1;
        branchSummary.totalOpening += sums.opening;
        branchSummary.totalIncome += sums.income;
        branchSummary.totalExpense += sums.expense;
        branchSummary.totalTransferIn += sums.transferIn;
        branchSummary.totalTransferOut += sums.transferOut;
        branchSummary.netMovement += net;
        branchSummary.totalClosing += closing;
        summaryByBranch.set(branchId, branchSummary);

        const dailyKey = `${branchId}::${day}`;
        const daily = dailyByBranchDay.get(dailyKey) || {
          branchId,
          branchName,
          day,
          sessionsCount: 0,
          opening: 0,
          income: 0,
          expense: 0,
          transferIn: 0,
          transferOut: 0,
          net: 0,
          closing: 0,
        };
        daily.sessionsCount += 1;
        daily.opening += sums.opening;
        daily.income += sums.income;
        daily.expense += sums.expense;
        daily.transferIn += sums.transferIn;
        daily.transferOut += sums.transferOut;
        daily.net += net;
        daily.closing += closing;
        dailyByBranchDay.set(dailyKey, daily);

        sessionRows.push({
          sessionId: String(session.id || ''),
          branchId,
          branchName,
          status: session.status,
          openedAt: session.openedAt,
          closedAt: session.closedAt,
          openingBalance: Number(session.openingBalance || 0),
          closingBalance: session.closingBalance,
          closingDifference: session.closingDifference,
          closingDifferenceReason: session.closingDifferenceReason,
          openedByName: session.openedByName,
          closedByName: session.closedByName,
          entriesCount: sessionEntries.length,
        });
      });

      const visibleSessionIds = new Set(allSessions.map((session) => String(session.id || '')).filter(Boolean));
      const visibleEntries = branchEntries.filter((entry) => visibleSessionIds.has(String(entry.sessionId || '')));
      const paymentGroups = new Map<string, RepairTreasuryMonthlyReportData['paymentMethodSummaries'][number]>();
      visibleEntries.forEach((entry) => {
        if (!['INCOME', 'EXPENSE'].includes(entry.entryType)) return;
        const method = entry.paymentMethod || 'unspecified';
        const costCenterId = String(entry.costCenterId || '');
        const key = `${entry.branchId}::${costCenterId}::${method}`;
        const current = paymentGroups.get(key) || {
          branchId: entry.branchId,
          branchName: String(input.branchNameMap?.[entry.branchId] || entry.branchId),
          costCenterId,
          paymentMethod: method,
          income: 0,
          expense: 0,
          net: 0,
          entriesCount: 0,
        };
        const amount = Number(entry.amount || 0);
        if (entry.entryType === 'INCOME') current.income += amount;
        if (entry.entryType === 'EXPENSE') current.expense += amount;
        current.net = current.income - current.expense;
        current.entriesCount += 1;
        paymentGroups.set(key, current);
      });
      const businessEntries = visibleEntries.filter((entry) => ['INCOME', 'EXPENSE'].includes(entry.entryType));

      return {
        month,
        sessionStatus,
        branchFilter: includeAllBranches ? 'ALL' : (targetBranchIds[0] || ''),
        visibleBranchIds: targetBranchIds,
        summaries: Array.from(summaryByBranch.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar')),
        dailyBreakdown: Array.from(dailyByBranchDay.values()).sort((a, b) => `${a.day}${a.branchName}`.localeCompare(`${b.day}${b.branchName}`, 'ar')),
        sessions: sessionRows.sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || ''))),
        monthCloseByBranchId,
        paymentMethodSummaries: Array.from(paymentGroups.values()).sort((a, b) => `${a.branchName}${a.paymentMethod}`.localeCompare(`${b.branchName}${b.paymentMethod}`, 'ar')),
        reconciliation: {
          entriesCount: businessEntries.length,
          missingPaymentMethod: businessEntries.filter((entry) => !entry.paymentMethod).length,
          missingCostCenter: businessEntries.filter((entry) => !entry.costCenterId).length,
          missingJournalReference: businessEntries.filter((entry) => !entry.journalEntryId).length,
        },
      };
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل تقرير الخزائن الشهري.');
    }
  },

  async getMonthClose(branchId: string, month: string): Promise<RepairTreasuryMonthClose | null> {
    if (!isConfigured) return null;
    try {
      const tenantId = getCurrentTenantId();
      const safeBranchId = String(branchId || '').trim();
      if (!safeBranchId) return null;
      const docId = buildRepairTreasuryMonthCloseDocId(tenantId, safeBranchId, month);
      const snap = await getDoc(doc(db, REPAIR_TREASURY_MONTH_CLOSES_COLLECTION, docId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as RepairTreasuryMonthClose;
    } catch (error: any) {
      // Missing collection rules (or get of absent doc denied) must not break the monthly report /
      // daily treasury — treat as "no close record" (month open).
      const code = String(error?.code || '').toLowerCase();
      if (code.includes('permission-denied')) return null;
      throw normalizeTreasuryError(error, 'تعذر تحميل حالة إقفال الشهر.');
    }
  },

  async isMonthClosed(branchId: string, month: string): Promise<boolean> {
    const row = await this.getMonthClose(branchId, month);
    return isRepairTreasuryMonthClosedStatus(row?.status);
  },

  async listMonthCloses(branchIds: string[], month?: string): Promise<RepairTreasuryMonthClose[]> {
    if (!isConfigured) return [];
    try {
      const ids = Array.from(new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
      if (!ids.length) return [];
      const safeMonth = normalizeTreasuryMonth(month || '');
      const rows = await Promise.all(ids.map((branchId) => this.getMonthClose(branchId, safeMonth)));
      return rows.filter(Boolean) as RepairTreasuryMonthClose[];
    } catch (error: any) {
      const code = String(error?.code || '').toLowerCase();
      if (code.includes('permission-denied')) return [];
      throw normalizeTreasuryError(error, 'تعذر تحميل سجلات الإقفال الشهري.');
    }
  },

  async assertMonthWritable(branchId: string, atIso?: string): Promise<void> {
    const month = monthKeyFromIso(atIso || nowIso());
    const closed = await this.isMonthClosed(branchId, month);
    assertMonthWritableOrThrow({ monthClosed: closed, month });
  },

  async closeMonth(input: {
    branchId: string;
    month: string;
    closedBy: string;
    closedByName: string;
    note?: string;
    snapshot?: RepairTreasuryMonthCloseSnapshot;
  }): Promise<RepairTreasuryMonthClose> {
    if (!isConfigured) throw new Error('النظام غير مُعد.');
    try {
      const tenantId = getCurrentTenantId();
      const branchId = String(input.branchId || '').trim();
      const month = normalizeTreasuryMonth(input.month);
      if (!branchId) throw new Error('الفرع مطلوب لإقفال الشهر.');

      const existing = await this.getMonthClose(branchId, month);
      const { startIso, endIso } = getMonthRange(month);
      const sessions = await this.listSessions(branchId);
      const monthSessions = sessions.filter((session) => {
        const openedAt = String(session.openedAt || '');
        return openedAt >= startIso && openedAt <= endIso;
      });
      const openCount = monthSessions.filter((session) => session.status === 'open').length;
      assertCanCloseRepairTreasuryMonth({
        alreadyClosed: isRepairTreasuryMonthClosedStatus(existing?.status),
        openSessionsCount: openCount,
      });

      let snapshot = input.snapshot;
      if (!snapshot) {
        const report = await this.getMonthlyReport({
          month,
          allowedBranchIds: [branchId],
          branchId,
          includeAllBranches: false,
        });
        const summary = report.summaries.find((row) => row.branchId === branchId);
        snapshot = {
          sessionsCount: Number(summary?.sessionsCount || 0),
          totalOpening: Number(summary?.totalOpening || 0),
          totalIncome: Number(summary?.totalIncome || 0),
          totalExpense: Number(summary?.totalExpense || 0),
          netMovement: Number(summary?.netMovement || 0),
          totalClosing: Number(summary?.totalClosing || 0),
        };
      }

      const at = nowIso();
      const docId = buildRepairTreasuryMonthCloseDocId(tenantId, branchId, month);
      const payload: RepairTreasuryMonthClose = {
        tenantId,
        branchId,
        month,
        status: 'closed',
        closedAt: at,
        closedBy: input.closedBy,
        closedByName: input.closedByName,
        closingNote: String(input.note || '').trim(),
        snapshot,
        updatedAt: at,
        ...(existing?.reopenedAt ? {
          reopenedAt: existing.reopenedAt,
          reopenedBy: existing.reopenedBy,
          reopenedByName: existing.reopenedByName,
          reopenReason: existing.reopenReason,
        } : {}),
      };
      await setDoc(doc(db, REPAIR_TREASURY_MONTH_CLOSES_COLLECTION, docId), payload, { merge: true });
      return { id: docId, ...payload };
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر إقفال الشهر.');
    }
  },

  async reopenMonth(input: {
    branchId: string;
    month: string;
    reopenedBy: string;
    reopenedByName: string;
    reopenReason: string;
  }): Promise<RepairTreasuryMonthClose> {
    if (!isConfigured) throw new Error('النظام غير مُعد.');
    try {
      const tenantId = getCurrentTenantId();
      const branchId = String(input.branchId || '').trim();
      const month = normalizeTreasuryMonth(input.month);
      const reason = String(input.reopenReason || '').trim();
      if (!branchId) throw new Error('الفرع مطلوب لإعادة فتح الشهر.');

      const existing = await this.getMonthClose(branchId, month);
      assertCanReopenRepairTreasuryMonth({
        currentlyClosed: isRepairTreasuryMonthClosedStatus(existing?.status),
        reopenReason: reason,
      });

      const at = nowIso();
      const docId = buildRepairTreasuryMonthCloseDocId(tenantId, branchId, month);
      const payload: RepairTreasuryMonthClose = {
        tenantId,
        branchId,
        month,
        status: 'open',
        closedAt: existing?.closedAt,
        closedBy: existing?.closedBy,
        closedByName: existing?.closedByName,
        closingNote: existing?.closingNote,
        snapshot: existing?.snapshot,
        reopenedAt: at,
        reopenedBy: input.reopenedBy,
        reopenedByName: input.reopenedByName,
        reopenReason: reason,
        updatedAt: at,
      };
      await setDoc(doc(db, REPAIR_TREASURY_MONTH_CLOSES_COLLECTION, docId), payload, { merge: true });
      return { id: docId, ...payload };
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر إعادة فتح الشهر.');
    }
  },

  async listSessions(branchId?: string): Promise<RepairTreasurySession[]> {
    if (!isConfigured) return [];
    try {
      const constraints = [orderBy('openedAt', 'desc')] as Parameters<typeof query>[1][];
      if (branchId) constraints.unshift(where('branchId', '==', branchId));
      const q = tenantQuery(db, REPAIR_TREASURY_SESSIONS_COLLECTION, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasurySession));
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل جلسات الخزينة.');
    }
  },

  /**
   * List sessions for many branches via chunked `in` queries (max 10 ids each).
   * Prefer this over `listSessions()` without branchId: security rules require
   * branch scope for non–branch-admins, and missing composite indexes fail closed.
   */
  async listSessionsForBranches(branchIds: string[]): Promise<RepairTreasurySession[]> {
    const ids = Array.from(new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return [];
    if (ids.length === 1) return this.listSessions(ids[0]);
    try {
      const IN_CHUNK = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
      const snaps = await Promise.all(
        chunks.map((chunk) =>
          getDocs(
            tenantQuery(
              db,
              REPAIR_TREASURY_SESSIONS_COLLECTION,
              where('branchId', 'in', chunk),
              orderBy('openedAt', 'desc'),
            ),
          ),
        ),
      );
      return snaps.flatMap((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasurySession)),
      );
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل جلسات الخزينة.');
    }
  },

  async listEntries(branchId?: string): Promise<RepairTreasuryEntry[]> {
    if (!isConfigured) return [];
    try {
      const constraints = [orderBy('createdAt', 'desc')] as Parameters<typeof query>[1][];
      if (branchId) constraints.unshift(where('branchId', '==', branchId));
      const q = tenantQuery(db, REPAIR_TREASURY_ENTRIES_COLLECTION, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasuryEntry));
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل حركات الخزينة.');
    }
  },

  async listEntriesForBranches(branchIds: string[]): Promise<RepairTreasuryEntry[]> {
    const ids = Array.from(new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return [];
    if (ids.length === 1) return this.listEntries(ids[0]);
    try {
      const IN_CHUNK = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
      const snaps = await Promise.all(
        chunks.map((chunk) =>
          getDocs(
            tenantQuery(
              db,
              REPAIR_TREASURY_ENTRIES_COLLECTION,
              where('branchId', 'in', chunk),
              orderBy('createdAt', 'desc'),
            ),
          ),
        ),
      );
      return snaps.flatMap((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasuryEntry)),
      );
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل حركات الخزينة.');
    }
  },

  async getOpenSession(branchId: string): Promise<RepairTreasurySession | null> {
    if (!isConfigured || !branchId) return null;
    try {
      const q = tenantQuery(
        db,
        REPAIR_TREASURY_SESSIONS_COLLECTION,
        where('branchId', '==', branchId),
        where('status', '==', 'open'),
        orderBy('openedAt', 'desc'),
      );
      const snap = await getDocs(q);
      const row = snap.docs[0];
      return row ? ({ id: row.id, ...row.data() } as RepairTreasurySession) : null;
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل حالة الخزينة الحالية.');
    }
  },

  async ensureOpenSession(branchId: string): Promise<RepairTreasurySession> {
    const openSession = await this.getOpenSession(branchId);
    if (!openSession?.id) {
      throw new Error('لا توجد خزينة مفتوحة لهذا الفرع.');
    }
    const settings = resolveRepairSettings(await systemSettingsService.get());
    const blockIfPrevDayOpen = settings.treasury.autoClose.blockOperationsIfPrevDayOpen;
    const openedDay = utcDay(String(openSession.openedAt || ''));
    const today = utcDay(nowIso());
    if (blockIfPrevDayOpen && openedDay && openedDay < today) {
      throw new Error('PREV_DAY_OPEN_TREASURY_SESSION');
    }
    if (openSession.needsManualClose) {
      throw new Error('الخزينة تحتاج إقفال يدوي بسبب فرق في الرصيد. لا يمكن تسجيل حركات جديدة.');
    }
    return openSession;
  },

  async getPreviousDayOpenSession(branchId: string): Promise<RepairTreasurySession | null> {
    if (!isConfigured || !branchId) return null;
    const settings = resolveRepairSettings(await systemSettingsService.get());
    if (!settings.treasury.autoClose.blockOperationsIfPrevDayOpen) return null;
    const openSession = await this.getOpenSession(branchId);
    if (!openSession?.id) return null;
    const openedDay = utcDay(String(openSession.openedAt || ''));
    const today = utcDay(nowIso());
    if (openedDay && openedDay < today) return openSession;
    return null;
  },

  async hasIncomeEntryByReference(sessionId: string, referenceId: string): Promise<boolean> {
    if (!isConfigured || !sessionId || !referenceId) return false;
    try {
      const q = tenantQuery(
        db,
        REPAIR_TREASURY_ENTRIES_COLLECTION,
        where('sessionId', '==', sessionId),
        where('entryType', '==', 'INCOME'),
        where('referenceId', '==', referenceId),
        limit(1),
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر التحقق من قيود التحصيل السابقة.');
    }
  },

  async hasEntryByReference(referenceId: string, entryType?: RepairTreasuryEntryType): Promise<boolean> {
    if (!isConfigured || !referenceId) return false;
    try {
      const constraints = [where('referenceId', '==', referenceId)] as Parameters<typeof query>[1][];
      if (entryType) constraints.push(where('entryType', '==', entryType));
      const q = tenantQuery(db, REPAIR_TREASURY_ENTRIES_COLLECTION, ...constraints, limit(1));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر التحقق من قيد الخزينة المرجعي.');
    }
  },

  async listEntriesByReference(referenceId: string, entryType?: RepairTreasuryEntryType): Promise<RepairTreasuryEntry[]> {
    if (!isConfigured || !referenceId) return [];
    try {
      const constraints = [where('referenceId', '==', referenceId)] as Parameters<typeof query>[1][];
      if (entryType) constraints.push(where('entryType', '==', entryType));
      const q = tenantQuery(db, REPAIR_TREASURY_ENTRIES_COLLECTION, ...constraints, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasuryEntry));
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل قيود الخزينة المرجعية.');
    }
  },

  async openSession(input: {
    branchId: string;
    openingBalance: number;
    openedBy: string;
    openedByName: string;
    note?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      await this.assertMonthWritable(input.branchId, nowIso());
      const tenantId = getCurrentTenantId();
      const existing = await this.getOpenSession(input.branchId);
      if (existing?.id) throw new Error('يوجد خزينة مفتوحة بالفعل لهذا الفرع.');
      const at = nowIso();
      const ref = await addDoc(collection(db, REPAIR_TREASURY_SESSIONS_COLLECTION), {
        tenantId,
        branchId: input.branchId,
        openedBy: input.openedBy,
        openedByName: input.openedByName,
        openedAt: at,
        openingBalance: Number(input.openingBalance || 0),
        status: 'open',
      } as RepairTreasurySession);
      await addDoc(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION), {
        tenantId,
        branchId: input.branchId,
        sessionId: ref.id,
        entryType: 'OPENING',
        amount: Number(input.openingBalance || 0),
        note: input.note || 'رصيد افتتاحي',
        createdBy: input.openedBy,
        createdByName: input.openedByName,
        createdAt: at,
      } as RepairTreasuryEntry);
      return ref.id;
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر فتح الخزينة.');
    }
  },

  async addEntry(input: {
    branchId: string;
    entryType: 'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN';
    amount: number;
    note?: string;
    referenceId?: string;
    paymentMethod?: 'cash' | 'card' | 'bank_transfer';
    costCenterId?: string;
    expenseType?: string;
    createdBy: string;
    createdByName?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      await this.assertMonthWritable(input.branchId, nowIso());
      if (!String(input.costCenterId || '').trim()) throw new Error('مركز التكلفة مطلوب للحركة اليدوية.');
      if (!['cash', 'card', 'bank_transfer'].includes(String(input.paymentMethod || ''))) {
        throw new Error('وسيلة الدفع مطلوبة للحركة اليدوية.');
      }
      if (String(input.note || '').trim().length < 3) throw new Error('سبب الحركة مطلوب بوضوح.');
      if (input.entryType === 'EXPENSE' && !String(input.expenseType || '').trim()) {
        throw new Error('اختر نوع المصروف قبل التسجيل.');
      }
      const openSession = await this.ensureOpenSession(input.branchId);
      if (openSession.openedAt) {
        await this.assertMonthWritable(input.branchId, openSession.openedAt);
      }
      if (input.entryType === 'INCOME' && input.referenceId) {
        const alreadyPosted = await this.hasIncomeEntryByReference(openSession.id || '', input.referenceId);
        if (alreadyPosted) {
          throw new Error('تم تسجيل تحصيل خزينة مسبقًا لنفس المرجع.');
        }
      }
      const requestId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const result = await mutateRepairTreasuryCallable({
        operation: 'post_manual_entry',
        requestId,
        branchId: input.branchId,
        entryType: input.entryType,
        amount: Math.abs(Number(input.amount || 0)),
        note: String(input.note || '').trim(),
        paymentMethod: input.paymentMethod as 'cash' | 'card' | 'bank_transfer',
        expenseType: input.expenseType,
      });
      return String(result.entryId || requestId);
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تسجيل حركة الخزينة.');
    }
  },

  async listSettlements(opts?: {
    status?: RepairTreasurySettlement['status'] | 'all';
    branchId?: string;
    limitCount?: number;
  }): Promise<RepairTreasurySettlement[]> {
    if (!isConfigured) return [];
    const limitCount = Math.min(200, Math.max(1, Number(opts?.limitCount || 80)));
    const status = opts?.status && opts.status !== 'all' ? opts.status : '';
    const branchId = String(opts?.branchId || '').trim();
    try {
      const constraints = [];
      if (status) constraints.push(where('status', '==', status));
      if (branchId) constraints.push(where('fromBranchId', '==', branchId));
      constraints.push(orderBy('submittedAt', 'desc'));
      constraints.push(limit(limitCount));
      const snap = await getDocs(tenantQuery(db, REPAIR_TREASURY_SETTLEMENTS_COLLECTION, ...constraints));
      return snap.docs.map((row) => ({ id: row.id, ...row.data() } as RepairTreasurySettlement));
    } catch (error: any) {
      // Fallback without composite index: tenant-wide recent then filter client-side.
      try {
        const snap = await getDocs(tenantQuery(
          db,
          REPAIR_TREASURY_SETTLEMENTS_COLLECTION,
          orderBy('createdAt', 'desc'),
          limit(limitCount),
        ));
        return snap.docs
          .map((row) => ({ id: row.id, ...row.data() } as RepairTreasurySettlement))
          .filter((row) => (!status || row.status === status) && (!branchId || row.fromBranchId === branchId));
      } catch {
        throw normalizeTreasuryError(error, 'تعذر تحميل طلبات التسوية.');
      }
    }
  },

  async submitSettlement(input: {
    branchId: string;
    countedAmount: number;
    expectedAmount: number;
    note?: string;
    varianceReason?: string;
  }): Promise<string> {
    if (!isConfigured) throw new Error('Firebase غير مُعد.');
    const requestId = `settle_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      const result = await mutateRepairTreasuryCallable({
        operation: 'submit_settlement',
        requestId,
        branchId: input.branchId,
        countedAmount: Math.abs(Number(input.countedAmount || 0)),
        expectedAmount: Math.abs(Number(input.expectedAmount || 0)),
        note: String(input.note || '').trim() || 'تسوية نقدية للإدارة',
        varianceReason: String(input.varianceReason || '').trim() || undefined,
      });
      return String(result.settlementId || `${getCurrentTenantId()}__${requestId}`);
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر إرسال طلب التسوية.');
    }
  },

  async approveSettlement(settlementId: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await mutateRepairTreasuryCallable({
        operation: 'approve_settlement',
        settlementId,
      });
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر اعتماد التسوية.');
    }
  },

  async rejectSettlement(settlementId: string, reason: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await mutateRepairTreasuryCallable({
        operation: 'reject_settlement',
        settlementId,
        reason,
      });
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر رفض التسوية.');
    }
  },

  async closeSession(input: {
    branchId: string;
    closingBalance: number;
    differenceReason?: string;
    closedBy: string;
    closedByName: string;
    note?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    try {
      const normalizedClosingBalance = Number(input.closingBalance);
      if (!Number.isFinite(normalizedClosingBalance)) {
        throw new Error('يرجى إدخال رصيد إقفال فعلي صحيح.');
      }
      const normalizedDifferenceReason = String(input.differenceReason || '').trim();
      const openSession = await this.getOpenSession(input.branchId);
      if (!openSession?.id) throw new Error('لا توجد خزينة مفتوحة للإقفال.');
      await this.assertMonthWritable(input.branchId, openSession.openedAt || nowIso());
      const sessionEntriesQuery = tenantQuery(
        db,
        REPAIR_TREASURY_ENTRIES_COLLECTION,
        where('branchId', '==', input.branchId),
        where('sessionId', '==', openSession.id),
      );
      const sessionEntriesSnap = await getDocs(sessionEntriesQuery);
      const sessionEntries = sessionEntriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasuryEntry));
      const computedBalance = computeSessionBalance(sessionEntries);
      const closingDifference = Math.abs(normalizedClosingBalance - computedBalance);
      if (closingDifference > 0.01 && !normalizedDifferenceReason) {
        throw new Error('يوجد فرق بين الرصيد الحسابي والفعلي. يجب إدخال سبب الفرق قبل التقفيل.');
      }
      const tenantId = getCurrentTenantId();
      const at = nowIso();
      await runTransaction(db, async (tx) => {
        tx.update(doc(db, REPAIR_TREASURY_SESSIONS_COLLECTION, openSession.id || ''), {
          status: 'closed',
          closedAt: at,
          closedBy: input.closedBy,
          closedByName: input.closedByName,
          closingBalance: normalizedClosingBalance,
          closingDifference,
          closingDifferenceReason: closingDifference > 0.01 ? normalizedDifferenceReason : '',
          needsManualClose: false,
          closeBlockReason: '',
        });
        const entryRef = doc(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION));
        tx.set(entryRef, {
          tenantId,
          branchId: input.branchId,
          sessionId: openSession.id,
          entryType: 'CLOSING',
          amount: normalizedClosingBalance,
          note: input.note || 'إقفال الخزينة',
          createdBy: input.closedBy,
          createdByName: input.closedByName,
          createdAt: at,
        } as RepairTreasuryEntry);
      });
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تقفيل الخزينة.');
    }
  },
};
