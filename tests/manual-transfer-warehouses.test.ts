import assert from 'node:assert/strict';
import {
  filterManualTransferWarehouses,
  isEligibleManualTransferWarehouse,
  isRepairSystemWarehouseRole,
  isSparePartsTransferWarehouseRole,
} from '../modules/inventory/lib/manualTransferWarehouses.ts';
import {
  buildTransferRequestLines,
  createTransferLine,
  type TransferFormLine,
  type TransferItemOption,
} from '../modules/inventory/utils/transferFormShared.ts';

function run() {
  assert.equal(isRepairSystemWarehouseRole('repair_customer_custody'), true);
  assert.equal(isRepairSystemWarehouseRole('repair_unrepairable'), true);
  assert.equal(isRepairSystemWarehouseRole('maintenance_center'), false);
  assert.equal(isSparePartsTransferWarehouseRole('spare_parts_central'), true);
  assert.equal(isSparePartsTransferWarehouseRole('maintenance_center'), true);
  assert.equal(isSparePartsTransferWarehouseRole('general'), false);

  assert.equal(
    isEligibleManualTransferWarehouse({ warehouseRole: 'repair_customer_custody' }),
    false,
  );
  assert.equal(
    isEligibleManualTransferWarehouse({ warehouseRole: 'repair_unrepairable' }),
    false,
  );
  assert.equal(
    isEligibleManualTransferWarehouse(
      { warehouseRole: 'final_product' },
      { sparePartsOnly: true },
    ),
    false,
  );
  assert.equal(
    isEligibleManualTransferWarehouse(
      { warehouseRole: 'maintenance_center' },
      { sparePartsOnly: true },
    ),
    true,
  );

  const warehouses = [
    { id: '1', warehouseRole: 'spare_parts_central' as const },
    { id: '2', warehouseRole: 'maintenance_center' as const },
    { id: '3', warehouseRole: 'repair_customer_custody' as const },
    { id: '4', warehouseRole: 'repair_unrepairable' as const },
    { id: '5', warehouseRole: 'final_product' as const },
  ];
  assert.deepEqual(
    filterManualTransferWarehouses(warehouses).map((w) => w.id),
    ['1', '2', '5'],
  );
  assert.deepEqual(
    filterManualTransferWarehouses(warehouses, { sparePartsOnly: true }).map((w) => w.id),
    ['1', '2'],
  );

  const item: TransferItemOption = {
    id: 'sp-1',
    name: 'قطعة',
    code: 'SP-0024',
    minStock: 0,
    stockItemType: 'material',
  };
  const lines: TransferFormLine[] = [{ ...createTransferLine(), itemId: 'sp-1', quantity: 1 }];
  const requestLines = buildTransferRequestLines(
    lines,
    'raw_material',
    () => item,
    (line) => Number(line.quantity || 0),
    {
      locationId: 'loc-from',
      locationCode: 'A-1',
      toLocationId: 'loc-to',
      toLocationCode: 'B-2',
    },
  );
  assert.equal(requestLines.length, 1);
  assert.equal(requestLines[0].unitsPerCarton, undefined);
  assert.ok(!('unitsPerCarton' in requestLines[0]));
  assert.equal(requestLines[0].locationId, 'loc-from');
  assert.equal(requestLines[0].locationCode, 'A-1');
  assert.equal(requestLines[0].toLocationId, 'loc-to');
  assert.equal(requestLines[0].toLocationCode, 'B-2');

  const fgItem: TransferItemOption = {
    id: 'fg-1',
    name: 'منتج',
    code: 'P-1',
    minStock: 0,
    unitsPerCarton: 12,
    stockItemType: 'finished_good',
  };
  const fgLines = buildTransferRequestLines(
    [{ ...createTransferLine(), itemId: 'fg-1', quantity: 2, unit: 'piece' }],
    'finished_good',
    () => fgItem,
    (line) => Number(line.quantity || 0),
  );
  assert.equal(fgLines[0].unitsPerCarton, 12);
  assert.ok(!('locationId' in fgLines[0]));

  console.log('manual-transfer-warehouses.test.ts: ok');
}

run();
