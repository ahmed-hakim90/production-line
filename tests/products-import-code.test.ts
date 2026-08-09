import { describe, expect, it } from './assertHarness.ts';
import * as XLSX from 'xlsx';
import type { FirestoreProduct } from '../types.ts';
import {
  parseProductsFromBuffer,
  toProductDataWithExisting,
} from '../utils/importProducts.ts';

function makeBuffer(rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'المنتجات');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

const existing: FirestoreProduct[] = [
  {
    id: 'p1',
    name: 'خلاط',
    model: 'منزلي',
    code: 'SK-999N',
    barcode: '622000000001',
    openingBalance: 0,
    isManufactured: true,
  },
];

describe('product import single code column', () => {
  it('matches and updates by كود المنتج without rewriting code', () => {
    const result = parseProductsFromBuffer(
      makeBuffer([
        ['اسم المنتج', 'كود المنتج', 'باركود العبوة', 'سعر البيع'],
        ['خلاط محدّث', 'SK-999N', '622000000001', 199],
      ]),
      existing,
    );
    expect(result.updateCount).toBe(1);
    expect(result.rows[0].code).toBe('SK-999N');
    const payload = toProductDataWithExisting(result.rows[0], existing[0]);
    expect(payload.code).toBe('SK-999N');
    expect(payload.name).toBe('خلاط محدّث');
    expect(payload.sellingPrice).toBe(199);
  });

  it('rejects rename via الكود الحالي/الجديد', () => {
    const result = parseProductsFromBuffer(
      makeBuffer([
        ['اسم المنتج', 'الكود الحالي', 'الكود الجديد', 'باركود العبوة'],
        ['خلاط', 'SK-999N', 'SK-NEW', '622000000001'],
      ]),
      existing,
    );
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => /تغيير كود المنتج/.test(e))).toBe(true);
  });
});

console.log('products-import-code.test.ts: ok');
