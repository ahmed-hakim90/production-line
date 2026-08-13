import { describe, expect, it } from './assertHarness.ts';
import {
  findItemOptionByCode,
  buildTransferPrintDataPayload,
  createTransferLine,
} from '../modules/inventory/utils/transferFormShared.ts';

describe('findItemOptionByCode', () => {
  const options = [
    { id: '1', name: 'صنف أ', code: 'SP-001', barcode: '6221234567890', minStock: 0 },
    { id: '2', name: 'صنف ب', code: 'SP-002', minStock: 0 },
  ];

  it('matches catalog code case-insensitively', () => {
    expect(findItemOptionByCode(options, 'sp-001')?.id).toBe('1');
  });

  it('matches barcode when present', () => {
    expect(findItemOptionByCode(options, '6221234567890')?.id).toBe('1');
  });

  it('matches Arabic digits in a scanned barcode', () => {
    expect(findItemOptionByCode(options, '٦٢٢١٢٣٤٥٦٧٨٩٠')?.id).toBe('1');
  });

  it('matches extra scanKeys aliases', () => {
    const withAlias = [
      { id: '3', name: 'صنف ج', code: 'SP-003', minStock: 0, scanKeys: ['SKU-J'] },
    ];
    expect(findItemOptionByCode(withAlias, 'sku-j')?.id).toBe('3');
  });

  it('returns undefined when no exact match', () => {
    expect(findItemOptionByCode(options, 'صنف أ')).toBeUndefined();
  });
});

describe('buildTransferPrintDataPayload', () => {
  it('passes documentType and locationCode into print payload', () => {
    const line = { ...createTransferLine({ locationId: 'loc1' }), itemId: '1', quantity: 2 };
    const payload = buildTransferPrintDataPayload({
      resolvedReferenceNo: 'INV-001',
      txId: null,
      transferItems: [line],
      itemType: 'raw_material',
      getItemById: (id) =>
        id === '1' ? { id: '1', name: 'قطعة', code: 'P1', minStock: 0 } : undefined,
      qtyInPieces: () => 2,
      fromWarehouseName: 'مركزي',
      effectiveWarehouseId: 'w1',
      toWarehouseName: 'مركز',
      toWarehouseId: 'w2',
      transferDisplayUnit: 'piece',
      createdBy: 'tester',
      documentType: 'إذن إضافة قطع غيار',
      resolveLocationCode: (id) => (id === 'loc1' ? 'A-01' : undefined),
    });
    expect(payload.documentType).toBe('إذن إضافة قطع غيار');
    expect(payload.items?.[0]?.locationCode).toBe('A-01');
  });
});

console.log('transfer-form-shared-voucher.test.ts: ok');
