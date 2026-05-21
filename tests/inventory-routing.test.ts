import assert from 'node:assert/strict';
import { resolveInventoryRoutingV1, pickConsumptionWarehouse } from '../modules/inventory/lib/inventoryRoutingResolver.ts';
import type { SystemSettings } from '../types.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';

function testLegacyFallback() {
  const settings: SystemSettings = {
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      decomposedSourceWarehouseId: 'dec-1',
      finishedReceiveWarehouseId: 'fin-1',
      wasteReceiveWarehouseId: 'waste-1',
      defaultProductionWarehouseId: 'wip-legacy',
      inventoryRouting: undefined,
    },
  } as SystemSettings;
  const routing = resolveInventoryRoutingV1(settings);
  assert.equal(routing.decomposedWarehouseId, 'dec-1');
  assert.equal(routing.finishedStagingWarehouseId, 'fin-1');
  assert.equal(routing.wasteWarehouseId, 'waste-1');
  assert.equal(routing.productionWipWarehouseId, 'wip-legacy');
}

function testNestedRoutingPreferred() {
  const settings: SystemSettings = {
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      finishedReceiveWarehouseId: 'legacy-fin',
      inventoryRouting: {
        finishedStagingWarehouseId: 'staging-new',
        productionWipWarehouseId: 'wip-new',
        autoTransferProductionToFinished: true,
      },
    },
  } as SystemSettings;
  const routing = resolveInventoryRoutingV1(settings);
  assert.equal(routing.finishedStagingWarehouseId, 'staging-new');
  assert.equal(routing.productionWipWarehouseId, 'wip-new');
  assert.equal(routing.autoTransferProductionToFinished, true);
}

function testPickConsumptionWarehouse() {
  const routing = resolveInventoryRoutingV1({
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        rawMaterialWarehouseId: 'raw-1',
        decomposedWarehouseId: 'dec-1',
        packagingSourceWarehouseId: 'pkg-1',
      },
    },
  } as SystemSettings);
  assert.equal(pickConsumptionWarehouse({ type: 'packaging' }, routing), 'pkg-1');
  assert.equal(pickConsumptionWarehouse({ type: 'semi_finished' }, routing), 'dec-1');
  assert.equal(pickConsumptionWarehouse({ type: 'raw_material' }, routing), 'raw-1');
}

testLegacyFallback();
testNestedRoutingPreferred();
testPickConsumptionWarehouse();
console.log('inventory-routing tests passed');
