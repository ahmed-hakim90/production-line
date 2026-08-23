import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { resolveInventoryRoutingFromSettings } from './productionInventoryRouting.js';
import { issueProductionIssueOrderForActor, loadProductionIssueActor, productionIssueActorHasPermission, } from './productionIssueStock.js';
const db = getDb();
const COLLECTIONS = {
    users: 'users',
    workOrders: 'work_orders',
    plans: 'production_plans',
    products: 'products',
    boms: 'boms',
    bomItems: 'bom_items',
    legacyBomItems: 'product_materials',
    materials: 'materials',
    rawMaterials: 'raw_materials',
    warehouses: 'warehouses',
    settings: 'system_settings',
    locationBalances: 'stock_location_balances',
    defaultLocations: 'default_item_locations',
    issueOrders: 'production_issue_orders',
    counters: 'inventory_counters',
};
const clean = (value) => String(value ?? '').trim();
const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const stripUndefined = (value) => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
const tenantMatchesOrLegacy = (value, tenantId) => {
    const documentTenantId = clean(value);
    return !documentTenantId || documentTenantId === tenantId;
};
function requireAuthUid(request) {
    const uid = clean(request.auth?.uid);
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    return uid;
}
function requireObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new HttpsError('invalid-argument', 'بيانات صرف الإنتاج غير صالحة.');
    }
    return data;
}
function assertAllowedKeys(data, allowed) {
    const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
    if (unexpected)
        throw new HttpsError('invalid-argument', `حقل غير مسموح: ${unexpected}`);
}
function assertCreatePermission(actor) {
    if (productionIssueActorHasPermission(actor, [
        'productionIssue.create',
        'productionIssue.approve',
        'inventory.transactions.create',
        'inventory.transfers.approve',
        'roles.manage',
        'adminDashboard.view',
    ]))
        return;
    throw new HttpsError('permission-denied', 'لا تملك صلاحية إنشاء أو تجهيز صرف الإنتاج.');
}
function assertApprovePermission(actor) {
    if (productionIssueActorHasPermission(actor, [
        'productionIssue.approve',
        'inventory.transfers.approve',
        'inventory.transactions.create',
        'roles.manage',
        'adminDashboard.view',
    ]))
        return;
    throw new HttpsError('permission-denied', 'لا تملك صلاحية اعتماد صرف الإنتاج.');
}
function assertWarehouseScope(actor, warehouseId) {
    if (!actor.boundWarehouseId || actor.boundWarehouseId === warehouseId)
        return;
    throw new HttpsError('permission-denied', 'مستخدم المخزن يستطيع الصرف من مخزنه المرتبط فقط.');
}
async function requireTenantDoc(collectionName, id, tenantId, missingMessage) {
    if (!id || id.includes('/') || id.length > 256) {
        throw new HttpsError('invalid-argument', 'معرّف السجل غير صالح.');
    }
    const snap = await db.collection(collectionName).doc(id).get();
    if (!snap.exists)
        throw new HttpsError('not-found', missingMessage);
    if (!tenantMatchesOrLegacy(snap.data()?.tenantId, tenantId)) {
        throw new HttpsError('permission-denied', 'السجل المطلوب خارج شركتك.');
    }
    return snap;
}
function sourceQuantity(source, sourceType) {
    if (sourceType === 'work_order')
        return num(source.quantity);
    const planned = num(source.plannedQuantity);
    const remaining = source.remainingQuantity == null
        ? planned - num(source.producedQuantity)
        : num(source.remainingQuantity);
    return Math.max(0, remaining || planned);
}
async function loadSource(actor, input) {
    const workOrderId = clean(input.workOrderId);
    const productionPlanId = clean(input.productionPlanId);
    if ((workOrderId ? 1 : 0) + (productionPlanId ? 1 : 0) !== 1) {
        throw new HttpsError('invalid-argument', 'حدد أمر شغل أو خطة إنتاج واحدة فقط.');
    }
    const sourceType = workOrderId ? 'work_order' : 'production_plan';
    const id = workOrderId || productionPlanId;
    const snap = await requireTenantDoc(sourceType === 'work_order' ? COLLECTIONS.workOrders : COLLECTIONS.plans, id, actor.tenantId, sourceType === 'work_order' ? 'أمر الشغل غير موجود.' : 'خطة الإنتاج غير موجودة.');
    const data = snap.data() || {};
    return {
        sourceType,
        source: {
            id: snap.id,
            productId: clean(data.productId),
            lineId: clean(data.lineId) || undefined,
            quantity: num(data.quantity),
            plannedQuantity: num(data.plannedQuantity),
            producedQuantity: num(data.producedQuantity),
            remainingQuantity: data.remainingQuantity == null ? undefined : num(data.remainingQuantity),
        },
    };
}
async function loadWarehouse(actor, warehouseId) {
    assertWarehouseScope(actor, warehouseId);
    const snap = await requireTenantDoc(COLLECTIONS.warehouses, warehouseId, actor.tenantId, 'مخزن صرف المكونات غير موجود.');
    const data = snap.data() || {};
    if (data.isActive === false)
        throw new HttpsError('failed-precondition', 'مخزن صرف المكونات غير نشط.');
    return { id: snap.id, name: clean(data.name) || snap.id };
}
async function loadFloorWarehouse(actor, sourceWarehouseId) {
    const settingsSnap = await db.collection(COLLECTIONS.settings).doc(actor.tenantId).get();
    const routing = resolveInventoryRoutingFromSettings((settingsSnap.data() || {}));
    const floorId = clean(routing.productionFloorWarehouseId);
    if (!floorId) {
        throw new HttpsError('failed-precondition', 'حدّد مخزن صالة الإنتاج في توجيه المخازن أولاً.');
    }
    if (floorId === clean(routing.decomposedWarehouseId) || floorId === sourceWarehouseId) {
        throw new HttpsError('failed-precondition', 'مخزن صالة الإنتاج يجب أن يختلف عن مخزن المصدر والمفكك.');
    }
    const snap = await requireTenantDoc(COLLECTIONS.warehouses, floorId, actor.tenantId, 'مخزن صالة الإنتاج غير موجود.');
    const data = snap.data() || {};
    if (data.isActive === false)
        throw new HttpsError('failed-precondition', 'مخزن صالة الإنتاج غير نشط.');
    return { id: snap.id, name: clean(data.name) || 'صالة الإنتاج' };
}
async function loadBomLines(tenantId, productId) {
    const bomSnap = await db.collection(COLLECTIONS.boms)
        .where('tenantId', '==', tenantId)
        .where('ownerType', '==', 'product')
        .where('ownerId', '==', productId)
        .where('status', '==', 'active')
        .get();
    const activeBom = [...bomSnap.docs].sort((a, b) => num(b.data().version) - num(a.data().version))[0];
    if (activeBom) {
        const itemSnap = await db.collection(COLLECTIONS.bomItems)
            .where('tenantId', '==', tenantId)
            .where('bomId', '==', activeBom.id)
            .get();
        const rows = itemSnap.docs
            .map((row) => row.data())
            .filter((row) => clean(row.itemType) === 'material' && num(row.qtyPerUnit) > 0)
            .map((row) => ({
            itemId: clean(row.itemId),
            itemName: clean(row.itemName),
            qtyPerUnit: num(row.qtyPerUnit),
            wastePercent: num(row.wastePercent),
        }))
            .filter((row) => Boolean(row.itemId));
        if (!rows.length) {
            throw new HttpsError('failed-precondition', 'BOM موجود لكنه لا يحتوي مكونات خامات موجبة صالحة للصرف.');
        }
        return rows;
    }
    const legacySnap = await db.collection(COLLECTIONS.legacyBomItems)
        .where('tenantId', '==', tenantId)
        .where('productId', '==', productId)
        .get();
    const legacyRows = legacySnap.docs
        .map((row) => {
        const data = row.data();
        return {
            id: row.id,
            materialId: data.materialId,
            materialName: data.materialName,
            quantityUsed: data.quantityUsed,
        };
    })
        .filter((row) => num(row.quantityUsed) > 0)
        .map((row) => ({
        itemId: clean(row.materialId) || row.id,
        itemName: clean(row.materialName),
        qtyPerUnit: num(row.quantityUsed),
        wastePercent: 0,
    }));
    if (!legacyRows.length) {
        throw new HttpsError('failed-precondition', 'لا يوجد BOM نشط أو مكونات قديمة لهذا المنتج.');
    }
    return legacyRows;
}
async function loadCatalogLines(tenantId, bomLines) {
    const ids = [...new Set(bomLines.map((line) => line.itemId))];
    const materialSnaps = ids.length
        ? await db.getAll(...ids.map((id) => db.collection(COLLECTIONS.materials).doc(id)))
        : [];
    const result = new Map();
    for (const snap of materialSnaps) {
        if (!snap.exists || !tenantMatchesOrLegacy(snap.data()?.tenantId, tenantId))
            continue;
        const data = snap.data() || {};
        result.set(snap.id, {
            materialId: snap.id,
            itemType: 'material',
            itemId: snap.id,
            itemName: clean(data.name) || snap.id,
            itemCode: clean(data.code),
            unit: clean(data.baseUnit) || 'unit',
        });
    }
    if (result.size !== ids.length) {
        const rawSnap = await db.collection(COLLECTIONS.rawMaterials)
            .where('tenantId', '==', tenantId)
            .get();
        const rawRows = rawSnap.docs.map((snap) => {
            const data = snap.data();
            return {
                id: snap.id,
                name: data.name,
                code: data.code,
                unit: data.unit,
            };
        });
        for (const line of bomLines) {
            if (result.has(line.itemId))
                continue;
            const fallbackName = line.itemName.toLocaleLowerCase('ar');
            const raw = rawRows.find((row) => (row.id === line.itemId
                || clean(row.name).toLocaleLowerCase('ar') === fallbackName));
            if (!raw) {
                throw new HttpsError('failed-precondition', `مكوّن BOM مرتبط بخامة محذوفة أو غير موجودة: ${line.itemName || line.itemId} (${line.itemId}).`, { reason: 'missing-bom-material', materialId: line.itemId, materialName: line.itemName });
            }
            result.set(line.itemId, {
                materialId: raw.id,
                itemType: 'raw_material',
                itemId: raw.id,
                itemName: clean(raw.name) || line.itemName || raw.id,
                itemCode: clean(raw.code),
                unit: clean(raw.unit) || 'unit',
            });
        }
    }
    return result;
}
export function allocateServerProductionIssue(balances, requiredQty, preferredLocationId) {
    let remaining = requiredQty;
    const sorted = balances
        .filter((row) => row.quantity > 0)
        .sort((a, b) => {
        if (preferredLocationId) {
            if (a.locationId === preferredLocationId && b.locationId !== preferredLocationId)
                return -1;
            if (b.locationId === preferredLocationId && a.locationId !== preferredLocationId)
                return 1;
        }
        return clean(a.lastMovementAt || a.updatedAt).localeCompare(clean(b.lastMovementAt || b.updatedAt));
    });
    const availableQty = sorted.reduce((sum, row) => sum + row.quantity, 0);
    const allocations = [];
    for (const row of sorted) {
        if (remaining <= 0)
            break;
        const quantity = Math.min(remaining, row.quantity);
        allocations.push(stripUndefined({
            locationId: row.locationId,
            locationCode: row.locationCode,
            rack: row.rack,
            shelf: row.shelf,
            quantity,
        }));
        remaining -= quantity;
    }
    return { allocations, availableQty, shortageQty: Math.max(0, requiredQty - availableQty) };
}
async function loadLocationData(tenantId, warehouseId, catalogLines) {
    const balances = [];
    const idsByType = new Map();
    for (const line of catalogLines) {
        idsByType.set(line.itemType, [...(idsByType.get(line.itemType) || []), line.itemId]);
    }
    for (const [itemType, rawIds] of idsByType) {
        const ids = [...new Set(rawIds)];
        for (let offset = 0; offset < ids.length; offset += 30) {
            const snap = await db.collection(COLLECTIONS.locationBalances)
                .where('tenantId', '==', tenantId)
                .where('warehouseId', '==', warehouseId)
                .where('itemType', '==', itemType)
                .where('itemId', 'in', ids.slice(offset, offset + 30))
                .get();
            balances.push(...snap.docs.map((row) => {
                const data = row.data();
                return {
                    itemType,
                    itemId: clean(data.itemId),
                    locationId: clean(data.locationId),
                    locationCode: clean(data.locationCode) || clean(data.locationId),
                    rack: clean(data.rack) || undefined,
                    shelf: clean(data.shelf) || undefined,
                    quantity: num(data.quantity),
                    updatedAt: data.updatedAt,
                    lastMovementAt: data.lastMovementAt,
                };
            }));
        }
    }
    const defaultIds = catalogLines.map((line) => `${warehouseId}__${line.itemType}__${line.itemId}`);
    const defaultSnaps = defaultIds.length
        ? await db.getAll(...defaultIds.map((id) => db.collection(COLLECTIONS.defaultLocations).doc(id)))
        : [];
    const defaults = new Map();
    for (const snap of defaultSnaps) {
        if (!snap.exists || clean(snap.data()?.tenantId) !== tenantId)
            continue;
        const data = snap.data() || {};
        defaults.set(`${clean(data.itemType)}__${clean(data.itemId)}`, clean(data.locationId));
    }
    return { balances, defaults };
}
async function buildLines(actor, productId, quantity, warehouseId) {
    const bomLines = await loadBomLines(actor.tenantId, productId);
    const catalog = await loadCatalogLines(actor.tenantId, bomLines);
    const aggregate = new Map();
    for (const bomLine of bomLines) {
        const catalogLine = catalog.get(bomLine.itemId);
        if (!catalogLine)
            continue;
        const key = `${catalogLine.itemType}__${catalogLine.itemId}`;
        const baseRequiredQty = bomLine.qtyPerUnit * quantity;
        const plannedWasteQty = baseRequiredQty * (bomLine.wastePercent / 100);
        const requiredQty = baseRequiredQty + plannedWasteQty;
        const current = aggregate.get(key);
        if (current) {
            current.qtyPerUnit += bomLine.qtyPerUnit;
            current.baseRequiredQty += baseRequiredQty;
            current.plannedWasteQty += plannedWasteQty;
            current.requiredQty += requiredQty;
        }
        else {
            aggregate.set(key, {
                catalog: catalogLine,
                qtyPerUnit: bomLine.qtyPerUnit,
                baseRequiredQty,
                plannedWasteQty,
                requiredQty,
                wastePercent: bomLine.wastePercent,
            });
        }
    }
    const { balances, defaults } = await loadLocationData(actor.tenantId, warehouseId, [...aggregate.values()].map((row) => row.catalog));
    return [...aggregate.entries()].map(([key, row]) => {
        const itemBalances = balances.filter((balance) => (`${balance.itemType}__${balance.itemId}` === key && Boolean(balance.locationId)));
        const allocation = allocateServerProductionIssue(itemBalances, row.requiredQty, defaults.get(key));
        return {
            ...row.catalog,
            qtyPerUnit: row.qtyPerUnit,
            baseRequiredQty: row.baseRequiredQty,
            wastePercent: row.wastePercent,
            plannedWasteQty: row.plannedWasteQty,
            requiredQty: row.requiredQty,
            issuedQty: 0,
            returnedQty: 0,
            compensatedQty: 0,
            actualScrapQty: 0,
            availableQty: allocation.availableQty,
            shortageQty: allocation.shortageQty,
            allocations: allocation.allocations,
        };
    });
}
async function assertNoBlockingIssue(actor, sourceType, sourceId) {
    const field = sourceType === 'work_order' ? 'workOrderId' : 'productionPlanId';
    const snap = await db.collection(COLLECTIONS.issueOrders)
        .where('tenantId', '==', actor.tenantId)
        .where(field, '==', sourceId)
        .where('status', 'in', ['requested', 'draft', 'submitted'])
        .get();
    const blocking = snap.docs[0];
    if (blocking) {
        throw new HttpsError('already-exists', 'يوجد طلب/إذن صرف معلّق لنفس أمر الشغل أو الخطة. أنهِه أو ألغِه أولاً.', { orderId: blocking.id });
    }
}
async function allocateReferenceAndCreate(actor, payload) {
    const counterRef = db.collection(COLLECTIONS.counters).doc(actor.tenantId);
    const orderRef = db.collection(COLLECTIONS.issueOrders).doc();
    await db.runTransaction(async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        if (counterSnap.exists && clean(counterSnap.data()?.tenantId) !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'عداد صرف الإنتاج خارج شركتك.');
        }
        const nextSeq = Math.max(1, Math.floor(num(counterSnap.data()?.lastPiSeq)) + 1);
        const referenceNo = `PI-${String(nextSeq).padStart(4, '0')}`;
        transaction.set(counterRef, {
            tenantId: actor.tenantId,
            lastPiSeq: nextSeq,
            updatedAt: nowIso(),
        }, { merge: true });
        transaction.set(orderRef, stripUndefined({ ...payload, referenceNo }));
    });
    const created = await orderRef.get();
    return { id: created.id, ...created.data() };
}
export async function createProductionIssueDraftForActor(actor, data) {
    const workOrderId = clean(data.workOrderId);
    const productionPlanId = clean(data.productionPlanId);
    const warehouseId = clean(data.sourceWarehouseId);
    const requestedQty = num(data.quantity);
    if (!warehouseId)
        throw new HttpsError('invalid-argument', 'حدد مخزن صرف المكونات.');
    if (!(requestedQty > 0))
        throw new HttpsError('invalid-argument', 'كمية الصرف يجب أن تكون أكبر من صفر.');
    const { sourceType, source } = await loadSource(actor, { workOrderId, productionPlanId });
    const maxQty = sourceQuantity(source, sourceType);
    if (maxQty > 0 && requestedQty > maxQty + 0.000001) {
        throw new HttpsError('failed-precondition', `كمية الصرف تتجاوز كمية المصدر (${maxQty}).`);
    }
    if (!source.productId)
        throw new HttpsError('failed-precondition', 'المصدر غير مرتبط بمنتج صالح.');
    await assertNoBlockingIssue(actor, sourceType, source.id);
    const productSnap = await requireTenantDoc(COLLECTIONS.products, source.productId, actor.tenantId, 'المنتج المرتبط غير موجود.');
    const product = productSnap.data() || {};
    const warehouse = await loadWarehouse(actor, warehouseId);
    const floor = await loadFloorWarehouse(actor, warehouse.id);
    const lines = await buildLines(actor, productSnap.id, requestedQty, warehouse.id);
    const createdAt = nowIso();
    return allocateReferenceAndCreate(actor, {
        referenceNo: '',
        sourceType,
        workOrderId: sourceType === 'work_order' ? source.id : undefined,
        productionPlanId: sourceType === 'production_plan' ? source.id : undefined,
        productId: productSnap.id,
        productName: clean(product.name) || productSnap.id,
        productCode: clean(product.code) || undefined,
        lineId: source.lineId,
        quantity: requestedQty,
        sourceWarehouseId: warehouse.id,
        sourceWarehouseName: warehouse.name,
        targetWarehouseId: floor.id,
        targetWarehouseName: floor.name,
        status: 'draft',
        origin: 'warehouse',
        lines,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt,
        note: clean(data.note) || undefined,
        tenantId: actor.tenantId,
    });
}
export async function prepareProductionIssueOrderForActor(actor, data) {
    const orderId = clean(data.orderId);
    const orderSnap = await requireTenantDoc(COLLECTIONS.issueOrders, orderId, actor.tenantId, 'طلب الصرف غير موجود.');
    const order = { id: orderSnap.id, ...orderSnap.data() };
    if (!['requested', 'draft'].includes(order.status)) {
        throw new HttpsError('failed-precondition', 'يمكن تجهيز الطلبات أو المسودات فقط.');
    }
    const quantity = data.quantity == null ? num(order.quantity) : num(data.quantity);
    if (!(quantity > 0))
        throw new HttpsError('invalid-argument', 'كمية الاعتماد يجب أن تكون أكبر من صفر.');
    const warehouseId = clean(data.sourceWarehouseId) || clean(order.sourceWarehouseId);
    const warehouse = await loadWarehouse(actor, warehouseId);
    const floor = await loadFloorWarehouse(actor, warehouse.id);
    const lines = await buildLines(actor, clean(order.productId), quantity, warehouse.id);
    const status = data.saveAsDraft === true && order.status === 'requested' ? 'draft' : order.status;
    const patch = stripUndefined({
        quantity,
        lines,
        sourceWarehouseId: warehouse.id,
        sourceWarehouseName: warehouse.name,
        targetWarehouseId: floor.id,
        targetWarehouseName: floor.name,
        status,
        updatedAt: nowIso(),
    });
    await orderSnap.ref.set(patch, { merge: true });
    return { ...order, ...patch, id: orderSnap.id };
}
function shortageDetails(order) {
    return order.lines
        .filter((line) => num(line.shortageQty) > 0)
        .map((line) => ({
        kind: 'insufficient_allocation',
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        requiredQty: line.requiredQty,
        availableQty: line.availableQty,
        shortageQty: line.shortageQty,
    }));
}
export async function approveAndIssueProductionIssueForActor(actor, data) {
    const order = await prepareProductionIssueOrderForActor(actor, data);
    const shortages = shortageDetails(order);
    if (shortages.length) {
        throw new HttpsError('failed-precondition', `لا يمكن اعتماد الصرف: يوجد عجز في ${shortages.length} مكوّن.`, { reason: 'insufficient-stock', shortages });
    }
    const submittedAt = nowIso();
    await db.collection(COLLECTIONS.issueOrders).doc(clean(order.id)).set(stripUndefined({
        status: 'submitted',
        submittedAt,
        approvedBy: actor.displayName,
        approvedAt: submittedAt,
        updatedAt: submittedAt,
    }), { merge: true });
    const result = await issueProductionIssueOrderForActor(actor, clean(order.id));
    const issuedSnap = await db.collection(COLLECTIONS.issueOrders).doc(clean(order.id)).get();
    return { order: { id: issuedSnap.id, ...issuedSnap.data() }, result };
}
export const createProductionIssueDraft = onCall({ region: 'us-central1', memory: '512MiB' }, async (request) => {
    const actor = await loadProductionIssueActor(requireAuthUid(request));
    assertCreatePermission(actor);
    const data = requireObject(request.data);
    assertAllowedKeys(data, ['workOrderId', 'productionPlanId', 'sourceWarehouseId', 'quantity', 'note']);
    const order = await createProductionIssueDraftForActor(actor, data);
    return { ok: true, order };
});
export const prepareProductionIssueOrder = onCall({ region: 'us-central1', memory: '512MiB' }, async (request) => {
    const actor = await loadProductionIssueActor(requireAuthUid(request));
    assertCreatePermission(actor);
    const data = requireObject(request.data);
    assertAllowedKeys(data, ['orderId', 'sourceWarehouseId', 'quantity', 'saveAsDraft']);
    const order = await prepareProductionIssueOrderForActor(actor, data);
    return { ok: true, order };
});
export const approveAndIssueProductionIssue = onCall({ region: 'us-central1', memory: '512MiB' }, async (request) => {
    const actor = await loadProductionIssueActor(requireAuthUid(request));
    assertApprovePermission(actor);
    const data = requireObject(request.data);
    assertAllowedKeys(data, ['orderId', 'sourceWarehouseId', 'quantity']);
    const result = await approveAndIssueProductionIssueForActor(actor, data);
    return { ok: true, ...result };
});
