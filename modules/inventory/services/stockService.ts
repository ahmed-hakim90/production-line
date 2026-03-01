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
  writeBatch,
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
const INV_REF_REGEX = /^INV-(\d+)$/i;
const formatInvReference = (seq: number) => `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

const balanceDocId = (warehouseId: string, itemType: InventoryItemType, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const toIsoNow = () => new Date().toISOString();
const stripUndefined = <T extends Record<string, any>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const stockService = {
  async getNextInvReferenceNo(): Promise<string> {
    if (!isConfigured) return formatInvReference(1);
    const q = query(collection(db, TRANSACTIONS_COLLECTION), orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    const maxInv = snap.docs.reduce((max, d) => {
      const ref = String((d.data() as any)?.referenceNo || '').trim();
      const match = ref.match(INV_REF_REGEX);
      if (!match) return max;
      return Math.max(max, Number(match[1] || 0));
    }, 0);
    return formatInvReference(maxInv + 1);
  },

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

  async getTransactionsByReferenceNo(referenceNo: string): Promise<StockTransaction[]> {
    if (!isConfigured || !referenceNo.trim()) return [];
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('referenceNo', '==', referenceNo.trim()),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
  },

  async getTransactionsByNote(note: string): Promise<StockTransaction[]> {
    if (!isConfigured || !note.trim()) return [];
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('note', '==', note.trim()),
    );
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
    const resolvedReferenceNo = input.referenceNo?.trim() || await this.getNextInvReferenceNo();

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
          referenceNo: resolvedReferenceNo,
          relatedTransactionId: linkedRef.id,
          transferDirection: 'OUT',
          createdBy: input.createdBy,
          createdAt: now,
        };
        const inPayload: StockTransaction = {
          ...outPayload,
          warehouseId: input.toWarehouseId!,
          toWarehouseId: input.warehouseId,
          relatedTransactionId: txRef.id,
          transferDirection: 'IN',
        };

        t.set(txRef, stripUndefined(outPayload));
        t.set(linkedRef, stripUndefined(inPayload));

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
      if (nextQty < 0 && !input.allowNegative) {
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
        referenceNo: resolvedReferenceNo,
        createdBy: input.createdBy,
        createdAt: now,
      };

      t.set(txRef, stripUndefined(payload));
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

  async updateMovement(
    tx: StockTransaction,
    updates: { quantity: number; referenceNo?: string },
  ): Promise<void> {
    if (!isConfigured || !tx.id) return;
    if (tx.movementType === 'TRANSFER') {
      throw new Error('تعديل التحويلة غير مدعوم مباشرة. احذف التحويلة ثم أنشئها من جديد.');
    }

    const typedQty = Number(updates.quantity || 0);
    if (tx.movementType === 'ADJUSTMENT') {
      if (typedQty === 0) throw new Error('قيمة التسوية لا يمكن أن تساوي صفر.');
    } else if (typedQty <= 0) {
      throw new Error('الكمية يجب أن تكون أكبر من صفر.');
    }

    const nextSignedQty =
      tx.movementType === 'OUT'
        ? -Math.abs(typedQty)
        : tx.movementType === 'IN'
          ? Math.abs(typedQty)
          : typedQty;

    await runTransaction(db, async (t) => {
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(tx.warehouseId, tx.itemType, tx.itemId));
      const txRef = doc(db, TRANSACTIONS_COLLECTION, tx.id!);
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      const delta = nextSignedQty - Number(tx.quantity || 0);
      const nextQty = currentQty + delta;
      if (nextQty < 0) {
        throw new Error('تعذر تعديل الحركة لأن الرصيد الحالي لا يسمح بهذه الكمية.');
      }

      const now = toIsoNow();
      t.set(
        balRef,
        {
          warehouseId: tx.warehouseId,
          itemType: tx.itemType,
          itemId: tx.itemId,
          itemName: tx.itemName,
          itemCode: tx.itemCode,
          minStock: 0,
          quantity: nextQty,
          updatedAt: now,
        },
        { merge: true },
      );
      t.update(txRef, stripUndefined({
        quantity: nextSignedQty,
        referenceNo: updates.referenceNo?.trim() || tx.referenceNo,
      }));
    });
  },

  async deleteMovement(tx: StockTransaction): Promise<void> {
    if (!isConfigured || !tx.id) return;

    if (tx.movementType === 'TRANSFER') {
      if (tx.referenceNo?.trim()) {
        await this.deleteTransferByReference(tx.referenceNo.trim());
        return;
      }
      throw new Error('لا يمكن حذف تحويلة بدون رقم مرجع.');
    }

    await runTransaction(db, async (t) => {
      const balRef = doc(db, BALANCES_COLLECTION, balanceDocId(tx.warehouseId, tx.itemType, tx.itemId));
      const balSnap = await t.get(balRef);
      const currentQty = balSnap.exists() ? Number(balSnap.data().quantity || 0) : 0;
      const nextQty = currentQty - Number(tx.quantity || 0);
      if (nextQty < 0) {
        throw new Error('تعذر حذف الحركة لأن رصيد الصنف الحالي لا يسمح بعكسها.');
      }

      const txRef = doc(db, TRANSACTIONS_COLLECTION, tx.id!);
      t.set(
        balRef,
        {
          warehouseId: tx.warehouseId,
          itemType: tx.itemType,
          itemId: tx.itemId,
          itemName: tx.itemName,
          itemCode: tx.itemCode,
          minStock: 0,
          quantity: nextQty,
          updatedAt: toIsoNow(),
        },
        { merge: true },
      );
      t.delete(txRef);
    });
  },

  async deleteTransferByReference(referenceNo: string): Promise<void> {
    if (!isConfigured || !referenceNo.trim()) return;
    const base = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('movementType', '==', 'TRANSFER'),
      where('referenceNo', '==', referenceNo.trim()),
    );
    const snap = await getDocs(base);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransaction));
    if (rows.length === 0) return;

    const txById = new Map(rows.map((row) => [row.id!, row]));
    const outRows = rows.filter((row) => row.transferDirection === 'OUT');
    if (outRows.length === 0) {
      throw new Error('هذه التحويلة قديمة وغير مدعومة للحذف التلقائي. أنشئ تحويلة عكسية بدلًا من الحذف.');
    }

    await runTransaction(db, async (t) => {
      for (const row of outRows) {
        if (!row.id || !row.toWarehouseId) continue;
        const sourceRef = doc(db, BALANCES_COLLECTION, balanceDocId(row.warehouseId, row.itemType, row.itemId));
        const targetRef = doc(db, BALANCES_COLLECTION, balanceDocId(row.toWarehouseId, row.itemType, row.itemId));

        const sourceSnap = await t.get(sourceRef);
        const targetSnap = await t.get(targetRef);
        const sourceQty = sourceSnap.exists() ? Number(sourceSnap.data().quantity || 0) : 0;
        const targetQty = targetSnap.exists() ? Number(targetSnap.data().quantity || 0) : 0;
        const qty = Number(row.quantity || 0);
        const nextSource = sourceQty + qty;
        const nextTarget = targetQty - qty;
        if (nextTarget < 0) {
          throw new Error(`تعذر حذف التحويلة لأن رصيد المخزن الوجهة للصنف "${row.itemName}" أقل من الكمية المحولة.`);
        }

        t.set(
          sourceRef,
          {
            warehouseId: row.warehouseId,
            itemType: row.itemType,
            itemId: row.itemId,
            itemName: row.itemName,
            itemCode: row.itemCode,
            minStock: 0,
            quantity: nextSource,
            updatedAt: toIsoNow(),
          },
          { merge: true },
        );
        t.set(
          targetRef,
          {
            warehouseId: row.toWarehouseId,
            itemType: row.itemType,
            itemId: row.itemId,
            itemName: row.itemName,
            itemCode: row.itemCode,
            minStock: 0,
            quantity: nextTarget,
            updatedAt: toIsoNow(),
          },
          { merge: true },
        );

        const outRef = doc(db, TRANSACTIONS_COLLECTION, row.id);
        t.delete(outRef);
        if (row.relatedTransactionId && txById.has(row.relatedTransactionId)) {
          const inRef = doc(db, TRANSACTIONS_COLLECTION, row.relatedTransactionId);
          t.delete(inRef);
        }
      }
    });
  },

  async deleteMovements(rows: StockTransaction[]): Promise<void> {
    if (!isConfigured || rows.length === 0) return;

    const transferRefs = new Set(
      rows
        .filter((row) => row.movementType === 'TRANSFER' && row.referenceNo?.trim())
        .map((row) => row.referenceNo!.trim()),
    );
    for (const ref of transferRefs) {
      await this.deleteTransferByReference(ref);
    }

    const nonTransferRows = rows.filter((row) => row.movementType !== 'TRANSFER' && row.id);
    for (const row of nonTransferRows) {
      await this.deleteMovement(row);
    }
  },

  async purgeAllMovements(): Promise<void> {
    if (!isConfigured) return;
    const [txSnap, balancesSnap] = await Promise.all([
      getDocs(collection(db, TRANSACTIONS_COLLECTION)),
      getDocs(collection(db, BALANCES_COLLECTION)),
    ]);

    const docsToDelete = [...txSnap.docs, ...balancesSnap.docs];
    if (docsToDelete.length === 0) return;

    const chunks = chunkArray(docsToDelete, 400);
    for (const group of chunks) {
      const batch = writeBatch(db);
      for (const row of group) {
        batch.delete(row.ref);
      }
      await batch.commit();
    }
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
