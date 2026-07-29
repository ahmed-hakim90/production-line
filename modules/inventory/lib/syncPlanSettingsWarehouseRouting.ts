import type { InventoryRoutingSettings, PlanSettings } from '../../../types';
import { createEmptyInventoryRouting } from './recommendedInventoryRouting';

const trimId = (value: unknown) => String(value ?? '').trim();

/**
 * Keep nested inventoryRouting and legacy planSettings warehouse fields in sync
 * so screens that read either path see the same saved values after save.
 *
 * When `inventoryRouting` is present, nested warehouse IDs are authoritative
 * (including empty clears). When absent, values are seeded from legacy fields.
 *
 * Also keeps `requireFinishedStockApprovalForReports` aligned with
 * `inventoryRouting.requireApprovalForProductionEntry`.
 */
export function syncPlanSettingsWarehouseRouting(plan: PlanSettings): PlanSettings {
  const hasNested = plan.inventoryRouting != null;
  const nested = { ...createEmptyInventoryRouting(), ...(plan.inventoryRouting ?? {}) };

  const pick = (nestedVal: unknown, legacyVal: unknown) => (
    hasNested ? trimId(nestedVal) : (trimId(nestedVal) || trimId(legacyVal))
  );

  const raw = pick(nested.rawMaterialWarehouseId, plan.rawMaterialWarehouseId);
  const decomposed = pick(nested.decomposedWarehouseId, plan.decomposedSourceWarehouseId);
  const wip = pick(nested.productionWipWarehouseId, plan.defaultProductionWarehouseId);
  const stagingRaw = pick(nested.finishedStagingWarehouseId, plan.finishedReceiveWarehouseId);
  const staging = stagingRaw || wip;
  const finalWh = pick(nested.finalProductWarehouseId, plan.finalProductWarehouseId);
  const waste = pick(nested.wasteWarehouseId, plan.wasteReceiveWarehouseId);
  const pkgSrc = pick(nested.packagingSourceWarehouseId, plan.packagingSourceWarehouseId);
  const pkgTgt = pick(nested.packagingTargetWarehouseId, plan.packagingTargetWarehouseId);

  const requireApprovalForProductionEntry = nested.requireApprovalForProductionEntry !== false;

  const inventoryRouting: InventoryRoutingSettings = {
    ...nested,
    rawMaterialWarehouseId: raw,
    decomposedWarehouseId: decomposed,
    productionWipWarehouseId: wip || staging,
    finishedStagingWarehouseId: staging || wip,
    finalProductWarehouseId: finalWh,
    packagingSourceWarehouseId: pkgSrc,
    packagingTargetWarehouseId: pkgTgt,
    wasteWarehouseId: waste,
    autoTransferProductionToFinished: nested.autoTransferProductionToFinished !== false,
    autoTransferFinishedToFinal: Boolean(nested.autoTransferFinishedToFinal),
    requireApprovalForProductionEntry,
    requireApprovalForAutoTransfers: nested.requireApprovalForAutoTransfers === true,
    autoConsumeBomOnProductionReport: Boolean(nested.autoConsumeBomOnProductionReport),
    requireIssuedProductionIssueOnReport: nested.requireIssuedProductionIssueOnReport !== false,
  };

  return {
    ...plan,
    inventoryRouting,
    requireFinishedStockApprovalForReports: requireApprovalForProductionEntry,
    rawMaterialWarehouseId: raw,
    decomposedSourceWarehouseId: decomposed,
    defaultProductionWarehouseId: inventoryRouting.productionWipWarehouseId,
    finishedReceiveWarehouseId: inventoryRouting.finishedStagingWarehouseId,
    finalProductWarehouseId: finalWh,
    wasteReceiveWarehouseId: waste,
    packagingSourceWarehouseId: pkgSrc,
    packagingTargetWarehouseId: pkgTgt,
  };
}
