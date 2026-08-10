import assert from 'node:assert/strict';
import { WAREHOUSE_ROLE_LABELS, transferRequestTypeLabel } from '../modules/inventory/lib/stockLabels.ts';
import { pickConsumptionWarehouse, assertDistinctProductionRoutingWarehouses, resolveInventoryRoutingV1, resolveWarehouseRoleFromRouting } from '../modules/inventory/lib/inventoryRoutingResolver.ts';
import { RECOMMENDED_INVENTORY_ROUTING_POLICY } from '../modules/inventory/lib/recommendedInventoryRouting.ts';
import { summarizePendingTransfersForDecision, summarizePackagingQueue } from '../modules/dashboards/lib/decisionMetrics.ts';
import {
  buildDeterministicHandoverRequestId,
  buildDeterministicMovementPlan,
  isExplicitlyActiveUser,
  roleBelongsToTenant,
  resolveApplyOperationAction,
  resolveReverseOperationAction,
  type InventoryMovementIntent,
} from '../functions/src/productionReportInventoryCore.ts';
import { buildAggregateCostDeltas } from '../modules/production/lib/reportAggregateCostReconciliation.ts';
import type { SystemSettings } from '../types.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';

function testV2LabelsAndTypes() {
  assert.equal(WAREHOUSE_ROLE_LABELS.production_floor, 'صالة الإنتاج');
  assert.equal(WAREHOUSE_ROLE_LABELS.production_wip, 'تم الإنتاج — تحت التسليم');
  assert.equal(WAREHOUSE_ROLE_LABELS.finished_staging, 'بانتظار التغليف');
  assert.equal(transferRequestTypeLabel('production_handover'), 'استلام تغليف (تحت التسليم)');
}

function testRecommendedPolicyV2() {
  assert.equal(RECOMMENDED_INVENTORY_ROUTING_POLICY.requirePackagingHandoverReceipt, true);
  assert.equal(RECOMMENDED_INVENTORY_ROUTING_POLICY.autoTransferProductionToFinished, false);
  assert.equal(RECOMMENDED_INVENTORY_ROUTING_POLICY.requireIssuedProductionIssueOnReport, true);
}

function testPickConsumptionPrefersFloor() {
  const warehouse = pickConsumptionWarehouse(
    { type: 'raw_material' },
    {
      rawMaterialWarehouseId: 'raw',
      decomposedWarehouseId: 'dec',
      productionFloorWarehouseId: 'floor',
      productionWipWarehouseId: 'wip',
      finishedStagingWarehouseId: 'stg',
      finalProductWarehouseId: 'fin',
      packagingSourceWarehouseId: '',
      packagingTargetWarehouseId: '',
      wasteWarehouseId: '',
      autoTransferProductionToFinished: false,
      autoTransferFinishedToFinal: false,
      requireApprovalForProductionEntry: false,
      requireApprovalForAutoTransfers: false,
      requirePackagingHandoverReceipt: true,
      autoConsumeBomOnProductionReport: false,
      requireIssuedProductionIssueOnReport: true,
      allowNegativeDecomposedStock: false,
      allowNegativeFinishedTransferStock: false,
      enablePackagingStockTransfer: true,
    },
  );
  assert.equal(warehouse, 'floor');
}

function testDistinctWarehouses() {
  assert.throws(() => assertDistinctProductionRoutingWarehouses({
    decomposedWarehouseId: 'same',
    productionFloorWarehouseId: 'same',
    productionWipWarehouseId: 'wip',
    finishedStagingWarehouseId: 'stg',
  }));
}

function testHandoverDecisionMetrics() {
  const transfers = summarizePendingTransfersForDecision([
    {
      fromWarehouseId: 'wip',
      toWarehouseId: 'stg',
      referenceNo: 'INV-1',
      lines: [],
      status: 'pending',
      requestType: 'production_handover',
      createdBy: 'a',
      createdAt: new Date().toISOString(),
      remainingQuantity: 12,
    },
    {
      fromWarehouseId: 'stg',
      toWarehouseId: 'fin',
      referenceNo: 'INV-2',
      lines: [],
      status: 'pending',
      requestType: 'packaging_transfer',
      createdBy: 'a',
      createdAt: new Date().toISOString(),
    },
  ]);
  assert.equal(transfers.pendingHandover, 1);
  assert.equal(transfers.pendingPackaging, 1);

  const packaging = summarizePackagingQueue({
    awaitingUnits: 5,
    skuCount: 2,
    pendingPackagingTransfers: 1,
    pendingHandover: 1,
    handoverRemainingUnits: 12,
    sourceWarehouseId: 'stg',
    targetWarehouseId: 'fin',
  });
  assert.equal(packaging.pendingHandover, 1);
  assert.equal(packaging.handoverRemainingUnits, 12);
  assert.equal(packaging.configured, true);
}

function testRoutingResolvesFloorAndHandoverFlag() {
  const routing = resolveInventoryRoutingV1({
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        productionFloorWarehouseId: 'floor-1',
        productionWipWarehouseId: 'wip-1',
        finishedStagingWarehouseId: 'stg-1',
        requirePackagingHandoverReceipt: true,
      },
    },
  } as SystemSettings);
  assert.equal(routing.productionFloorWarehouseId, 'floor-1');
  assert.equal(routing.requirePackagingHandoverReceipt, true);
}

