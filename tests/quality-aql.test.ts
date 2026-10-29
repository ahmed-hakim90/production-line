import assert from 'node:assert/strict';
import { calculateAqlDecision, lookupAqlPlan } from '../modules/quality/domain/aql.ts';
import { validateAdditionalInspector } from '../modules/quality/domain/samples.ts';
import { workOrderMayCloseFromQuality } from '../modules/quality/domain/release.ts';
import { scrapCauseShares } from '../modules/quality/domain/scrap.ts';
import { buildFlowchartMetrics } from '../modules/quality/domain/flowchart.ts';
import { assertSlotWindow } from '../modules/quality/domain/time.ts';

const plan = lookupAqlPlan(120);
assert.equal(plan.sampleSize, 20);
assert.equal(plan.acceptLimit, 2);
assert.equal(plan.rejectLimit, 3);

assert.equal(calculateAqlDecision(1, 2, 3, 'auto'), 'مقبول');
assert.equal(calculateAqlDecision(3, 2, 3, 'auto'), 'مرفوض');
assert.equal(calculateAqlDecision(9, 2, 3, 'manual_accept'), 'مقبول');
assert.equal(calculateAqlDecision(0, 2, 3, 'manual_reject'), 'مرفوض');
assert.equal(calculateAqlDecision(2, 2, 3, 'auto'), 'مقبول');
assert.equal(calculateAqlDecision(3, 2, 5, 'auto'), 'مرفوض');
assert.equal(lookupAqlPlan(91).sampleSize, 20);
assert.equal(lookupAqlPlan(150).rejectLimit, 3);

const extra = validateAdditionalInspector({
  additionalInspectorId: 'inspector-2',
  additionalSampleCount: 4,
  primaryInspectorId: 'inspector-1',
  sampleCount: 12,
});
assert.equal(extra.additionalSampleCount, 4);
assert.throws(() => validateAdditionalInspector({
  additionalInspectorId: 'inspector-1',
  additionalSampleCount: 2,
  primaryInspectorId: 'inspector-1',
  sampleCount: 12,
}));

assert.equal(workOrderMayCloseFromQuality({
  legacyStatus: 'approved',
  linkedPallets: [],
}), true);
assert.equal(workOrderMayCloseFromQuality({
  legacyStatus: 'pending',
  linkedPallets: [
    { inspectionStatus: 'تم الفحص', palletDecision: 'مقبول' },
    { inspectionStatus: 'تم الفحص', palletDecision: 'مقبول' },
  ],
}), true);
assert.equal(workOrderMayCloseFromQuality({
  legacyStatus: 'pending',
  linkedPallets: [{ inspectionStatus: 'تم الفحص', palletDecision: 'مرفوض' }],
}), false);

const shares = scrapCauseShares([
  { reasonLabel: 'خدش', quantity: 1 },
  { reasonLabel: 'كسر', quantity: 3 },
  { reasonLabel: 'خدش', quantity: 1 },
]);
assert.equal(shares[0].reasonLabel, 'كسر');
assert.equal(shares[0].quantity, 3);
assert.equal(shares[0].share, 0.6);
assert.equal(shares[1].quantity, 2);

const flow = buildFlowchartMetrics({
  reportedProductionUnits: 100,
  lines: [{ id: 'a', name: 'أ' }, { id: 'b', name: 'ب' }],
  hourly: [{ lineId: 'a', lineName: 'أ', productName: 'ص', sampleCount: 10, defectCount: 1 }],
  pallets: [{
    lineId: 'b',
    lineName: 'ب',
    productName: 'ص',
    quantityOnPallet: 40,
    inspectedQuantity: 10,
    rejectedQuantity: 4,
    palletDecision: 'مرفوض',
    defects: [{ reasonLabel: 'خدش', count: 4 }],
  }],
});
assert.equal(flow.reportedProductionUnits, 100);
assert.equal(flow.lotUnits, 40);
assert.equal(flow.inspected, 20);
assert.equal(flow.defects, 5);
assert.equal(flow.defectRate, 25);
assert.equal(flow.best?.lineId, 'a');
assert.equal(flow.worst?.lineId, 'b');
assert.equal(flow.pareto[0].count, 4);

assert.throws(() => assertSlotWindow({
  startTime: '09:00',
  endTime: '08:00',
  kind: 'hourly',
  existing: [],
}), /غير صالح/);
assert.throws(() => assertSlotWindow({
  startTime: '08:30',
  endTime: '09:30',
  kind: 'hourly',
  existing: [{ id: '1', kind: 'hourly', startTime: '08:00', endTime: '09:00', isActive: true }],
}), /تتداخل/);
assertSlotWindow({
  startTime: '09:00',
  endTime: '10:00',
  kind: 'hourly',
  existing: [{ id: '1', kind: 'hourly', startTime: '08:00', endTime: '09:00', isActive: true }],
});

console.log('quality aql checks passed');
