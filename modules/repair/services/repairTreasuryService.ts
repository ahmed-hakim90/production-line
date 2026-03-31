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
import type { RepairTreasuryEntry, RepairTreasuryEntryType, RepairTreasurySession } from '../types';

const nowIso = () => new Date().toISOString();
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

export const repairTreasuryService = {
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
    if (openSession.needsManualClose) {
      throw new Error('الخزينة تحتاج إقفال يدوي بسبب فرق في الرصيد. لا يمكن تسجيل حركات جديدة.');
    }
    return openSession;
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
    closedBy: string;
    closedByName: string;
    note?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    try {
      const openSession = await this.getOpenSession(input.branchId);
      if (!openSession?.id) throw new Error('لا توجد خزينة مفتوحة للإقفال.');
      const tenantId = getCurrentTenantId();
      const at = nowIso();
      await runTransaction(db, async (tx) => {
        tx.update(doc(db, REPAIR_TREASURY_SESSIONS_COLLECTION, openSession.id || ''), {
          status: 'closed',
          closedAt: at,
          closedBy: input.closedBy,
          closedByName: input.closedByName,
          closingBalance: Number(input.closingBalance || 0),
          needsManualClose: false,
          closeBlockReason: '',
        });
        const entryRef = doc(collection(db, REPAIR_TREASURY_ENTRIES_COLLECTION));
        tx.set(entryRef, {
          tenantId,
          branchId: input.branchId,
          sessionId: openSession.id,
          entryType: 'CLOSING',
          amount: Number(input.closingBalance || 0),
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
