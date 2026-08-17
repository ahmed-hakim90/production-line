import assert from 'node:assert/strict';
import { MENU_CONFIG, canAccessMenuItem } from '../config/menu.config.ts';
import { WAREHOUSE_ROLE_LABELS, transferRequestTypeLabel } from '../modules/inventory/lib/stockLabels.ts';
import { syncPlanSettingsWarehouseRouting } from '../modules/inventory/lib/syncPlanSettingsWarehouseRouting.ts';
import { resolveInventoryRoutingV1 } from '../modules/inventory/lib/inventoryRoutingResolver.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';
import type { SystemSettings } from '../types.ts';

/** Recommended operational path: صرف → صالة → تقرير → استلام تغليف → بانتظار تغليف → منتج تام. */
function testRecommendedRoutingDefaults() {
  const synced = syncPlanSettingsWarehouseRouting({
    ...DEFAULT_PLAN_SETTINGS,
    inventoryRouting: {
      autoTransferProductionToFinished: false,
      requireApprovalForProductionEntry: false,
      requireApprovalForAutoTransfers: false,
      requirePackagingHandoverReceipt: true,
      autoConsumeBomOnProductionReport: false,
      requireIssuedProductionIssueOnReport: true,
      packagingSourceWarehouseId: 'staging-1',
      packagingTargetWarehouseId: 'final-1',
      finishedStagingWarehouseId: 'staging-1',
      finalProductWarehouseId: 'final-1',
      productionWipWarehouseId: 'wip-1',
      productionFloorWarehouseId: 'floor-1',
    },
  });
  const routing = synced.inventoryRouting!;
  assert.equal(routing.autoTransferProductionToFinished, false);
  assert.equal(routing.requireApprovalForProductionEntry, false);
  assert.equal(routing.requireApprovalForAutoTransfers, false);
  assert.equal(routing.requirePackagingHandoverReceipt, true);
  assert.equal(routing.autoConsumeBomOnProductionReport, false);
  assert.equal(routing.requireIssuedProductionIssueOnReport, true);
  assert.equal(routing.packagingSourceWarehouseId, 'staging-1');
  assert.equal(routing.packagingTargetWarehouseId, 'final-1');
  assert.equal(routing.productionFloorWarehouseId, 'floor-1');
}

function testArabicStageLabels() {
  assert.equal(WAREHOUSE_ROLE_LABELS.finished_staging, 'بانتظار التغليف');
  assert.equal(WAREHOUSE_ROLE_LABELS.final_product, 'منتج تام');
  assert.equal(WAREHOUSE_ROLE_LABELS.production_wip, 'تم الإنتاج — تحت التسليم');
  assert.equal(WAREHOUSE_ROLE_LABELS.production_floor, 'صالة الإنتاج');
  assert.equal(transferRequestTypeLabel('production_auto_transfer'), 'ترحيل إلى تم الإنتاج');
  assert.equal(transferRequestTypeLabel('packaging_transfer'), 'تحويل تغليف');
  assert.equal(transferRequestTypeLabel('production_handover'), 'استلام تغليف (تحت التسليم)');
}

function testPackagingMenuAndMaterialsRoleFilter() {
  const productionGroup = MENU_CONFIG.find((g) => g.key === 'production');
  const packaging = productionGroup?.children.find((c) => c.key === 'packaging-control');
  assert.ok(packaging);
  assert.equal(packaging?.path, '/production/packaging/control');
  assert.deepEqual(packaging?.excludeRoleKeys, [
    'materials_warehouse',
    'repair_reception',
    'repair_technician',
  ]);
  assert.deepEqual(packaging?.anyOfPermissions, [
    'productionHandover.approve',
    'inventory.transfers.approve',
    'reports.packaging.create',
    'factoryDashboard.view',
    'adminDashboard.view',
  ]);

  const inventoryGroup = MENU_CONFIG.find((g) => g.key === 'inventory');
  assert.equal(
    inventoryGroup?.children.some((c) => c.key === 'inv-packaging-control' || c.path?.includes('/packaging/control')),
    false,
  );

  const allowAll = () => true;
  const floor = productionGroup?.children.find((c) => c.key === 'production-floor');
  assert.ok(floor);
  assert.equal(floor?.label, 'مساحة صالة الإنتاج');
  assert.equal(floor?.path, '/production/floor');
  assert.equal(floor?.permission, 'inventory.view');
  assert.deepEqual(floor?.excludeRoleKeys, [
    'repair_reception',
    'repair_technician',
    'spare_parts_central_warehouse',
    'maintenance_center_warehouse',
  ]);
  assert.equal(
    inventoryGroup?.children.some((c) => c.key === 'inv-production-floor' || c.path?.includes('/production-floor')),
    false,
  );
  assert.equal(canAccessMenuItem(allowAll, floor!, null), true);
  assert.equal(canAccessMenuItem(allowAll, floor!, 'repair_reception'), false);
  assert.equal(canAccessMenuItem(allowAll, floor!, 'spare_parts_central_warehouse'), false);
  assert.equal(canAccessMenuItem(allowAll, floor!, 'factory_manager'), true);
  assert.equal(canAccessMenuItem(allowAll, floor!, 'materials_warehouse'), true);
  assert.equal(
    canAccessMenuItem((p) => p === 'plans.view' || p === 'quickAction.view', floor!, 'supervisor'),
    false,
    'line supervisor without inventory.view must not open مساحة صالة الإنتاج',
  );
  assert.equal(
    canAccessMenuItem((p) => p === 'inventory.view', floor!, 'hall_supervisor'),
    true,
  );

  assert.equal(canAccessMenuItem(allowAll, packaging!, null), true);
  assert.equal(canAccessMenuItem(allowAll, packaging!, 'materials_warehouse'), false);
  assert.equal(canAccessMenuItem(allowAll, packaging!, 'repair_reception'), false);
  assert.equal(canAccessMenuItem(allowAll, packaging!, 'factory_manager'), true);
  assert.equal(
    canAccessMenuItem((p) => p === 'inventory.view', packaging!, 'repair_reception'),
    false,
    'inventory.view alone must not open packaging control',
  );
  assert.equal(
    canAccessMenuItem(
      (p) => ['reports.view', 'reports.create', 'plans.view', 'quickAction.view'].includes(p),
      packaging!,
      'supervisor',
    ),
    false,
    'line supervisor reports.view must not open packaging control',
  );
  assert.equal(
    canAccessMenuItem((p) => p === 'productionHandover.approve', packaging!, null),
    true,
  );

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
