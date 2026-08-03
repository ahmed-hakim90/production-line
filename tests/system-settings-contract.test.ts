import assert from 'node:assert/strict';
import { resolveReportBehaviorSettings } from '../modules/production/lib/reportBehaviorSettings.ts';
import {
  resolvePlanSettings,
  resolveSystemSettings,
} from '../modules/system/lib/resolveSystemSettings.ts';
import {
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_SYSTEM_SETTINGS,
} from '../utils/dashboardConfig.ts';

const fromNull = resolveSystemSettings(null);
assert.deepEqual(
  fromNull.planSettings.inventoryRouting,
  DEFAULT_PLAN_SETTINGS.inventoryRouting,
  'null settings must keep default inventoryRouting',
);
assert.deepEqual(
  fromNull.planSettings.reportBehavior,
  DEFAULT_PLAN_SETTINGS.reportBehavior,
  'null settings must keep default reportBehavior',
);
assert.deepEqual(
  fromNull.attendanceIntegration,
  DEFAULT_SYSTEM_SETTINGS.attendanceIntegration,
);
assert.deepEqual(
  fromNull.operationPaths,
  DEFAULT_SYSTEM_SETTINGS.operationPaths,
);

const partialPlan = resolveSystemSettings({
  planSettings: {
    maxWasteThreshold: 9,
    inventoryRouting: {
      productionWipWarehouseId: 'wip-1',
    },
    reportBehavior: {
      operationalDayStartHour: 6,
    },
  } as any,
});
assert.equal(partialPlan.planSettings.maxWasteThreshold, 9);
assert.equal(partialPlan.planSettings.inventoryRouting.productionWipWarehouseId, 'wip-1');
assert.equal(
  partialPlan.planSettings.inventoryRouting.requirePackagingHandoverReceipt,
  DEFAULT_PLAN_SETTINGS.inventoryRouting.requirePackagingHandoverReceipt,
  'partial inventoryRouting must preserve nested defaults',
);
assert.equal(partialPlan.planSettings.reportBehavior?.operationalDayStartHour, 6);
assert.equal(
  partialPlan.planSettings.reportBehavior?.autoApplyInventoryOnReportSave,
  DEFAULT_PLAN_SETTINGS.reportBehavior?.autoApplyInventoryOnReportSave,
  'partial reportBehavior must preserve nested defaults',
);
assert.equal(
  partialPlan.planSettings.allowMultipleActivePlans,
  DEFAULT_PLAN_SETTINGS.allowMultipleActivePlans,
);

const storedLegacyFlag = resolveSystemSettings({
  planSettings: {
    reportBehavior: {
      autoPostReportToPlanAndWorkOrder: false,
      operationalDayStartHour: 7,
    },
  } as any,
});
const behavior = resolveReportBehaviorSettings(storedLegacyFlag);
assert.equal(
  behavior.autoPostReportToPlanAndWorkOrder,
  true,
  'stored autoPostReportToPlanAndWorkOrder=false must not disable reconcile invariant',
);
assert.equal(behavior.operationalDayStartHour, 7);

const mergedPlanOnly = resolvePlanSettings({
  inventoryRouting: { finalProductWarehouseId: 'fp-1' },
} as any);
assert.equal(mergedPlanOnly.inventoryRouting.finalProductWarehouseId, 'fp-1');
assert.equal(
  mergedPlanOnly.inventoryRouting.autoTransferProductionToFinished,
  DEFAULT_PLAN_SETTINGS.inventoryRouting.autoTransferProductionToFinished,
);

console.log('system-settings-contract tests passed');
