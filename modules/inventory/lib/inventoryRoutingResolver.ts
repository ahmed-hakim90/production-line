import type { SystemSettings } from '../../../types';
import type { Material } from '../../manufacturing/types';
import type { InventoryRoutingSettings, ResolvedInventoryRouting } from '../types';

const trimId = (value: unknown) => String(value ?? '').trim();

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
    productionWipWarehouseId: productionWip || finishedStaging,
    finishedStagingWarehouseId: finishedStaging || productionWip,
    finalProductWarehouseId: trimId(nested.finalProductWarehouseId) || legacyFinal,
    packagingSourceWarehouseId: trimId(nested.packagingSourceWarehouseId) || legacyPkgSrc,
    packagingTargetWarehouseId: trimId(nested.packagingTargetWarehouseId) || legacyPkgTgt,
    wasteWarehouseId: trimId(nested.wasteWarehouseId) || legacyWaste,
    autoTransferProductionToFinished: Boolean(nested.autoTransferProductionToFinished),
    autoTransferFinishedToFinal: Boolean(nested.autoTransferFinishedToFinal),
    requireApprovalForProductionEntry:
      nested.requireApprovalForProductionEntry !== undefined
        ? Boolean(nested.requireApprovalForProductionEntry)
        : plan?.requireFinishedStockApprovalForReports !== false,
    requireApprovalForAutoTransfers:
      nested.requireApprovalForAutoTransfers !== undefined
        ? Boolean(nested.requireApprovalForAutoTransfers)
        : true,
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
  | 'waste'
  | 'packagingSource'
  | 'packagingTarget';

const REQUIREMENT_KEYS: Record<RoutingRequirement, keyof ResolvedInventoryRouting> = {
  wip: 'productionWipWarehouseId',
  staging: 'finishedStagingWarehouseId',
  final: 'finalProductWarehouseId',
  raw: 'rawMaterialWarehouseId',
  decomposed: 'decomposedWarehouseId',
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
    wip: 'مخزن إنتاج تحت التشغيل',
    staging: 'مخزن تم الصنع',
    final: 'مخزن المنتج التام',
    raw: 'مخزن المواد الخام',
    decomposed: 'مخزن المفكك',
    waste: 'مخزن الهالك',
    packagingSource: 'مخزن التغليف (مصدر)',
    packagingTarget: 'مخزن التغليف (هدف)',
  };
  throw new Error(`حدد ${missing.map((m) => labels[m]).join(' و ')} من إعدادات توجيه المخزون.`);
}

export function pickConsumptionWarehouse(
  material: Pick<Material, 'type'> | null | undefined,
  routing: ResolvedInventoryRouting,
): string {
  const type = material?.type ?? 'raw_material';
  if (type === 'packaging') {
    return routing.packagingSourceWarehouseId || routing.decomposedWarehouseId;
  }
  if (type === 'semi_finished' || type === 'consumable') {
    return routing.decomposedWarehouseId || routing.rawMaterialWarehouseId;
  }
  return routing.rawMaterialWarehouseId || routing.decomposedWarehouseId;
}

export function buildInventoryRoutingFromLegacy(plan: import('../../../types').PlanSettings): InventoryRoutingSettings {
  const legacyWip = trimId(plan.defaultProductionWarehouseId);
  const legacyStaging = trimId(plan.finishedReceiveWarehouseId);
  return {
    rawMaterialWarehouseId: trimId(plan.rawMaterialWarehouseId),
    decomposedWarehouseId: trimId(plan.decomposedSourceWarehouseId),
    productionWipWarehouseId: legacyWip || legacyStaging,
    finishedStagingWarehouseId: legacyStaging || legacyWip,
    finalProductWarehouseId: trimId(plan.finalProductWarehouseId),
    packagingSourceWarehouseId: trimId(plan.packagingSourceWarehouseId),
    packagingTargetWarehouseId: trimId(plan.packagingTargetWarehouseId),
    wasteWarehouseId: trimId(plan.wasteReceiveWarehouseId),
    autoTransferProductionToFinished: false,
    autoTransferFinishedToFinal: false,
    requireApprovalForProductionEntry: plan.requireFinishedStockApprovalForReports !== false,
    requireApprovalForAutoTransfers: true,
  };
}
