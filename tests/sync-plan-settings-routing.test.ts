import assert from 'node:assert/strict';
import { syncPlanSettingsWarehouseRouting } from '../modules/inventory/lib/syncPlanSettingsWarehouseRouting.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';

function testNestedWinsIncludingClear() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    decomposedSourceWarehouseId: 'legacy-dec',
    inventoryRouting: {
      ...DEFAULT_PLAN_SETTINGS.inventoryRouting,
      decomposedWarehouseId: '',
      productionWipWarehouseId: 'wip-1',
      requireIssuedProductionIssueOnReport: true,
    },
  });
  assert.equal(synced.decomposedSourceWarehouseId, '');
  assert.equal(synced.inventoryRouting?.decomposedWarehouseId, '');
  assert.equal(synced.inventoryRouting?.productionWipWarehouseId, 'wip-1');
  assert.equal(synced.defaultProductionWarehouseId, 'wip-1');
}

function testLegacySeedWhenNestedAbsent() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    inventoryRouting: undefined,
    decomposedSourceWarehouseId: 'legacy-dec',
    defaultProductionWarehouseId: 'legacy-wip',
  });
  assert.equal(synced.inventoryRouting?.decomposedWarehouseId, 'legacy-dec');
  assert.equal(synced.inventoryRouting?.productionWipWarehouseId, 'legacy-wip');
  assert.equal(synced.inventoryRouting?.requireIssuedProductionIssueOnReport, true);
  assert.equal(synced.inventoryRouting?.autoConsumeBomOnProductionReport, false);
}

function testFlagsPreserved() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    inventoryRouting: {
      ...DEFAULT_PLAN_SETTINGS.inventoryRouting,
      autoConsumeBomOnProductionReport: true,
      requireIssuedProductionIssueOnReport: false,
      autoTransferProductionToFinished: false,
      requireApprovalForProductionEntry: false,
    },
  });
  assert.equal(synced.inventoryRouting?.autoConsumeBomOnProductionReport, true);
  assert.equal(synced.inventoryRouting?.requireIssuedProductionIssueOnReport, false);
  assert.equal(synced.inventoryRouting?.autoTransferProductionToFinished, false);
  assert.equal(synced.inventoryRouting?.requireApprovalForProductionEntry, false);
  assert.equal(synced.requireFinishedStockApprovalForReports, false);
}

function testApprovalFlagsStayInSync() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    requireFinishedStockApprovalForReports: false,
    inventoryRouting: {
      ...DEFAULT_PLAN_SETTINGS.inventoryRouting,
      requireApprovalForProductionEntry: true,
      autoTransferProductionToFinished: true,
    },
  });
  assert.equal(synced.requireFinishedStockApprovalForReports, true);
  assert.equal(synced.inventoryRouting?.requireApprovalForProductionEntry, true);
  assert.equal(synced.inventoryRouting?.autoTransferProductionToFinished, true);
}

testNestedWinsIncludingClear();
testLegacySeedWhenNestedAbsent();
testFlagsPreserved();
testApprovalFlagsStayInSync();
console.log('sync-plan-settings-routing tests passed');