function testWarehouseRoleResolvedFromRoutingOverDocument() {
  const routing = {
    rawMaterialWarehouseId: 'raw',
    decomposedWarehouseId: 'dec',
    productionFloorWarehouseId: 'floor',
    productionWipWarehouseId: 'wip',
    finishedStagingWarehouseId: 'stg',
    finalProductWarehouseId: 'fin',
    packagingSourceWarehouseId: 'pkg-src',
    packagingTargetWarehouseId: 'pkg-tgt',
    wasteWarehouseId: 'waste',
  };
  assert.equal(resolveWarehouseRoleFromRouting('stg', routing, 'general'), 'finished_staging');
  assert.equal(resolveWarehouseRoleFromRouting('wip', routing, 'general'), 'production_wip');
  assert.equal(resolveWarehouseRoleFromRouting('other', routing, 'spare_parts_central'), 'spare_parts_central');
}

function testPartialHandoverRemainingMath() {
  const reported = 100;
  const firstReceipt = 40;
  const secondReceipt = 35;
  const receivedAfterFirst = firstReceipt;
  const remainingAfterFirst = Math.max(0, reported - receivedAfterFirst);
  assert.equal(remainingAfterFirst, 60);
  const receivedAfterSecond = receivedAfterFirst + secondReceipt;
  const remainingAfterSecond = Math.max(0, reported - receivedAfterSecond);
  assert.equal(remainingAfterSecond, 25);
  assert.ok(secondReceipt <= remainingAfterFirst + 0.000001);
  assert.ok(!(60 > remainingAfterFirst)); // cannot over-receive beyond remaining
}

function testDeterministicReportInventoryIdentities() {
  const movements: InventoryMovementIntent[] = [
    {
      warehouseId: 'wip',
      itemType: 'finished_good',
      itemId: 'product-1',
      itemName: 'Product',
      unit: 'piece',
      movementType: 'IN',
      quantity: 10,
      sourceModule: 'production_report',
      sourceId: 'report-1',
      note: 'WIP entry',
    },
    {
      warehouseId: 'floor',
      itemType: 'material',
      itemId: 'material-1',
      itemName: 'Material',
      unit: 'kg',
      movementType: 'OUT',
      quantity: 5,
      sourceModule: 'production_report',
      sourceId: 'report-1',
      note: 'BOM consumption',
    },
  ];
  const first = buildDeterministicMovementPlan('report-1', 'apply', movements);
  const retry = buildDeterministicMovementPlan('report-1', 'apply', [...movements].reverse());
  assert.deepEqual(
    first.map((movement) => movement.movementId),
    retry.map((movement) => movement.movementId),
  );
  assert.equal(new Set(first.map((movement) => movement.movementId)).size, 2);

  const duplicateLines = buildDeterministicMovementPlan(
    'report-1',
    'apply',
    [movements[0], movements[0]],
  );
  assert.notEqual(duplicateLines[0].movementId, duplicateLines[1].movementId);
  assert.equal(
    buildDeterministicHandoverRequestId('report-1'),
    buildDeterministicHandoverRequestId('report-1'),
  );
}

function testInventoryOperationStateDecisions() {
  assert.equal(resolveApplyOperationAction(undefined), 'claim');
  assert.equal(resolveApplyOperationAction('applying'), 'resume');
  assert.equal(resolveApplyOperationAction('applied'), 'done');
  assert.equal(resolveApplyOperationAction('reversing'), 'blocked');
  assert.equal(resolveApplyOperationAction('reversed'), 'blocked');
  assert.equal(resolveReverseOperationAction(undefined), 'claim');
  assert.equal(resolveReverseOperationAction('applying'), 'claim');
  assert.equal(resolveReverseOperationAction('reversing'), 'resume');
  assert.equal(resolveReverseOperationAction('reversed'), 'done');
}

function testCallableActorSecurityInvariants() {
  assert.equal(isExplicitlyActiveUser(true), true);
  assert.equal(isExplicitlyActiveUser(false), false);
  assert.equal(isExplicitlyActiveUser(undefined), false);
  assert.equal(roleBelongsToTenant('tenant-1', 'tenant-1'), true);
  assert.equal(roleBelongsToTenant('', 'tenant-1'), false);
  assert.equal(roleBelongsToTenant('tenant-2', 'tenant-1'), false);
}

function testReportAggregateCostReconciliationDeltas() {
  assert.deepEqual(
    Object.fromEntries(buildAggregateCostDeltas(
      { targetId: 'wo-old', amount: 120 },
      { targetId: 'wo-new', amount: 150 },
    )),
    { 'wo-old': -120, 'wo-new': 150 },
  );
  assert.deepEqual(
    Object.fromEntries(buildAggregateCostDeltas(
      { targetId: 'wo-1', amount: 150 },
      { targetId: 'wo-1', amount: 150 },
    )),
    { 'wo-1': 0 },
  );
  assert.deepEqual(
    Object.fromEntries(buildAggregateCostDeltas(
      { targetId: 'wo-1', amount: 150 },
      { targetId: '', amount: 0 },
    )),
    { 'wo-1': -150 },
  );
  assert.deepEqual(
    Object.fromEntries(buildAggregateCostDeltas(
      { targetId: '', amount: 0 },
      { targetId: 'wo-1', amount: 150 },
    )),
    { 'wo-1': 150 },
  );
  assert.deepEqual(
    Object.fromEntries(buildAggregateCostDeltas(
      { targetId: '', amount: 0 },
      { targetId: '', amount: 0 },
    )),
    {},
  );
}

testV2LabelsAndTypes();
testRecommendedPolicyV2();
testPickConsumptionPrefersFloor();
testDistinctWarehouses();
testHandoverDecisionMetrics();
testRoutingResolvesFloorAndHandoverFlag();
testWarehouseRoleResolvedFromRoutingOverDocument();
testPartialHandoverRemainingMath();
testDeterministicReportInventoryIdentities();
testInventoryOperationStateDecisions();
testCallableActorSecurityInvariants();
testReportAggregateCostReconciliationDeltas();
console.log('production-stock-flow-v2.test.ts: OK');
