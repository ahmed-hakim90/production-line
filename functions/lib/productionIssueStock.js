import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { resolveInventoryRoutingFromSettings } from './productionInventoryRouting.js';
import { assertActorWarehousesAllowed, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
import { PRODUCTION_QUANTITY_TOLERANCE, quantitiesMatch, } from './productionStockInvariants.js';
const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const ORDERS = 'production_issue_orders';
const WAREHOUSES = 'warehouses';
const WAREHOUSE_LOCATIONS = 'warehouse_locations';
const DEFAULT_ITEM_LOCATIONS = 'default_item_locations';
const STOCK_ITEMS = 'stock_items';
const STOCK_LOCATION_BALANCES = 'stock_location_balances';
const STOCK_TX = 'stock_transactions';
const INVENTORY_COUNTERS = 'inventory_counters';
const SYSTEM_SETTINGS = 'system_settings';
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const toIsoNow = () => new Date().toISOString();
const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const balanceDocId = (warehouseId, itemType, itemId) => `${warehouseId}__${itemType}__${itemId}`;
const locationBalanceDocId = (warehouseId, locationId, itemType, itemId) => `${warehouseId}__${locationId}__${itemType}__${itemId}`;
const formatInvReference = (seq) => `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;
const requireAuth = (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    return uid;
};
const loadActor = async (uid) => {
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive !== true)
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId)
        throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    let permissions = {};
    const roleId = String(user.roleId || '').trim();
    if (roleId) {
        const roleSnap = await db.collection(ROLES).doc(roleId).get();
        if (!roleSnap.exists) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        const role = roleSnap.data();
        if (String(role.tenantId || '').trim() !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = role.permissions || {};
    }
    return {
        uid,
        tenantId,
        displayName: String(user.displayName || user.email || uid).trim(),
        isSuperAdmin: user.isSuperAdmin === true,
        permissions,
        boundWarehouseId: resolveBoundInventoryWarehouseId(user),
    };
};
const hasPermission = (actor, keys) => actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true);
async function resolveFloorWarehouse(order, tenantId) {
    const fromOrder = String(order.targetWarehouseId || '').trim();
    if (fromOrder) {
        const snap = await db.collection(WAREHOUSES).doc(fromOrder).get();
        if (!snap.exists)
            throw new HttpsError('failed-precondition', 'مخزن صالة الإنتاج غير موجود.');
        const data = snap.data();
        if (String(data.tenantId || '') !== tenantId) {
            throw new HttpsError('permission-denied', 'مخزن الوجهة خارج شركتك.');
        }
        if (data.isActive === false) {
            throw new HttpsError('failed-precondition', 'مخزن صالة الإنتاج غير نشط.');
        }
        return { id: fromOrder, name: String(data.name || order.targetWarehouseName || fromOrder) };
    }
    const settingsSnap = await db.collection(SYSTEM_SETTINGS).doc(tenantId).get();
    const routing = resolveInventoryRoutingFromSettings((settingsSnap.data() || {}));
    const floorId = String(routing.productionFloorWarehouseId || '').trim();
    if (!floorId) {
        throw new HttpsError('failed-precondition', 'يجب ضبط مخزن صالة الإنتاج في إعدادات التوجيه قبل صرف الإنتاج.');
    }
    if (floorId === String(order.sourceWarehouseId || '').trim()) {
        throw new HttpsError('failed-precondition', 'مخزن المصدر والوجهة يجب أن يكونا مختلفين.');
    }
    const snap = await db.collection(WAREHOUSES).doc(floorId).get();
    if (!snap.exists)
        throw new HttpsError('failed-precondition', 'مخزن صالة الإنتاج غير موجود.');
    const data = snap.data();
    if (String(data.tenantId || '') !== tenantId) {
        throw new HttpsError('permission-denied', 'مخزن الوجهة خارج شركتك.');
    }
    return { id: floorId, name: String(data.name || floorId) };
}
async function loadActiveLocations(warehouseId, tenantId) {
    const snap = await db.collection(WAREHOUSE_LOCATIONS)
        .where('warehouseId', '==', warehouseId)
        .where('isActive', '==', true)
        .get();
    return snap.docs
        .map((d) => {
        const data = d.data();
        if (data.tenantId && String(data.tenantId) !== tenantId)
            return null;
        return { id: d.id, code: String(data.code || d.id) };
    })
        .filter(Boolean);
}
async function defaultFloorLocationId(warehouseId, itemType, itemId, fallbackLocationId) {
    const id = `${warehouseId}__${itemType}__${itemId}`;
    const snap = await db.collection(DEFAULT_ITEM_LOCATIONS).doc(id).get();
    if (snap.exists) {
        const locationId = String(snap.data().locationId || '').trim();
        if (locationId)
            return locationId;
    }
    return fallbackLocationId;
}
const issueOrderStockFingerprint = (order) => JSON.stringify({
    tenantId: String(order.tenantId || ''),
    status: String(order.status || ''),
    sourceWarehouseId: String(order.sourceWarehouseId || ''),
    targetWarehouseId: String(order.targetWarehouseId || ''),
    lines: (order.lines || []).map((line) => ({
        itemType: String(line.itemType || ''),
        itemId: String(line.itemId || ''),
        itemName: String(line.itemName || ''),
        itemCode: String(line.itemCode || ''),
        unit: String(line.unit || ''),
        requiredQty: toNumber(line.requiredQty),
        allocations: (line.allocations || []).map((allocation) => ({
            locationId: String(allocation.locationId || ''),
            locationCode: String(allocation.locationCode || ''),
            quantity: toNumber(allocation.quantity),
        })),
    })),
});
async function applyCrossWarehouseTransfers(params) {
    const { actor, legs } = params;
    if (!legs.length) {
        throw new HttpsError('failed-precondition', 'أمر الصرف بلا كميات قابلة للترحيل.');
    }
    const groupLegs = (keyOf) => {
        const groups = new Map();
        for (const leg of legs) {
            const key = keyOf(leg);
            if (!key)
                continue;
            const current = groups.get(key);
            groups.set(key, {
                leg: current?.leg || leg,
                quantity: (current?.quantity || 0) + leg.quantity,
            });
        }
        return groups;
    };
    const itemGroups = groupLegs((leg) => JSON.stringify([leg.itemType, leg.itemId]));
    const sourceLocationGroups = groupLegs((leg) => JSON.stringify([
        leg.fromLocationId,
        leg.itemType,
        leg.itemId,
    ]));
    const targetLocationGroups = groupLegs((leg) => (leg.toLocationId
        ? JSON.stringify([leg.toLocationId, leg.itemType, leg.itemId])
        : null));
    return db.runTransaction(async (t) => {
        const orderRef = db.collection(ORDERS).doc(params.orderId);
        const counterRef = db.collection(INVENTORY_COUNTERS).doc(actor.tenantId);
        const [orderSnap, counterSnap] = await Promise.all([
            t.get(orderRef),
            t.get(counterRef),
        ]);
        if (!orderSnap.exists)
            throw new HttpsError('not-found', 'أمر الصرف غير موجود.');
        const currentOrder = orderSnap.data();
        if (String(currentOrder.tenantId || '') !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'لا يمكن الوصول لأمر صرف خارج شركتك.');
        }
        if (currentOrder.status === 'issued') {
            return { idempotent: true };
        }
        if (currentOrder.status === 'requested') {
            throw new HttpsError('failed-precondition', 'اعتمد طلب الإنتاج أولاً قبل ترحيل الصرف.');
        }
        if (currentOrder.status === 'rejected' || currentOrder.status === 'cancelled') {
            throw new HttpsError('failed-precondition', 'لا يمكن صرف طلب مرفوض أو ملغى.');
        }
        if (issueOrderStockFingerprint(currentOrder) !== params.expectedOrderFingerprint) {
            throw new HttpsError('failed-precondition', 'تم تعديل أمر الصرف. حدّث الصفحة ثم أعد المحاولة.');
        }
        if (counterSnap.exists
            && String(counterSnap.data()?.tenantId || '') !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'عداد حركات المخزون خارج شركتك.');
        }
        const [itemReads, sourceLocationReads, targetLocationReads] = await Promise.all([
            Promise.all([...itemGroups.values()].map(async (group) => {
                const sourceRef = db.collection(STOCK_ITEMS).doc(balanceDocId(params.sourceWarehouseId, group.leg.itemType, group.leg.itemId));
                const targetRef = db.collection(STOCK_ITEMS).doc(balanceDocId(params.targetWarehouseId, group.leg.itemType, group.leg.itemId));
                const [sourceSnap, targetSnap] = await Promise.all([
                    t.get(sourceRef),
                    t.get(targetRef),
                ]);
                return { ...group, sourceRef, targetRef, sourceSnap, targetSnap };
            })),
            Promise.all([...sourceLocationGroups.values()].map(async (group) => {
                const ref = db.collection(STOCK_LOCATION_BALANCES).doc(locationBalanceDocId(params.sourceWarehouseId, group.leg.fromLocationId, group.leg.itemType, group.leg.itemId));
                return { ...group, ref, snap: await t.get(ref) };
            })),
            Promise.all([...targetLocationGroups.values()].map(async (group) => {
                const ref = db.collection(STOCK_LOCATION_BALANCES).doc(locationBalanceDocId(params.targetWarehouseId, String(group.leg.toLocationId), group.leg.itemType, group.leg.itemId));
                return { ...group, ref, snap: await t.get(ref) };
            })),
        ]);
        const assertBalanceTenant = (snap) => {
            if (snap.exists && String(snap.data()?.tenantId || '') !== actor.tenantId) {
                throw new HttpsError('permission-denied', 'رصيد المخزن خارج شركتك.');
            }
        };
        for (const row of itemReads) {
            assertBalanceTenant(row.sourceSnap);
            assertBalanceTenant(row.targetSnap);
            const sourceQty = row.sourceSnap.exists ? toNumber(row.sourceSnap.data()?.quantity) : 0;
            if (sourceQty - row.quantity < -PRODUCTION_QUANTITY_TOLERANCE) {
                throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${row.leg.itemName}.`);
            }
        }
        for (const row of sourceLocationReads) {
            assertBalanceTenant(row.snap);
            const sourceQty = row.snap.exists ? toNumber(row.snap.data()?.quantity) : 0;
            if (sourceQty - row.quantity < -PRODUCTION_QUANTITY_TOLERANCE) {
                throw new HttpsError('failed-precondition', `رصيد الرف غير كافٍ للصنف ${row.leg.itemName}.`);
            }
        }
        for (const row of targetLocationReads)
            assertBalanceTenant(row.snap);
        let nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
        const now = toIsoNow();
        for (const row of itemReads) {
            const sourceQty = row.sourceSnap.exists ? toNumber(row.sourceSnap.data()?.quantity) : 0;
            const targetQty = row.targetSnap.exists ? toNumber(row.targetSnap.data()?.quantity) : 0;
            t.set(row.sourceRef, stripUndefined({
                warehouseId: params.sourceWarehouseId,
                warehouseName: params.sourceWarehouseName,
                itemType: row.leg.itemType,
                itemId: row.leg.itemId,
                itemName: row.leg.itemName,
                itemCode: row.leg.itemCode,
                unit: row.leg.unit,
                quantity: Math.max(0, sourceQty - row.quantity),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
            t.set(row.targetRef, stripUndefined({
                warehouseId: params.targetWarehouseId,
                warehouseName: params.targetWarehouseName,
                itemType: row.leg.itemType,
                itemId: row.leg.itemId,
                itemName: row.leg.itemName,
                itemCode: row.leg.itemCode,
                unit: row.leg.unit,
                quantity: targetQty + row.quantity,
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        for (const row of sourceLocationReads) {
            const sourceQty = row.snap.exists ? toNumber(row.snap.data()?.quantity) : 0;
            t.set(row.ref, stripUndefined({
                warehouseId: params.sourceWarehouseId,
                locationId: row.leg.fromLocationId,
                locationCode: row.leg.fromLocationCode || row.leg.fromLocationId,
                itemType: row.leg.itemType,
                itemId: row.leg.itemId,
                itemName: row.leg.itemName,
                itemCode: row.leg.itemCode,
                unit: row.leg.unit,
                quantity: Math.max(0, sourceQty - row.quantity),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        for (const row of targetLocationReads) {
            const targetQty = row.snap.exists ? toNumber(row.snap.data()?.quantity) : 0;
            t.set(row.ref, stripUndefined({
                warehouseId: params.targetWarehouseId,
                locationId: row.leg.toLocationId,
                locationCode: row.leg.toLocationCode || row.leg.toLocationId,
                itemType: row.leg.itemType,
                itemId: row.leg.itemId,
                itemName: row.leg.itemName,
                itemCode: row.leg.itemCode,
                unit: row.leg.unit,
                quantity: targetQty + row.quantity,
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        legs.forEach((leg, index) => {
            const outTxRef = db.collection(STOCK_TX).doc(`production_issue_${params.orderId}_${index}_out`);
            const inTxRef = db.collection(STOCK_TX).doc(`production_issue_${params.orderId}_${index}_in`);
            const referenceNo = formatInvReference(nextInv);
            nextInv += 1;
            const lineage = {
                sourceModule: 'production_issue',
                sourceId: params.orderId,
                sourceIssueOrderId: params.orderId,
                sourceReportId: params.productionReportId || null,
                sourceWorkOrderId: params.workOrderId || null,
                sourcePlanId: params.productionPlanId || null,
                tenantId: actor.tenantId,
            };
            t.set(outTxRef, stripUndefined({
                warehouseId: params.sourceWarehouseId,
                warehouseName: params.sourceWarehouseName,
                toWarehouseId: params.targetWarehouseId,
                toWarehouseName: params.targetWarehouseName,
                locationId: leg.fromLocationId,
                locationCode: leg.fromLocationCode,
                toLocationId: leg.toLocationId,
                toLocationCode: leg.toLocationCode,
                itemType: leg.itemType,
                itemId: leg.itemId,
                itemName: leg.itemName,
                itemCode: leg.itemCode,
                unit: leg.unit,
                movementType: 'TRANSFER',
                transferDirection: 'OUT',
                quantity: leg.quantity,
                relatedTransactionId: inTxRef.id,
                referenceNo,
                note: params.referenceHint,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                ...lineage,
            }));
            t.set(inTxRef, stripUndefined({
                warehouseId: params.targetWarehouseId,
                warehouseName: params.targetWarehouseName,
                toWarehouseId: params.sourceWarehouseId,
                toWarehouseName: params.sourceWarehouseName,
                locationId: leg.toLocationId,
                locationCode: leg.toLocationCode,
                toLocationId: leg.fromLocationId,
                toLocationCode: leg.fromLocationCode,
                itemType: leg.itemType,
                itemId: leg.itemId,
                itemName: leg.itemName,
                itemCode: leg.itemCode,
                unit: leg.unit,
                movementType: 'TRANSFER',
                transferDirection: 'IN',
                quantity: leg.quantity,
                relatedTransactionId: outTxRef.id,
                referenceNo,
                note: params.referenceHint,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                ...lineage,
            }));
        });
        t.set(counterRef, {
            tenantId: actor.tenantId,
            lastInvSeq: nextInv - 1,
            updatedAt: now,
        }, { merge: true });
        const nextLines = currentOrder.lines.map((line) => ({
            ...line,
            issuedQty: toNumber(line.requiredQty),
        }));
        t.set(orderRef, stripUndefined({
            status: 'issued',
            issuedAt: now,
            issuedBy: actor.displayName,
            issuedByUserId: actor.uid,
            lines: nextLines,
            targetWarehouseId: params.targetWarehouseId,
            targetWarehouseName: params.targetWarehouseName,
            updatedAt: now,
        }), { merge: true });
        return { idempotent: false };
    });
}
export const issueProductionIssueStock = onCall({
    region: 'us-central1',
    memory: '512MiB',
}, async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPermission(actor, [
        'productionIssue.approve',
        'inventory.transfers.approve',
        'inventory.transactions.create',
    ])) {
        throw new HttpsError('permission-denied', 'لا تملك صلاحية اعتماد صرف الإنتاج.');
    }
    if (!request.data
        || typeof request.data !== 'object'
        || Array.isArray(request.data)
        || Object.keys(request.data).some((key) => key !== 'orderId')
        || typeof request.data.orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'بيانات أمر الصرف غير صالحة.');
    }
    const orderId = String(request.data.orderId).trim();
    if (!orderId)
        throw new HttpsError('invalid-argument', 'معرّف أمر الصرف مطلوب.');
    if (orderId.includes('/') || orderId.length > 256) {
        throw new HttpsError('invalid-argument', 'معرّف أمر الصرف غير صالح.');
    }
    const orderRef = db.collection(ORDERS).doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists)
        throw new HttpsError('not-found', 'أمر الصرف غير موجود.');
    const order = orderSnap.data();
    if (String(order.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول لأمر صرف خارج شركتك.');
    }
    if (order.status === 'issued') {
        return { ok: true, idempotent: true, orderId };
    }
    if (order.status === 'requested') {
        throw new HttpsError('failed-precondition', 'اعتمد طلب الإنتاج أولاً قبل ترحيل الصرف.');
    }
    if (order.status === 'rejected' || order.status === 'cancelled') {
        throw new HttpsError('failed-precondition', 'لا يمكن صرف طلب مرفوض أو ملغى.');
    }
    if (!Array.isArray(order.lines) || order.lines.length === 0) {
        throw new HttpsError('failed-precondition', 'أمر الصرف بلا بنود مكونات.');
    }
    const sourceWarehouseId = String(order.sourceWarehouseId || '').trim();
    if (!sourceWarehouseId) {
        throw new HttpsError('failed-precondition', 'مخزن المصدر غير محدد.');
    }
    const sourceWhSnap = await db.collection(WAREHOUSES).doc(sourceWarehouseId).get();
    if (!sourceWhSnap.exists)
        throw new HttpsError('failed-precondition', 'مخزن المصدر غير موجود.');
    const sourceWh = sourceWhSnap.data();
    if (String(sourceWh.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'مخزن المصدر خارج شركتك.');
    }
    const floor = await resolveFloorWarehouse(order, actor.tenantId);
    // Bound users may only issue from their warehouse (Admin SDK still credits the floor).
    assertActorWarehousesAllowed(actor.boundWarehouseId, [sourceWarehouseId]);
    const sourceLocations = await loadActiveLocations(sourceWarehouseId, actor.tenantId);
    const sourceLocationIds = new Set(sourceLocations.map((loc) => loc.id));
    const floorLocations = await loadActiveLocations(floor.id, actor.tenantId);
    const floorFallback = floorLocations[0]?.id;
    const legs = [];
    for (const line of order.lines) {
        const requiredQty = toNumber(line.requiredQty);
        if (!(requiredQty > 0)) {
            throw new HttpsError('failed-precondition', `الكمية المطلوبة غير صالحة للصنف ${line.itemName || line.itemId}.`);
        }
        const allocatedQty = (line.allocations || []).reduce((sum, row) => sum + toNumber(row.quantity), 0);
        if (!quantitiesMatch(allocatedQty, requiredQty)) {
            throw new HttpsError('failed-precondition', `يجب أن يطابق مجموع التوزيع الكمية المطلوبة للصنف ${line.itemName || line.itemId}.`);
        }
        for (const allocation of line.allocations || []) {
            const qty = toNumber(allocation.quantity);
            if (!(qty > 0))
                continue;
            if (!sourceLocationIds.has(allocation.locationId)) {
                throw new HttpsError('failed-precondition', `رف غير نشط للصنف ${line.itemName || line.itemId}.`);
            }
            const toLocationId = await defaultFloorLocationId(floor.id, line.itemType, line.itemId, floorFallback);
            const toLocation = floorLocations.find((loc) => loc.id === toLocationId);
            legs.push({
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName || line.itemId,
                itemCode: String(line.itemCode || ''),
                unit: String(line.unit || 'unit'),
                quantity: qty,
                fromLocationId: allocation.locationId,
                fromLocationCode: allocation.locationCode,
                toLocationId: toLocation?.id,
                toLocationCode: toLocation?.code,
            });
        }
    }
    const referenceHint = order.productionReportCode
        ? `Production issue ${order.referenceNo || orderId} → floor for report ${order.productionReportCode}`
        : `Production issue ${order.referenceNo || orderId} → production floor`;
    const transferResult = await applyCrossWarehouseTransfers({
        actor,
        sourceWarehouseId,
        sourceWarehouseName: String(order.sourceWarehouseName || sourceWh.name || ''),
        targetWarehouseId: floor.id,
        targetWarehouseName: floor.name,
        legs,
        orderId,
        referenceHint,
        productionReportId: order.productionReportId,
        workOrderId: order.workOrderId,
        productionPlanId: order.productionPlanId,
        expectedOrderFingerprint: issueOrderStockFingerprint(order),
    });
    return {
        ok: true,
        orderId,
        targetWarehouseId: floor.id,
        idempotent: transferResult.idempotent,
    };
});
