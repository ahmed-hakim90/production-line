import type { InventoryRoutingSettings, PlanSettings } from '../../../types';
import type { Warehouse, WarehouseRole } from '../types';

/**
 * Factory-recommended inventory routing policy (booleans only).
 * Warehouse IDs stay tenant-specific unless role-mapping fills empty slots.
 *
 * Flow: صرف إنتاج → تقرير → اعتماد إدخال → تم الإنتاج → تغليف → منتج تام
 */
export const RECOMMENDED_INVENTORY_ROUTING_POLICY: Pick<
  InventoryRoutingSettings,
  | 'autoTransferProductionToFinished'
  | 'autoTransferFinishedToFinal'
  | 'requireApprovalForProductionEntry'
  | 'requireApprovalForAutoTransfers'
  | 'autoConsumeBomOnProductionReport'
  | 'requireIssuedProductionIssueOnReport'
> = {
  autoTransferProductionToFinished: true,
  autoTransferFinishedToFinal: false,
  requireApprovalForProductionEntry: true,
  requireApprovalForAutoTransfers: false,
  autoConsumeBomOnProductionReport: false,
  requireIssuedProductionIssueOnReport: true,
};

/** Empty routing shell with recommended policy defaults (warehouse ids blank). */
export function createEmptyInventoryRouting(): InventoryRoutingSettings {
  return {
    rawMaterialWarehouseId: '',
    decomposedWarehouseId: '',
    productionWipWarehouseId: '',
    finishedStagingWarehouseId: '',
    finalProductWarehouseId: '',
    packagingSourceWarehouseId: '',
    packagingTargetWarehouseId: '',
    wasteWarehouseId: '',
    ...RECOMMENDED_INVENTORY_ROUTING_POLICY,
  };
}

const trimId = (value: unknown) => String(value ?? '').trim();

function pickWarehouseIdByRole(
  warehouses: Array<Pick<Warehouse, 'id' | 'name' | 'isActive' | 'warehouseRole'>>,
  role: WarehouseRole,
  excludeIds: Set<string> = new Set(),
): string {
  const matches = warehouses
    .filter((w) => w.isActive !== false)
    .filter((w) => (w.warehouseRole || 'general') === role)
    .filter((w) => {
      const id = trimId(w.id);
      return Boolean(id) && !excludeIds.has(id);
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));

  return trimId(matches[0]?.id);
}

function fillOrKeep(current: unknown, next: string, overwrite: boolean): string {
  const cur = trimId(current);
  if (overwrite) return next || cur;
  return cur || next;
}

export type MapRoutingFromWarehouseRolesOptions = {
  /** When true, replace existing routing IDs with role matches. Default: fill empty only. */
  overwrite?: boolean;
};

/**
 * Map routing slots from warehouses by `warehouseRole`.
 * Names stay whatever the user set — only IDs are linked to operational slots.
 */
export function mapRoutingWarehouseIdsFromRoles(
  plan: PlanSettings,
  warehouses: Array<Pick<Warehouse, 'id' | 'name' | 'isActive' | 'warehouseRole'>>,
  options: MapRoutingFromWarehouseRolesOptions = {},
): PlanSettings {
  const overwrite = options.overwrite === true;
  const prev = plan.inventoryRouting ?? {};
  const used = new Set<string>();

  const take = (role: WarehouseRole): string => {
    const id = pickWarehouseIdByRole(warehouses, role, used);
    if (id) used.add(id);
    return id;
  };

  const raw = fillOrKeep(prev.rawMaterialWarehouseId ?? plan.rawMaterialWarehouseId, take('raw_material'), overwrite);
  const decomposed = fillOrKeep(
    prev.decomposedWarehouseId ?? plan.decomposedSourceWarehouseId,
    take('decomposed'),
    overwrite,
  );
  const wip = fillOrKeep(
    prev.productionWipWarehouseId ?? plan.defaultProductionWarehouseId,
    take('production_wip'),
    overwrite,
  );
  const staging = fillOrKeep(
    prev.finishedStagingWarehouseId ?? plan.finishedReceiveWarehouseId,
    take('finished_staging'),
    overwrite,
  );
  const finalWh = fillOrKeep(
    prev.finalProductWarehouseId ?? plan.finalProductWarehouseId,
    take('final_product'),
    overwrite,
  );
  const waste = fillOrKeep(
    prev.wasteWarehouseId ?? plan.wasteReceiveWarehouseId,
    take('waste'),
    overwrite,
  );

  // Packaging prefers dedicated packaging-role warehouses; else staging → final.
  const packagingRoleId = take('packaging');
  const packagingSource = fillOrKeep(
    prev.packagingSourceWarehouseId ?? plan.packagingSourceWarehouseId,
    packagingRoleId || staging || wip,
    overwrite,
  );
  const packagingTarget = fillOrKeep(
    prev.packagingTargetWarehouseId ?? plan.packagingTargetWarehouseId,
    (packagingRoleId && packagingRoleId !== packagingSource ? packagingRoleId : '') || finalWh || staging,
    overwrite,
  );

  return {
    ...plan,
    inventoryRouting: {
      ...createEmptyInventoryRouting(),
      ...prev,
      rawMaterialWarehouseId: raw,
      decomposedWarehouseId: decomposed,
      productionWipWarehouseId: wip || staging,
      finishedStagingWarehouseId: staging || wip,
      finalProductWarehouseId: finalWh,
      wasteWarehouseId: waste,
      packagingSourceWarehouseId: packagingSource,
      packagingTargetWarehouseId: packagingTarget,
    },
  };
}

/**
 * Apply factory policy flags and optionally map empty routing slots from warehouse roles.
 * Never renames warehouses — only links IDs / toggles policy.
 */
export function applyRecommendedInventoryRoutingPolicy(
  plan: PlanSettings,
  warehouses?: Array<Pick<Warehouse, 'id' | 'name' | 'isActive' | 'warehouseRole'>>,
): PlanSettings {
  const withPolicy = (() => {
    const prev = plan.inventoryRouting ?? {};
    const staging = trimId(prev.finishedStagingWarehouseId || plan.finishedReceiveWarehouseId);
    const finalWh = trimId(prev.finalProductWarehouseId || plan.finalProductWarehouseId);

    return {
      ...plan,
      requireFinishedStockApprovalForReports: true,
      inventoryRouting: {
        ...createEmptyInventoryRouting(),
        ...prev,
        ...RECOMMENDED_INVENTORY_ROUTING_POLICY,
        packagingSourceWarehouseId: trimId(prev.packagingSourceWarehouseId) || staging,
        packagingTargetWarehouseId: trimId(prev.packagingTargetWarehouseId) || finalWh,
      },
    };
  })();

  if (!warehouses?.length) return withPolicy;
  return mapRoutingWarehouseIdsFromRoles(withPolicy, warehouses, { overwrite: false });
}
