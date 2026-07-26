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
}

function testFlagsPreserved() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    inventoryRouting: {
      ...DEFAULT_PLAN_SETTINGS.inventoryRouting,
      autoConsumeBomOnProductionReport: true,
      requireIssuedProductionIssueOnReport: false,
    },
  });
  assert.equal(synced.inventoryRouting?.autoConsumeBomOnProductionReport, true);
  assert.equal(synced.inventoryRouting?.requireIssuedProductionIssueOnReport, false);
}

testNestedWinsIncludingClear();
testLegacySeedWhenNestedAbsent();
testFlagsPreserved();
console.log('sync-plan-settings-routing tests passed');
