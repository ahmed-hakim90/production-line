import { describe, expect, it } from './assertHarness.ts';
import * as XLSX from 'xlsx';
import { parseInventoryInByCodeFromBuffer } from '../utils/importInventoryInByCode';

function makeBuffer(rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'إضافة مواد خام');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

describe('parseInventoryInByCodeFromBuffer with location', () => {
  const items = [
    { id: 'm1', code: 'RM-0001', name: 'خامة 1' },
    { id: 'm2', code: 'RM-0002', name: 'خامة 2' },
  ];
  const locations = [
    { id: 'loc1', code: '20-01-0', warehouseId: 'wh1', isActive: true },
  ];

  it('parses optional location code', () => {
    const result = parseInventoryInByCodeFromBuffer(
      makeBuffer([
        ['كود المادة الخام', 'الكمية', 'كود اللوكيشن'],
        ['RM-0001', 300, '20-01-0'],
        ['RM-0002', 40, ''],
      ]),
      items,
      { itemLabel: 'المادة الخام', locations },
    );

    expect(result.validCount).toBe(2);
    expect(result.rows[0].locationId).toBe('loc1');
    expect(result.rows[0].locationCode).toBe('20-01-0');
    expect(result.rows[1].locationId).toBeUndefined();
  });

  it('errors on unknown location code', () => {
    const result = parseInventoryInByCodeFromBuffer(
      makeBuffer([
        ['كود المادة الخام', 'الكمية', 'كود اللوكيشن'],
        ['RM-0001', 10, '99-99-9'],
      ]),
      items,
      { locations },
    );

    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('كود اللوكيشن غير موجود'))).toBe(true);
  });
});
