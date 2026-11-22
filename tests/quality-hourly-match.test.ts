import assert from 'node:assert/strict';
import { filterLinePulls, hourlyDefectRate, hourlyDefectText, hourlyInspectorSummary, hourlyProductionMatch, hourlySampleTotals, linePullDailySummary, linePullExportRows, linePullLineSummary, linePullPeriodBoards } from '../modules/quality/domain/samples.ts';

const totals = hourlySampleTotals([
  { sampleCount: 10, defectCount: 1 },
  { sampleCount: 10, defectCount: 1 },
]);
assert.equal(totals.pulls, 2);
assert.equal(totals.samples, 20);
assert.equal(totals.defects, 2);
assert.equal(totals.defectRate, 10);
assert.equal(hourlyDefectRate(8, 1), 12.5);
assert.equal(hourlyDefectText([{ reasonLabel: 'كسر', count: 1 }, { reasonLabel: 'خدش', count: 0 }]), 'كسر: 1');
assert.equal(hourlyDefectText([]), 'لا توجد عيوب');

const match = hourlyProductionMatch({
  production: [{ lineId: 'l1', productId: 'p1', lineName: 'خط', productName: 'جهاز', quantityProduced: 100 }],
  samples: [
    { lineId: 'l1', productId: 'p1', sampleCount: 8, defectCount: 2 },
    { lineId: 'other', productId: 'p1', sampleCount: 5, defectCount: 5 },
  ],
});
assert.equal(match.length, 1);
assert.equal(match[0]?.produced, 100);
assert.equal(match[0]?.samples, 8);
assert.equal(match[0]?.defects, 2);
assert.equal(match[0]?.estimatedQualityRate, '98٪');
const inspectorBoards = hourlyInspectorSummary([
  { slotKey: '09', slotName: '09:00–10:00', inspectorName: 'مراقب', productName: 'ب', sampleCount: 4, defectCount: 1, defects: [{ reasonLabel: 'كسر', count: 1, notes: 'حافة' }] },
  { slotKey: '08', slotName: '08:00–09:00', inspectorName: 'مراقب', productName: 'ب', sampleCount: 4, defectCount: 0 },
  { slotKey: '08', slotName: '08:00–09:00', inspectorName: 'مراقب', productName: 'أ', sampleCount: 6, defectCount: 0 },
]);
assert.equal(inspectorBoards[0]?.label, '08:00–09:00');
assert.equal(inspectorBoards[0]?.inspectors[0]?.products[0]?.productName, 'أ');
assert.equal(inspectorBoards[0]?.inspectors[0]?.products[0]?.inspectorTotal, 10);
assert.equal(inspectorBoards[1]?.inspectors[0]?.products[0]?.problems[0], 'ب: كسر (1) - حافة');

const summary = linePullLineSummary([{
  lineId: 'l1',
  lineName: 'خط 1',
  productName: 'جهاز',
  stationName: 'لحام',
  inspectorName: 'مراقب',
  additionalInspectorName: 'مساعد',
  sampleCount: 10,
  additionalSampleCount: 4,
  defectCount: 2,
  status: 'completed',
  palletRejected: true,
  defects: [{ reasonLabel: 'كسر', count: 2, notes: 'حافة' }],
}]);
assert.equal(summary[0]?.stations, 'لحام');
assert.equal(summary[0]?.inspectors, 'مراقب (6 عينة)، مساعد (4 عينة)');
assert.equal(summary[0]?.palletStatus, 'مرفوضة (1)');
assert.equal(summary[0]?.problems, 'كسر (2)، حافة');

const periods = linePullPeriodBoards([
  {
    ...{
      lineId: 'l1',
      lineName: 'خط 1',
      productName: 'جهاز',
      stationName: 'لحام',
      inspectorName: 'مراقب',
      sampleCount: 10,
      additionalSampleCount: 0,
      defectCount: 0,
      status: 'completed' as const,
      palletRejected: false,
    },
    slotKey: '08',
    startTime: '08:00',
    endTime: '09:00',
  },
], [{ slotKey: '09', lineId: 'l2', lineName: 'خط 2', isStopped: true, noSampleReason: 'عطل' }]);
assert.equal(periods.length, 2);
assert.equal(periods[0]?.label, '08:00–09:00');
assert.equal(periods[0]?.lines[0]?.pullStatus, 'تم الفحص');
assert.equal(periods[1]?.lines[0]?.lineStatus, 'متوقف');
assert.equal(periods[1]?.lines[0]?.noSampleReason, 'عطل');
const exported = linePullExportRows('=2026-11-01', periods);
assert.equal(exported.length, 2);
assert.equal(exported[0]?.['فترة السحب'], '08:00–09:00');
assert.equal(exported[1]?.['سبب عدم السحب'], 'عطل');
assert.equal(exported[0]?.['التاريخ'], "'=2026-11-01");
const filtered = filterLinePulls([
  { slotKey: '08', lineId: 'l1', status: 'pending' },
  { slotKey: '09', lineId: 'l1', status: 'completed' },
], { slotKey: '08', status: 'pending' });
assert.equal(filtered.length, 1);
assert.equal(filtered[0]?.slotKey, '08');
const daily = linePullDailySummary([
  {
    slotKey: '08',
    startTime: '08:00',
    endTime: '09:00',
    lineId: 'l1',
    lineName: 'خط 1',
    productName: 'جهاز',
    stationName: 'لحام',
    inspectorName: 'مراقب',
    additionalInspectorName: 'مساعد',
    sampleCount: 10,
    additionalSampleCount: 4,
    defectCount: 2,
    status: 'completed',
    palletRejected: true,
    defects: [{ reasonLabel: 'كسر', count: 2 }],
  },
  {
    slotKey: '09',
    startTime: '09:00',
    endTime: '10:00',
    lineId: 'l1',
    lineName: 'خط 1',
    productName: 'جهاز',
    stationName: 'لحام',
    inspectorName: 'مراقب',
    sampleCount: 5,
    additionalSampleCount: 0,
    defectCount: 0,
    status: 'pending',
  },
]);
assert.equal(daily.periods[0]?.label, '08:00–09:00');
assert.equal(daily.periods[0]?.inspectors[0]?.name, 'مراقب');
assert.equal(daily.periods[0]?.inspectors[0]?.samples, 6);
assert.equal(daily.periods[0]?.inspectors[0]?.reasons, 'كسر (2)');
assert.equal(daily.periods[0]?.inspectors[1]?.samples, 4);
assert.equal(daily.periods[0]?.inspectors[1]?.reasons, 'لا توجد عيوب');
assert.equal(daily.inspectors.find((row) => row.name === 'مراقب')?.samples, 11);
assert.equal(daily.stations[0]?.samples, 15);
assert.equal(daily.lines[0]?.defects, 2);
const additive = linePullLineSummary([{
  lineId: 'l1',
  lineName: 'خط 1',
  productName: 'جهاز',
  stationName: 'لحام',
  inspectorName: 'مراقب',
  additionalInspectorName: 'مساعد',
  sampleCount: 10,
  additionalSampleCount: 4,
  sampleCountSemantics: 'base_plus_additional',
  defectCount: 1,
  status: 'completed',
  palletRejected: false,
}]);
assert.equal(additive[0]?.samples, 14);
assert.equal(additive[0]?.inspectors, 'مراقب (10 عينة)، مساعد (4 عينة)');

console.log('hourly match ok');
