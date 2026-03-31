import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import {
  REPAIR_SPARE_PARTS_COL,
  REPAIR_SPARE_PARTS_STOCK_COL,
  REPAIR_PARTS_TRANSACTIONS_COL,
} from '../collections';
import type {
  RepairSparePart,
  RepairSparePartStock,
  RepairPartsTransaction,
  RepairPartUsed,
  RepairPartsTransactionType,
} from '../types';

const toIso = () => new Date().toISOString();
const stockDocId = (branchId: string, partId: string) => `${branchId}__${partId}`;

export const sparePartsService = {
  // ─── Catalog ─────────────────────────────────────────────────────────────────

  async getAll(branchId?: string): Promise<RepairSparePart[]> {
    if (!isConfigured) return [];
    const constraints: any[] = [orderBy('name')];
    if (branchId) constraints.unshift(where('branchId', '==', branchId));
    const q = query(collection(db, REPAIR_SPARE_PARTS_COL), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePart));
  },

  subscribe(branchId: string, callback: (parts: RepairSparePart[]) => void): () => void {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, REPAIR_SPARE_PARTS_COL),
      where('branchId', '==', branchId),
      orderBy('name'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePart)));
    });
  },

  async create(data: Omit<RepairSparePart, 'id' | 'createdAt'>, createdBy: string): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const ref = await addDoc(collection(db, REPAIR_SPARE_PARTS_COL), {
      ...data,
      createdBy,
      createdAt: toIso(),
    });
    // initialize stock to 0
    await setDoc(doc(db, REPAIR_SPARE_PARTS_STOCK_COL, stockDocId(data.branchId, ref.id)), {
      branchId: data.branchId,
      partId: ref.id,
      partName: data.name,
      quantity: 0,
      updatedAt: toIso(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<RepairSparePart>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, REPAIR_SPARE_PARTS_COL, id), { ...data, updatedAt: toIso() });
    // If name changed, sync in stock doc
    if (data.name && data.branchId) {
      const stockRef = doc(db, REPAIR_SPARE_PARTS_STOCK_COL, stockDocId(data.branchId, id));
      await updateDoc(stockRef, { partName: data.name, updatedAt: toIso() });
    }
  },

  // ─── Stock ───────────────────────────────────────────────────────────────────

  async getStock(branchId: string): Promise<RepairSparePartStock[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, REPAIR_SPARE_PARTS_STOCK_COL),
      where('branchId', '==', branchId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePartStock));
  },

  subscribeStock(branchId: string, callback: (stock: RepairSparePartStock[]) => void): () => void {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, REPAIR_SPARE_PARTS_STOCK_COL),
      where('branchId', '==', branchId),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePartStock)));
    });
  },

  subscribeAllStock(callback: (stock: RepairSparePartStock[]) => void): () => void {
    if (!isConfigured) return () => {};
    return onSnapshot(collection(db, REPAIR_SPARE_PARTS_STOCK_COL), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePartStock)));
    });
  },

  /** Adjust stock quantity (IN/OUT/ADJUSTMENT) — uses Firestore transaction for atomicity */
  async adjustStock(params: {
    branchId: string;
    partId: string;
    partName: string;
    type: RepairPartsTransactionType;
    quantity: number;
    unitCost?: number;
    jobId?: string;
    invoiceId?: string;
    notes?: string;
    createdBy: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const stockRef = doc(
      db,
      REPAIR_SPARE_PARTS_STOCK_COL,
      stockDocId(params.branchId, params.partId),
    );

    await runTransaction(db, async (tx) => {
      const stockSnap = await tx.get(stockRef);
      const currentQty = stockSnap.exists() ? (stockSnap.data().quantity as number) : 0;

      const delta =
        params.type === 'IN'
          ? params.quantity
          : params.type === 'OUT'
            ? -params.quantity
            : params.quantity; // ADJUSTMENT sets absolutely? No — delta from current

      const newQty = Math.max(0, currentQty + delta);

      tx.set(
        stockRef,
        {
          branchId: params.branchId,
          partId: params.partId,
          partName: params.partName,
          quantity: newQty,
          updatedAt: toIso(),
        },
        { merge: true },
      );

      // Record transaction
      const txRef = doc(collection(db, REPAIR_PARTS_TRANSACTIONS_COL));
      tx.set(txRef, {
        branchId: params.branchId,
        partId: params.partId,
        partName: params.partName,
        type: params.type,
        quantity: params.quantity,
        unitCost: params.unitCost ?? null,
        jobId: params.jobId ?? null,
        invoiceId: params.invoiceId ?? null,
        notes: params.notes ?? null,
        createdBy: params.createdBy,
        createdAt: toIso(),
      });
    });
  },

  /** Deduct multiple parts atomically (used when a repair job is updated with parts) */
  async deductParts(params: {
    branchId: string;
    parts: RepairPartUsed[];
    jobId: string;
    createdBy: string;
  }): Promise<void> {
    if (!isConfigured || params.parts.length === 0) return;

    await runTransaction(db, async (tx) => {
      for (const part of params.parts) {
        const stockRef = doc(
          db,
          REPAIR_SPARE_PARTS_STOCK_COL,
          stockDocId(params.branchId, part.partId),
        );
        const snap = await tx.get(stockRef);
        const current = snap.exists() ? (snap.data().quantity as number) : 0;
        const newQty = Math.max(0, current - part.quantity);

        tx.set(stockRef, { quantity: newQty, updatedAt: toIso() }, { merge: true });

        const txRef = doc(collection(db, REPAIR_PARTS_TRANSACTIONS_COL));
        tx.set(txRef, {
          branchId: params.branchId,
          partId: part.partId,
          partName: part.partName,
          type: 'OUT',
          quantity: part.quantity,
          unitCost: part.unitCost,
          jobId: params.jobId,
          createdBy: params.createdBy,
          createdAt: toIso(),
        });
      }
    });
  },

  async getTransactions(branchId: string): Promise<RepairPartsTransaction[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, REPAIR_PARTS_TRANSACTIONS_COL),
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairPartsTransaction));
  },
};
