import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import {
  REPAIR_CASH_TRANSACTIONS_COL,
  REPAIR_CASH_SESSIONS_COL,
  REPAIR_SALE_INVOICES_COL,
  REPAIR_COUNTERS_COL,
} from '../collections';
import type {
  RepairCashTransaction,
  RepairCashSession,
  RepairSaleInvoice,
  RepairSaleInvoiceLine,
} from '../types';
import { sparePartsService } from './sparePartsService';

const toIso = () => new Date().toISOString();

export const repairCashService = {
  // ─── Sessions ────────────────────────────────────────────────────────────────

  async getOpenSession(branchId: string): Promise<RepairCashSession | null> {
    if (!isConfigured) return null;
    const q = query(
      collection(db, REPAIR_CASH_SESSIONS_COL),
      where('branchId', '==', branchId),
      where('status', '==', 'open'),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as RepairCashSession;
  },

  async openSession(branchId: string, openedBy: string, openedByName: string): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const ref = await addDoc(collection(db, REPAIR_CASH_SESSIONS_COL), {
      branchId,
      openedBy,
      openedByName,
      openedAt: toIso(),
      totalIncome: 0,
      totalExpenses: 0,
      netBalance: 0,
      transferredToMain: false,
      status: 'open',
    });
    return ref.id;
  },

  async closeSession(params: {
    sessionId: string;
    branchId: string;
    closedBy: string;
    closedByName: string;
    transferToMain: boolean;
  }): Promise<void> {
    if (!isConfigured) return;
    // Compute totals from transactions
    const txns = await this.getSessionTransactions(params.branchId, params.sessionId);
    const totalIncome = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    await updateDoc(doc(db, REPAIR_CASH_SESSIONS_COL, params.sessionId), {
      closedBy: params.closedBy,
      closedByName: params.closedByName,
      closedAt: toIso(),
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      transferredToMain: params.transferToMain,
      status: 'closed',
    });
  },

  subscribe(branchId: string, callback: (sessions: RepairCashSession[]) => void): () => void {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, REPAIR_CASH_SESSIONS_COL),
      where('branchId', '==', branchId),
      orderBy('openedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairCashSession)));
    });
  },

  // ─── Transactions ────────────────────────────────────────────────────────────

  async addTransaction(data: Omit<RepairCashTransaction, 'id' | 'createdAt'>): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const ref = await addDoc(collection(db, REPAIR_CASH_TRANSACTIONS_COL), {
      ...data,
      createdAt: toIso(),
    });
    return ref.id;
  },

  async getSessionTransactions(
    branchId: string,
    sessionId: string,
  ): Promise<RepairCashTransaction[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, REPAIR_CASH_TRANSACTIONS_COL),
      where('branchId', '==', branchId),
      where('sessionId', '==', sessionId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairCashTransaction));
  },

  subscribeTransactions(
    branchId: string,
    sessionId: string,
    callback: (txns: RepairCashTransaction[]) => void,
  ): () => void {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, REPAIR_CASH_TRANSACTIONS_COL),
      where('branchId', '==', branchId),
      where('sessionId', '==', sessionId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairCashTransaction)));
    });
  },

  async getMonthTransactions(branchId: string, yearMonth: string): Promise<RepairCashTransaction[]> {
    if (!isConfigured) return [];
    const start = `${yearMonth}-01T00:00:00.000Z`;
    const end = `${yearMonth}-31T23:59:59.999Z`;
    const q = query(
      collection(db, REPAIR_CASH_TRANSACTIONS_COL),
      where('branchId', '==', branchId),
      where('createdAt', '>=', start),
      where('createdAt', '<=', end),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairCashTransaction));
  },

  // ─── Sale Invoices ───────────────────────────────────────────────────────────

  async createSaleInvoice(params: {
    branchId: string;
    invoiceNo: string;
    customerName: string;
    customerPhone?: string;
    lines: RepairSaleInvoiceLine[];
    totalAmount: number;
    notes?: string;
    sessionId?: string;
    createdBy: string;
  }): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');

    // Deduct stock for each line
    for (const line of params.lines) {
      await sparePartsService.adjustStock({
        branchId: params.branchId,
        partId: line.partId,
        partName: line.partName,
        type: 'OUT',
        quantity: line.quantity,
        unitCost: line.unitPrice,
        notes: `فاتورة بيع ${params.invoiceNo}`,
        createdBy: params.createdBy,
      });
    }

    const ref = await addDoc(collection(db, REPAIR_SALE_INVOICES_COL), {
      branchId: params.branchId,
      invoiceNo: params.invoiceNo,
      customerName: params.customerName,
      customerPhone: params.customerPhone ?? null,
      lines: params.lines,
      totalAmount: params.totalAmount,
      notes: params.notes ?? null,
      createdBy: params.createdBy,
      createdAt: toIso(),
    });

    // Record income in cash register
    await this.addTransaction({
      branchId: params.branchId,
      sessionId: params.sessionId,
      type: 'income',
      category: 'فاتورة بيع قطع غيار',
      amount: params.totalAmount,
      invoiceId: ref.id,
      description: `فاتورة بيع ${params.invoiceNo} - ${params.customerName}`,
      createdBy: params.createdBy,
    });

    return ref.id;
  },

  async getSaleInvoices(branchId: string): Promise<RepairSaleInvoice[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, REPAIR_SALE_INVOICES_COL),
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSaleInvoice));
  },
};
