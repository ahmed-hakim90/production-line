import assert from 'node:assert/strict';
import {
  defaultTransferItemType,
  inventoryMovementsBreadcrumbLabel,
  inventoryMovementsPageTitle,
} from '../modules/inventory/lib/transferItemTypeDefault.ts';

assert.equal(defaultTransferItemType({ queryItemType: 'raw_material' }), 'raw_material');
assert.equal(defaultTransferItemType({ queryItemType: 'finished_good' }), 'finished_good');
assert.equal(defaultTransferItemType({ sparePartsContext: true }), 'raw_material');
assert.equal(defaultTransferItemType({ isMaterialsWarehouseRole: true }), 'raw_material');
assert.equal(defaultTransferItemType({ warehouseRole: 'spare_parts_central' }), 'raw_material');
assert.equal(defaultTransferItemType({ warehouseRole: 'packaging' }), 'finished_good');
assert.equal(defaultTransferItemType({ warehouseRole: 'finished_staging' }), 'finished_good');
assert.equal(defaultTransferItemType({}), 'finished_good');

assert.equal(inventoryMovementsPageTitle('TRANSFER'), 'تحويل مخزون');
assert.equal(inventoryMovementsPageTitle('IN'), 'إذن إضافة');
assert.equal(inventoryMovementsPageTitle(null), 'حركة المخزون');
assert.equal(inventoryMovementsBreadcrumbLabel('movementType=TRANSFER'), 'تحويل مخزون');
assert.equal(inventoryMovementsBreadcrumbLabel('?movementType=OUT'), 'إذن منصرف');
assert.equal(inventoryMovementsBreadcrumbLabel('movementType=IN&itemType=raw_material'), 'إذن إضافة');
assert.equal(inventoryMovementsBreadcrumbLabel('movementType=IN'), 'إذن إضافة');
assert.equal(inventoryMovementsBreadcrumbLabel(''), 'حركة المخزون');

console.log('transfer-item-type-default.test.ts: ok');
