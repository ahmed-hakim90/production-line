import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import {
  REPAIR_TREASURY_ENTRIES_COLLECTION,
  REPAIR_TREASURY_SESSIONS_COLLECTION,
} from '../collections';
import type {
  RepairTreasuryBranchDailyBreakdown,
  RepairTreasuryBranchMonthlySummary,
  RepairTreasuryEntry,
  RepairTreasuryEntryType,
  RepairTreasuryMonthlyReportData,
  RepairTreasurySession,
  RepairTreasurySessionDetailsRow,
  RepairTreasurySessionStatusFilter,
} from '../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { resolveRepairSettings } from '../config/repairSettings';

const nowIso = () => new Date().toISOString();
const utcDay = (isoLike: string) => String(isoLike || '').slice(0, 10);
const computeSessionBalance = (entries: RepairTreasuryEntry[]): number => entries.reduce((sum, entry) => {
  const amount = Number(entry.amount || 0);
  if (entry.entryType === 'OPENING') return sum + amount;
  if (entry.entryType === 'INCOME' || entry.entryType === 'TRANSFER_IN') return sum + amount;
  if (entry.entryType === 'EXPENSE' || entry.entryType === 'TRANSFER_OUT') return sum - amount;
  return sum;
}, 0);
const normalizeTreasuryError = (error: any, fallbackMessage: string): Error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();
  if (code.includes('permission-denied')) {
    return new Error('ليس لديك صلاحية للوصول إلى خزينة الصيانة.');
  }
  if (code.includes('failed-precondition')) {
    return new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
  }
  if (message) {
    return new Error(message);
  }
  return new Error(fallbackMessage);
};

const getMonthRange = (month: string): { startIso: string; endIso: string } => {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
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
      return {
        month: input.month,
        sessionStatus: input.sessionStatus || 'all',
        branchFilter: input.branchId || '',
        visibleBranchIds: [],
        summaries: [],
        dailyBreakdown: [],
        sessions: [],
      };
    }
    try {
      const visibleBranchIds = Array.from(
        new Set((input.allowedBranchIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
      );
      if (!visibleBranchIds.length) {
        return {
          month: input.month,
          sessionStatus: input.sessionStatus || 'all',
          branchFilter: '',
          visibleBranchIds: [],
          summaries: [],
          dailyBreakdown: [],
          sessions: [],
        };
      }
      const includeAllBranches = Boolean(input.includeAllBranches);
      const requestedBranchId = String(input.branchId || '').trim();
      if (requestedBranchId && !visibleBranchIds.includes(requestedBranchId)) {
        throw new Error('ليس لديك صلاحية للوصول إلى بيانات هذا الفرع.');
      }
      const targetBranchIds = includeAllBranches
        ? visibleBranchIds
        : (requestedBranchId ? [requestedBranchId] : [visibleBranchIds[0]]);
      const { startIso, endIso } = getMonthRange(input.month);
      const sessionStatus = input.sessionStatus || 'all';
      const groupedSessions = await Promise.all(targetBranchIds.map((branchId) => this.listSessions(branchId)));
      const groupedEntries = await Promise.all(targetBranchIds.map((branchId) => this.listEntries(branchId)));
      const allSessions = groupedSessions.flat().filter((session) => {
        const openedAt = String(session.openedAt || '');
        if (!openedAt || openedAt < startIso || openedAt > endIso) return false;
        if (sessionStatus !== 'all' && session.status !== sessionStatus) return false;
        return true;
      });
      const entriesBySessionId = new Map<string, RepairTreasuryEntry[]>();
      groupedEntries.flat().forEach((entry) => {
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
            if (entry.entryType === 'TRANSFER_IN') acc.transferIn += amount;
            if (entry.entryType === 'TRANSFER_OUT') acc.transferOut += amount;
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

      return {
        month: input.month,
        sessionStatus,
        branchFilter: includeAllBranches ? 'ALL' : (targetBranchIds[0] || ''),
        visibleBranchIds: targetBranchIds,
        summaries: Array.from(summaryByBranch.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar')),
        dailyBreakdown: Array.from(dailyByBranchDay.values()).sort((a, b) => `${a.day}${a.branchName}`.localeCompare(`${b.day}${b.branchName}`, 'ar')),
        sessions: sessionRows.sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || ''))),
      };
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل تقرير الخزائن الشهري.');
    }
  },

  async listSessions(branchId?: string): Promise<RepairTreasurySession[]> {
    if (!isConfigured) return [];
    try {
      const constraints = [orderBy('openedAt', 'desc')] as Parameters<typeof query>[1][];
      if (branchId) constraints.unshift(where('branchId', '==', branchId));
      const q = query(collection(db, REPAIR_TREASURY_SESSIONS_COLLECTION), ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasurySession));
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل جلسات الخزينة.');
    }
  },

  async listEntries(branchId?: string): Promise<RepairTreasuryEntry[]> {
    if (!isConfigured) return [];
    try {
      const constraints = [orderBy('createdAt', 'desc')] as Parameters<typeof query>[1][];
      if (branchId) constraints.unshift(where('branchId', '==', branchId));
      const q = query(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION), ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTreasuryEntry));
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تحميل حركات الخزينة.');
    }
  },

  async getOpenSession(branchId: string): Promise<RepairTreasurySession | null> {
    if (!isConfigured || !branchId) return null;
    try {
      const q = query(
        collection(db, REPAIR_TREASURY_SESSIONS_COLLECTION),
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
      const q = query(
        collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION),
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
      const q = query(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION), ...constraints, limit(1));
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
      const q = query(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION), ...constraints, orderBy('createdAt', 'desc'));
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
    entryType: Exclude<RepairTreasuryEntryType, 'OPENING' | 'CLOSING'>;
    amount: number;
    note?: string;
    referenceId?: string;
    createdBy: string;
    createdByName?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const tenantId = getCurrentTenantId();
      const openSession = await this.ensureOpenSession(input.branchId);
      if (input.entryType === 'INCOME' && input.referenceId) {
        const alreadyPosted = await this.hasIncomeEntryByReference(openSession.id || '', input.referenceId);
        if (alreadyPosted) {
          throw new Error('تم تسجيل تحصيل خزينة مسبقًا لنفس المرجع.');
        }
      }
      const ref = await addDoc(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION), {
        tenantId,
        branchId: input.branchId,
        sessionId: openSession.id,
        entryType: input.entryType,
        amount: Math.abs(Number(input.amount || 0)),
        note: input.note || '',
        referenceId: input.referenceId || '',
        createdBy: input.createdBy,
        createdByName: input.createdByName || '',
        createdAt: nowIso(),
      } as RepairTreasuryEntry);
      return ref.id;
    } catch (error: any) {
      throw normalizeTreasuryError(error, 'تعذر تسجيل حركة الخزينة.');
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
      const sessionEntriesQuery = query(
        collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION),
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
