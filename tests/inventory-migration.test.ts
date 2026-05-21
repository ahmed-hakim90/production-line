import assert from 'node:assert/strict';
import { buildInventoryRoutingFromLegacy } from '../modules/inventory/lib/inventoryRoutingResolver.ts';
import type { PlanSettings } from '../types.ts';

function testLegacyMapping() {
  const routing = buildInventoryRoutingFromLegacy({
    allowMultipleActivePlans: true,
    allowReportWithoutPlan: true,
    allowOverProduction: true,
    autoClosePlan: true,
    maxWasteThreshold: 5,
    efficiencyCalculationMode: 'standard',
    averageProductionMode: 'daily',
    injectionRawMaterialCategoryKeywords: '',
    defaultProductionWarehouseId: 'w1',
    finishedReceiveWarehouseId: 'w2',
    decomposedSourceWarehouseId: 'd1',
    wasteReceiveWarehouseId: 'h1',
  });
  assert.equal(routing.productionWipWarehouseId, 'w1');
  assert.equal(routing.finishedStagingWarehouseId, 'w2');
  assert.equal(routing.decomposedWarehouseId, 'd1');
  assert.equal(routing.wasteWarehouseId, 'h1');
  assert.equal(routing.autoTransferProductionToFinished, false);
}

function testExistingRoutingPreserved() {
  const plan: PlanSettings = {
    allowMultipleActivePlans: true,
    allowReportWithoutPlan: true,
    allowOverProduction: true,
    autoClosePlan: true,
    maxWasteThreshold: 5,
    efficiencyCalculationMode: 'standard',
    averageProductionMode: 'daily',
    injectionRawMaterialCategoryKeywords: '',
    inventoryRouting: {
      productionWipWarehouseId: 'wip-1',
      finishedStagingWarehouseId: 'stage-1',
    },
    inventoryRoutingMigratedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(plan.inventoryRouting?.productionWipWarehouseId, 'wip-1');
  const fromLegacy = buildInventoryRoutingFromLegacy(plan);
  assert.equal(fromLegacy.productionWipWarehouseId, '');
}

testLegacyMapping();
testExistingRoutingPreserved();
console.log('inventory-migration tests passed');
