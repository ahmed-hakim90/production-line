/**
 * Pure inventory routing resolver for Cloud Functions (mirrors client V2 defaults).
 * Do not import client modules here.
 */
const trimId = (value) => String(value ?? '').trim();
export function resolveInventoryRoutingFromSettings(settings) {
    const plan = (settings.planSettings || {});
    const nested = (plan.inventoryRouting || {});
    const legacyWip = trimId(plan.defaultProductionWarehouseId);
    const legacyStaging = trimId(plan.finishedReceiveWarehouseId);
    const legacyDecomposed = trimId(plan.decomposedSourceWarehouseId);
    const legacyRaw = trimId(plan.rawMaterialWarehouseId);
    const legacyWaste = trimId(plan.wasteReceiveWarehouseId);
    const legacyFinal = trimId(plan.finalProductWarehouseId);
    const legacyPkgSrc = trimId(plan.packagingSourceWarehouseId);
    const legacyPkgTgt = trimId(plan.packagingTargetWarehouseId);
    const productionWip = trimId(nested.productionWipWarehouseId) || legacyWip;
    const finishedStaging = trimId(nested.finishedStagingWarehouseId) || legacyStaging || legacyWip;
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
