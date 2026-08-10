import type { SystemSettings } from '../../../types';
import type { Material } from '../../manufacturing/types';
import type {
  InventoryRoutingSettings,
  ResolvedInventoryRouting,
  WarehouseRole,
} from '../types';

const trimId = (value: unknown) => String(value ?? '').trim();

/**
 * Prefer routing slot over the warehouse document `warehouseRole` field.
 * Many tenants assign staging/WIP IDs in settings without updating warehouseRole,
 * so list filters that only trust the document field hide real balances.
 */
export function resolveWarehouseRoleFromRouting(
  warehouseId: string,
  routing: Pick<
    ResolvedInventoryRouting,
    | 'rawMaterialWarehouseId'
    | 'decomposedWarehouseId'
    | 'productionFloorWarehouseId'
    | 'productionWipWarehouseId'
    | 'finishedStagingWarehouseId'
    | 'finalProductWarehouseId'
    | 'packagingSourceWarehouseId'
    | 'packagingTargetWarehouseId'
    | 'wasteWarehouseId'
  >,
  documentRole?: WarehouseRole | string | null,
): WarehouseRole {
  const id = trimId(warehouseId);
  if (!id) return (documentRole as WarehouseRole) || 'general';
  if (id === trimId(routing.rawMaterialWarehouseId)) return 'raw_material';
  if (id === trimId(routing.decomposedWarehouseId)) return 'decomposed';
  if (id === trimId(routing.productionFloorWarehouseId)) return 'production_floor';
  if (id === trimId(routing.productionWipWarehouseId)) return 'production_wip';
  if (id === trimId(routing.finishedStagingWarehouseId)) return 'finished_staging';
  if (id === trimId(routing.finalProductWarehouseId)) return 'final_product';
  if (
    id === trimId(routing.packagingSourceWarehouseId)
    || id === trimId(routing.packagingTargetWarehouseId)
  ) {
    return 'packaging';
  }
  if (id === trimId(routing.wasteWarehouseId)) return 'waste';
  return (documentRole as WarehouseRole) || 'general';
}

export function resolveInventoryRoutingV1(systemSettings: SystemSettings): ResolvedInventoryRouting {
  const plan = systemSettings.planSettings ?? ({} as SystemSettings['planSettings']);
  const nested = plan?.inventoryRouting ?? {};
  const nameFallback = '';

  const legacyWip = trimId(plan?.defaultProductionWarehouseId);
  const legacyStaging = trimId(plan?.finishedReceiveWarehouseId);
  const legacyDecomposed = trimId(plan?.decomposedSourceWarehouseId);
  const legacyRaw = trimId(plan?.rawMaterialWarehouseId);
  const legacyWaste = trimId(plan?.wasteReceiveWarehouseId);
  const legacyFinal = trimId(plan?.finalProductWarehouseId);
  const legacyPkgSrc = trimId(plan?.packagingSourceWarehouseId);
  const legacyPkgTgt = trimId(plan?.packagingTargetWarehouseId);

  const productionWip =
    trimId(nested.productionWipWarehouseId) || legacyWip || nameFallback;
  const finishedStaging =
    trimId(nested.finishedStagingWarehouseId) || legacyStaging || legacyWip || nameFallback;

  return {
    rawMaterialWarehouseId: trimId(nested.rawMaterialWarehouseId) || legacyRaw,
    decomposedWarehouseId: trimId(nested.decomposedWarehouseId) || legacyDecomposed,
    productionFloorWarehouseId: trimId(nested.productionFloorWarehouseId),
    productionWipWarehouseId: productionWip || finishedStaging,
    finishedStagingWarehouseId: finishedStaging || productionWip,
    finalProductWarehouseId: trimId(nested.finalProductWarehouseId) || legacyFinal,
    packagingSourceWarehouseId: trimId(nested.packagingSourceWarehouseId) || legacyPkgSrc,
    packagingTargetWarehouseId: trimId(nested.packagingTargetWarehouseId) || legacyPkgTgt,
    wasteWarehouseId: trimId(nested.wasteWarehouseId) || legacyWaste,
    autoTransferProductionToFinished: Boolean(nested.autoTransferProductionToFinished),
    autoTransferFinishedToFinal: Boolean(nested.autoTransferFinishedToFinal),
    requireApprovalForProductionEntry: Boolean(nested.requireApprovalForProductionEntry),
    requireApprovalForAutoTransfers:
      nested.requireApprovalForAutoTransfers !== undefined
        ? Boolean(nested.requireApprovalForAutoTransfers)
        : false,
    // On by default for V2: packaging supervisor must confirm actual received qty.
    requirePackagingHandoverReceipt: nested.requirePackagingHandoverReceipt !== false,
    // Off by default — تقرير الإنتاج لا يخصم BOM من المفكك مباشرة؛ الصرف إلى الصالة أولاً.
    autoConsumeBomOnProductionReport: Boolean(nested.autoConsumeBomOnProductionReport),
    // On by default — لا يُنشأ/يُرحَّل تقرير منتج تام إلا بعد صرف إنتاج معتمد.
    requireIssuedProductionIssueOnReport: nested.requireIssuedProductionIssueOnReport !== false,
    allowNegativeDecomposedStock: Boolean(plan?.allowNegativeDecomposedStock),
    allowNegativeFinishedTransferStock: Boolean(plan?.allowNegativeFinishedTransferStock),
    enablePackagingStockTransfer: Boolean(plan?.enablePackagingStockTransfer),
  };
}

