import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import {
  approveAndIssueProductionIssueForActor,
  createProductionIssueDraftForActor,
  prepareProductionIssueOrderForActor,
} from '../functions/src/productionIssuePreparation';
import { issueProductionIssueOrderForActor, type ActorContext } from '../functions/src/productionIssueStock';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required. Run npm run test:production-issue:functions.');
}

const db = getDb();
const tenantId = 'tenant-a';
const actor: ActorContext = {
  uid: 'manager-a',
  tenantId,
  displayName: 'مدير النظام',
  isSuperAdmin: false,
  permissions: { 'adminDashboard.view': true },
  boundWarehouseId: null,
};

const seed = async () => {
  const batch = db.batch();
  const set = (collectionName: string, id: string, data: Record<string, unknown>) => {
    batch.set(db.collection(collectionName).doc(id), data);
  };
  set('system_settings', tenantId, {
    tenantId,
    planSettings: {
      inventoryRouting: {
        productionFloorWarehouseId: 'floor',
        decomposedWarehouseId: 'decomposed',
      },
    },
  });
  set('warehouses', 'source', { tenantId, name: 'المستلزمات', isActive: true });
  set('warehouses', 'floor', { tenantId, name: 'صالة الإنتاج', isActive: true });
  set('products', 'product-a', { tenantId, name: 'منتج أ', code: 'P-A' });
  set('products', 'product-missing', { tenantId, name: 'منتج ناقص', code: 'P-X' });
  set('work_orders', 'wo-a', {
    tenantId,
    workOrderNumber: 'WO-A',
    productId: 'product-a',
    lineId: 'line-a',
    quantity: 10,
  });
  set('work_orders', 'wo-shortage', {
    tenantId,
    workOrderNumber: 'WO-SHORT',
    productId: 'product-a',
    lineId: 'line-a',
    quantity: 100,
  });
  set('work_orders', 'wo-missing', {
    tenantId,
    workOrderNumber: 'WO-MISSING',
    productId: 'product-missing',
    lineId: 'line-a',
    quantity: 1,
  });
  set('boms', 'bom-a', {
    tenantId,
    ownerType: 'product',
    ownerId: 'product-a',
    status: 'active',
    version: 1,
  });
  set('bom_items', 'bom-a-line', {
    tenantId,
    bomId: 'bom-a',
    itemType: 'material',
    itemId: 'material-a',
    itemName: 'خامة أ',
    qtyPerUnit: 3,
    wastePercent: 0,
  });
  set('boms', 'bom-missing', {
    tenantId,
    ownerType: 'product',
    ownerId: 'product-missing',
    status: 'active',
    version: 1,
  });
  set('bom_items', 'bom-missing-line', {
    tenantId,
    bomId: 'bom-missing',
    itemType: 'material',
    itemId: 'deleted-material',
    itemName: 'خامة محذوفة',
    qtyPerUnit: 1,
  });
  set('materials', 'material-a', {
    tenantId,
    name: 'خامة أ',
    code: 'M-A',
    baseUnit: 'piece',
  });
  set('warehouse_locations', 'source-location', {
    tenantId,
    warehouseId: 'source',
    code: 'SRC-01',
    isActive: true,
  });
  set('warehouse_locations', 'floor-location', {
    tenantId,
    warehouseId: 'floor',
    code: 'FLR-01',
    isActive: true,
  });
  set('default_item_locations', 'source__material__material-a', {
    tenantId,
    warehouseId: 'source',
    itemType: 'material',
    itemId: 'material-a',
    locationId: 'source-location',
  });
  set('stock_items', 'source__material__material-a', {
    tenantId,
    warehouseId: 'source',
    itemType: 'material',
    itemId: 'material-a',
    itemName: 'خامة أ',
    itemCode: 'M-A',
    unit: 'piece',
    quantity: 100,
  });
  set('stock_location_balances', 'source__source-location__material__material-a', {
    tenantId,
    warehouseId: 'source',
    locationId: 'source-location',
    locationCode: 'SRC-01',
    itemType: 'material',
    itemId: 'material-a',
    itemName: 'خامة أ',
    itemCode: 'M-A',
    unit: 'piece',
    quantity: 100,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  await batch.commit();
};

await seed();

const created = await createProductionIssueDraftForActor(actor, {
  workOrderId: 'wo-a',
  sourceWarehouseId: 'source',
  quantity: 2,
});
assert.equal(created.status, 'draft');
assert.equal(created.lines.length, 1);
assert.equal(created.lines[0]?.requiredQty, 6);
assert.equal(created.lines[0]?.shortageQty, 0);

const prepared = await prepareProductionIssueOrderForActor(actor, {
  orderId: created.id,
  sourceWarehouseId: 'source',
  quantity: 2,
});
assert.equal(prepared.lines[0]?.allocations[0]?.locationId, 'source-location');

const approved = await approveAndIssueProductionIssueForActor(actor, {
  orderId: created.id,
  sourceWarehouseId: 'source',
  quantity: 2,
});
assert.equal(approved.order.status, 'issued');
assert.equal((await db.collection('stock_items').doc('source__material__material-a').get()).data()?.quantity, 94);
assert.equal((await db.collection('stock_items').doc('floor__material__material-a').get()).data()?.quantity, 6);

const idempotent = await issueProductionIssueOrderForActor(actor, created.id!);
assert.equal(idempotent.idempotent, true);
assert.equal((await db.collection('stock_items').doc('source__material__material-a').get()).data()?.quantity, 94);

const shortageOrder = await createProductionIssueDraftForActor(actor, {
  workOrderId: 'wo-shortage',
  sourceWarehouseId: 'source',
  quantity: 40,
});
await assert.rejects(
  approveAndIssueProductionIssueForActor(actor, {
    orderId: shortageOrder.id,
    sourceWarehouseId: 'source',
    quantity: 40,
  }),
  /عجز/,
);
assert.equal((await db.collection('production_issue_orders').doc(shortageOrder.id!).get()).data()?.status, 'draft');

await assert.rejects(
  createProductionIssueDraftForActor(actor, {
    workOrderId: 'wo-missing',
    sourceWarehouseId: 'source',
    quantity: 1,
  }),
  /خامة محذوفة/,
);

await assert.rejects(
  createProductionIssueDraftForActor({ ...actor, tenantId: 'tenant-b' }, {
    workOrderId: 'wo-a',
    sourceWarehouseId: 'source',
    quantity: 1,
  }),
  /خارج شركتك/,
);

await assert.rejects(
  createProductionIssueDraftForActor({ ...actor, boundWarehouseId: 'other-source' }, {
    workOrderId: 'wo-a',
    sourceWarehouseId: 'source',
    quantity: 1,
  }),
  /مخزنه المرتبط/,
);

console.log('production-issue-functions.integration.ts: OK');

