import assert from 'node:assert/strict';
import {
  averageScheduleAdherence,
  computeProductionHealthBreakdown,
  costToComplete,
  countNegativeAndLow,
  daysOfCover,
  forecastGapDays,
  isPlanBehindSchedule,
  laborUtilizationPercent,
  outputVsIdealPercent,
  performanceProxyPercent,
  qualityRatesFromTotals,
  scheduleAdherencePercent,
  stockCountAccuracyFromLines,
  assemblableCoveragePercent,
  summarizeInventoryRisk,
  summarizeMaterialReadiness,
  summarizePendingTransfersForDecision,
  summarizeProductionIssuesForDecision,
  summarizeReceiptsForDecision,
  summarizeStockCountSessions,
  volumeWeightedPlanAchievement,
  yieldEfficiencyPercent,
} from '../modules/dashboards/lib/decisionMetrics';
import type { ProductionIssueOrder } from '../modules/inventory/types';
import type { InventoryTransferRequest } from '../modules/inventory/types';

assert.equal(volumeWeightedPlanAchievement([]), 0);
assert.equal(
  volumeWeightedPlanAchievement([
    { plannedQuantity: 100, actualQuantity: 90 },
    { plannedQuantity: 10, actualQuantity: 10 },
  ]),
  90.9,
);
assert.equal(
  volumeWeightedPlanAchievement([
    { plannedQuantity: 1000, actualQuantity: 500 },
    { plannedQuantity: 10, actualQuantity: 10 },
  ]),
  50.5,
);

assert.equal(yieldEfficiencyPercent(95, 5), 95);
assert.equal(yieldEfficiencyPercent(0, 0), 0);

const ahead = scheduleAdherencePercent({
  plannedQuantity: 100,
  actualQuantity: 100,
  startDate: '2099-01-01',
  plannedEndDate: '2099-01-31',
});
assert.ok(ahead >= 100 || ahead === 0);

const behind = isPlanBehindSchedule({
  plannedQuantity: 100,
  actualQuantity: 5,
  startDate: '2020-01-01',
  plannedEndDate: '2020-01-10',
  status: 'in_progress',
}, { minElapsedDays: 1, gapPercent: 20 });
assert.equal(behind, true);

const onTrack = isPlanBehindSchedule({
  plannedQuantity: 100,
  actualQuantity: 100,
  startDate: '2020-01-01',
  plannedEndDate: '2099-12-31',
  status: 'in_progress',
}, { minElapsedDays: 1, gapPercent: 20 });
assert.equal(onTrack, false);

assert.equal(
  averageScheduleAdherence([
    {
      plannedQuantity: 100,
      actualQuantity: 50,
      startDate: '2020-01-01',
      plannedEndDate: '2020-01-02',
      status: 'in_progress',
    },
  ]) > 0,
  true,
);

const now = Date.parse('2026-07-29T12:00:00.000Z');
const issues = summarizeProductionIssuesForDecision(
  [
    {
      referenceNo: 'PI-0001',
      sourceType: 'work_order',
      productId: 'p1',
      productName: 'A',
      quantity: 10,
      requestedQuantity: 20,
      sourceWarehouseId: 'w1',
      status: 'submitted',
      lines: [],
      createdBy: 'u',
      createdAt: '2026-07-26T10:00:00.000Z',
      submittedAt: '2026-07-26T10:00:00.000Z',
    },
    {
      referenceNo: 'PI-0002',
      sourceType: 'work_order',
      productId: 'p1',
      productName: 'A',
      quantity: 30,
      requestedQuantity: 30,
      sourceWarehouseId: 'w1',
      status: 'issued',
      lines: [],
      createdBy: 'u',
      createdAt: '2026-07-28T10:00:00.000Z',
    },
  ] as ProductionIssueOrder[],
  now,
);
assert.equal(issues.openCount, 1);
assert.equal(issues.issuedQty, 30);
assert.equal(issues.openRequestedQty, 20);
assert.equal(issues.fulfilmentPercent, 60);
assert.equal(issues.agingOver72h, 1);

const transfers = summarizePendingTransfersForDecision(
  [
    {
      fromWarehouseId: 'a',
      toWarehouseId: 'b',
      referenceNo: 'T1',
      lines: [],
      status: 'pending',
      createdBy: 'u',
      createdAt: '2026-07-27T10:00:00.000Z',
      requestType: 'production_entry',
    },
    {
      fromWarehouseId: 'a',
      toWarehouseId: 'b',
      referenceNo: 'T2',
      lines: [],
      status: 'pending',
      createdBy: 'u',
      createdAt: '2026-07-29T08:00:00.000Z',
      requestType: 'packaging_transfer',
    },
  ] as InventoryTransferRequest[],
  now,
);
assert.equal(transfers.pendingTotal, 2);
assert.equal(transfers.pendingProductionEntry, 1);
assert.equal(transfers.pendingPackaging, 1);
assert.equal(transfers.agingOver24h, 1);

