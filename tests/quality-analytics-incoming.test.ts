import assert from 'node:assert/strict';
import { buildQualityAnalytics, csvCell, inspectorPerformanceRows, monthBounds, rejectionReasonRows } from '../modules/quality/domain/qualityAnalytics';
import { buildScrapBoard } from '../modules/quality/domain/scrapAnalysis';
import { hourlyScrapQuantity, normalizeHourlyScrapPeriods } from '../modules/quality/domain/hourlyScrap';
import {
  cartonRowsFromSheet,
  excelSerialToIsoDate,
  normalizeCartonReceipt,
  normalizePlasticReceipt,
  plasticRowsFromSheet,
  prepareCartonImport,
  summarizeCartons,
} from '../modules/quality/domain/incomingReceipt';
const base = {
  id: 'a',
  date: '2026-10-02',
  lineId: 'l1',
  lineName: 'خط 1',
  productId: 'p1',
  productName: 'منتج',
  productCode: 'P',
  inspected: 40,
  defects: [{ reasonLabel: 'خدش', count: 2 }],
};

const board = buildQualityAnalytics([
  base,
  { ...base, id: 'b', lineId: 'l2', lineName: 'خط 2', inspected: 40, defects: [{ reasonLabel: 'خدش', count: 8 }] },
  { ...base, id: 'c', date: '2026-09-30', inspected: 100, defects: [] },
], { month: '2026-10', lineId: '', productId: '', reasonLabel: '' });

assert.equal(board.range.from, '2026-10-01');
assert.equal(board.range.to, '2026-10-31');
assert.equal(board.totals.inspections, 2);
assert.equal(board.totals.defects, 10);
assert.equal(board.bestLines[0]?.lineName, 'خط 1');
assert.equal(board.pareto[0]?.share, 100);
assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
assert.throws(() => buildQualityAnalytics([], { from: '2026-10-01', to: '2026-11-05' }), /31/);
assert.equal(csvCell('=1+1'), `"'=1+1"`);

const scrap = buildScrapBoard({
  scrap: [{
    lineName: 'خط 1',
    productName: 'منتج',
    reasonLabel: 'جدول ساعي',
    quantity: 99,
    periods: [
      { slotName: '08-09', reasonId: 'r1', reasonLabel: 'كسر', quantity: 2 },
      { slotName: '09-10', reasonId: 'r2', reasonLabel: 'نقص', quantity: 3 },
    ],
  }],
  handovers: [{ productName: 'منتج', quantity: 10, discountPercent: 20, reasonName: 'لون', problem: '' }],
  returns: [{ productName: 'منتج', notes: 'راجع', quantity: 4 }],
});
assert.equal(scrap.scrapQuantity, 5);
assert.equal(scrap.byReason[0]?.label, 'نقص');
assert.equal(scrap.averageDiscount, 20);
assert.equal(scrap.returnQuantity, 4);

const periods = normalizeHourlyScrapPeriods([
  { slotName: '08-09', reasonId: 'r', reasonLabel: 'كسر', quantity: 0 },
  { slotName: '09-10', reasonId: 'r', reasonLabel: 'كسر', quantity: 4 },
]);
assert.equal(hourlyScrapQuantity(periods), 4);
assert.throws(() => normalizeHourlyScrapPeriods([]), /فترة/);

assert.equal(excelSerialToIsoDate(25569), '1970-01-01');
assert.throws(() => normalizeCartonReceipt({
  supplier: 'مورد',
  receivedDate: '2026-10-01',
  totalQuantity: 10,
  totalItems: 5,
  acceptedItems: 2,
  rejectedItems: 2,
}), /إجمالي الأصناف/);

const imported = cartonRowsFromSheet([{
  'المورد': 'مورد',
  'تاريخ الاستلام': 25569,
  'رقم الشحنة': 'S1',
  'إجمالي الكمية': 10,
  'رقم إذن التسليم': 'N1',
  'إجمالي الأصناف': 4,
  'المقبول': 3,
  'المرفوض': 1,
}]);
const prepared = prepareCartonImport([
  ...imported,
  { ...imported[0], deliveryNoteNumber: 'N2' },
], []);
assert.equal(prepared[0]?.shipmentCount, 1);
assert.equal(prepared[1]?.shipmentCount, 0);
assert.throws(() => prepareCartonImport([imported[0], imported[0]], []), /مكرر/);

assert.throws(() => normalizePlasticReceipt({
  supplier: 'مورد',
  receivedDate: '2026-10-01',
  productName: 'غطاء',
  quantity: 5,
  inspectedSamples: 4,
  rejectedSamples: 1,
  reasonIds: [],
  finalDecision: 'مقبول',
}), /سبب رفض/);
assert.equal(normalizePlasticReceipt({
  supplier: 'مورد',
  receivedDate: '2026-10-01',
  productName: 'غطاء',
  quantity: 5,
  inspectedSamples: 4,
  rejectedSamples: 0,
  finalDecision: 'مقبول بنسبة',
  acceptedPercentage: 80,
}).acceptedPercentage, 80);

const plastic = plasticRowsFromSheet([{
  'التاريخ': '2026-10-02',
  'اسم المورد': 'مورد',
  'اسم الصنف': 'غطاء',
  'الكمية': 3,
  'العينات المفحوصة': 2,
  'العينات المرفوضة': 1,
  'أسباب الرفض': 'Flash / Burrs',
  'القرار النهائي': 'مرفوض',
}], {
  items: [{ id: 'item', name: 'غطاء', isActive: true }],
  reasons: [{ id: 'reason', name: 'Flash / Burrs', isActive: true }],
});
assert.equal(plastic[0]?.reasonIds[0], 'reason');
assert.equal(summarizeCartons(prepared).shipments, 1);
assert.equal(rejectionReasonRows([{ lineName: 'خط', productName: 'منتج', defects: [{ reasonLabel: 'خدش', count: 2 }] }])[0]?.defects, 2);
assert.equal(inspectorPerformanceRows([{ inspectorName: 'مراقب', inspectedQuantity: 10, rejectedQuantity: 1, palletDecision: 'مقبول' }])[0]?.rate, 10);

console.log('quality analytics and incoming passed');
