/**
 * Pure inventory routing resolver for Cloud Functions (mirrors client V2 defaults).
 * Do not import client modules here.
 */

export type ResolvedInventoryRouting = {
  rawMaterialWarehouseId: string;
  decomposedWarehouseId: string;
  productionFloorWarehouseId: string;
  productionWipWarehouseId: string;
  finishedStagingWarehouseId: string;
  finalProductWarehouseId: string;
  packagingSourceWarehouseId: string;
  packagingTargetWarehouseId: string;
  wasteWarehouseId: string;
  autoTransferProductionToFinished: boolean;
  autoTransferFinishedToFinal: boolean;
  requireApprovalForProductionEntry: boolean;
  requireApprovalForAutoTransfers: boolean;
  requirePackagingHandoverReceipt: boolean;
  autoConsumeBomOnProductionReport: boolean;
  requireIssuedProductionIssueOnReport: boolean;
  allowNegativeDecomposedStock: boolean;
  allowNegativeFinishedTransferStock: boolean;
  enablePackagingStockTransfer: boolean;
};

const trimId = (value: unknown) => String(value ?? '').trim();

export function resolveInventoryRoutingFromSettings(settings: {
  planSettings?: Record<string, unknown> | null;
}): ResolvedInventoryRouting {
  const plan = (settings.planSettings || {}) as Record<string, unknown>;
  const nested = (plan.inventoryRouting || {}) as Record<string, unknown>;

  const legacyWip = trimId(plan.defaultProductionWarehouseId);
  const legacyStaging = trimId(plan.finishedReceiveWarehouseId);
  const legacyDecomposed = trimId(plan.decomposedSourceWarehouseId);
  const legacyRaw = trimId(plan.rawMaterialWarehouseId);
  const legacyWaste = trimId(plan.wasteReceiveWarehouseId);
  const legacyFinal = trimId(plan.finalProductWarehouseId);
  const legacyPkgSrc = trimId(plan.packagingSourceWarehouseId);
  const legacyPkgTgt = trimId(plan.packagingTargetWarehouseId);

  const productionWip =
    trimId(nested.productionWipWarehouseId) || legacyWip;
  const finishedStaging =
    trimId(nested.finishedStagingWarehouseId) || legacyStaging || legacyWip;

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
    requireApprovalForAutoTransfers: Boolean(nested.requireApprovalForAutoTransfers),
    requirePackagingHandoverReceipt: nested.requirePackagingHandoverReceipt !== false,
    autoConsumeBomOnProductionReport: Boolean(nested.autoConsumeBomOnProductionReport),
    requireIssuedProductionIssueOnReport: nested.requireIssuedProductionIssueOnReport !== false,
    allowNegativeDecomposedStock: Boolean(plan.allowNegativeDecomposedStock),
    allowNegativeFinishedTransferStock: Boolean(plan.allowNegativeFinishedTransferStock),
    enablePackagingStockTransfer: Boolean(plan.enablePackagingStockTransfer),
  };
}
