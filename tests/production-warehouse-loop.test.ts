import assert from 'node:assert/strict';
import { MENU_CONFIG, canAccessMenuItem } from '../config/menu.config.ts';
import { WAREHOUSE_ROLE_LABELS, transferRequestTypeLabel } from '../modules/inventory/lib/stockLabels.ts';
import { syncPlanSettingsWarehouseRouting } from '../modules/inventory/lib/syncPlanSettingsWarehouseRouting.ts';
import { resolveInventoryRoutingV1 } from '../modules/inventory/lib/inventoryRoutingResolver.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';
import type { SystemSettings } from '../types.ts';

/** Recommended operational path after production_entry approval → تم الإنتاج → packaging → منتج تام. */
function testRecommendedRoutingDefaults() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    inventoryRouting: {
      autoTransferProductionToFinished: true,
      requireApprovalForProductionEntry: true,
      requireApprovalForAutoTransfers: false,
      autoConsumeBomOnProductionReport: false,
      requireIssuedProductionIssueOnReport: true,
      packagingSourceWarehouseId: 'staging-1',
      packagingTargetWarehouseId: 'final-1',
      finishedStagingWarehouseId: 'staging-1',
      finalProductWarehouseId: 'final-1',
      productionWipWarehouseId: 'wip-1',
    },
  });
  const routing = synced.inventoryRouting!;
  assert.equal(routing.autoTransferProductionToFinished, true);
  assert.equal(routing.requireApprovalForProductionEntry, true);
  assert.equal(routing.requireApprovalForAutoTransfers, false);
  assert.equal(routing.autoConsumeBomOnProductionReport, false);
  assert.equal(routing.requireIssuedProductionIssueOnReport, true);
  assert.equal(routing.packagingSourceWarehouseId, 'staging-1');
  assert.equal(routing.packagingTargetWarehouseId, 'final-1');
}

function testArabicStageLabels() {
  assert.equal(WAREHOUSE_ROLE_LABELS.finished_staging, 'تم الإنتاج');
  assert.equal(WAREHOUSE_ROLE_LABELS.final_product, 'منتج تام');
  assert.equal(transferRequestTypeLabel('production_auto_transfer'), 'ترحيل إلى تم الإنتاج');
  assert.equal(transferRequestTypeLabel('packaging_transfer'), 'تحويل تغليف');
}

function testPackagingMenuAndMaterialsRoleFilter() {
  const productionGroup = MENU_CONFIG.find((g) => g.key === 'production');
  const packaging = productionGroup?.children.find((c) => c.key === 'packaging-control');
  assert.ok(packaging);
  assert.equal(packaging?.path, '/production/packaging/control');
  assert.deepEqual(packaging?.excludeRoleKeys, ['materials_warehouse']);

  const inventoryGroup = MENU_CONFIG.find((g) => g.key === 'inventory');
  assert.equal(
    inventoryGroup?.children.some((c) => c.key === 'inv-packaging-control' || c.path?.includes('/packaging/control')),
    false,
  );

  const allowAll = () => true;
  assert.equal(canAccessMenuItem(allowAll, packaging!, null), true);
  assert.equal(canAccessMenuItem(allowAll, packaging!, 'materials_warehouse'), false);
  assert.equal(canAccessMenuItem(allowAll, packaging!, 'factory_manager'), true);

  const productionApprovals = inventoryGroup?.children.find((c) => c.key === 'inv-production-approvals');
  assert.ok(productionApprovals?.excludeRoleKeys?.includes('materials_warehouse'));
  assert.equal(
    canAccessMenuItem(allowAll, productionApprovals!, 'materials_warehouse'),
    false,
  );
}

function testPackagingSourceFallsBackToStaging() {
  const routing = resolveInventoryRoutingV1({
    planSettings: {
      ...DEFAULT_PLAN_SETTINGS,
      inventoryRouting: {
        finishedStagingWarehouseId: 'staging-1',
        finalProductWarehouseId: 'final-1',
        packagingSourceWarehouseId: '',
        packagingTargetWarehouseId: '',
      },
    },
  } as SystemSettings);
  // UI PackagingControl falls back to staging/final when packaging IDs empty.
  const source = String(routing.packagingSourceWarehouseId || routing.finishedStagingWarehouseId || '').trim();
  const target = String(routing.packagingTargetWarehouseId || routing.finalProductWarehouseId || '').trim();
  assert.equal(source, 'staging-1');
  assert.equal(target, 'final-1');
}

testRecommendedRoutingDefaults();
testArabicStageLabels();
testPackagingMenuAndMaterialsRoleFilter();
testPackagingSourceFallsBackToStaging();
console.log('production-warehouse-loop.test.ts: OK');
