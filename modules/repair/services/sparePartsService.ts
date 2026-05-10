import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import {
  REPAIR_JOBS_COLLECTION,
  REPAIR_PART_RESERVATIONS_COLLECTION,
  REPAIR_PARTS_TRANSACTIONS_COLLECTION,
  REPAIR_SPARE_PARTS_COLLECTION,
  REPAIR_SPARE_PARTS_STOCK_COLLECTION,
} from '../collections';
import { appendRepairServiceEvent } from './repairServiceEventService';
import { REPAIR_DOMAIN_EVENT_VERSION } from '../utils/repairDomainEvents';
import type {
  RepairPartReservation,
  RepairPartTransaction,
  RepairSparePart,
  RepairSparePartStock,
} from '../types';

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

  async updatePartCatalog(
    partId: string,
    patch: Partial<
      Pick<
        RepairSparePart,
        | 'purchaseUnitCost'
        | 'defaultSalePrice'
        | 'warehouseDiscountPercent'
        | 'minStock'
        | 'unit'
        | 'category'
        | 'name'
      >
    >,
  ): Promise<void> {
    if (!isConfigured || !partId) return;
    const data: Record<string, unknown> = {};
    if (patch.purchaseUnitCost !== undefined) data.purchaseUnitCost = Number(patch.purchaseUnitCost || 0);
    if (patch.defaultSalePrice !== undefined) data.defaultSalePrice = Number(patch.defaultSalePrice || 0);
    if (patch.warehouseDiscountPercent !== undefined) {
      data.warehouseDiscountPercent = Math.min(100, Math.max(0, Number(patch.warehouseDiscountPercent || 0)));
    }
    if (patch.minStock !== undefined) data.minStock = Number(patch.minStock || 0);
    if (patch.unit !== undefined) data.unit = String(patch.unit || '');
    if (patch.category !== undefined) data.category = String(patch.category || '');
    if (patch.name !== undefined) data.name = String(patch.name || '');
    if (Object.keys(data).length === 0) return;
    await updateDoc(doc(db, REPAIR_SPARE_PARTS_COLLECTION, partId), data);
  },

  async createPart(input: Omit<RepairSparePart, 'id' | 'createdAt' | 'tenantId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const partRef = doc(collection(db, REPAIR_SPARE_PARTS_COLLECTION));
    const batch = writeBatch(db);

    const partDoc: Record<string, unknown> = {
      branchId: input.branchId,
      name: input.name,
      code: input.code,
      category: input.category,
      unit: input.unit,
      minStock: input.minStock,
      tenantId,
      createdAt: nowIso(),
    };
    if (input.rawMaterialId) partDoc.rawMaterialId = input.rawMaterialId;
    if (input.purchaseUnitCost !== undefined) partDoc.purchaseUnitCost = Number(input.purchaseUnitCost || 0);
    if (input.defaultSalePrice !== undefined) partDoc.defaultSalePrice = Number(input.defaultSalePrice || 0);
    if (input.warehouseDiscountPercent !== undefined) {
      partDoc.warehouseDiscountPercent = Math.min(100, Math.max(0, Number(input.warehouseDiscountPercent || 0)));
    }
    batch.set(partRef, partDoc);

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
    const activeResQ = tenantQuery(
      db,
      REPAIR_PART_RESERVATIONS_COLLECTION,
      where('branchId', '==', branchId),
      where('partId', '==', partId),
      where('status', '==', 'active'),
    );
    const activeResSnap = await getDocs(activeResQ);
    if (!activeResSnap.empty) {
      throw new Error('لا يمكن حذف القطعة طالما توجد حجوزات نشطة على طلبات صيانة.');
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

  /** حجوزات نشطة لطلب — بنستخدمها في waiting_parts ونحررها لما المسار يرجع ورا */
  async listActiveReservationsForBranch(branchId: string): Promise<RepairPartReservation[]> {
    if (!isConfigured || !branchId) return [];
    const q = tenantQuery(
      db,
      REPAIR_PART_RESERVATIONS_COLLECTION,
      where('branchId', '==', branchId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairPartReservation));
  },

  async listActiveReservationsForJob(jobId: string): Promise<RepairPartReservation[]> {
    if (!isConfigured || !jobId) return [];
    const q = tenantQuery(
      db,
      REPAIR_PART_RESERVATIONS_COLLECTION,
      where('jobId', '==', jobId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairPartReservation));
  },

  async sumActiveReservedForPart(
    branchId: string,
    partId: string,
    warehouseId?: string,
  ): Promise<number> {
    const rows = await this.listActiveReservationsForBranchPart(branchId, partId, warehouseId);
    return rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  },

  async listActiveReservationsForBranchPart(
    branchId: string,
    partId: string,
    warehouseId?: string,
  ): Promise<RepairPartReservation[]> {
    if (!isConfigured || !branchId || !partId) return [];
    const q = tenantQuery(
      db,
      REPAIR_PART_RESERVATIONS_COLLECTION,
      where('branchId', '==', branchId),
      where('partId', '==', partId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairPartReservation));
    const wh = String(warehouseId || '').trim();
    if (!wh) return rows;
    return rows.filter((r) => String(r.warehouseId || '').trim() === wh);
  },

  /**
   * حجز كمية على الطلب — الرصيد الفيزيائي ما يتغيرش، بس «المتاح للحجز الجديد» بينقص.
   * لو المخزون مش كفاية بعد طرح الحجوزات النشطة، منرفض.
   */
  async reserveForJob(input: {
    branchId: string;
    jobId: string;
    partId: string;
    partName: string;
    quantity: number;
    warehouseId?: string;
    warehouseName?: string;
    createdBy: string;
  }): Promise<string | null> {
    if (!isConfigured || !input.jobId || !input.partId) return null;
    const tenantId = getCurrentTenantId();
    const qty = Math.max(0, Math.round(Number(input.quantity || 0)));
    if (qty <= 0) throw new Error('الكمية غير صالحة.');
    const at = nowIso();
    const wh = String(input.warehouseId || '').trim();
    const stockRef = doc(
      db,
      REPAIR_SPARE_PARTS_STOCK_COLLECTION,
      stockId(input.branchId, input.partId, wh || undefined),
    );
    const stockRow = await getDoc(stockRef);
    const physical = stockRow.exists() ? Number(stockRow.data().quantity || 0) : 0;
    const reservedByOthers = await this.sumActiveReservedForPart(input.branchId, input.partId, wh || undefined);
    const available = physical - reservedByOthers;
    if (qty > available) {
      throw new Error('الكمية المتاحة للحجز غير كافية (بعد خصم الحجوزات النشطة).');
    }
    await addDoc(collection(db, REPAIR_PART_RESERVATIONS_COLLECTION), {
      tenantId,
      branchId: input.branchId,
      jobId: input.jobId,
      partId: input.partId,
      partName: input.partName,
      quantity: qty,
      warehouseId: wh,
      warehouseName: String(input.warehouseName || ''),
      status: 'active',
      createdAt: at,
      updatedAt: at,
      createdBy: input.createdBy,
    });

    const jobSnap = await getDoc(doc(db, REPAIR_JOBS_COLLECTION, input.jobId));
    if (jobSnap.exists()) {
      const j = jobSnap.data() as Record<string, unknown>;
      await appendRepairServiceEvent(input.jobId, {
        tenantId: String(j.tenantId || tenantId),
        branchId: String(j.branchId || input.branchId),
        at,
        actorUid: input.createdBy,
        actorName: input.createdBy,
        action: 'parts_reserved',
        domainEvent: 'part.reserved',
        eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
        payload: {
          partId: input.partId,
          partName: input.partName,
          quantity: qty,
          warehouseId: wh || null,
        },
      });
    }
    return 'ok';
  },

  async releaseAllActiveForJob(jobId: string, updatedBy: string): Promise<void> {
    if (!isConfigured || !jobId) return;
    const rows = await this.listActiveReservationsForJob(jobId);
    if (rows.length === 0) return;
    const at = nowIso();
    const batch = writeBatch(db);
    rows.forEach((r) => {
      if (!r.id) return;
      batch.update(doc(db, REPAIR_PART_RESERVATIONS_COLLECTION, r.id), {
        status: 'released',
        updatedAt: at,
        releasedBy: updatedBy,
      });
    });
    await batch.commit();

    const jobSnap = await getDoc(doc(db, REPAIR_JOBS_COLLECTION, jobId));
    if (jobSnap.exists() && rows.length > 0) {
      const j = jobSnap.data() as Record<string, unknown>;
      await appendRepairServiceEvent(jobId, {
        tenantId: String(j.tenantId || ''),
        branchId: String(j.branchId || ''),
        at,
        actorUid: updatedBy,
        actorName: updatedBy,
        action: 'parts_released_all',
        domainEvent: 'parts.released_all',
        eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
        payload: { releasedCount: rows.length },
      });
    }
  },

  /** بعد صرف فعلي للمخزون: حجز نشط لنفس القطعة والطلب يتقفل أو يتقلص */
  async consumeActiveReservationForJob(input: {
    jobId: string;
    partId: string;
    quantity: number;
    updatedBy: string;
  }): Promise<void> {
    if (!isConfigured) return;
    let remaining = Math.max(0, Math.round(Number(input.quantity || 0)));
    if (remaining <= 0) return;
    const at = nowIso();
    const active = await this.listActiveReservationsForJob(input.jobId);
    const forPart = active.filter((r) => String(r.partId) === String(input.partId));
    const batch = writeBatch(db);
    for (const r of forPart) {
      if (remaining <= 0 || !r.id) break;
      const rq = Number(r.quantity || 0);
      if (rq <= remaining) {
        batch.update(doc(db, REPAIR_PART_RESERVATIONS_COLLECTION, r.id), {
          status: 'consumed',
          quantity: rq,
          updatedAt: at,
          consumedBy: input.updatedBy,
        });
        remaining -= rq;
      } else {
        batch.update(doc(db, REPAIR_PART_RESERVATIONS_COLLECTION, r.id), {
          quantity: rq - remaining,
          updatedAt: at,
          partiallyConsumedBy: input.updatedBy,
        });
        remaining = 0;
      }
    }
    await batch.commit();
  },
};
