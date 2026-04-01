import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  getDocs,
  orderBy,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, deleteRepairBranchCascadeCallable, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { REPAIR_BRANCHES_COLLECTION } from '../collections';
import type { RepairBranch } from '../types';
import { warehouseService } from '../../inventory/services/warehouseService';

const nowIso = () => new Date().toISOString();
const WAREHOUSE_CODE_PREFIX = 'RWH-';

const resolveNextWarehouseCode = async (): Promise<string> => {
  const warehouses = await warehouseService.getAll();
  const maxSerial = warehouses.reduce((max, warehouse) => {
    const code = String(warehouse.code || '').trim().toUpperCase();
    const match = code.match(/^RWH-(\d{3})$/);
    if (!match) return max;
    const value = Number(match[1] || 0);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return `${WAREHOUSE_CODE_PREFIX}${String(maxSerial + 1).padStart(3, '0')}`;
};

export const repairBranchService = {
  async list(): Promise<RepairBranch[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, REPAIR_BRANCHES_COLLECTION, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairBranch));
  },

  async create(input: Omit<RepairBranch, 'id' | 'createdAt' | 'tenantId'>): Promise<string | null> {
    if (!isConfigured) return null;
    const warehouseCode = await resolveNextWarehouseCode();
    const warehouseId = await warehouseService.create({
      name: `مخزن صيانة - ${input.name}`,
      code: warehouseCode,
      isActive: true,
    });
    if (!warehouseId) throw new Error('تعذر إنشاء مخزن تلقائي للفرع.');

    const ref = await addDoc(collection(db, REPAIR_BRANCHES_COLLECTION), {
      ...input,
      warehouseId,
      warehouseCode,
      tenantId: getCurrentTenantId(),
      createdAt: nowIso(),
    });
    return ref.id;
  },

  async update(id: string, patch: Partial<Omit<RepairBranch, 'id' | 'tenantId'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, id), patch as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured) return;
    throw new Error('استخدم removeCascade لحذف الفرع مع جميع البيانات المرتبطة.');
  },

  async removeCascade(id: string): Promise<{ deletedFirestoreDocs: number; deletedCounts: Record<string, number> }> {
    if (!isConfigured) return { deletedFirestoreDocs: 0, deletedCounts: {} };
    const result = await deleteRepairBranchCascadeCallable(id);
    return {
      deletedFirestoreDocs: Number(result.deletedFirestoreDocs || 0),
      deletedCounts: result.deletedCounts || {},
    };
  },

  async assignTechnicianToBranch(branchId: string, technicianId: string): Promise<void> {
    if (!isConfigured || !branchId || !technicianId) return;
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId), {
      technicianIds: arrayUnion(technicianId),
    });
  },

  async removeTechnicianFromBranch(branchId: string, technicianId: string): Promise<void> {
    if (!isConfigured || !branchId || !technicianId) return;
    await updateDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId), {
      technicianIds: arrayRemove(technicianId),
    });
  },
};
