import assert from 'node:assert/strict';
import {
  namedCatalogKey,
  normalizeNamedCatalogLabel,
  normalizeSecondSortReturn,
} from '../modules/quality/domain/namedCatalog.ts';

assert.equal(namedCatalogKey('خدش'), namedCatalogKey('خدش'));
assert.equal(namedCatalogKey('Flash'), namedCatalogKey('flash'));
assert.throws(() => normalizeNamedCatalogLabel('   ', 'اكتب سبب الهالك.'), /اكتب سبب الهالك/);
assert.throws(() => normalizeNamedCatalogLabel('س'.repeat(121), 'اكتب سبب الهالك.'), /120/);
assert.equal(normalizeNamedCatalogLabel('  خدش   تشطيب  ', 'اكتب سبب الهالك.'), 'خدش تشطيب');

const report = normalizeSecondSortReturn({
  reportDate: '2026-10-31',
  productId: 'product-1',
  productName: 'غسالة',
  quantity: '4',
  notes: '  إرجاع سليم  ',
  signatures: [{ title: 'مشرف', name: 'علي' }, { title: '', name: '' }],
});
assert.equal(report.quantity, 4);
assert.equal(report.notes, 'إرجاع سليم');
assert.equal(report.signatures.length, 1);

assert.throws(() => normalizeSecondSortReturn({
  reportDate: '31-10-2026',
  productId: 'product-1',
  productName: 'غسالة',
  quantity: 1,
  notes: '',
  signatures: [],
}), /تاريخ التقرير غير صالح/);

assert.throws(() => normalizeSecondSortReturn({
  reportDate: '2026-10-31',
  productId: 'product-1',
  productName: 'غسالة',
  quantity: 1.5,
  notes: '',
  signatures: [],
}), /عددًا صحيحًا غير سالب/);

console.log('quality named catalog passed');
