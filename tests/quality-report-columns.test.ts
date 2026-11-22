import assert from 'node:assert/strict';
import { qualityReportRecords, reportColumnsFor } from '../modules/quality/domain/qualityReportColumns.ts';

const pallet = {
  id: 'p1',
  date: '2026-10-31',
  lineId: 'line-1',
  lineName: 'خط 1',
  productId: 'product-1',
  productName: 'جهاز',
  productCode: 'A1',
  palletNumber: 4,
  quantityOnPallet: 100,
  inspectedQuantity: 20,
  rejectedQuantity: 2,
  inspectionStatus: 'تم الفحص',
  palletDecision: 'مرفوض',
  inspectorName: 'مراقب',
  defects: [{ reasonLabel: 'كسر', count: 2 }],
};

const records = qualityReportRecords({
  kind: 'daily',
  pallets: [pallet],
  production: [{ lineId: 'line-1', productId: 'product-1', lineName: 'خط 1', productName: 'جهاز', productCode: 'A1', quantityProduced: 12 }],
});

assert.equal(records[0]?.cells.produced, 12);
assert.notEqual(records[0]?.cells.produced, pallet.quantityOnPallet);
assert.equal(records[0]?.cells.inspected, 20);
assert.equal(records[0]?.cells.rejectionRate, '10٪');

const product = qualityReportRecords({
  kind: 'product',
  pallets: [pallet],
  production: [],
});
assert.equal(product[0]?.cells.produced, '—');
assert.equal(product[0]?.cells.inspectedLot, 100);

const columns = reportColumnsFor('waiting', ['date', 'palletNumber']);
assert.deepEqual(columns.map((column) => column.id), ['date', 'palletNumber']);
assert.equal(reportColumnsFor('waiting', []).length, 8);

console.log('quality report columns ok');
