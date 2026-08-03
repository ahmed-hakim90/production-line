import assert from 'node:assert/strict';
import {
  applyRecommendedInventoryRoutingPolicy,
  mapRoutingWarehouseIdsFromRoles,
  RECOMMENDED_INVENTORY_ROUTING_POLICY,
} from '../modules/inventory/lib/recommendedInventoryRouting.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';

function testApplyRecommendedPreservesWarehouses() {
  const applied = applyRecommendedInventoryRoutingPolicy({
    ...DEFAULT_PLAN_SETTINGS,
    requireFinishedStockApprovalForReports: false,
    inventoryRouting: {
      productionWipWarehouseId: 'wip-1',
      finishedStagingWarehouseId: 'stage-1',
      finalProductWarehouseId: 'final-1',
      autoTransferProductionToFinished: false,
      requireApprovalForProductionEntry: false,
      requireApprovalForAutoTransfers: true,
      autoConsumeBomOnProductionReport: true,
      requireIssuedProductionIssueOnReport: false,
    },
  });

  assert.equal(applied.requireFinishedStockApprovalForReports, false);
  assert.equal(applied.inventoryRouting?.productionWipWarehouseId, 'wip-1');
  assert.equal(applied.inventoryRouting?.finishedStagingWarehouseId, 'stage-1');
  assert.equal(applied.inventoryRouting?.finalProductWarehouseId, 'final-1');
  assert.equal(applied.inventoryRouting?.packagingSourceWarehouseId, 'stage-1');
  assert.equal(applied.inventoryRouting?.packagingTargetWarehouseId, 'final-1');
  assert.equal(
    applied.inventoryRouting?.autoTransferProductionToFinished,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.autoTransferProductionToFinished,
  );
  assert.equal(
    applied.inventoryRouting?.requireApprovalForProductionEntry,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.requireApprovalForProductionEntry,
  );
  assert.equal(
    applied.inventoryRouting?.requirePackagingHandoverReceipt,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.requirePackagingHandoverReceipt,
  );
  assert.equal(
    applied.inventoryRouting?.requireIssuedProductionIssueOnReport,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.requireIssuedProductionIssueOnReport,
  );
  assert.equal(
    applied.inventoryRouting?.autoConsumeBomOnProductionReport,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.autoConsumeBomOnProductionReport,
  );
  assert.equal(
    applied.inventoryRouting?.requireApprovalForAutoTransfers,
    RECOMMENDED_INVENTORY_ROUTING_POLICY.requireApprovalForAutoTransfers,
  );
}

function testMapRoutingFromCustomNamedWarehouses() {
  const mapped = mapRoutingWarehouseIdsFromRoles(
    {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {},
    },
    [
      { id: 'a1', name: 'خامات المغربي', warehouseRole: 'raw_material', isActive: true },
      { id: 'b1', name: 'مستلزم الخط', warehouseRole: 'decomposed', isActive: true },
      { id: 'floor1', name: 'صالة التجميع', warehouseRole: 'production_floor', isActive: true },
      { id: 'c1', name: 'تشغيل داخلي', warehouseRole: 'production_wip', isActive: true },
      { id: 'd1', name: 'بانتظار التغليف', warehouseRole: 'finished_staging', isActive: true },
      { id: 'e1', name: 'الجاهز للبيع', warehouseRole: 'final_product', isActive: true },
      { id: 'f1', name: 'هالك الخط', warehouseRole: 'waste', isActive: true },
    ],
  );

  assert.equal(mapped.inventoryRouting?.rawMaterialWarehouseId, 'a1');
  assert.equal(mapped.inventoryRouting?.decomposedWarehouseId, 'b1');
  assert.equal(mapped.inventoryRouting?.productionFloorWarehouseId, 'floor1');
  assert.equal(mapped.inventoryRouting?.productionWipWarehouseId, 'c1');
  assert.equal(mapped.inventoryRouting?.finishedStagingWarehouseId, 'd1');
  assert.equal(mapped.inventoryRouting?.finalProductWarehouseId, 'e1');
  assert.equal(mapped.inventoryRouting?.wasteWarehouseId, 'f1');
  assert.equal(mapped.inventoryRouting?.packagingSourceWarehouseId, 'd1');
  assert.equal(mapped.inventoryRouting?.packagingTargetWarehouseId, 'e1');
}

function testMapDoesNotOverwriteExistingUnlessAsked() {
  const keep = mapRoutingWarehouseIdsFromRoles(
    {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        productionWipWarehouseId: 'keep-wip',
        finishedStagingWarehouseId: 'keep-stage',
      },
    },
    [
      { id: 'c1', name: 'تشغيل داخلي', warehouseRole: 'production_wip', isActive: true },
      { id: 'd1', name: 'بانتظار التغليف', warehouseRole: 'finished_staging', isActive: true },
      { id: 'e1', name: 'الجاهز للبيع', warehouseRole: 'final_product', isActive: true },
    ],
    { overwrite: false },
  );
  assert.equal(keep.inventoryRouting?.productionWipWarehouseId, 'keep-wip');
  assert.equal(keep.inventoryRouting?.finishedStagingWarehouseId, 'keep-stage');
  assert.equal(keep.inventoryRouting?.finalProductWarehouseId, 'e1');

  const overwrite = mapRoutingWarehouseIdsFromRoles(
    {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        productionWipWarehouseId: 'keep-wip',
        finishedStagingWarehouseId: 'keep-stage',
      },
    },
    [
      { id: 'c1', name: 'تشغيل داخلي', warehouseRole: 'production_wip', isActive: true },
      { id: 'd1', name: 'بانتظار التغليف', warehouseRole: 'finished_staging', isActive: true },
    ],
    { overwrite: true },
  );
  assert.equal(overwrite.inventoryRouting?.productionWipWarehouseId, 'c1');
  assert.equal(overwrite.inventoryRouting?.finishedStagingWarehouseId, 'd1');
}

function testApplyRecommendedFillsEmptyFromRoles() {
  const applied = applyRecommendedInventoryRoutingPolicy(
    {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        productionWipWarehouseId: '',
        finishedStagingWarehouseId: '',
      },
    },
    [
      { id: 'c1', name: 'تشغيل داخلي', warehouseRole: 'production_wip', isActive: true },
      { id: 'd1', name: 'بانتظار التغليف', warehouseRole: 'finished_staging', isActive: true },
    ],
  );
  assert.equal(applied.inventoryRouting?.productionWipWarehouseId, 'c1');
  assert.equal(applied.inventoryRouting?.finishedStagingWarehouseId, 'd1');
  assert.equal(applied.inventoryRouting?.requireApprovalForProductionEntry, false);
  assert.equal(applied.inventoryRouting?.requirePackagingHandoverReceipt, true);
}

testApplyRecommendedPreservesWarehouses();
testMapRoutingFromCustomNamedWarehouses();
testMapDoesNotOverwriteExistingUnlessAsked();
testApplyRecommendedFillsEmptyFromRoles();
console.log('recommended-inventory-routing tests passed');
