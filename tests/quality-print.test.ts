import assert from 'node:assert/strict';
import { checkPermission } from '../utils/permissions.ts';
import {
  SECOND_SORT_PAPER,
  filterQualityPallets,
  formatQualityShare,
  hourlyPrintRows,
  linePullResultLabel,
  periodStatusPrintRows,
  qualityRecordPrintAllowed,
  qualityReportTotals,
  rowsMatchingTenant,
  scrapPrintModel,
  scrapReasonCode,
  secondSortPageStyle,
} from '../modules/quality/print/qualityPrintModel.ts';
import type { QualityHourlySample, QualityPallet } from '../modules/quality/model.ts';

const hourly = (slotName: string): QualityHourlySample => ({
  id: slotName,
  tenantId: 'tenant-a',
  moduleSource: 'qms',
  date: '2026-10-28',
  slotKey: slotName,
  slotName,
  lineId: 'line-1',
  lineName: 'خط 1',
  productId: 'product-1',
  productName: 'منتج',
  shiftId: 'shift-1',
  shiftName: 'صباحية',
  inspectorEmployeeId: 'emp-1',
  inspectorName: 'مراقب',
  sampleCount: 5,
  defectCount: 1,
  decision: 'مرفوض',
  sector: 'home',
  createdByUid: 'u',
  createdByName: 'u',
  defects: [{ tenantId: 'tenant-a', reasonId: 'r1', reasonCode: 'FIN-SCRATCH', reasonLabel: 'خدش', count: 1 }],
});

const printedHourly = hourlyPrintRows([hourly('08:00–09:00')]);
assert.equal(printedHourly.length, 1);
assert.equal(printedHourly[0].slotName, '08:00–09:00');
assert.equal(printedHourly[0].defects[0].code, 'FIN-SCRATCH');
assert.equal(hourlyPrintRows([]).length, 0);

assert.equal(linePullResultLabel({ status: 'pending' }), 'قيد الفحص');
assert.equal(linePullResultLabel({ status: 'completed', palletRejected: true }), 'مرفوضة');

const periods = periodStatusPrintRows([
  {
    id: 'p1',
    tenantId: 'tenant-a',
    date: '2026-10-28',
    slotKey: '08:00',
    lineId: 'line-1',
    isStopped: false,
    noSampleReason: '',
    updatedByUid: 'u',
    updatedByName: 'u',
  },
  {
    id: 'p2',
    tenantId: 'tenant-a',
    date: '2026-10-28',
    slotKey: '09:00',
    lineId: 'line-1',
    isStopped: true,
    noSampleReason: 'عطل',
    updatedByUid: 'u',
    updatedByName: 'u',
  },
], { 'line-1': 'خط 1' });
assert.equal(periods.length, 1);
assert.equal(periods[0].lineName, 'خط 1');
assert.equal(periods[0].reason, 'عطل');

const scrap = scrapPrintModel([
  { id: '1', reportDate: '2026-10-28', lineName: 'خط 1', productName: 'منتج', reasonLabel: 'خدش', reasonCode: 'FIN-SCRATCH', quantity: 1, slotName: '' },
  { id: '2', reportDate: '2026-10-28', lineName: 'خط 1', productName: 'منتج', reasonLabel: 'خدش', reasonCode: 'FIN-SCRATCH', quantity: 3, slotName: '' },
]);
assert.equal(scrap.total, 4);
assert.equal(scrap.shares[0].share, 1);
assert.match(formatQualityShare(scrap.shares[0].share), /٪/);
assert.notEqual(formatQualityShare(1), formatQualityShare(0));
assert.equal(scrapPrintModel([]).rows.length, 0);
assert.equal(scrapReasonCode('reason-1', [{ id: 'reason-1', code: 'FIN-SCRATCH' }]), 'FIN-SCRATCH');
assert.equal(scrapReasonCode('missing', [{ id: 'reason-1', code: 'FIN-SCRATCH' }]), '');

const pallet = {
  id: 'pallet-1',
  tenantId: 'tenant-a',
  lineId: 'line-1',
  productId: 'product-1',
  workOrderId: 'wo-1',
  workOrderNumber: 'WO-1',
  inspectionStatus: 'تم الفحص',
  quantityOnPallet: 70,
  inspectedQuantity: 13,
  rejectedQuantity: 1,
  defects: [{ tenantId: 'tenant-a', reasonId: 'reason-1', reasonCode: 'FIN-SCRATCH', reasonLabel: 'خدش', count: 1 }],
} as QualityPallet;
const filtered = filterQualityPallets([pallet, { ...pallet, id: 'other', tenantId: 'tenant-b', lineId: 'line-2' }], {
  lineId: 'line-1',
  reasonId: 'reason-1',
});
assert.equal(filtered.length, 1);
assert.equal(filterQualityPallets([pallet], { workOrderId: 'WO-1' })[0].id, 'pallet-1');

const totals = qualityReportTotals({
  pallets: [pallet],
  reportedProduction: 13063,
  scrapQuantity: 4,
});
assert.equal(totals.reportedProduction, 13063);
assert.equal(totals.lotUnits, 70);
assert.equal(totals.inspected, 13);
assert.equal(totals.defects, 1);
assert.equal(totals.scrap, 4);
assert.equal('combined' in totals, false);

assert.deepEqual(rowsMatchingTenant([
  { tenantId: 'tenant-a', id: '1' },
  { tenantId: 'tenant-b', id: '2' },
], 'tenant-a').map((row) => row.id), ['1']);

assert.equal(qualityRecordPrintAllowed({ 'quality.print': true }, 'quality.pallets.view'), false);
assert.equal(qualityRecordPrintAllowed({ 'quality.pallets.view': true }, 'quality.pallets.view'), false);
assert.equal(qualityRecordPrintAllowed({
  'quality.print': true,
  'quality.pallets.view': true,
}, 'quality.pallets.view'), true);
assert.equal(qualityRecordPrintAllowed({
  'quality.print': true,
  'quality.view': true,
}, 'quality.samples.view'), true);
assert.equal(checkPermission({ 'quality.print': true }, 'quality.pallets.view'), false);

assert.equal(SECOND_SORT_PAPER.width, '210mm');
assert.equal(SECOND_SORT_PAPER.height, '148mm');
assert.match(secondSortPageStyle(), /A5 landscape/);
assert.doesNotMatch(secondSortPageStyle(), /size: A4/);

console.log('quality print model passed');
