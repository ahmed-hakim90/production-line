import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, updateDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { PlanSettings, SystemSettings } from '../../../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import type { Warehouse } from '../types';
import { stockService } from './stockService';

const COLLECTION = 'warehouses';

async function clearPlanSettingsWarehouseRefs(warehouseId: string): Promise<void> {
  const settings = await systemSettingsService.get();
  if (!settings?.planSettings) return;
  const keys: (keyof PlanSettings)[] = [
    'defaultProductionWarehouseId',
    'rawMaterialWarehouseId',
    'decomposedSourceWarehouseId',
    'finishedReceiveWarehouseId',
    'wasteReceiveWarehouseId',
    'finalProductWarehouseId',
  ];
  let changed = false;
  const next: PlanSettings = { ...settings.planSettings };
  for (const k of keys) {
    const v = next[k];
    if (v !== undefined && String(v) === warehouseId) {
      (next as Record<string, unknown>)[k as string] = '';
      changed = true;
    }
  }
  if (changed) {
    const merged: SystemSettings = { ...settings, planSettings: next };
    await systemSettingsService.set(merged);
  }
}

export const warehouseService = {
  async getAll(): Promise<Warehouse[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, COLLECTION, orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Warehouse));
  },

  async create(payload: Omit<Warehouse, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      tenantId: getCurrentTenantId(),
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<Warehouse>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...data } = payload as Warehouse;
    await updateDoc(doc(db, COLLECTION, id), data as any);
  },

  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isConfigured || !id) return { ok: false, error: 'معرّف غير صالح' };
    try {
      await stockService.deleteAllDataForWarehouse(id);
      await clearPlanSettingsWarehouseRefs(id);
      await deleteDoc(doc(db, COLLECTION, id));
      return { ok: true };
    } catch (error) {
      console.error('warehouseService.delete', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'تعذر حذف المخزن.',
      };
    }
  },
};
