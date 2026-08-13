import assert from 'node:assert/strict';
import { hideZeroForInput } from '../lib/inputDisplayValue.ts';
import { matchSelectOptionByScan, searchableSelectFilter } from '../lib/searchableSelectFilter.ts';
import { accessoriesForProductCategory } from '../modules/repair/config/repairSettings.ts';
import {
  buildRepairProductCardFields,
  resolveRepairJobPrintProducts,
} from '../modules/repair/lib/repairJobPrint.ts';
import { normalizeCustomerPhoneDigits } from '../modules/repair/utils/customerPhone.ts';
import type { RepairJob, RepairJobProduct } from '../modules/repair/types.ts';
import type { RepairAccessoryCatalogItem } from '../types.ts';

// hideZero must not wipe leading phone zero when used only for type=number (unit helper).
assert.equal(hideZeroForInput(0), '');
assert.equal(hideZeroForInput('0'), '');
assert.equal(hideZeroForInput('01'), '01');
assert.equal(hideZeroForInput('01001234567'), '01001234567');

// Arabic phone digits normalize to ASCII.
assert.equal(normalizeCustomerPhoneDigits('٠١٠٠١٢٣٤٥٦٧'), '01001234567');
assert.equal(normalizeCustomerPhoneDigits('01001234567'), '01001234567');
assert.equal(normalizeCustomerPhoneDigits('abc'), '');

// Searchable select: Arabic digits match Western product codes.
assert.equal(searchableSelectFilter('خلاط (7033) prod-1', '٧٠٣٣'), 1);
assert.equal(searchableSelectFilter('خلاط (7033) prod-1', '7033'), 1);
assert.equal(searchableSelectFilter('موتور (SP-1) 622123 mat-1', '622123'), 1);
assert.equal(searchableSelectFilter('موتور (SP-1) 622123 mat-1', '٦٢٢١٢٣'), 1);

assert.equal(
  matchSelectOptionByScan(
    [
      { value: 'mat-1', scanKeys: ['622123', 'SP-1'] },
      { value: 'mat-2', scanKeys: ['SP-2'] },
    ],
    '622123',
  ),
  'mat-1',
);
assert.equal(
  matchSelectOptionByScan(
    [
      { value: 'mat-1', scanKeys: ['622123', 'SP-1'] },
      { value: 'mat-2', scanKeys: ['SP-2'] },
    ],
    '٦٢٢١٢٣',
  ),
  'mat-1',
);
assert.equal(
  matchSelectOptionByScan(
    [
      { value: 'mat-1', scanKeys: ['SP-1'] },
      { value: 'mat-2', scanKeys: ['SP-1'] },
    ],
    'SP-1',
  ),
  null,
);
assert.equal(
  matchSelectOptionByScan(
    [{ value: 'mat-1', scanKeys: ['622123'] }],
    'موتور',
  ),
  null,
);

// Category-scoped accessories: empty categoryIds = all categories.
const catalog: RepairAccessoryCatalogItem[] = [
  { id: 'charger', label: 'شاحن', enabled: true },
  { id: 'hose', label: 'خرطوم', enabled: true, categoryIds: ['cat-washer'] },
  { id: 'sim', label: 'شريحة', enabled: true, categoryIds: ['cat-phone'] },
  { id: 'disabled', label: 'معطّل', enabled: false, categoryIds: ['cat-phone'] },
];
assert.deepEqual(
  accessoriesForProductCategory(catalog, 'cat-phone').map((a) => a.id),
  ['charger', 'sim'],
);
assert.deepEqual(
  accessoriesForProductCategory(catalog, 'cat-washer').map((a) => a.id),
  ['charger', 'hose'],
);
assert.deepEqual(
  accessoriesForProductCategory(catalog, '').map((a) => a.id),
  ['charger'],
);
assert.deepEqual(
  accessoriesForProductCategory(catalog, 'cat-other').map((a) => a.id),
  ['charger'],
);

// Product card print fields.
const job = {
  tenantId: 't1',
  receiptNo: 'REP-0009',
  branchId: 'b1',
  customerName: 'أحمد',
  customerPhone: '01001234567',
  deviceType: 'منتج',
  deviceBrand: 'Sokany',
  deviceModel: 'SK-1',
  problemDescription: 'لا يعمل',
  accessories: 'كابل',
  status: 'received',
  warranty: 'none',
  partsUsed: [],
  estimatedCost: 0,
  finalCost: 0,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
} as RepairJob;

const product: RepairJobProduct = {
  itemId: 'p1',
  productName: 'خلاط',
  serialNo: 'SN-1',
  diagnosis: 'صوت غريب',
  accessories: 'شاحن، كابل',
};

const card = buildRepairProductCardFields(job, product, 'فرع المعادي');
assert.equal(card.receiptNo, 'REP-0009');
assert.equal(card.customerName, 'أحمد');
assert.equal(card.customerPhone, '01001234567');
assert.equal(card.productName, 'خلاط');
assert.equal(card.serialNo, 'SN-1');
assert.equal(card.diagnosis, 'صوت غريب');
assert.equal(card.accessories, 'شاحن، كابل');
assert.equal(card.branchName, 'فرع المعادي');

assert.equal(resolveRepairJobPrintProducts(job, [product]).length, 1);

console.log('repair-intake-ux.test.ts: ok');
