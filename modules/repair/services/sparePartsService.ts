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

const nextSparePartCode = (parts: RepairSparePart[]) => {
  const maxSerial = parts.reduce((max, part) => {
    const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
    if (!match) return max;
    const current = Number(match[1] || 0);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);
  return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
};

const partLinkedToMaterial = (part: RepairSparePart, materialId: string) => {
  const linked = String(part.materialId || part.rawMaterialId || '').trim();
  return linked === materialId;
};

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

  /** Pricing admin: load catalog parts for one or more repair branches. */
  async listPartsForBranches(branchIds: string[]): Promise<RepairSparePart[]> {
    const ids = Array.from(new Set(branchIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (!isConfigured || ids.length === 0) return [];
    if (ids.length === 1) return sparePartsService.listParts(ids[0]);
    // Parallel per-branch queries (existing indexes) — avoid sequential await-in-loop.
    const chunks = await Promise.all(ids.map((branchId) => sparePartsService.listParts(branchId)));
    return chunks.flat().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
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
        | 'warehouseDiscountPercent'
        | 'minStock'
        | 'unit'
        | 'category'
        | 'name'
        | 'materialId'
        | 'sourceProductId'
        | 'rawMaterialId'
      >
    >,
  ): Promise<void> {
    if (!isConfigured || !partId) return;
    const data: Record<string, unknown> = {};
    if (patch.purchaseUnitCost !== undefined) data.purchaseUnitCost = Number(patch.purchaseUnitCost || 0);
    // defaultSalePrice is not writable — materials master is the only sale-price source.
    if (patch.warehouseDiscountPercent !== undefined) {
      data.warehouseDiscountPercent = Math.min(100, Math.max(0, Number(patch.warehouseDiscountPercent || 0)));
    }
    if (patch.minStock !== undefined) data.minStock = Number(patch.minStock || 0);
    if (patch.unit !== undefined) data.unit = String(patch.unit || '');
    if (patch.category !== undefined) data.category = String(patch.category || '');
    if (patch.name !== undefined) data.name = String(patch.name || '');
    if (patch.materialId !== undefined) {
      const materialId = String(patch.materialId || '').trim();
      if (materialId) {
        const { materialService } = await import('../../manufacturing/services/materialService');
        const {
          isMaterialAvailableForSpareParts,
          MATERIAL_NOT_AVAILABLE_FOR_SPARE_PARTS_ERROR,
        } = await import('../../manufacturing/utils/isMaterialAvailableForSpareParts');
        const material = await materialService.getById(materialId);
        if (material && !isMaterialAvailableForSpareParts(material)) {
          throw new Error(MATERIAL_NOT_AVAILABLE_FOR_SPARE_PARTS_ERROR);
        }
        data.materialId = materialId;
      }
    }
    if (patch.sourceProductId !== undefined) {
      const sourceProductId = String(patch.sourceProductId || '').trim();
      if (sourceProductId) data.sourceProductId = sourceProductId;
    }
    if (patch.rawMaterialId !== undefined) {
      const rawMaterialId = String(patch.rawMaterialId || '').trim();
      if (rawMaterialId) data.rawMaterialId = rawMaterialId;
    }
    if (Object.keys(data).length === 0) return;
    await updateDoc(doc(db, REPAIR_SPARE_PARTS_COLLECTION, partId), data);
  },

  async linkPartsToCatalog(
    links: Array<{ partId: string; materialId: string; itemType?: 'material' | 'legacy_raw' }>,
  ): Promise<number> {
    if (!isConfigured || links.length === 0) return 0;
    const { materialService } = await import('../../manufacturing/services/materialService');
    let linked = 0;
    for (const link of links) {
      const partId = String(link.partId || '').trim();
      const materialId = String(link.materialId || '').trim();
      if (!partId || !materialId) continue;
      const material = await materialService.getById(materialId);
      const isLegacyRaw = link.itemType === 'legacy_raw';
      if (!material && !isLegacyRaw) {
        throw new Error('المكون غير موجود في ماستر داتا المواد.');
      }
      if (material) {
        if (material.availableForSpareParts !== true && material.id) {
          await materialService.update(
            material.id,
            { availableForSpareParts: true },
            { internal: true },
          );
        }
      }
      await sparePartsService.updatePartCatalog(partId, {
        materialId,
        ...(isLegacyRaw || !material ? { rawMaterialId: materialId } : {}),
      });
      linked += 1;
    }
    return linked;
  },

  async createPart(input: Omit<RepairSparePart, 'id' | 'createdAt' | 'tenantId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const materialId = String(input.materialId || '').trim();
    if (materialId) {
      // Prefer manufacturing materials; allow legacy raw ids only when explicitly set as rawMaterialId
      const { materialService } = await import('../../manufacturing/services/materialService');
      const material = await materialService.getById(materialId);
      const isLegacyRawLink =
        !material && String(input.rawMaterialId || '').trim() === materialId;
      if (!material && !isLegacyRawLink) {
        throw new Error('المكون غير موجود في ماستر داتا المواد.');
      }
      // Creating a repair spare part is an explicit opt-in to the spare catalog.
      if (material?.id && material.availableForSpareParts !== true) {
        await materialService.update(
          material.id,
          { availableForSpareParts: true },
          { internal: true },
        );
      }
    }
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
    if (materialId) partDoc.materialId = materialId;
    const sourceProductId = String(input.sourceProductId || '').trim();
    if (sourceProductId) partDoc.sourceProductId = sourceProductId;
    // Legacy field kept for older clients / backfill
    if (input.rawMaterialId) partDoc.rawMaterialId = input.rawMaterialId;
    if (input.purchaseUnitCost !== undefined) partDoc.purchaseUnitCost = Number(input.purchaseUnitCost || 0);
    // Do not persist catalog sale prices — resolve from materials at read time.
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

  /**
   * Remove a branch spare-part catalog row and its stock docs.
   * Use `force: true` only for cleanup of wrongly-added / test rows — discards remaining stock
   * and releases active reservations for that part on the branch.
   */
  async removePart(
    partId: string,
    branchId: string,
    opts?: { force?: boolean },
  ): Promise<void> {
    if (!isConfigured || !partId || !branchId) return;
    const force = opts?.force === true;

    const stockQuery = tenantQuery(
      db,
      REPAIR_SPARE_PARTS_STOCK_COLLECTION,
      where('branchId', '==', branchId),
      where('partId', '==', partId),
    );
    const stockSnap = await getDocs(stockQuery);
    const hasStock = stockSnap.docs.some((row) => Number(row.data().quantity || 0) > 0);
    if (hasStock && !force) {
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
    if (!activeResSnap.empty && !force) {
      throw new Error('لا يمكن حذف القطعة طالما توجد حجوزات نشطة على طلبات صيانة.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, REPAIR_SPARE_PARTS_COLLECTION, partId));
    stockSnap.docs.forEach((stockDoc) => {
      batch.delete(stockDoc.ref);
    });
    if (force && !activeResSnap.empty) {
      const at = nowIso();
      activeResSnap.docs.forEach((resDoc) => {
        batch.update(resDoc.ref, {
          status: 'released',
          updatedAt: at,
          releasedBy: 'force_remove_part',
        });
      });
    }
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

      if (Math.abs(qtyDelta) < 0.00001) return;

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

  /**
   * Ensure a branch catalog part exists for a materials-master id (create if missing).
   * Used after stock-count approve and opening-balance sync so مركز inventory UI is not empty.
   */
  async ensurePartForMaterial(input: {
    branchId: string;
    materialId: string;
    fallbackName?: string;
    fallbackCode?: string;
    fallbackCategory?: string;
    fallbackUnit?: string;
    minStock?: number;
    existingParts?: RepairSparePart[];
  }): Promise<RepairSparePart | null> {
    if (!isConfigured) return null;
    const branchId = String(input.branchId || '').trim();
    const materialId = String(input.materialId || '').trim();
    if (!branchId || !materialId) return null;

    const parts = input.existingParts ?? await this.listParts(branchId);
    const existing = parts.find((row) => partLinkedToMaterial(row, materialId));
    if (existing?.id) return existing;

    const { materialService } = await import('../../manufacturing/services/materialService');
    const {
      isMaterialAvailableForSpareParts,
    } = await import('../../manufacturing/utils/isMaterialAvailableForSpareParts');
    const material = await materialService.getById(materialId).catch(() => null);
    if (material && !isMaterialAvailableForSpareParts(material)) {
      return null;
    }

    const name = String(material?.name || input.fallbackName || materialId).trim() || materialId;
    const code = String(input.fallbackCode || material?.code || '').trim() || nextSparePartCode(parts);
    const unitRaw = String(material?.baseUnit || input.fallbackUnit || 'piece').trim() || 'piece';
    const unit = unitRaw === 'piece' ? 'قطعة' : unitRaw;
    const category = String(material?.categoryName || input.fallbackCategory || 'قطع غيار').trim() || 'قطع غيار';
    const minStock = Number.isFinite(Number(input.minStock))
      ? Number(input.minStock)
      : Number(material?.minStock || 0);

    const partId = await this.createPart({
      branchId,
      name,
      code,
      category,
      unit,
      minStock,
      materialId,
    });
    if (!partId) return null;

    return {
      id: partId,
      tenantId: getCurrentTenantId(),
      branchId,
      name,
      code,
      category,
      unit,
      minStock,
      materialId,
      createdAt: nowIso(),
    };
  },

  /**
   * Set warehouse-scoped repair ledger qty to an absolute value (used after inventory count approve).
   * When createIfMissing is true, creates the branch catalog row from materials master first.
   */
  async setWarehouseStockAbsolute(input: {
    branchId: string;
    warehouseId: string;
    warehouseName?: string;
    materialId: string;
    quantity: number;
    createdBy: string;
    notes?: string;
    createIfMissing?: boolean;
    fallbackName?: string;
    fallbackCode?: string;
    fallbackUnit?: string;
    existingParts?: RepairSparePart[];
  }): Promise<boolean> {
    if (!isConfigured) return false;
    const branchId = String(input.branchId || '').trim();
    const warehouseId = String(input.warehouseId || '').trim();
    const materialId = String(input.materialId || '').trim();
    const target = Number(input.quantity);
    if (!branchId || !warehouseId || !materialId || !Number.isFinite(target) || target < 0) return false;

    let parts = input.existingParts ?? await this.listParts(branchId);
    let part = parts.find((row) => partLinkedToMaterial(row, materialId)) || null;
    if (!part?.id && input.createIfMissing !== false) {
      part = await this.ensurePartForMaterial({
        branchId,
        materialId,
        fallbackName: input.fallbackName,
        fallbackCode: input.fallbackCode,
        fallbackUnit: input.fallbackUnit,
        existingParts: parts,
      });
      if (part) parts = [...parts, part];
    }
    if (!part?.id) return false;

    const stockRows = await this.listStock(branchId, warehouseId);
    const current = Number(stockRows.find((row) => row.partId === part.id)?.quantity || 0);
    const delta = target - current;
    if (Math.abs(delta) < 0.00001) return true;
    await this.adjustStock({
      branchId,
      warehouseId,
      warehouseName: input.warehouseName,
      partId: part.id,
      partName: part.name,
      quantity: Math.abs(delta),
      type: delta > 0 ? 'IN' : 'OUT',
      createdBy: input.createdBy,
      notes: input.notes || 'مزامنة من اعتماد جرد المخزن',
    });
    return true;
  },

  /**
   * Pull inventory SoT balances into the branch spare-parts catalog + ledger via Cloud Function.
   * Center managers may run this (mirror SoT) — free-hand +/- stays on stockAdjust only.
   */
  async syncBranchCatalogFromWarehouseBalances(input: {
    branchId: string;
    warehouseId: string;
    warehouseName?: string;
    createdBy: string;
  }): Promise<{ createdParts: number; synced: number; failed: number }> {
    if (!isConfigured) {
      return { createdParts: 0, synced: 0, failed: 0 };
    }
    const branchId = String(input.branchId || '').trim();
    const warehouseId = String(input.warehouseId || '').trim();
    if (!branchId || !warehouseId) {
      throw new Error('بيانات الفرع/المخزن غير مكتملة للمزامنة.');
    }

    const { httpsCallable } = await import('firebase/functions');
    const { functionsClient } = await import('../../auth/services/firebase');
    if (!functionsClient) throw new Error('خدمات السحابة غير متاحة.');
    const callable = httpsCallable<
      { branchId: string; warehouseId: string; warehouseName?: string },
      { ok: boolean; createdParts: number; synced: number; failed: number }
    >(functionsClient, 'syncRepairCenterCatalogFromInventory');
    const result = await callable({
      branchId,
      warehouseId,
      warehouseName: input.warehouseName,
    });
    const data = result.data || { createdParts: 0, synced: 0, failed: 0 };
    return {
      createdParts: Number(data.createdParts || 0),
      synced: Number(data.synced || 0),
      failed: Number(data.failed || 0),
    };
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
   * @deprecated Legacy soft-hold on repair_spare_parts_stock.
   * Inventory reservations use stock_items.reservedQty via Cloud Functions.
   */
  async reserveForJob(_input: {
    branchId: string;
    jobId: string;
    partId: string;
    partName: string;
    quantity: number;
    warehouseId?: string;
    warehouseName?: string;
    createdBy: string;
  }): Promise<string | null> {
    throw new Error(
      'حجز قطع الصيانة يتم عبر مخزون الشركة (stock_items.reservedQty) وليس دفتر الفرع القديم.',
    );
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
