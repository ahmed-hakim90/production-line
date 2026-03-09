import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
const LEGACY_PRODUCTS = 'products';
const LEGACY_RAW = 'raw_materials';
const LEGACY_STOCK = 'stock_items';
const LEGACY_TX = 'stock_transactions';
const LEGACY_WAREHOUSES = 'warehouses';
const ITEMS = 'items';
const ITEM_CATEGORIES = 'item_categories';
const INVENTORY = 'inventory';
const INVENTORY_MOVEMENTS = 'inventory_movements';
const WAREHOUSES = 'warehouses';
const parseArgs = (argv) => {
    const getValue = (flag) => {
        const idx = argv.findIndex((arg) => arg === flag);
        if (idx === -1)
            return undefined;
        return argv[idx + 1];
    };
    const pageSizeRaw = Number(getValue('--page-size') || 500);
    return {
        apply: argv.includes('--apply'),
        pageSize: Number.isFinite(pageSizeRaw) ? Math.max(100, Math.min(pageSizeRaw, 2000)) : 500,
        sourceProjectId: getValue('--source-project') || undefined,
        targetProjectId: getValue('--target-project') || undefined,
        legacyWarehousesCollection: getValue('--legacy-warehouses') || LEGACY_WAREHOUSES,
        warehousesCollection: getValue('--warehouses') || WAREHOUSES,
    };
};
const toNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const ensureApp = (name, projectId) => {
    const existing = getApps().find((app) => app.name === name);
    if (existing)
        return existing;
    if (!projectId) {
        const defaultApp = getApps().find((app) => app.name === '[DEFAULT]');
        if (defaultApp)
            return defaultApp;
        return initializeApp();
    }
    return initializeApp({ credential: applicationDefault(), projectId }, name);
};
const mapLegacyType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'raw_material')
        return 'raw_material';
    if (normalized === 'finished_good')
        return 'product';
    if (normalized === 'spare_part')
        return 'spare_part';
    if (normalized === 'consumable')
        return 'consumable';
    if (normalized === 'service')
        return 'service';
    return 'product';
};
const mapMovementType = (direction) => {
    const normalized = String(direction || '').trim().toUpperCase();
    if (normalized === 'TRANSFER')
        return 'transfer';
    if (normalized === 'ADJUSTMENT')
        return 'adjustment';
    if (normalized === 'IN')
        return 'container_import';
    return 'production';
};
const normalizeCode = (value, fallback) => {
    const raw = String(value || '').trim();
    if (raw)
        return raw;
    return String(fallback || '').trim() || 'WAREHOUSE';
};
const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    const sourceApp = ensureApp(args.sourceProjectId ? 'source' : '[DEFAULT]', args.sourceProjectId);
    const targetApp = ensureApp(args.targetProjectId ? 'target' : '[DEFAULT]', args.targetProjectId);
    const sourceDb = getFirestore(sourceApp);
    const targetDb = getFirestore(targetApp);
    const categories = new Set();
    const warehouseNameById = new Map();
    const summary = {
        sourceProjectId: args.sourceProjectId || sourceApp.options.projectId || 'default',
        targetProjectId: args.targetProjectId || targetApp.options.projectId || 'default',
        warehousesRead: 0,
        productsRead: 0,
        rawRead: 0,
        stockRead: 0,
        txRead: 0,
        warehouseWrites: 0,
        itemWrites: 0,
        categoryWrites: 0,
        inventoryWrites: 0,
        movementWrites: 0,
    };
    const warehouseSnap = await sourceDb.collection(args.legacyWarehousesCollection).get();
    const productSnap = await sourceDb.collection(LEGACY_PRODUCTS).get();
    const rawSnap = await sourceDb.collection(LEGACY_RAW).get();
    const stockSnap = await sourceDb.collection(LEGACY_STOCK).get();
    const txSnap = await sourceDb.collection(LEGACY_TX).get();
    summary.warehousesRead = warehouseSnap.size;
    summary.productsRead = productSnap.size;
    summary.rawRead = rawSnap.size;
    summary.stockRead = stockSnap.size;
    summary.txRead = txSnap.size;
    const writes = [];
    warehouseSnap.docs.forEach((row) => {
        const data = row.data();
        const name = String(data.name || row.id || '').trim();
        warehouseNameById.set(row.id, name);
        writes.push(async () => {
            await targetDb.collection(args.warehousesCollection).doc(row.id).set({
                name,
                code: normalizeCode(data.code, row.id),
                isActive: data.isActive !== false,
                createdAt: String(data.createdAt || new Date().toISOString()),
                migratedFrom: args.legacyWarehousesCollection,
                migratedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        summary.warehouseWrites += 1;
    });
    productSnap.docs.forEach((row) => {
        const data = row.data();
        const categoryCode = String(data.model || 'general').trim().toLowerCase() || 'general';
        categories.add(categoryCode);
        writes.push(async () => {
            await targetDb.collection(ITEMS).doc(row.id).set({
                name: String(data.name || ''),
                sku: String(data.code || ''),
                type: 'product',
                categoryId: categoryCode,
                unit: 'piece',
                cost: toNumber(data.chineseUnitCost),
                salePrice: toNumber(data.sellingPrice),
                trackSerial: false,
                trackBatch: false,
                active: true,
                createdAt: new Date().toISOString(),
                migratedFrom: LEGACY_PRODUCTS,
                migratedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        summary.itemWrites += 1;
    });
    rawSnap.docs.forEach((row) => {
        const data = row.data();
        categories.add('raw_materials');
        writes.push(async () => {
            await targetDb.collection(ITEMS).doc(row.id).set({
                name: String(data.name || ''),
                sku: String(data.code || ''),
                type: 'raw_material',
                categoryId: 'raw_materials',
                unit: String(data.unit || 'unit'),
                cost: 0,
                salePrice: 0,
                trackSerial: false,
                trackBatch: false,
                active: data.isActive !== false,
                createdAt: String(data.createdAt || new Date().toISOString()),
                minStock: toNumber(data.minStock),
                migratedFrom: LEGACY_RAW,
                migratedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        summary.itemWrites += 1;
    });
    categories.forEach((code) => {
        writes.push(async () => {
            await targetDb.collection(ITEM_CATEGORIES).doc(code).set({
                name: code.replace(/_/g, ' '),
                code,
                active: true,
                createdAt: new Date().toISOString(),
            }, { merge: true });
        });
        summary.categoryWrites += 1;
    });
    stockSnap.docs.forEach((row) => {
        const data = row.data();
        const itemId = String(data.itemId || '').trim();
        const warehouseId = String(data.warehouseId || '').trim();
        if (!itemId || !warehouseId)
            return;
        const docId = `${warehouseId}__${itemId}`;
        writes.push(async () => {
            await targetDb.collection(INVENTORY).doc(docId).set({
                itemId,
                warehouseId,
                warehouseName: String(data.warehouseName || warehouseNameById.get(warehouseId) || ''),
                quantity: toNumber(data.quantity),
                updatedAt: String(data.updatedAt || new Date().toISOString()),
                itemName: String(data.itemName || ''),
                itemSku: String(data.itemCode || ''),
                itemType: mapLegacyType(String(data.itemType || '')),
                minStock: toNumber(data.minStock),
                migratedFrom: LEGACY_STOCK,
            }, { merge: true });
        });
        summary.inventoryWrites += 1;
    });
    txSnap.docs.forEach((row) => {
        const data = row.data();
        const itemId = String(data.itemId || '').trim();
        if (!itemId)
            return;
        writes.push(async () => {
            await targetDb.collection(INVENTORY_MOVEMENTS).doc(row.id).set({
                itemId,
                type: mapMovementType(String(data.movementType || '')),
                quantity: toNumber(data.quantity),
                referenceId: String(data.referenceNo || ''),
                date: String(data.createdAt || new Date().toISOString()),
                createdAt: String(data.createdAt || new Date().toISOString()),
                warehouseId: String(data.warehouseId || ''),
                warehouseName: String(data.warehouseName || warehouseNameById.get(String(data.warehouseId || '')) || ''),
                toWarehouseId: String(data.toWarehouseId || ''),
                toWarehouseName: String(data.toWarehouseName || warehouseNameById.get(String(data.toWarehouseId || '')) || ''),
                note: String(data.note || ''),
                direction: String(data.movementType || ''),
                transferDirection: String(data.transferDirection || ''),
                createdBy: String(data.createdBy || ''),
                migratedFrom: LEGACY_TX,
            }, { merge: true });
        });
        summary.movementWrites += 1;
    });
    console.log('[items-inventory backfill] mode:', args.apply ? 'APPLY' : 'DRY_RUN');
    console.log('[items-inventory backfill] summary:', summary);
    if (!args.apply)
        return;
    for (let i = 0; i < writes.length; i += args.pageSize) {
        const chunk = writes.slice(i, i + args.pageSize);
        await Promise.all(chunk.map((fn) => fn()));
    }
    console.log('[items-inventory backfill] completed.');
};
run().catch((error) => {
    console.error('[items-inventory backfill] failed:', error);
    process.exitCode = 1;
});
