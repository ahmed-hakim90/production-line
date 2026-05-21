import { doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { InventoryRoutingSettings, PlanSettings, SystemSettings } from '../../../types';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import type { Warehouse, WarehouseRole } from '../types';
import { buildInventoryRoutingFromLegacy } from '../lib/inventoryRoutingResolver';
import { clearInventoryRoutingCache } from './inventoryRoutingService';

const WAREHOUSES = 'warehouses';

const trimId = (value: unknown) => String(value ?? '').trim();

function roleForWarehouseId(
  warehouseId: string,
  routing: InventoryRoutingSettings,
): WarehouseRole | undefined {
  if (!warehouseId) return undefined;
  if (warehouseId === routing.rawMaterialWarehouseId) return 'raw_material';
  if (warehouseId === routing.decomposedWarehouseId) return 'decomposed';
  if (warehouseId === routing.productionWipWarehouseId) return 'production_wip';
  if (warehouseId === routing.finishedStagingWarehouseId) return 'finished_staging';
  if (warehouseId === routing.finalProductWarehouseId) return 'final_product';
  if (
    warehouseId === routing.packagingSourceWarehouseId
    || warehouseId === routing.packagingTargetWarehouseId
  ) {
    return 'packaging';
  }
  if (warehouseId === routing.wasteWarehouseId) return 'waste';
  return undefined;
}

export type MigrateInventoryRoutingV1Result = {
  warehousesUpdated: number;
  rolesAssigned: number;
  settingsUpdated: boolean;
  alreadyMigrated: boolean;
};

/**
 * Idempotent V1 migration: warehouse roles + nested inventoryRouting from legacy PlanSettings.
 */
export async function migrateInventoryRoutingV1(): Promise<MigrateInventoryRoutingV1Result> {
  if (!isConfigured) {
    return { warehousesUpdated: 0, rolesAssigned: 0, settingsUpdated: false, alreadyMigrated: false };
  }

  const settings = await systemSettingsService.get();
  if (!settings) {
    throw new Error('تعذر تحميل إعدادات النظام.');
  }

  const plan = settings.planSettings ?? ({} as PlanSettings);
  const alreadyMigrated = Boolean(plan.inventoryRoutingMigratedAt?.trim());
  const routing = plan.inventoryRouting?.productionWipWarehouseId
    ? { ...plan.inventoryRouting }
    : buildInventoryRoutingFromLegacy(plan);

  let warehousesUpdated = 0;
  let rolesAssigned = 0;

  const whSnap = await getDocs(tenantQuery(db, WAREHOUSES));
  const batch = writeBatch(db);
  let batchOps = 0;

  for (const whDoc of whSnap.docs) {
    const data = whDoc.data() as Warehouse;
    const patch: Partial<Warehouse> = {};
    if (!data.warehouseRole) {
      patch.warehouseRole = 'general';
      warehousesUpdated += 1;
    }
    const inferredRole = roleForWarehouseId(whDoc.id, routing);
    if (inferredRole && (!data.warehouseRole || data.warehouseRole === 'general')) {
      patch.warehouseRole = inferredRole;
      rolesAssigned += 1;
    }
    if (Object.keys(patch).length > 0) {
      batch.update(doc(db, WAREHOUSES, whDoc.id), patch);
      batchOps += 1;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  const nextPlan: PlanSettings = {
    ...plan,
    inventoryRouting: routing,
    inventoryRoutingMigratedAt: plan.inventoryRoutingMigratedAt ?? new Date().toISOString(),
  };

  const merged: SystemSettings = { ...settings, planSettings: nextPlan };
  await systemSettingsService.set(merged);
  clearInventoryRoutingCache();

  return {
    warehousesUpdated,
    rolesAssigned,
    settingsUpdated: true,
    alreadyMigrated,
  };
}
