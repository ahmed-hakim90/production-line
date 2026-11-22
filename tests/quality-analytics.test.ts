import assert from 'node:assert/strict';
import {
  buildQualityAnalytics,
  heatmapColor,
  paretoTopCauseCount,
  type QualityAnalyticsRecord,
} from '../modules/quality/domain/analytics.ts';
import { isLinePullRejectedByLimit, resolveLinePullDecision, totalLinePullSampleCount } from '../modules/quality/domain/samples.ts';

const records: QualityAnalyticsRecord[] = [
  {
    id: 'pull-1',
    source: 'line',
    date: '2026-11-01',
    lineId: 'old-line',
    lineName: 'خط 1',
    productId: 'product-a',
    productName: 'خلاط',
    productCode: '7077A',
    sampleCount: 5,
    defectCount: 2,
    defects: [
      { tenantId: 'tenant', reasonId: 'loose-screw', reasonCode: 'D1', reasonLabel: 'مسمار مفكوك', count: 2 },
    ],
  },
  {
    id: 'hourly-1',
    source: 'hourly',
    date: '2026-11-02',
    lineId: 'new-line',
    lineName: 'خط-1',
    productId: 'product-a',
    productName: 'خلاط',
    productCode: '7077A',
    sampleCount: 10,
    defectCount: 1,
    defects: [
      { tenantId: 'tenant', reasonId: 'appearance', reasonCode: 'D2', reasonLabel: 'مظهر خارجي', count: 1 },
    ],
  },
  {
    id: 'pallet-1',
    source: 'pallet',
    date: '2026-11-03',
    lineId: 'line-2',
    lineName: 'خط 2',
    productId: 'product-b',
    productName: 'كبة',
    sampleCount: 20,
    defectCount: 2,
    defects: [
      { tenantId: 'tenant', reasonId: 'loose-screw', reasonCode: 'D1', reasonLabel: 'مسمار مفكوك', count: 2 },
    ],
  },
];

const result = buildQualityAnalytics(records);
assert.equal(result.inspectionCount, 3);
assert.equal(result.sampleCount, 35);
assert.equal(result.defectCount, 5);
assert.equal(result.defectRate, (5 / 35) * 100);
assert.equal(result.defectOccurrenceCount, 5);
assert.equal(result.lineProducts.length, 2);
assert.equal(result.lineProducts.find((row) => row.productId === 'product-a')?.inspectionCount, 2);
assert.equal(result.lineProducts.find((row) => row.productId === 'product-a')?.sampleCount, 15);
assert.equal(result.reasons[0].reasonId, 'loose-screw');
assert.equal(paretoTopCauseCount(result.reasons), 1);
assert.equal(buildQualityAnalytics(records, { reasonId: 'appearance' }).defectCount, 1);
assert.equal(buildQualityAnalytics(records, { lineId: 'line-2' }).sampleCount, 20);
assert.equal(heatmapColor(0), '#16a34a');
assert.equal(heatmapColor(2), '#facc15');
assert.equal(heatmapColor(6), '#f97316');
assert.equal(heatmapColor(10), '#991b1b');
assert.equal(totalLinePullSampleCount({
  sampleCount: 5,
  additionalSampleCount: 3,
  sampleCountSemantics: 'base_plus_additional',
}), 8);
assert.equal(totalLinePullSampleCount({ sampleCount: 5, additionalSampleCount: 3 }), 5);
assert.equal(isLinePullRejectedByLimit(1, 1), false);
assert.equal(isLinePullRejectedByLimit(2, 1), true);
assert.throws(() => isLinePullRejectedByLimit(2, -1), /حد الرفض/);
assert.equal(resolveLinePullDecision(2, 1, 'auto'), true);
assert.equal(resolveLinePullDecision(2, 1, 'manual_accept'), false);
assert.equal(resolveLinePullDecision(0, 1, 'manual_reject'), true);
assert.throws(() => resolveLinePullDecision(0, -1, 'manual_accept'), /حد الرفض/);

console.log('quality analytics checks passed');
