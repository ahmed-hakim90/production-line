import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import {
  REPAIR_PARTS_TRANSACTIONS_COLLECTION,
  REPAIR_SPARE_PARTS_COLLECTION,
  REPAIR_SPARE_PARTS_STOCK_COLLECTION,
} from '../collections';
import type { RepairPartTransaction, RepairSparePart, RepairSparePartStock } from '../types';

const nowIso = () => new Date().toISOString();
const stockId = (branchId: string, partId: string, warehouseId?: string) =>
  warehouseId ? `${branchId}__${warehouseId}__${partId}` : `${branchId}__${partId}`;

export const sparePartsService = {
  async listParts(branchId: string): Promise<RepairSparePart[]> {
    if (!isConfigured || !branchId) return [];
    const q = tenantQuery(
      db,
      REPAIR_SPARE_PARTS_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePart));
  },

  async listStock(branchId: string, warehouseId?: string): Promise<RepairSparePartStock[]> {
    if (!isConfigured || !branchId) return [];
    const q = tenantQuery(
      db,
      REPAIR_SPARE_PARTS_STOCK_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('updatedAt', 'desc'),
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSparePartStock));
    if (!warehouseId) return rows;

    // Prefer rows for the selected warehouse and only fall back to legacy
    // branch-level rows (without warehouseId) when no warehouse row exists.
    const exactWarehouseRows = rows.filter((row) => String(row.warehouseId || '').trim() === warehouseId);
    const exactPartIds = new Set(exactWarehouseRows.map((row) => String(row.partId || '')));
    const fallbackLegacyRows = rows.filter((row) => !String(row.warehouseId || '').trim() && !exactPartIds.has(String(row.partId || '')));

    const merged = [...exactWarehouseRows, ...fallbackLegacyRows];
    const deduped = new Map<string, RepairSparePartStock>();
    for (const row of merged) {
      const partId = String(row.partId || '').trim();
      if (!partId || deduped.has(partId)) continue;
      deduped.set(partId, row);
    }
    return Array.from(deduped.values());
  },

  async createPart(input: Omit<RepairSparePart, 'id' | 'createdAt' | 'tenantId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const partRef = doc(collection(db, REPAIR_SPARE_PARTS_COLLECTION));
    const batch = writeBatch(db);

    batch.set(partRef, {
      ...input,
      tenantId,
      createdAt: nowIso(),
    });

    batch.set(doc(db, REPAIR_SPARE_PARTS_STOCK_COLLECTION, stockId(input.branchId, partRef.id)), {
      tenantId,
      branchId: input.branchId,
      partId: partRef.id,
      partName: input.name,
      quantity: 0,
      updatedAt: nowIso(),
    });

    await batch.commit();
    return partRef.id;
  },

  async removePart(partId: string, branchId: string): Promise<void> {
    if (!isConfigured || !partId || !branchId) return;

    const stockQuery = tenantQuery(
      db,
      REPAIR_SPARE_PARTS_STOCK_COLLECTION,
      where('branchId', '==', branchId),
      where('partId', '==', partId),
    );
    const stockSnap = await getDocs(stockQuery);
    const hasStock = stockSnap.docs.some((row) => Number(row.data().quantity || 0) > 0);
    if (hasStock) {
      throw new Error('لا يمكن حذف القطعة طالما يوجد لها رصيد في المخزون.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, REPAIR_SPARE_PARTS_COLLECTION, partId));
    stockSnap.docs.forEach((stockDoc) => {
      batch.delete(stockDoc.ref);
    });
    await batch.commit();
  },

  async adjustStock(input: {
    branchId: string;
    warehouseId?: string;
    warehouseName?: string;
    partId: string;
    partName: string;
    quantity: number;
    type: 'IN' | 'OUT';
    createdBy: string;
    notes?: string;
    jobId?: string;
    referenceId?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const tenantId = getCurrentTenantId();
    const qtyDelta = input.type === 'OUT' ? -Math.abs(input.quantity) : Math.abs(input.quantity);
    await runTransaction(db, async (tx) => {
      const stockRef = doc(
        db,
        REPAIR_SPARE_PARTS_STOCK_COLLECTION,
        stockId(input.branchId, input.partId, input.warehouseId),
      );
      const stockSnap = await tx.get(stockRef);
      const current = stockSnap.exists() ? Number(stockSnap.data().quantity || 0) : 0;
      const next = current + qtyDelta;
      if (next < 0) throw new Error('الكمية غير كافية في المخزون.');

      tx.set(
        stockRef,
        {
          tenantId,
          branchId: input.branchId,
          warehouseId: input.warehouseId || '',
          warehouseName: input.warehouseName || '',
          partId: input.partId,
          partName: input.partName,
          quantity: next,
          updatedAt: nowIso(),
        },
        { merge: true },
      );

      const txRef = doc(collection(db, REPAIR_PARTS_TRANSACTIONS_COLLECTION));
      const normalizedNotes = [input.notes, input.warehouseName ? `المخزن: ${input.warehouseName}` : undefined]
        .filter(Boolean)
        .join(' - ');
      const row: RepairPartTransaction = {
        tenantId,
        branchId: input.branchId,
        partId: input.partId,
        partName: input.partName,
        type: input.type,
        quantity: Math.abs(input.quantity),
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
        ...(normalizedNotes ? { notes: normalizedNotes } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        createdBy: input.createdBy,
        createdAt: nowIso(),
      };
      tx.set(txRef, row);
    });
  },

  async deductPart(
    branchId: string,
    partId: string,
    partName: string,
    quantity: number,
    createdBy: string,
    jobId?: string,
    warehouseId?: string,
    warehouseName?: string,
  ): Promise<void> {
    return this.adjustStock({
      branchId,
      warehouseId,
      warehouseName,
      partId,
      partName,
      quantity,
      type: 'OUT',
      createdBy,
      jobId,
      notes: 'استهلاك قطع غيار في طلب صيانة',
    });
  },
};
