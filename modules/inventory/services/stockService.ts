import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  where,
  limit,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type {
  CreateStockMovementInput,
  InventoryItemType,
  StockCountLine,
  StockCountSession,
  StockItemBalance,
  StockTransaction,
} from '../types';

const BALANCES_COLLECTION = 'stock_items';
const TRANSACTIONS_COLLECTION = 'stock_transactions';
const COUNTS_COLLECTION = 'stock_counts';

const balanceDocId = (warehouseId: string, itemType: InventoryItemType, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const toIsoNow = () => new Date().toISOString();

export const stockService = {
  async getBalances(warehouseId?: string): Promise<StockItemBalance[]> {
    if (!isConfigured) return [];
    const base = collection(db, BALANCES_COLLECTION);
    const q = warehouseId
      ? query(base, where('warehouseId', '==', warehouseId))
      : query(base);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockItemBalance));
  },

  async getTransactions(warehouseId?: string): Promise<StockTransaction[]> {
    if (!isConfigured) return [];
    const base = collection(db, TRANSACTIONS_COLLECTION);
    const q = warehouseId
      ? query(base, where('warehouseId', '==', warehouseId), orderBy('createdAt', 'desc'), limit(500))
      : query(base, orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
  },

  async createMovement(input: CreateStockMovementInput): Promise<string | null> {
    if (!isConfigured) return null;
    if (input.movementType === 'ADJUSTMENT') {
      if (input.quantity === 0) throw new Error('قيمة التسوية يجب ألا تساوي صفر.');
    } else if (input.quantity <= 0) {
      throw new Error('الكمية يجب أن تكون أكبر من صفر.');
    }

    const txRef = doc(collection(db, TRANSACTIONS_COLLECTION));

    if (input.movementType === 'TRANSFER') {
      if (!input.toWarehouseId || input.toWarehouseId === input.warehouseId) {
        throw new Error('اختر مخزن وجهة مختلف للتحويل.');
      }

      const linkedRef = doc(collection(db, TRANSACTIONS_COLLECTION));
      await runTransaction(db, async (t) => {
        const sourceBalanceRef = doc(
          db,
          BALANCES_COLLECTION,
          balanceDocId(input.warehouseId, input.itemType, input.itemId),
        );
        const targetBalanceRef = doc(
          db,
          BALANCES_COLLECTION,
          balanceDocId(input.toWarehouseId!, input.itemType, input.itemId),
        );

        const sourceSnap = await t.get(sourceBalanceRef);
        const sourceQty = sourceSnap.exists() ? Number(sourceSnap.data().quantity || 0) : 0;
        const nextSource = sourceQty - input.quantity;
        if (nextSource < 0) {
          throw new Error('لا يمكن تنفيذ التحويل: الرصيد غير كافٍ في المخزن المصدر.');
        }

        const targetSnap = await t.get(targetBalanceRef);
        const targetQty = targetSnap.exists() ? Number(targetSnap.data().quantity || 0) : 0;
        const nextTarget = targetQty + input.quantity;
        const now = toIsoNow();

        const outPayload: StockTransaction = {
          warehouseId: input.warehouseId,
          toWarehouseId: input.toWarehouseId,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          movementType: 'TRANSFER',
          quantity: input.quantity,
          note: input.note,
          referenceNo: input.referenceNo,
          relatedTransactionId: linkedRef.id,
          createdBy: input.createdBy,
          createdAt: now,
        };
        const inPayload: StockTransaction = {
          ...outPayload,
          warehouseId: input.toWarehouseId!,
          toWarehouseId: input.warehouseId,
          relatedTransactionId: txRef.id,
        };

        t.set(txRef, outPayload);
        t.set(linkedRef, inPayload);

        t.set(sourceBalanceRef, {
          warehouseId: input.warehouseId,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextSource,
          updatedAt: now,
        }, { merge: true });

        t.set(targetBalanceRef, {
          warehouseId: input.toWarehouseId!,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextTarget,
          updatedAt: now,
        }, { merge: true });
      });
      return txRef.id;
    }

    await runTransaction(db, async (t) => {
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(input.warehouseId, input.itemType, input.itemId));
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      let delta = input.quantity;
      if (input.movementType === 'OUT') delta = -input.quantity;
      if (input.movementType === 'ADJUSTMENT') delta = input.quantity;

      const nextQty = currentQty + delta;
      if (nextQty < 0) {
        throw new Error('لا يمكن تنفيذ العملية: الرصيد الحالي لا يسمح بهذه الحركة.');
      }

      const now = toIsoNow();
      const payload: StockTransaction = {
        warehouseId: input.warehouseId,
        itemType: input.itemType,
        itemId: input.itemId,
        itemName: input.itemName,
        itemCode: input.itemCode,
        movementType: input.movementType,
        quantity: delta,
        note: input.note,
        referenceNo: input.referenceNo,
        createdBy: input.createdBy,
        createdAt: now,
      };

      t.set(txRef, payload);
      t.set(
        balRef,
        {
          warehouseId: input.warehouseId,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: input.itemName,
          itemCode: input.itemCode,
          minStock: input.minStock ?? 0,
          quantity: nextQty,
          updatedAt: now,
        },
        { merge: true },
      );
    });

    return txRef.id;
  },

  async createCountSession(payload: {
    warehouseId: string;
    warehouseName: string;
    lines: StockCountLine[];
    note?: string;
    createdBy: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = doc(collection(db, COUNTS_COLLECTION));
    const session: StockCountSession = {
      warehouseId: payload.warehouseId,
      warehouseName: payload.warehouseName,
      status: 'open',
      note: payload.note,
      lines: payload.lines,
      createdBy: payload.createdBy,
      createdAt: toIsoNow(),
    };
    await setDoc(ref, session);
    return ref.id;
  },

  async getCountSessions(): Promise<StockCountSession[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COUNTS_COLLECTION), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockCountSession));
  },

  async saveCountLines(sessionId: string, lines: StockCountLine[]): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, COUNTS_COLLECTION, sessionId), {
      lines,
      status: 'counted',
    });
  },

  async approveCountSession(session: StockCountSession, approvedBy: string): Promise<void> {
    if (!isConfigured || !session.id) return;
    const diffs = session.lines
      .map((line) => ({
        ...line,
        diff: Number(line.countedQty || 0) - Number(line.expectedQty || 0),
      }))
      .filter((line) => line.diff !== 0);

    for (const line of diffs) {
      await this.createMovement({
        warehouseId: session.warehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        movementType: 'ADJUSTMENT',
        quantity: line.diff,
        note: `Count adjustment from session ${session.id}`,
        createdBy: approvedBy,
      });
    }

    await updateDoc(doc(db, COUNTS_COLLECTION, session.id), {
      status: 'approved',
      approvedAt: toIsoNow(),
      approvedBy,
    });
  },
};
