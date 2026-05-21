import assert from 'node:assert/strict';
import { buildTenantReadinessChecks } from '../modules/system/lib/tenantReadinessLib.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';
import type { SystemSettings } from '../types.ts';

function testAllPass() {
  const settings: SystemSettings = {
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        ...DEFAULT_PLAN_SETTINGS.inventoryRouting,
        productionWipWarehouseId: 'wip-1',
        finishedStagingWarehouseId: 'fin-1',
      },
    },
  } as SystemSettings;

  const result = buildTenantReadinessChecks({
    warehouseCount: 4,
    materialCount: 10,
    materialsWithCost: 8,
    bomCount: 5,
    lineCount: 3,
    costCenterCount: 2,
    settings,
  });

  assert.equal(result.score, result.total);
  assert.equal(result.percent, 100);
}

function testRoutingFail() {
  const result = buildTenantReadinessChecks({
    warehouseCount: 1,
    materialCount: 0,
    materialsWithCost: 0,
    bomCount: 0,
    lineCount: 0,
    costCenterCount: 0,
    settings: { planSettings: DEFAULT_PLAN_SETTINGS } as SystemSettings,
  });

  assert.equal(result.checks.find((c) => c.id === 'routing_wip_staging')?.ok, false);
  assert.ok(result.percent < 80);
}

testAllPass();
testRoutingFail();
console.log('tenant-readiness.test.ts: ok');
