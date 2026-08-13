import assert from 'node:assert/strict';
import { materialScanKeys } from '../modules/manufacturing/lib/materialScanKeys';
import { buildMaterialVoucherPicker, buildCodeVoucherPicker } from '../modules/inventory/lib/materialVoucherPicker';
import { findItemOptionByCode } from '../modules/inventory/utils/transferFormShared';
import { matchSelectOptionByScan, searchableSelectFilter } from '../lib/searchableSelectFilter';
import type { Material } from '../modules/manufacturing/types';

assert.deepEqual(
  materialScanKeys({ barcode: ' 622123 ', code: 'SP-1' }),
  ['622123', 'SP-1'],
);
assert.deepEqual(materialScanKeys({ code: 'SP-1', barcode: 'SP-1' }), ['SP-1']);
assert.deepEqual(materialScanKeys({ code: '', barcode: null }), []);
assert.deepEqual(
  materialScanKeys({ code: 'SP-1', scanKeys: ['GUN-9', 'SP-1'] }),
  ['SP-1', 'GUN-9'],
);

const options = [
  {
    value: 'mat-1',
    label: 'موتور (SP-1) — تكلفة 12',
    keywords: '622123 SP-1',
    scanKeys: materialScanKeys({ barcode: '622123', code: 'SP-1' }),
  },
  {
    value: 'mat-2',
    label: 'مقاومة (SP-2)',
    keywords: 'SP-2',
    scanKeys: materialScanKeys({ code: 'SP-2' }),
  },
];

assert.equal(searchableSelectFilter(`${options[0]!.label} ${options[0]!.keywords}`, 'موتور'), 1);
assert.equal(searchableSelectFilter(`${options[0]!.label} ${options[0]!.keywords}`, '622123'), 1);
assert.equal(matchSelectOptionByScan(options, '622123'), 'mat-1');
assert.equal(matchSelectOptionByScan(options, 'SP-2'), 'mat-2');
assert.equal(matchSelectOptionByScan(options, 'unknown'), null);

const picker = buildMaterialVoucherPicker([
  {
    id: 'mat-1',
    name: 'موتور',
    code: 'SP-1',
    barcode: '622123',
    type: 'raw_material',
    baseUnit: 'piece',
    isActive: true,
    createdAt: '2026-01-01',
  } satisfies Material,
]);
assert.equal(picker.options[0]?.searchText?.includes('622123'), true);
assert.equal(findItemOptionByCode(picker.catalog, '622123')?.id, 'mat-1');
assert.equal(findItemOptionByCode(picker.catalog, '٦٢٢١٢٣')?.id, 'mat-1');

const codePicker = buildCodeVoucherPicker([
  {
    value: 'prod-1',
    label: 'شواية',
    name: 'شواية',
    code: 'SK-1',
    barcode: '622000',
    scanKeys: ['SKU-NORM'],
    stockItemType: 'finished_good',
  },
]);
assert.equal(findItemOptionByCode(codePicker.catalog, 'SKU-NORM')?.id, 'prod-1');
assert.equal(findItemOptionByCode(codePicker.catalog, '622000')?.id, 'prod-1');

console.log('material-scan-keys.test.ts: ok');

