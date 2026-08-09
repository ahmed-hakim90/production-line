import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { parseRepairPartsPricingBuffer } from '../modules/repair/lib/repairPartsPricingSheet';
import type { Material } from '../modules/manufacturing/types';

const materials: Material[] = [
  {
    id: 'material-1',
    code: 'MAT-001',
    name: 'قطعة أولى',
    type: 'raw_material',
    categoryName: 'قطع غيار',
    baseUnit: 'piece',
    defaultSalePrice: 100,
    traderSalePrice: 80,
    purchaseCost: 50,
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'material-2',
    code: 'MAT-002',
    name: 'قطعة ثانية',
    type: 'raw_material',
    baseUnit: 'piece',
    defaultSalePrice: 20,
    traderSalePrice: 15,
    purchaseCost: 10,
    isActive: true,
    createdAt: '2026-01-01',
  },
];

function workbookBuffer(rows: Array<Record<string, unknown>>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'تسعير قطع الغيار');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('repair parts pricing Excel import', () => {
  it('matches by business code without requiring material uid', () => {
    const result = parseRepairPartsPricingBuffer(workbookBuffer([{
      الكود: 'mat-001',
      'سعر المستهلك': 125.5,
      'سعر التاجر': '',
      'سعر التكلفة': 0,
    }]), materials);

    assert.deepEqual(result.errors, []);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].materialId, 'material-1');
    assert.deepEqual(result.changes[0].current, { consumer: 100, trader: 80, cost: 50 });
    assert.deepEqual(result.changes[0].next, { consumer: 125.5, trader: 80, cost: 0 });
  });

  it('still accepts legacy sheets that include معرف المادة', () => {
    const result = parseRepairPartsPricingBuffer(workbookBuffer([{
      'معرف المادة': 'material-1',
      الكود: 'MAT-001',
      'سعر المستهلك': 110,
    }]), materials);

    assert.deepEqual(result.errors, []);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].next.consumer, 110);
  });

  it('rejects duplicate rows and invalid prices', () => {
    const result = parseRepairPartsPricingBuffer(workbookBuffer([
      {
        الكود: 'MAT-002',
        'سعر المستهلك': -1,
      },
      {
        الكود: 'MAT-002',
        'سعر المستهلك': 30,
      },
    ]), materials);

    assert.equal(result.changes.length, 0);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /سعر المستهلك/);
    assert.match(result.errors[1], /مكررة/);
  });

  it('rejects unknown codes and legacy id/code mismatches', () => {
    const result = parseRepairPartsPricingBuffer(workbookBuffer([
      {
        'معرف المادة': 'material-1',
        الكود: 'MAT-002',
        'سعر المستهلك': 30,
      },
      {
        الكود: 'MAT-999',
        'سعر المستهلك': 30,
      },
    ]), materials);

    assert.equal(result.changes.length, 0);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /معرف المادة لا يطابق|الكود لا يطابق/);
    assert.match(result.errors[1], /لم يتم العثور/);
  });
});
