import {
  arrayRemove,
  arrayUnion,
  getDoc,
  getDocs,
  orderBy,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, createRepairBranchProvisionedCallable, deleteRepairBranchCascadeCallable, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_BRANCHES_COLLECTION } from '../collections';
import type { RepairBranch } from '../types';
import { warehouseService } from '../../inventory/services/warehouseService';
import {
  isRepairCenterWarehouse,
  otherMainBranchIds,
  repairMaintenanceWarehouseName,
} from '../lib/repairBranchMain';
import { normalizeRepairBranchCreateInput, type RepairBranchCreateInput } from '../lib/repairBranchProvision';

const nowIso = () => new Date().toISOString();

const clearOtherMainBranches = async (exceptId?: string | null): Promise<void> => {
  const branches = await repairBranchService.list();
  const ids = otherMainBranchIds(branches, exceptId);
  await Promise.all(
    ids.map((id) =>
      updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id), {
        isMain: false,
        updatedAt: nowIso(),
      }),
    ),
  );
};

export const repairBranchService = {
  async list(): Promise<RepairBranch[]> {
    if (!isConfigured) return [];
    try {
      const q = tenantQuery(db, REPAIR_BRANCHES_COLLECTION, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairBranch));
    } catch (error: unknown) {
      // Technicians and other scoped roles may hit deny on list; callers treat empty as no labels.
      const code = String((error as { code?: string })?.code || '').toLowerCase();
      const message = String((error as { message?: string })?.message || '');
      if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(message)) {
        return [];
      }
      throw error;
    }
  },

  async create(input: RepairBranchCreateInput): Promise<string | null> {
    if (!isConfigured) return null;
    const payload = normalizeRepairBranchCreateInput(input);
    const result = await createRepairBranchProvisionedCallable(payload);
    const branchId = String(result.branchId || '').trim();
    if (!branchId) throw new Error('تعذر إنشاء الفرع.');
    return branchId;
  },

  async findByWarehouseId(warehouseId: string): Promise<RepairBranch | null> {
    if (!isConfigured) return null;
    const wh = String(warehouseId || '').trim();
    if (!wh) return null;
    const branches = await this.list();
    return branches.find((b) => String(b.warehouseId || '').trim() === wh) || null;
  },

  /**
   * Backfill: branch-linked / RWH-* warehouses → role `maintenance_center`.
   */
  async ensureMaintenanceCenterWarehouseRoles(): Promise<{ updated: number; checked: number }> {
    if (!isConfigured) return { updated: 0, checked: 0 };
    const [branches, warehouses] = await Promise.all([
      this.list(),
      warehouseService.getAllWarehouses(),
    ]);
    const linkedIds = new Set(
      branches.map((b) => String(b.warehouseId || '').trim()).filter(Boolean),
    );
    let updated = 0;
    let checked = 0;
    for (const warehouse of warehouses) {
      const id = String(warehouse.id || '').trim();
      if (!id) continue;
      const code = String(warehouse.code || '').trim().toUpperCase();
      const isLinked = linkedIds.has(id);
      const isLegacyRepairCode = /^RWH-\d{3}$/.test(code);
      if (!isLinked && !isLegacyRepairCode) continue;
      checked += 1;
      if ((warehouse.warehouseRole || 'general') === 'maintenance_center') continue;
      await warehouseService.update(id, { warehouseRole: 'maintenance_center' });
      updated += 1;
    }
    return { updated, checked };
  },

  async update(id: string, patch: Partial<Omit<RepairBranch, 'id' | 'tenantId'>>): Promise<void> {
    if (!isConfigured) return;
    const branchId = String(id || '').trim();
    if (!branchId) throw new Error('معرف الفرع غير صالح.');

    const snap = await getDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId));
    if (!snap.exists()) throw new Error('الفرع غير موجود.');
    const existing = snap.data() as RepairBranch;

    const nextName = patch.name !== undefined ? String(patch.name || '').trim() : undefined;
    if (nextName !== undefined && !nextName) {
      throw new Error('اسم الفرع مطلوب.');
    }
    if (patch.managerEmployeeId !== undefined && !String(patch.managerEmployeeId || '').trim()) {
      throw new Error('اختر المسؤول عن الفرع قبل حفظ التعديلات.');
    }

    if (patch.isMain === true) {
      await clearOtherMainBranches(branchId);
    }

    if (nextName && nextName !== String(existing.name || '').trim()) {
      const warehouseId = String(existing.warehouseId || '').trim();
      if (warehouseId) {
        const warehouse = await warehouseService.getById(warehouseId);
        const previousAutoName = repairMaintenanceWarehouseName(String(existing.name || ''));
        // Only auto-rename warehouse when it still follows the default naming pattern.
        if (!warehouse?.name || warehouse.name === previousAutoName) {
          await warehouseService.update(warehouseId, {
            name: repairMaintenanceWarehouseName(nextName),
          });
        }
      }
    }

    const nextPatch: Record<string, unknown> = {
      ...patch,
      updatedAt: nowIso(),
    };
    if (nextName !== undefined) nextPatch.name = nextName;
    if (patch.phone !== undefined) nextPatch.phone = String(patch.phone || '').trim();
    if (patch.address !== undefined) nextPatch.address = String(patch.address || '').trim();

    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId), nextPatch);
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured) return;
    throw new Error('استخدم removeCascade لحذف الفرع مع جميع البيانات المرتبطة.');
  },

  async removeCascade(id: string): Promise<{
    deletedFirestoreDocs: number;
    deletedCounts: Record<string, number>;
    unlinkedCounts: Record<string, number>;
  }> {
    if (!isConfigured) return { deletedFirestoreDocs: 0, deletedCounts: {}, unlinkedCounts: {} };
    const result = await deleteRepairBranchCascadeCallable(id);
    return {
      deletedFirestoreDocs: Number(result.deletedFirestoreDocs || 0),
      deletedCounts: result.deletedCounts || {},
      unlinkedCounts: result.unlinkedCounts || {},
    };
  },

  async linkWarehouse(branchId: string, warehouseId: string): Promise<void> {
    if (!isConfigured) return;
    const id = String(branchId || '').trim();
    const whId = String(warehouseId || '').trim();
    if (!id) throw new Error('معرف الفرع غير صالح.');
    if (!whId) throw new Error('اختر مخزن مركز صيانة.');

    const snap = await getDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id));
    if (!snap.exists()) throw new Error('الفرع غير موجود.');

    const warehouse = await warehouseService.getById(whId);
    if (!warehouse?.id) throw new Error('المخزن المختار غير موجود.');
    if (!isRepairCenterWarehouse(warehouse)) {
      throw new Error('اختر مخزنًا بدور «مخزن مركز صيانة».');
    }

    const taken = await this.findByWarehouseId(whId);
    if (taken && String(taken.id || '') !== id) {
      throw new Error('هذا المخزن مرتبط بفرع صيانة آخر.');
    }

    if ((warehouse.warehouseRole || 'general') !== 'maintenance_center') {
      await warehouseService.update(whId, { warehouseRole: 'maintenance_center' });
    }

    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id), {
      warehouseId: whId,
      warehouseCode: String(warehouse.code || '').trim(),
      updatedAt: nowIso(),
    });
  },

  async updateLinkedWarehouse(
    branchId: string,
    patch: { name?: string; code?: string; isActive?: boolean },
  ): Promise<void> {
    if (!isConfigured) return;
    const id = String(branchId || '').trim();
    if (!id) throw new Error('معرف الفرع غير صالح.');
    const snap = await getDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id));
    if (!snap.exists()) throw new Error('الفرع غير موجود.');
    const existing = snap.data() as RepairBranch;
    const warehouseId = String(existing.warehouseId || '').trim();
    if (!warehouseId) throw new Error('لا يوجد مخزن مرتبط بهذا الفرع.');

    const nextName = patch.name !== undefined ? String(patch.name || '').trim() : undefined;
    const nextCode = patch.code !== undefined ? String(patch.code || '').trim() : undefined;
    if (nextName !== undefined && !nextName) throw new Error('اسم المخزن مطلوب.');
    if (nextCode !== undefined && !nextCode) throw new Error('كود المخزن مطلوب.');

    await warehouseService.update(warehouseId, {
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    });

    const branchPatch: Record<string, unknown> = { updatedAt: nowIso() };
    if (nextCode !== undefined) branchPatch.warehouseCode = nextCode;
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id), branchPatch);
  },

  async assignTechnicianToBranch(branchId: string, technicianId: string): Promise<void> {
    if (!isConfigured || !branchId || !technicianId) return;
    // technicianId is an employee id; also store linked Auth uid so Firestore
    // pl_isTechnicianAssignedToBranch (auth.uid in technicianIds) matches the UI.
    const ids = new Set<string>([technicianId]);
    try {
      const { employeeService } = await import('../../hr/employeeService');
      const employee = await employeeService.getById(technicianId);
      const userId = String(employee?.userId || '').trim();
      if (userId) ids.add(userId);
    } catch {
      // Keep employee id even if employee lookup fails.
    }
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId), {
      technicianIds: arrayUnion(...Array.from(ids)),
      updatedAt: nowIso(),
    });
  },

  async removeTechnicianFromBranch(branchId: string, technicianId: string): Promise<void> {
    if (!isConfigured || !branchId || !technicianId) return;
    const ids = new Set<string>([technicianId]);
    try {
      const { employeeService } = await import('../../hr/employeeService');
      const employee = await employeeService.getById(technicianId);
      const userId = String(employee?.userId || '').trim();
      if (userId) ids.add(userId);
    } catch {
      // Still remove the provided id.
    }
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId), {
      technicianIds: arrayRemove(...Array.from(ids)),
      updatedAt: nowIso(),
    });
  },
};