export type RoutingRequirement =
  | 'wip'
  | 'staging'
  | 'final'
  | 'raw'
  | 'decomposed'
  | 'floor'
  | 'waste'
  | 'packagingSource'
  | 'packagingTarget';

const REQUIREMENT_KEYS: Record<RoutingRequirement, keyof ResolvedInventoryRouting> = {
  wip: 'productionWipWarehouseId',
  staging: 'finishedStagingWarehouseId',
  final: 'finalProductWarehouseId',
  raw: 'rawMaterialWarehouseId',
  decomposed: 'decomposedWarehouseId',
  floor: 'productionFloorWarehouseId',
  waste: 'wasteWarehouseId',
  packagingSource: 'packagingSourceWarehouseId',
  packagingTarget: 'packagingTargetWarehouseId',
};

export function assertRoutingConfigured(
  routing: ResolvedInventoryRouting,
  required: RoutingRequirement[],
): void {
  const missing = required.filter((key) => !trimId(routing[REQUIREMENT_KEYS[key]]));
  if (missing.length === 0) return;
  const labels: Record<RoutingRequirement, string> = {
    wip: 'مخزن تم الإنتاج — تحت التسليم',
    staging: 'مخزن بانتظار التغليف',
    final: 'مخزن المنتج التام',
    raw: 'مخزن المواد الخام',
    decomposed: 'مخزن المفكك (مستلزم إنتاج)',
    floor: 'مخزن صالة الإنتاج',
    waste: 'مخزن الهالك',
    packagingSource: 'مخزن التغليف (مصدر)',
    packagingTarget: 'مخزن التغليف (هدف)',
  };
  throw new Error(`حدد ${missing.map((m) => labels[m]).join(' و ')} من إعدادات توجيه المخزون.`);
}

/**
 * Warehouse for BOM component consumption on production.
 * V2: production floor holds issued components; decomposed is only the issue source.
 * Packaging materials keep their dedicated source when configured.
 */
export function pickConsumptionWarehouse(
  material: Pick<Material, 'type'> | null | undefined,
  routing: ResolvedInventoryRouting,
): string {
  const type = material?.type ?? 'raw_material';
  if (type === 'packaging') {
    return (
      routing.packagingSourceWarehouseId
      || routing.productionFloorWarehouseId
      || routing.decomposedWarehouseId
      || routing.rawMaterialWarehouseId
    );
  }
  return (
    routing.productionFloorWarehouseId
    || routing.decomposedWarehouseId
    || routing.rawMaterialWarehouseId
  );
}

/** Distinct warehouse IDs that must not collide for V2 production flow. */
export function assertDistinctProductionRoutingWarehouses(
  routing: Pick<
    ResolvedInventoryRouting,
    | 'decomposedWarehouseId'
    | 'productionFloorWarehouseId'
    | 'productionWipWarehouseId'
    | 'finishedStagingWarehouseId'
  >,
): void {
  const pairs: Array<[string, string, string, string]> = [
    ['decomposedWarehouseId', 'productionFloorWarehouseId', 'المفكك', 'صالة الإنتاج'],
    ['productionFloorWarehouseId', 'productionWipWarehouseId', 'صالة الإنتاج', 'تحت التسليم'],
    ['productionWipWarehouseId', 'finishedStagingWarehouseId', 'تحت التسليم', 'بانتظار التغليف'],
  ];
  for (const [aKey, bKey, aLabel, bLabel] of pairs) {
    const a = trimId((routing as Record<string, string>)[aKey]);
    const b = trimId((routing as Record<string, string>)[bKey]);
    if (a && b && a === b) {
      throw new Error(`مخزن «${aLabel}» يجب أن يختلف عن مخزن «${bLabel}».`);
    }
  }
}

export function buildInventoryRoutingFromLegacy(plan: import('../../../types').PlanSettings): InventoryRoutingSettings {
  const legacyWip = trimId(plan.defaultProductionWarehouseId);
  const legacyStaging = trimId(plan.finishedReceiveWarehouseId);
  return {
    rawMaterialWarehouseId: trimId(plan.rawMaterialWarehouseId),
    decomposedWarehouseId: trimId(plan.decomposedSourceWarehouseId),
    productionFloorWarehouseId: '',
    productionWipWarehouseId: legacyWip || legacyStaging,
    finishedStagingWarehouseId: legacyStaging || legacyWip,
    finalProductWarehouseId: trimId(plan.finalProductWarehouseId),
    packagingSourceWarehouseId: trimId(plan.packagingSourceWarehouseId),
    packagingTargetWarehouseId: trimId(plan.packagingTargetWarehouseId),
    wasteWarehouseId: trimId(plan.wasteReceiveWarehouseId),
    autoTransferProductionToFinished: false,
    autoTransferFinishedToFinal: false,
    // V2: packaging handover replaces legacy production-entry approval gate by default.
    requireApprovalForProductionEntry: false,
    requireApprovalForAutoTransfers: false,
    requirePackagingHandoverReceipt: true,
    autoConsumeBomOnProductionReport: false,
    requireIssuedProductionIssueOnReport: true,
  };
}
