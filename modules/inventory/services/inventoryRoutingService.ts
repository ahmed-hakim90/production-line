import type { SystemSettings } from '../../../types';
import { warehouseService } from './warehouseService';
import {
  assertRoutingConfigured,
  pickConsumptionWarehouse,
  resolveInventoryRoutingV1,
} from '../lib/inventoryRoutingResolver';

export {
  assertRoutingConfigured,
  pickConsumptionWarehouse,
  resolveInventoryRoutingV1,
} from '../lib/inventoryRoutingResolver';

let cachedProductionWarehouseId: string | null = null;

async function resolveProductionWarehouseIdByName(): Promise<string> {
  if (cachedProductionWarehouseId) return cachedProductionWarehouseId;
  try {
    const warehouses = await warehouseService.getAllWarehouses();
    const finishedWarehouse = warehouses.find((w) => {
      const name = (w.name || '').trim().toLowerCase();
      return name === 'تم الصنع' || name.includes('تم الصنع');
    });
    if (finishedWarehouse?.id) {
      cachedProductionWarehouseId = finishedWarehouse.id;
      return finishedWarehouse.id;
    }
  } catch {
    // graceful fallback
  }
  return '';
}

export function clearInventoryRoutingCache(): void {
  cachedProductionWarehouseId = null;
}

/** Async resolver with name-based fallback for WIP/staging when IDs empty. */
export async function resolveInventoryRoutingV1Async(
  systemSettings: SystemSettings,
) {
  const base = resolveInventoryRoutingV1(systemSettings);
  if (base.productionWipWarehouseId && base.finishedStagingWarehouseId) {
    return base;
  }
  const nameMatch = await resolveProductionWarehouseIdByName();
  if (!nameMatch) return base;
  return {
    ...base,
    productionWipWarehouseId: base.productionWipWarehouseId || nameMatch,
    finishedStagingWarehouseId: base.finishedStagingWarehouseId || nameMatch,
  };
}
