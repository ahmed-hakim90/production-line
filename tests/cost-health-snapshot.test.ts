import assert from 'node:assert/strict';
import { costHealthSnapshotService } from '../modules/costs/services/costHealthSnapshotService.ts';
import { DEFAULT_PLAN_SETTINGS } from '../utils/dashboardConfig.ts';
import type { SystemSettings } from '../types.ts';

function testCostHealthSnapshot() {
  const settings = {
    laborSettings: { hourlyRate: 0 },
    planSettings: { ...DEFAULT_PLAN_SETTINGS, inventoryRouting: { productionWipWarehouseId: '' } },
  } as unknown as SystemSettings;
  const snap = costHealthSnapshotService.getQuickSnapshot(settings);
  assert.ok(snap.issueCount >= 2);
}

testCostHealthSnapshot();
console.log('cost-health-snapshot.test.ts: ok');
