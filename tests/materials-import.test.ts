import { describe, expect, it } from './assertHarness.ts';
import * as XLSX from 'xlsx';
import type { Material } from '../modules/manufacturing/types';
import {
  parseMaterialsFromBuffer,
  toMaterialCreateData,
  toMaterialUpdateData,
} from '../utils/importMaterials';
import { decideMaterialImportSave } from '../utils/importSaveDecision';

function makeBuffer(rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'المواد التصنيعية');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

const existing: Material[] = [
  {
    id: 'm1',
    code: 'MAT-001',
    name: 'موتور نحاس',
    type: 'raw_material',
    categoryId: 'cat1',
    categoryName: 'كهرباء',
    baseUnit: 'piece',
    purchaseUnit: 'piece',
    conversionRate: 1,
    purchaseCost: 18,
    wastePercent: 2,
    minStock: 10,
    isManufacturedInternally: false,
    linkedCostCenterIds: ['cc1'],
    legacyRawMaterialId: 'legacy-1',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

describe('parseMaterialsFromBuffer', () => {
  it('updates existing by كود المادة and keeps identity fields out of patch', () => {
    const data = makeBuffer([
      ['كود المادة', 'اسم المادة', 'تكلفة الشراء', 'هالك %'],
      ['MAT-001', 'موتور نحاس محدّث', 22, 3],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.validCount).toBe(1);
    expect(result.updateCount).toBe(1);
    const row = result.rows[0];
    expect(row.action).toBe('update');
    expect(row.matchedId).toBe('m1');
    expect(row.code).toBe('MAT-001');
    expect(row.name).toBe('موتور نحاس محدّث');
    expect(row.purchaseCost).toBe(22);

    const patch = toMaterialUpdateData(row, existing[0]);
    expect(patch.name).toBe('موتور نحاس محدّث');
    expect(patch.purchaseCost).toBe(22);
    expect(patch.wastePercent).toBe(3);
    expect(patch.code).toBeUndefined();
    expect(patch.type).toBeUndefined();
    expect(patch.linkedCostCenterIds).toBeUndefined();
    expect(patch.legacyRawMaterialId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patch, 'id')).toBe(false);
  });

  it('rejects rename attempts via الكود الحالي/الجديد', () => {
    const data = makeBuffer([
      ['الكود الحالي', 'الكود الجديد', 'اسم المادة'],
      ['MAT-001', 'MAT-001B', 'موتور نحاس'],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => /تغيير كود المادة/.test(e))).toBe(true);
  });

  it('accepts legacy current=new columns as a stable round-trip', () => {
    const data = makeBuffer([
      ['الكود الحالي', 'الكود الجديد', 'تكلفة الشراء'],
      ['MAT-001', 'MAT-001', 19],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.updateCount).toBe(1);
    expect(result.rows[0].matchedId).toBe('m1');
    expect(result.rows[0].code).toBe('MAT-001');
    const patch = toMaterialUpdateData(result.rows[0], existing[0]);
    expect(patch.code).toBeUndefined();
    expect(patch.purchaseCost).toBe(19);
  });

  it('creates new material when code is unknown', () => {
    const data = makeBuffer([
      ['مصدر المادة', 'كود المادة', 'اسم المادة', 'النوع', 'الوحدة الأساسية'],
      ['شراء خارجي', 'MAT-999', 'مادة جديدة', 'نصف مصنع', 'كجم'],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.newCount).toBe(1);
    expect(result.rows[0].type).toBe('semi_finished');
    expect(result.rows[0].baseUnit).toBe('kg');
  });

  it('requires an explicit source when creating a material', () => {
    const data = makeBuffer([
      ['كود المادة', 'اسم المادة', 'النوع', 'الوحدة الأساسية'],
      ['MAT-998', 'مادة بلا مصدر', 'مادة خام', 'كجم'],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => /مصدر المادة مطلوب/.test(e))).toBe(true);
  });

  it('clears purchasing fields for internally manufactured materials', () => {
    const data = makeBuffer([
      [
        'مصدر المادة',
        'كود المادة',
        'اسم المادة',
        'النوع',
        'الوحدة الأساسية',
        'وحدة الشراء',
        'معامل التحويل',
        'تكلفة الشراء',
        'هالك %',
      ],
      ['تُصنع داخلياً', 'SF-100', 'قطعة حقن', 'نصف مصنع', 'قطعة', 'كجم', 100, 75, 4],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].isManufacturedInternally).toBe(true);

    const payload = toMaterialCreateData(result.rows[0]);
    expect(payload.purchaseUnit).toBeUndefined();
    expect(payload.conversionRate).toBe(1);
    expect(payload.purchaseCost).toBe(0);
    expect(payload.wastePercent).toBe(0);
  });

  it('omitted columns do not overwrite on merge', () => {
    const data = makeBuffer([
      ['كود المادة', 'تكلفة الشراء'],
      ['MAT-001', 30],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    const patch = toMaterialUpdateData(result.rows[0], existing[0]);
    expect(patch.purchaseCost).toBe(30);
    expect(patch.name).toBeUndefined();
    expect(patch.isManufacturedInternally).toBeUndefined();
    expect(patch.isActive).toBeUndefined();
    expect(patch.availableForSpareParts).toBeUndefined();
  });

  it('imports تظهر في قطع الغيار and patches only when provided', () => {
    const data = makeBuffer([
      ['كود المادة', 'تظهر في قطع الغيار'],
      ['MAT-001', 'لا'],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].availableForSpareParts).toBe(false);
    const patch = toMaterialUpdateData(result.rows[0], existing[0]);
    expect(patch.availableForSpareParts).toBe(false);
  });

  it('rejects unknown material code when using legacy current-code column alone', () => {
    const data = makeBuffer([
      ['الكود الحالي', 'اسم المادة'],
      ['NOPE', 'x'],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => /غير موجود/.test(e))).toBe(true);
  });

  it('marks identical re-upload rows as skip (no write)', () => {
    const data = makeBuffer([
      ['كود المادة', 'اسم المادة', 'تكلفة الشراء', 'هالك %'],
      ['MAT-001', 'موتور نحاس', 18, 2],
    ]);
    const result = parseMaterialsFromBuffer(data, existing);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].action).toBe('update');
    expect(result.rows[0].changes || []).toEqual([]);
    expect(decideMaterialImportSave(result.rows[0])).toBe('skip');
  });
});