assert.equal(costToComplete(10, 2.5), 25);
assert.equal(forecastGapDays('2026-08-10', '2026-08-05'), 5);
assert.equal(forecastGapDays('—', '2026-08-05'), null);

assert.equal(daysOfCover(100, 20), 5);
assert.equal(daysOfCover(50, 0), null);

const inv = summarizeInventoryRisk({
  lowStockCount: 4,
  negativeCount: 1,
  suppliesAlertCount: 2,
  wipQty: 30,
  finishedQty: 40,
  wasteQty: 5,
  dailyFinishedDemand: 20,
  coverRows: [
    { quantity: 10, dailyDemand: 10, minCoverDays: 3 },
    { quantity: 100, dailyDemand: 10, minCoverDays: 3 },
  ],
});
assert.equal(inv.finishedDaysOfCover, 2);
assert.equal(inv.skusBelowMinCover, 1);
assert.equal(inv.negativeCount, 1);

const receipts = summarizeReceiptsForDecision(
  [
    {
      status: 'submitted',
      createdAt: '2026-07-26T10:00:00.000Z',
      submittedAt: '2026-07-26T10:00:00.000Z',
    },
    {
      status: 'executed',
      submittedAt: '2026-07-28T08:00:00.000Z',
      executedAt: '2026-07-28T14:00:00.000Z',
    },
  ],
  now,
);
assert.equal(receipts.awaitingCount, 1);
assert.equal(receipts.agingOver72h, 1);
assert.equal(receipts.avgCycleHours, 6);

assert.deepEqual(countNegativeAndLow([
  { quantity: -2, minStock: 1 },
  { quantity: 1, minStock: 5 },
  { quantity: 10, minStock: 5 },
]), { negativeCount: 1, lowCount: 1 });

const countAccuracy = stockCountAccuracyFromLines([
  { expectedQty: 10, countedQty: 10 },
  { expectedQty: 5, countedQty: 4 },
  { expectedQty: 2, countedQty: 2 },
]);
assert.equal(countAccuracy.matchedLines, 2);
assert.equal(countAccuracy.countedLines, 3);
assert.equal(countAccuracy.accuracyPercent, 66.7);
assert.equal(countAccuracy.absoluteVarianceQty, 1);

const countSummary = summarizeStockCountSessions([
  { status: 'open', lines: [] },
  {
    status: 'counted',
    lines: [
      { expectedQty: 10, countedQty: 10 },
      { expectedQty: 3, countedQty: 1 },
    ],
  },
  {
    status: 'approved',
    approvedAt: '2026-07-28T10:00:00.000Z',
    lines: [{ expectedQty: 1, countedQty: 1 }],
  },
], { nowMs: now, recentDays: 30 });
assert.equal(countSummary.openSessions, 1);
assert.equal(countSummary.awaitingApproval, 1);
assert.equal(countSummary.approvedRecent, 1);
assert.equal(countSummary.accuracyPercent, 66.7);

assert.equal(laborUtilizationPercent(40, 50), 80);
assert.equal(outputVsIdealPercent(90, 100), 90);
assert.equal(performanceProxyPercent({ actualUnits: 80, runHours: 10, idealUnitsPerHour: 10 }), 80);

const materials = summarizeMaterialReadiness({
  plans: [
    { id: 'p1', status: 'in_progress', plannedQuantity: 100, producedQuantity: 40 },
    { id: 'p2', status: 'planned', plannedQuantity: 50, producedQuantity: 0 },
    { id: 'p3', status: 'completed', plannedQuantity: 10, producedQuantity: 10 },
  ],
  followUps: [
    { planId: 'p1', status: 'open', shortageQty: 12 },
    { planId: 'p1', status: 'in_progress', shortageQty: 3 },
    { planId: 'p2', status: 'resolved', shortageQty: 99 },
  ],
});
assert.equal(materials.activePlanCount, 2);
assert.equal(materials.plansWithShortage, 1);
assert.equal(materials.openShortageRows, 2);
assert.equal(materials.totalShortageQty, 15);
assert.equal(materials.readinessPercent, 50);
assert.equal(materials.blockedRemainingQty, 60);

assert.equal(
  assemblableCoveragePercent([
    { remainingQty: 100, maxAssemblable: 40 },
    { remainingQty: 50, maxAssemblable: 50 },
  ]),
  60,
);

const rates = qualityRatesFromTotals({ inspected: 100, failed: 4, rework: 6, fpyTotal: 90, fpyCount: 1 });
assert.equal(rates.failRate, 4);
assert.equal(rates.reworkRate, 6);
assert.equal(rates.defectRate, 4);
assert.equal(rates.avgFpy, 90);

const health = computeProductionHealthBreakdown({
  yieldEfficiency: 95,
  costVarianceAbs: 3,
  wastePercent: 1,
  planVolumeAchievement: 90,
  scheduleAdherence: 88,
  openIssueCount: 0,
  packagingAwaitingUnits: 0,
  pendingApprovals: 0,
  qualityFailRate: 1,
});
assert.ok(health.total >= 80);
assert.equal(health.quality, 85);

console.log('decision-metrics.test.ts: OK');
