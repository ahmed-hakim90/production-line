import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { InventoryRoutingSettings, PlanSettings, SystemSettings } from '../../../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import type { Warehouse } from '../types';
import { stockService } from './stockService';

const COLLECTION = 'warehouses';

export const normalizeWarehouseCode = (code: string) => code.trim().toUpperCase();

async function isWarehouseCodeTaken(code: string, excludeDocId?: string): Promise<boolean> {
  const normalized = normalizeWarehouseCode(code);
  if (!normalized) return false;
  const q = tenantQuery(db, COLLECTION, where('code', '==', normalized));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (!excludeDocId) return true;
  return snap.docs.some((d) => d.id !== excludeDocId);
}

const LEGACY_WAREHOUSE_KEYS: (keyof PlanSettings)[] = [
  'defaultProductionWarehouseId',
  'rawMaterialWarehouseId',
  'decomposedSourceWarehouseId',
  'finishedReceiveWarehouseId',
  'wasteReceiveWarehouseId',
  'finalProductWarehouseId',
  'packagingSourceWarehouseId',
  'packagingTargetWarehouseId',
];

const ROUTING_WAREHOUSE_KEYS: (keyof InventoryRoutingSettings)[] = [
  'rawMaterialWarehouseId',
  'decomposedWarehouseId',
  'productionWipWarehouseId',
  'finishedStagingWarehouseId',
  'finalProductWarehouseId',
  'packagingSourceWarehouseId',
  'packagingTargetWarehouseId',
  'wasteWarehouseId',
];

async function clearPlanSettingsWarehouseRefs(warehouseId: string): Promise<void> {
  const settings = await systemSettingsService.get();
  if (!settings?.planSettings) return;
  let changed = false;
  const next: PlanSettings = { ...settings.planSettings };
  for (const k of LEGACY_WAREHOUSE_KEYS) {
    const v = next[k];
    if (v !== undefined && String(v) === warehouseId) {
      (next as unknown as Record<string, unknown>)[k as string] = '';
      changed = true;
    }
  }
  if (next.inventoryRouting) {
    const routing = { ...next.inventoryRouting };
    for (const k of ROUTING_WAREHOUSE_KEYS) {
      if (routing[k] === warehouseId) {
        routing[k] = '';
        changed = true;
      }
    }
    next.inventoryRouting = routing;
  }
  if (changed) {
    const merged: SystemSettings = { ...settings, planSettings: next };
    await systemSettingsService.set(merged);
  }
}

/**
 * Warehouses listing rules:
 * - `getAllWarehouses` / `getWarehousesForReportingFilters`: every warehouse (including inactive).
 *   Use for admin screens, system settings, and filter dropdowns on balances/transactions where
 *   historical rows may still point at inactive warehouses.
 * - `getActiveWarehouses`: warehouses with `isActive !== false` (treats missing flag as active).
 *   Use for new stock movements, transfers, imports, and any flow that must not target inactive sites.
 */
export const warehouseService = {
  /** Full list for this tenant (all warehouses, ordered by `name` ascending in Firestore). */
  async getAllWarehouses(): Promise<Warehouse[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, COLLECTION, orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Warehouse));
  },

  /** @deprecated Prefer `getAllWarehouses` for clarity. */
  async getAll(): Promise<Warehouse[]> {
    return this.getAllWarehouses();
  },

  /** Active warehouses only — use for operational selects (movements, transfers, imports). */
  async getActiveWarehouses(): Promise<Warehouse[]> {
    const all = await this.getAllWarehouses();
    return all.filter((w) => w.isActive !== false);
  },

  /**
   * Same data as `getAllWarehouses`; name expresses intent for balance/transaction filter UIs
   * where inactive warehouses must remain visible.
   */
  async getWarehousesForReportingFilters(): Promise<Warehouse[]> {
    return this.getAllWarehouses();
  },

  async create(payload: Omit<Warehouse, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const code = normalizeWarehouseCode(payload.code);
    if (await isWarehouseCodeTaken(code)) {
      throw new Error('كود المخزن مستخدم بالفعل. اختر كودًا آخر.');
    }
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      code,
      warehouseRole: payload.warehouseRole ?? 'general',
      tenantId: getCurrentTenantId(),
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<Warehouse>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...rest } = payload as Warehouse;
    const data: Record<string, unknown> = { ...rest };
    if (typeof payload.code === 'string') {
      const code = normalizeWarehouseCode(payload.code);
      if (await isWarehouseCodeTaken(code, id)) {
        throw new Error('كود المخزن مستخدم بالفعل. اختر كودًا آخر.');
      }
      data.code = code;
    }
    const pruned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    await updateDoc(doc(db, COLLECTION, id), pruned as any);
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
