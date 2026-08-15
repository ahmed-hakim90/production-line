import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { actorHasDepartmentConsumableAccess, resolveConsumableActorRoleKey, } from './departmentConsumableAccess.js';
import { assertActorWarehousesAllowed, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
import { assertOperationPathEnabledServer } from './operationPathGuard.js';
import { allocateConsumableIssueFromStock, resolveConsumableAddLocation, } from './departmentConsumableLocation.js';
const db = getDb();
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
const DEPARTMENTS_COLLECTION = 'departments';
const WAREHOUSES_COLLECTION = 'warehouses';
const WAREHOUSE_LOCATIONS_COLLECTION = 'warehouse_locations';
const MATERIALS_COLLECTION = 'materials';
const ISSUES_COLLECTION = 'department_consumable_issues';
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const INVENTORY_COUNTERS_COLLECTION = 'inventory_counters';
const DEFAULT_ITEM_LOCATIONS_COLLECTION = 'default_item_locations';
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';
const MAX_LINES = 40;
const SOURCE_ISSUE = 'department_consumable_issue';
const SOURCE_RETURN = 'department_consumable_return';
const SOURCE_ADD_STOCK = 'manual_movement';
const STOCK_MOVE_OPERATION_KEY = 'inventory.stock.move';
const CONSUMABLE_ADD_STOCK_PATH = 'consumable_add_stock';
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const toIsoNow = () => new Date().toISOString();
const materialPurchaseCostPerBaseUnit = (material) => {
    const cost = toNumber(material.purchaseCost);
    const rate = toNumber(material.conversionRate);
    if (rate > 0)
        return cost / rate;
    return cost;
};
const balanceDocId = (warehouseId, itemId) => `${warehouseId}__material__${itemId}`;
const locationBalanceDocId = (warehouseId, locationId, itemId) => `${warehouseId}__${locationId}__material__${itemId}`;
const issueLineId = (itemId, locationId) => JSON.stringify([String(itemId || '').trim(), String(locationId || '').trim()]);
const formatDciReference = (seq) => `DCI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;
const formatInvReference = (seq) => `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;
const userSafeError = (error, fallback) => {
    if (error instanceof HttpsError)
        return error;
    const message = error instanceof Error ? error.message : '';
    if (message
        && !message.includes('Firebase')
        && !message.includes('Firestore')
        && !message.includes('PERMISSION')
        && message.length < 180) {
        return new HttpsError('failed-precondition', message);
    }
    return new HttpsError('failed-precondition', fallback);
};
const requireAuth = (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    return uid;
};
const loadActor = async (uid) => {
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive === false) {
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    }
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId && user.isSuperAdmin !== true) {
        throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');
    }
    const roleId = String(user.roleId || '').trim();
    let permissions = {};
    let roleKey = null;
    if (roleId) {
        const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
        if (roleSnap.exists) {
            const role = roleSnap.data();
            if (role.tenantId && tenantId && role.tenantId !== tenantId && user.isSuperAdmin !== true) {
                throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
            }
            permissions = role.permissions || {};
            roleKey = resolveConsumableActorRoleKey(role);
        }
    }
    return {
        uid,
        tenantId: tenantId || String(user.tenantId || ''),
        displayName: String(user.displayName || user.name || user.email || uid),
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
        boundWarehouseId: resolveBoundInventoryWarehouseId(user),
        roleKey,
    };
};
const hasPermission = (actor, keys) => actorHasDepartmentConsumableAccess(actor, keys);
const requirePermission = (actor, keys, message) => {
    if (!hasPermission(actor, keys)) {
        throw new HttpsError('permission-denied', message);
    }
};
const assertActorIssueWarehouse = (actor, warehouseId) => {
    assertActorWarehousesAllowed(actor.boundWarehouseId, [warehouseId]);
};
const writeAudit = async (params) => {
    await db.collection(ACTIVITY_LOGS_COLLECTION).add({
        tenantId: params.actor.tenantId,
        module: 'inventory',
        action: params.action,
        entityType: 'department_consumable_issue',
        entityId: params.entityId,
        description: params.description,
        performedBy: params.actor.displayName,
        performedByUserId: params.actor.uid,
        createdAt: toIsoNow(),
        metadata: params.metadata || {},
    });
};
const loadApprovalMode = async (tenantId) => {
    const snap = await db.collection(SYSTEM_SETTINGS_COLLECTION).doc(tenantId).get();
    if (!snap.exists)
        return 'direct';
    const data = snap.data();
    return data.planSettings?.departmentConsumableIssueApprovalMode === 'required'
        ? 'required'
        : 'direct';
};
const assertSameTenant = (resourceTenantId, actorTenantId) => {
    const tid = String(resourceTenantId || '').trim();
    if (!tid || tid !== actorTenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول إلى هذا المورد.');
    }
};
const resolveDepartment = async (tenantId, departmentId) => {
    const id = String(departmentId || '').trim();
    if (!id)
        throw new HttpsError('invalid-argument', 'حدد القسم.');
    const snap = await db.collection(DEPARTMENTS_COLLECTION).doc(id).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'القسم غير موجود.');
    const data = snap.data();
    assertSameTenant(data.tenantId, tenantId);
    if (data.isActive === false)
        throw new HttpsError('failed-precondition', 'القسم غير نشط.');
    return { id, name: String(data.name || id) };
};
const resolveWarehouse = async (tenantId, warehouseId) => {
    const id = String(warehouseId || '').trim();
    if (!id)
        throw new HttpsError('invalid-argument', 'حدد المخزن.');
    const snap = await db.collection(WAREHOUSES_COLLECTION).doc(id).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'المخزن غير موجود.');
    const data = snap.data();
    assertSameTenant(data.tenantId, tenantId);
    if (data.isActive === false)
        throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
    return { id, name: String(data.name || id) };
};
const activeLocationsForWarehouse = async (tenantId, warehouseId) => {
    const snap = await db
        .collection(WAREHOUSE_LOCATIONS_COLLECTION)
        .where('tenantId', '==', tenantId)
        .where('warehouseId', '==', warehouseId)
        .get();
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((loc) => loc.isActive !== false);
};
const loadItemLocationBalances = async (tenantId, warehouseId, itemId) => {
    const snap = await db
        .collection(STOCK_LOCATION_BALANCES_COLLECTION)
        .where('tenantId', '==', tenantId)
        .where('warehouseId', '==', warehouseId)
        .orderBy('updatedAt', 'desc')
        .get();
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            locationId: String(data.locationId || '').trim(),
            locationCode: String(data.locationCode || '').trim(),
            quantity: toNumber(data.quantity),
            lastMovementAt: data.lastMovementAt,
            updatedAt: data.updatedAt,
            itemType: String(data.itemType || 'material'),
            itemId: String(data.itemId || '').trim(),
        };
    }).filter((row) => row.locationId && row.itemType === 'material' && row.itemId === itemId);
};
const loadWarehouseItemQty = async (warehouseId, itemId) => {
    const snap = await db.collection(STOCK_ITEMS_COLLECTION).doc(balanceDocId(warehouseId, itemId)).get();
    return toNumber(snap.data()?.quantity);
};
const loadDefaultLocationId = async (warehouseId, itemId) => {
    const snap = await db.collection(DEFAULT_ITEM_LOCATIONS_COLLECTION).doc(`${warehouseId}__material__${itemId}`).get();
    return String(snap.data()?.locationId || '').trim();
};
const rememberDefaultItemLocation = async (params) => {
    const now = toIsoNow();
    await db.collection(DEFAULT_ITEM_LOCATIONS_COLLECTION).doc(`${params.warehouseId}__material__${params.itemId}`).set({
        tenantId: params.tenantId,
        warehouseId: params.warehouseId,
        warehouseName: params.warehouseName,
        itemType: 'material',
        itemId: params.itemId,
        itemName: params.itemName,
        itemCode: params.itemCode,
        locationId: params.locationId,
        locationCode: params.locationCode,
        updatedAt: now,
        createdAt: now,
    }, { merge: true });
};
const resolveConsumableMaterial = async (tenantId, itemId) => {
    const id = String(itemId || '').trim();
    if (!id)
        throw new HttpsError('invalid-argument', 'حدد الصنف لكل بند.');
    const materialSnap = await db.collection(MATERIALS_COLLECTION).doc(id).get();
    if (!materialSnap.exists)
        throw new HttpsError('not-found', 'المادة غير موجودة.');
    const material = materialSnap.data();
    assertSameTenant(material.tenantId, tenantId);
    if (material.isActive === false) {
        throw new HttpsError('failed-precondition', 'المادة غير نشطة.');
    }
    if (material.type !== 'consumable') {
        throw new HttpsError('failed-precondition', 'يُسمح فقط بالمواد من نوع مستهلكات.');
    }
    return {
        itemId: id,
        itemName: String(material.name || id),
        itemCode: String(material.code || ''),
        unit: String(material.baseUnit || 'piece'),
        unitCost: roundMoney(materialPurchaseCostPerBaseUnit(material)),
    };
};
const resolveLines = async (params) => {
    const rawLines = Array.isArray(params.lines) ? params.lines : [];
    if (rawLines.length === 0) {
        throw new HttpsError('invalid-argument', 'أضف بند مستهلك واحد على الأقل.');
    }
    if (rawLines.length > MAX_LINES) {
        throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
    }
    const merged = new Map();
    for (const line of rawLines) {
        const itemId = String(line.itemId || '').trim();
        const quantity = toNumber(line.quantity);
        if (!itemId)
            throw new HttpsError('invalid-argument', 'حدد الصنف لكل بند.');
        if (!(quantity > 0)) {
            throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
        }
        merged.set(itemId, toNumber(merged.get(itemId)) + quantity);
    }
    const resolved = [];
    for (const [itemId, quantity] of merged.entries()) {
        const material = await resolveConsumableMaterial(params.tenantId, itemId);
        const [warehouseQty, locationBalances, preferredLocationId] = await Promise.all([
            loadWarehouseItemQty(params.warehouseId, itemId),
            loadItemLocationBalances(params.tenantId, params.warehouseId, itemId),
            loadDefaultLocationId(params.warehouseId, itemId),
        ]);
        const allocated = allocateConsumableIssueFromStock({
            requiredQty: quantity,
            warehouseQty,
            locationBalances,
            preferredLocationId,
        });
        if (allocated.error) {
            throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${material.itemName}. ${allocated.error}`);
        }
        if (resolved.length + allocated.slices.length > MAX_LINES) {
            throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
        }
        for (const slice of allocated.slices) {
            const locationId = String(slice.locationId || '').trim();
            resolved.push({
                lineId: issueLineId(itemId, locationId),
                itemType: 'material',
                itemId,
                itemName: material.itemName,
                itemCode: material.itemCode,
                unit: material.unit,
                quantity: slice.quantity,
                ...(locationId
                    ? { locationId, locationCode: String(slice.locationCode || locationId) }
                    : {}),
                unitCostSnapshot: material.unitCost,
                totalCostSnapshot: roundMoney(material.unitCost * slice.quantity),
                returnedQty: 0,
            });
        }
    }
    return resolved;
};
const loadIssue = async (issueId, actor) => {
    const id = String(issueId || '').trim();
    if (!id)
        throw new HttpsError('invalid-argument', 'معرّف السند غير صالح.');
    const snap = await db.collection(ISSUES_COLLECTION).doc(id).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'سند الصرف غير موجود.');
    const data = snap.data();
    assertSameTenant(data.tenantId, actor.tenantId);
    assertActorIssueWarehouse(actor, data.warehouseId);
    return { id: snap.id, data };
};
async function transitionIssueStatus(params) {
    const issueRef = db.collection(ISSUES_COLLECTION).doc(params.issueId);
    return db.runTransaction(async (t) => {
        const issueSnap = await t.get(issueRef);
        if (!issueSnap.exists)
            throw new HttpsError('not-found', 'سند الصرف غير موجود.');
        const current = issueSnap.data();
        assertSameTenant(current.tenantId, params.actor.tenantId);
        assertActorIssueWarehouse(params.actor, current.warehouseId);
        if (params.idempotent && current.status === params.nextStatus) {
            return { data: current, changed: false };
        }
        params.validate(current);
        const now = toIsoNow();
        t.update(issueRef, {
            status: params.nextStatus,
            ...params.fields(now),
        });
        return { data: current, changed: true };
    });
}
const canIssueNow = (status, approvalMode) => approvalMode === 'direct' ? status === 'draft' : status === 'approved';
async function postIssueMovements(params) {
    const { actor, issueId } = params;
    const issueRef = db.collection(ISSUES_COLLECTION).doc(issueId);
    const issueSnap = await issueRef.get();
    if (!issueSnap.exists)
        throw new HttpsError('not-found', 'سند الصرف غير موجود.');
    const current = issueSnap.data();
    assertSameTenant(current.tenantId, actor.tenantId);
    assertActorIssueWarehouse(actor, current.warehouseId);
    if (current.status === 'issued') {
        return { referenceNo: current.referenceNo, issue: current, changed: false };
    }
    if (!canIssueNow(current.status, current.approvalMode)) {
        throw new HttpsError('failed-precondition', 'لا يمكن تنفيذ الصرف في الحالة الحالية.');
    }
    const sourceLines = current.lines || [];
    if (sourceLines.length === 0) {
        throw new HttpsError('failed-precondition', 'السند لا يحتوي بنوداً.');
    }
    const lines = await resolveLines({
        tenantId: actor.tenantId,
        warehouseId: current.warehouseId,
        lines: sourceLines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
        })),
    });
    return db.runTransaction(async (t) => {
        const liveSnap = await t.get(issueRef);
        if (!liveSnap.exists)
            throw new HttpsError('not-found', 'سند الصرف غير موجود.');
        const live = liveSnap.data();
        if (live.status === 'issued') {
            return { referenceNo: live.referenceNo, issue: live, changed: false };
        }
        if (!canIssueNow(live.status, live.approvalMode)) {
            throw new HttpsError('failed-precondition', 'لا يمكن تنفيذ الصرف في الحالة الحالية.');
        }
        const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
        const counterSnap = await t.get(counterRef);
        let nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
        const now = toIsoNow();
        const movementRefs = lines.map(() => db.collection(STOCK_TRANSACTIONS_COLLECTION).doc());
        const stockByItem = new Map();
        const locationRows = [];
        for (const line of lines) {
            const existing = stockByItem.get(line.itemId);
            if (existing) {
                existing.quantity += line.quantity;
            }
            else {
                stockByItem.set(line.itemId, {
                    line,
                    quantity: line.quantity,
                    balRef: db.collection(STOCK_ITEMS_COLLECTION).doc(balanceDocId(current.warehouseId, line.itemId)),
                });
            }
            if (line.locationId) {
                locationRows.push({
                    line,
                    locRef: db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(locationBalanceDocId(current.warehouseId, line.locationId, line.itemId)),
                });
            }
        }
        const stockRows = Array.from(stockByItem.values());
        const balanceRefs = [
            ...stockRows.map((row) => row.balRef),
            ...locationRows.map((row) => row.locRef),
        ];
        const balanceSnaps = balanceRefs.length > 0 ? await t.getAll(...balanceRefs) : [];
        const balanceSnapByPath = new Map(balanceSnaps.map((snap) => [snap.ref.path, snap]));
        for (const row of stockRows) {
            const balSnap = balanceSnapByPath.get(row.balRef.path);
            const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
            const coveredByLocations = locationRows
                .filter((locRow) => locRow.line.itemId === row.line.itemId)
                .reduce((sum, locRow) => sum + locRow.line.quantity, 0);
            if (balQty - row.quantity < -0.000001
                && coveredByLocations + 0.000001 < row.quantity) {
                throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${row.line.itemName}.`);
            }
        }
        for (const row of locationRows) {
            const locSnap = balanceSnapByPath.get(row.locRef.path);
            const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
            if (locQty - row.line.quantity < -0.000001) {
                throw new HttpsError('failed-precondition', `رصيد الرف غير كافٍ للصنف ${row.line.itemName}.`);
            }
        }
        for (const row of stockRows) {
            const balSnap = balanceSnapByPath.get(row.balRef.path);
            const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
            t.set(row.balRef, stripUndefined({
                warehouseId: current.warehouseId,
                warehouseName: current.warehouseName,
                itemType: 'material',
                itemId: row.line.itemId,
                itemName: row.line.itemName,
                itemCode: row.line.itemCode,
                unit: row.line.unit,
                quantity: Math.max(0, balQty - row.quantity),
                minStock: toNumber(balSnap?.data()?.minStock),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        for (const row of locationRows) {
            const locSnap = balanceSnapByPath.get(row.locRef.path);
            const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
            t.set(row.locRef, stripUndefined({
                warehouseId: current.warehouseId,
                warehouseName: current.warehouseName,
                locationId: row.line.locationId,
                locationCode: row.line.locationCode || row.line.locationId,
                itemType: 'material',
                itemId: row.line.itemId,
                itemName: row.line.itemName,
                itemCode: row.line.itemCode,
                unit: row.line.unit,
                quantity: locQty - row.line.quantity,
                minStock: toNumber(locSnap?.data()?.minStock),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const invRef = formatInvReference(nextInv);
            nextInv += 1;
            t.set(movementRefs[i], stripUndefined({
                warehouseId: current.warehouseId,
                warehouseName: current.warehouseName,
                locationId: line.locationId,
                locationCode: line.locationCode,
                itemType: 'material',
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                movementType: 'OUT',
                quantity: line.quantity,
                unit: line.unit,
                note: `صرف مستهلكات ${current.referenceNo} — ${current.departmentName}`,
                referenceNo: invRef,
                sourceModule: SOURCE_ISSUE,
                sourceId: issueId,
                departmentId: current.departmentId,
                departmentName: current.departmentName,
                sourceLineId: line.lineId || issueLineId(line.itemId, line.locationId),
                unitCostSnapshot: line.unitCostSnapshot,
                totalCostSnapshot: line.totalCostSnapshot,
                createdAt: now,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                tenantId: actor.tenantId,
            }));
        }
        t.set(counterRef, {
            tenantId: actor.tenantId,
            lastInvSeq: nextInv - 1,
            updatedAt: now,
        }, { merge: true });
        t.update(issueRef, {
            status: 'issued',
            lines,
            issuedAt: now,
            issuedBy: actor.displayName,
            issuedByUserId: actor.uid,
            totalCostSnapshot: roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0)),
        });
        return {
            referenceNo: live.referenceNo,
            issue: { ...live, status: 'issued', lines },
            changed: true,
        };
    });
}
export async function addDepartmentConsumableStockHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.create', 'inventory.transactions.create'], 'لا تملك صلاحية إضافة مستهلكات للمخزن.');
        if (!actor.tenantId)
            throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');
        const settingsSnap = await db.collection(SYSTEM_SETTINGS_COLLECTION).doc(actor.tenantId).get();
        assertOperationPathEnabledServer(settingsSnap.data(), STOCK_MOVE_OPERATION_KEY, CONSUMABLE_ADD_STOCK_PATH);
        const data = (request.data || {});
        const warehouse = await resolveWarehouse(actor.tenantId, String(data.warehouseId || ''));
        assertActorIssueWarehouse(actor, warehouse.id);
        const quantity = toNumber(data.quantity);
        if (!(quantity > 0)) {
            throw new HttpsError('invalid-argument', 'أدخل كمية أكبر من صفر.');
        }
        const material = await resolveConsumableMaterial(actor.tenantId, String(data.itemId || ''));
        const [locations, locationBalances, defaultLocationId] = await Promise.all([
            activeLocationsForWarehouse(actor.tenantId, warehouse.id),
            loadItemLocationBalances(actor.tenantId, warehouse.id, material.itemId),
            loadDefaultLocationId(warehouse.id, material.itemId),
        ]);
        const dest = resolveConsumableAddLocation({
            locations: locations.map((loc) => ({ id: loc.id, code: loc.code })),
            defaultLocationId: defaultLocationId || String(data.locationId || '').trim(),
            locationBalances,
        });
        const line = {
            lineId: issueLineId(material.itemId, dest?.locationId),
            itemType: 'material',
            itemId: material.itemId,
            itemName: material.itemName,
            itemCode: material.itemCode,
            unit: material.unit,
            quantity,
            ...(dest
                ? { locationId: dest.locationId, locationCode: dest.locationCode }
                : {}),
            unitCostSnapshot: material.unitCost,
            totalCostSnapshot: roundMoney(material.unitCost * quantity),
            returnedQty: 0,
        };
        const note = String(data.note || '').trim().slice(0, 500)
            || `إضافة مستهلكات — ${line.itemName}`;
        const txRef = db.collection(STOCK_TRANSACTIONS_COLLECTION).doc();
        const balRef = db.collection(STOCK_ITEMS_COLLECTION).doc(balanceDocId(warehouse.id, line.itemId));
        const locRef = line.locationId
            ? db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(locationBalanceDocId(warehouse.id, line.locationId, line.itemId))
            : null;
        const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
        const now = toIsoNow();
        const referenceNo = await db.runTransaction(async (t) => {
            const counterSnap = await t.get(counterRef);
            const balSnap = await t.get(balRef);
            const locSnap = locRef ? await t.get(locRef) : null;
            const nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
            const refNo = formatInvReference(nextInv);
            const nextQty = toNumber(balSnap.data()?.quantity) + line.quantity;
            const nextLocQty = toNumber(locSnap?.data()?.quantity) + line.quantity;
            t.set(counterRef, {
                tenantId: actor.tenantId,
                lastInvSeq: nextInv,
                updatedAt: now,
            }, { merge: true });
            t.set(txRef, stripUndefined({
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                locationId: line.locationId,
                locationCode: line.locationCode,
                itemType: 'material',
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                movementType: 'IN',
                quantity: line.quantity,
                unit: line.unit,
                note,
                referenceNo: refNo,
                sourceModule: SOURCE_ADD_STOCK,
                sourceId: `CNS-IN-${txRef.id}`,
                unitCostSnapshot: line.unitCostSnapshot,
                totalCostSnapshot: line.totalCostSnapshot,
                createdAt: now,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                tenantId: actor.tenantId,
            }));
            t.set(balRef, stripUndefined({
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                itemType: 'material',
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                quantity: nextQty,
                minStock: toNumber(balSnap.data()?.minStock),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
            if (locRef && line.locationId) {
                t.set(locRef, stripUndefined({
                    warehouseId: warehouse.id,
                    warehouseName: warehouse.name,
                    locationId: line.locationId,
                    locationCode: line.locationCode || line.locationId,
                    itemType: 'material',
                    itemId: line.itemId,
                    itemName: line.itemName,
                    itemCode: line.itemCode,
                    unit: line.unit,
                    quantity: nextLocQty,
                    minStock: toNumber(locSnap?.data()?.minStock),
                    updatedAt: now,
                    lastMovementAt: now,
                    tenantId: actor.tenantId,
                }), { merge: true });
            }
            return refNo;
        });
        await writeAudit({
            actor,
            action: 'add_stock',
            entityId: txRef.id,
            description: `إضافة مستهلك ${line.itemName} (${line.quantity} ${line.unit}) إلى ${warehouse.name}${line.locationCode ? ` — رف ${line.locationCode}` : ''}`,
            metadata: {
                warehouseId: warehouse.id,
                itemId: line.itemId,
                quantity: line.quantity,
                locationId: line.locationId,
                referenceNo,
            },
        });
        if (line.locationId && line.locationCode) {
            await rememberDefaultItemLocation({
                tenantId: actor.tenantId,
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                locationId: line.locationId,
                locationCode: line.locationCode,
            });
        }
        return { id: txRef.id, referenceNo };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر إضافة الكمية للمخزن.');
    }
}
export async function createDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.create', 'inventory.transactions.create'], 'لا تملك صلاحية إنشاء صرف مستهلكات.');
        if (!actor.tenantId)
            throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');
        const data = (request.data || {});
        const [warehouse, department, approvalMode] = await Promise.all([
            resolveWarehouse(actor.tenantId, String(data.warehouseId || '')),
            resolveDepartment(actor.tenantId, String(data.departmentId || '')),
            loadApprovalMode(actor.tenantId),
        ]);
        assertActorIssueWarehouse(actor, warehouse.id);
        const lines = await resolveLines({
            tenantId: actor.tenantId,
            warehouseId: warehouse.id,
            lines: data.lines || [],
        });
        const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
        const now = toIsoNow();
        const issueRef = db.collection(ISSUES_COLLECTION).doc();
        const referenceNo = await db.runTransaction(async (t) => {
            const counterSnap = await t.get(counterRef);
            const nextSeq = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastDciSeq) + 1));
            const refNo = formatDciReference(nextSeq);
            t.set(counterRef, {
                tenantId: actor.tenantId,
                lastDciSeq: nextSeq,
                updatedAt: now,
            }, { merge: true });
            const payload = {
                referenceNo: refNo,
                status: 'draft',
                approvalMode,
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                departmentId: department.id,
                departmentName: department.name,
                lines,
                note: String(data.note || '').trim() || undefined,
                totalCostSnapshot: roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0)),
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                tenantId: actor.tenantId,
            };
            t.set(issueRef, stripUndefined(payload));
            return refNo;
        });
        await writeAudit({
            actor,
            action: 'create',
            entityId: issueRef.id,
            description: `إنشاء سند صرف مستهلكات ${referenceNo}`,
            metadata: {
                departmentId: department.id,
                warehouseId: warehouse.id,
                approvalMode,
            },
        });
        return { id: issueRef.id, referenceNo, status: 'draft' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر إنشاء سند صرف المستهلكات.');
    }
}
export async function submitDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.create', 'inventory.transactions.create'], 'لا تملك صلاحية تقديم سند الصرف.');
        const issueId = String(request.data?.issueId || '').trim();
        const { id } = await loadIssue(issueId, actor);
        const { data } = await transitionIssueStatus({
            actor,
            issueId: id,
            nextStatus: 'submitted',
            validate: (current) => {
                if (current.approvalMode !== 'required') {
                    throw new HttpsError('failed-precondition', 'هذا السند لا يتطلب تقديم موافقة.');
                }
                if (current.status !== 'draft') {
                    throw new HttpsError('failed-precondition', 'لا يمكن تقديم سند ليس مسودة.');
                }
            },
            fields: (now) => ({
                submittedAt: now,
                submittedBy: actor.displayName,
                submittedByUserId: actor.uid,
            }),
        });
        await writeAudit({
            actor,
            action: 'submit',
            entityId: id,
            description: `تقديم سند صرف مستهلكات ${data.referenceNo}`,
        });
        return { id, status: 'submitted' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تقديم سند الصرف.');
    }
}
export async function approveDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.approve', 'inventory.transfers.approve'], 'لا تملك صلاحية اعتماد سند الصرف.');
        const issueId = String(request.data?.issueId || '').trim();
        const { id } = await loadIssue(issueId, actor);
        const { data } = await transitionIssueStatus({
            actor,
            issueId: id,
            nextStatus: 'approved',
            validate: (current) => {
                if (current.approvalMode !== 'required' || current.status !== 'submitted') {
                    throw new HttpsError('failed-precondition', 'لا يمكن اعتماد هذا السند في حالته الحالية.');
                }
            },
            fields: (now) => ({
                approvedAt: now,
                approvedBy: actor.displayName,
                approvedByUserId: actor.uid,
            }),
        });
        await writeAudit({
            actor,
            action: 'approve',
            entityId: id,
            description: `اعتماد سند صرف مستهلكات ${data.referenceNo}`,
        });
        return { id, status: 'approved' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر اعتماد سند الصرف.');
    }
}
export async function rejectDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.approve', 'inventory.transfers.approve'], 'لا تملك صلاحية رفض سند الصرف.');
        const payload = (request.data || {});
        const { id } = await loadIssue(String(payload.issueId || ''), actor);
        const { data } = await transitionIssueStatus({
            actor,
            issueId: id,
            nextStatus: 'rejected',
            validate: (current) => {
                if (current.approvalMode !== 'required'
                    || (current.status !== 'submitted' && current.status !== 'approved')) {
                    throw new HttpsError('failed-precondition', 'لا يمكن رفض هذا السند في حالته الحالية.');
                }
            },
            fields: (now) => ({
                rejectedAt: now,
                rejectedBy: actor.displayName,
                rejectedByUserId: actor.uid,
                rejectionReason: String(payload.reason || '').trim().slice(0, 500) || 'مرفوض',
            }),
        });
        await writeAudit({
            actor,
            action: 'reject',
            entityId: id,
            description: `رفض سند صرف مستهلكات ${data.referenceNo}`,
        });
        return { id, status: 'rejected' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر رفض سند الصرف.');
    }
}
export async function issueDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.issue', 'inventory.transactions.create'], 'لا تملك صلاحية تنفيذ صرف المستهلكات.');
        const issueId = String(request.data?.issueId || '').trim();
        const { id } = await loadIssue(issueId, actor);
        const result = await postIssueMovements({ actor, issueId: id });
        if (result.changed) {
            await writeAudit({
                actor,
                action: 'issue',
                entityId: id,
                description: `تنفيذ صرف مستهلكات ${result.referenceNo}`,
                metadata: {
                    departmentId: result.issue.departmentId,
                    warehouseId: result.issue.warehouseId,
                },
            });
        }
        return { id, status: 'issued', referenceNo: result.referenceNo };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تنفيذ صرف المستهلكات.');
    }
}
export async function cancelDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.create', 'inventory.transactions.create'], 'لا تملك صلاحية إلغاء سند الصرف.');
        const issueId = String(request.data?.issueId || '').trim();
        const { id } = await loadIssue(issueId, actor);
        const { data, changed } = await transitionIssueStatus({
            actor,
            issueId: id,
            nextStatus: 'cancelled',
            idempotent: true,
            validate: (current) => {
                if (!['draft', 'submitted', 'approved', 'rejected'].includes(current.status)) {
                    const message = current.status === 'issued'
                        ? 'لا يمكن إلغاء سند منفّذ. استخدم المرتجع.'
                        : 'لا يمكن إلغاء السند في حالته الحالية.';
                    throw new HttpsError('failed-precondition', message);
                }
            },
            fields: (now) => ({
                cancelledAt: now,
                cancelledBy: actor.displayName,
                cancelledByUserId: actor.uid,
            }),
        });
        if (changed) {
            await writeAudit({
                actor,
                action: 'cancel',
                entityId: id,
                description: `إلغاء سند صرف مستهلكات ${data.referenceNo}`,
            });
        }
        return { id, status: 'cancelled' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر إلغاء سند الصرف.');
    }
}
export async function returnDepartmentConsumableIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.issue', 'inventory.transactions.create'], 'لا تملك صلاحية تسجيل مرتجع مستهلكات.');
        const payload = (request.data || {});
        const { id, data } = await loadIssue(String(payload.issueId || ''), actor);
        const returns = Array.isArray(payload.lines) ? payload.lines : [];
        if (returns.length === 0) {
            throw new HttpsError('invalid-argument', 'أضف بند مرتجع واحد على الأقل.');
        }
        if (returns.length > MAX_LINES) {
            throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
        }
        await db.runTransaction(async (t) => {
            const issueRef = db.collection(ISSUES_COLLECTION).doc(id);
            const issueSnap = await t.get(issueRef);
            if (!issueSnap.exists)
                throw new HttpsError('not-found', 'سند الصرف غير موجود.');
            const current = issueSnap.data();
            assertSameTenant(current.tenantId, actor.tenantId);
            assertActorIssueWarehouse(actor, current.warehouseId);
            if (current.status !== 'issued') {
                throw new HttpsError('failed-precondition', 'لا يمكن تسجيل مرتجع إلا لسند منفّذ.');
            }
            const now = toIsoNow();
            const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
            const counterSnap = await t.get(counterRef);
            let nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
            const nextLines = current.lines.map((line) => ({
                ...line,
                lineId: line.lineId || issueLineId(line.itemId, line.locationId),
            }));
            const indexByLineId = new Map(nextLines.map((line, index) => [line.lineId, index]));
            const seenLineIds = new Set();
            const resolvedReturns = [];
            for (const row of returns) {
                const requestedLineId = String(row.lineId || '').trim();
                const itemId = String(row.itemId || '').trim();
                const locationId = String(row.locationId || '').trim();
                const quantity = toNumber(row.quantity);
                if ((!requestedLineId && !itemId) || !(quantity > 0)) {
                    throw new HttpsError('invalid-argument', 'بيانات المرتجع غير صالحة.');
                }
                const targetLineId = requestedLineId || issueLineId(itemId, locationId);
                const idx = indexByLineId.get(targetLineId);
                if (idx == null) {
                    throw new HttpsError('failed-precondition', 'بند الصنف والرف غير موجود في سند الصرف.');
                }
                if (seenLineIds.has(targetLineId)) {
                    throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس بند المرتجع.');
                }
                seenLineIds.add(targetLineId);
                const source = nextLines[idx];
                if (itemId && itemId !== source.itemId) {
                    throw new HttpsError('invalid-argument', 'الصنف لا يطابق بند المرتجع.');
                }
                if (locationId && locationId !== String(source.locationId || '')) {
                    throw new HttpsError('invalid-argument', 'الرف لا يطابق بند المرتجع.');
                }
                const remaining = toNumber(source.quantity) - toNumber(source.returnedQty);
                if (quantity > remaining + 0.000001) {
                    throw new HttpsError('failed-precondition', `كمية المرتجع لـ ${source.itemName} تتجاوز المتاح (${remaining}).`);
                }
                nextLines[idx] = {
                    ...source,
                    returnedQty: toNumber(source.returnedQty) + quantity,
                };
                resolvedReturns.push({ row, source, quantity });
            }
            const stockByItem = new Map();
            const locationByPath = new Map();
            for (const resolved of resolvedReturns) {
                const stockRow = stockByItem.get(resolved.source.itemId);
                if (stockRow) {
                    stockRow.quantity += resolved.quantity;
                }
                else {
                    stockByItem.set(resolved.source.itemId, {
                        source: resolved.source,
                        quantity: resolved.quantity,
                        ref: db.collection(STOCK_ITEMS_COLLECTION).doc(balanceDocId(current.warehouseId, resolved.source.itemId)),
                    });
                }
                if (resolved.source.locationId) {
                    const ref = db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(locationBalanceDocId(current.warehouseId, resolved.source.locationId, resolved.source.itemId));
                    const locationRow = locationByPath.get(ref.path);
                    if (locationRow) {
                        locationRow.quantity += resolved.quantity;
                    }
                    else {
                        locationByPath.set(ref.path, {
                            source: resolved.source,
                            quantity: resolved.quantity,
                            ref,
                        });
                    }
                }
            }
            const stockRows = Array.from(stockByItem.values());
            const locationRows = Array.from(locationByPath.values());
            const balanceRefs = [
                ...stockRows.map((row) => row.ref),
                ...locationRows.map((row) => row.ref),
            ];
            const balanceSnaps = balanceRefs.length > 0 ? await t.getAll(...balanceRefs) : [];
            const balanceSnapByPath = new Map(balanceSnaps.map((snap) => [snap.ref.path, snap]));
            const movementRefs = resolvedReturns.map(() => db.collection(STOCK_TRANSACTIONS_COLLECTION).doc());
            for (const stockRow of stockRows) {
                const balSnap = balanceSnapByPath.get(stockRow.ref.path);
                const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
                t.set(stockRow.ref, stripUndefined({
                    warehouseId: current.warehouseId,
                    warehouseName: current.warehouseName,
                    itemType: 'material',
                    itemId: stockRow.source.itemId,
                    itemName: stockRow.source.itemName,
                    itemCode: stockRow.source.itemCode,
                    unit: stockRow.source.unit,
                    quantity: balQty + stockRow.quantity,
                    minStock: toNumber(balSnap?.data()?.minStock),
                    updatedAt: now,
                    lastMovementAt: now,
                    tenantId: actor.tenantId,
                }), { merge: true });
            }
            for (const locationRow of locationRows) {
                const locSnap = balanceSnapByPath.get(locationRow.ref.path);
                const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
                t.set(locationRow.ref, stripUndefined({
                    warehouseId: current.warehouseId,
                    warehouseName: current.warehouseName,
                    locationId: locationRow.source.locationId,
                    locationCode: locationRow.source.locationCode || locationRow.source.locationId,
                    itemType: 'material',
                    itemId: locationRow.source.itemId,
                    itemName: locationRow.source.itemName,
                    itemCode: locationRow.source.itemCode,
                    unit: locationRow.source.unit,
                    quantity: locQty + locationRow.quantity,
                    minStock: toNumber(locSnap?.data()?.minStock),
                    updatedAt: now,
                    lastMovementAt: now,
                    tenantId: actor.tenantId,
                }), { merge: true });
            }
            for (let i = 0; i < resolvedReturns.length; i += 1) {
                const { row, source, quantity } = resolvedReturns[i];
                const locationId = String(source.locationId || '').trim();
                const unitCost = toNumber(source.unitCostSnapshot);
                t.set(movementRefs[i], stripUndefined({
                    warehouseId: current.warehouseId,
                    warehouseName: current.warehouseName,
                    locationId: locationId || undefined,
                    locationCode: locationId
                        ? String(source.locationCode || locationId)
                        : undefined,
                    itemType: 'material',
                    itemId: source.itemId,
                    itemName: source.itemName,
                    itemCode: source.itemCode,
                    movementType: 'IN',
                    quantity,
                    unit: source.unit,
                    note: `مرتجع مستهلكات ${current.referenceNo}${row.note ? ` — ${String(row.note).trim().slice(0, 500)}` : ''}`,
                    referenceNo: formatInvReference(nextInv),
                    sourceModule: SOURCE_RETURN,
                    sourceId: id,
                    departmentId: current.departmentId,
                    departmentName: current.departmentName,
                    sourceLineId: source.lineId,
                    unitCostSnapshot: unitCost,
                    totalCostSnapshot: roundMoney(unitCost * quantity),
                    createdAt: now,
                    createdBy: actor.displayName,
                    createdByUserId: actor.uid,
                    tenantId: actor.tenantId,
                }));
                nextInv += 1;
            }
            t.set(counterRef, {
                tenantId: actor.tenantId,
                lastInvSeq: nextInv - 1,
                updatedAt: now,
            }, { merge: true });
            t.update(issueRef, { lines: nextLines });
        });
        await writeAudit({
            actor,
            action: 'return',
            entityId: id,
            description: `مرتجع مستهلكات لسند ${data.referenceNo}`,
        });
        return { id, ok: true };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تسجيل مرتجع المستهلكات.');
    }
}
export async function getDepartmentConsumableMonthlyReportHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['departmentConsumables.view', 'departmentConsumables.export', 'inventory.view'], 'لا تملك صلاحية عرض تقرير مستهلكات الأقسام.');
        const data = (request.data || {});
        const month = String(data.month || '').trim();
        if (!/^\d{4}-\d{2}$/.test(month)) {
            throw new HttpsError('invalid-argument', 'صيغة الشهر يجب أن تكون YYYY-MM.');
        }
        const departmentId = String(data.departmentId || '').trim() || undefined;
        let warehouseId = String(data.warehouseId || '').trim() || undefined;
        if (actor.boundWarehouseId) {
            if (warehouseId && warehouseId !== actor.boundWarehouseId) {
                throw new HttpsError('permission-denied', 'هذا الحساب مرتبط بمخزن آخر.');
            }
            warehouseId = actor.boundWarehouseId;
        }
        const [year, mon] = month.split('-').map(Number);
        const startIso = new Date(Date.UTC(year, mon - 1, 1)).toISOString();
        const endExclusiveIso = new Date(Date.UTC(year, mon, 1)).toISOString();
        let query = db
            .collection(STOCK_TRANSACTIONS_COLLECTION)
            .where('tenantId', '==', actor.tenantId);
        if (departmentId) {
            query = query.where('departmentId', '==', departmentId);
        }
        if (warehouseId) {
            query = query.where('warehouseId', '==', warehouseId);
        }
        query = query
            .where('createdAt', '>=', startIso)
            .where('createdAt', '<', endExclusiveIso)
            .orderBy('createdAt', 'asc')
            .limit(5000);
        const snap = await query.get();
        const map = new Map();
        const issueIds = new Set();
        let totalIssuedCost = 0;
        let totalReturnedCost = 0;
        snap.docs.forEach((docSnap) => {
            const tx = docSnap.data();
            const isIssue = tx.sourceModule === SOURCE_ISSUE && tx.movementType === 'OUT';
            const isReturn = tx.sourceModule === SOURCE_RETURN && tx.movementType === 'IN';
            if (!isIssue && !isReturn)
                return;
            const deptId = String(tx.departmentId || '').trim();
            const itemId = String(tx.itemId || '').trim();
            const unit = String(tx.unit || 'piece').trim() || 'piece';
            if (!deptId || !itemId)
                return;
            const key = `${deptId}__${itemId}__${unit}`;
            const existing = map.get(key) || {
                departmentId: deptId,
                departmentName: String(tx.departmentName || deptId),
                itemId,
                itemName: String(tx.itemName || itemId),
                itemCode: String(tx.itemCode || ''),
                unit,
                issuedQty: 0,
                returnedQty: 0,
                netQty: 0,
                issuedCost: 0,
                returnedCost: 0,
                netCost: 0,
            };
            const qty = Math.abs(toNumber(tx.quantity));
            const cost = Math.abs(toNumber(tx.totalCostSnapshot));
            if (isIssue) {
                existing.issuedQty += qty;
                existing.issuedCost = roundMoney(existing.issuedCost + cost);
                totalIssuedCost = roundMoney(totalIssuedCost + cost);
                if (tx.sourceId)
                    issueIds.add(tx.sourceId);
            }
            else {
                existing.returnedQty += qty;
                existing.returnedCost = roundMoney(existing.returnedCost + cost);
                totalReturnedCost = roundMoney(totalReturnedCost + cost);
            }
            existing.netQty = roundMoney(existing.issuedQty - existing.returnedQty);
            existing.netCost = roundMoney(existing.issuedCost - existing.returnedCost);
            map.set(key, existing);
        });
        const rows = Array.from(map.values()).sort((a, b) => {
            const byDept = a.departmentName.localeCompare(b.departmentName, 'ar');
            if (byDept !== 0)
                return byDept;
            return a.itemName.localeCompare(b.itemName, 'ar');
        });
        return {
            month,
            ...(departmentId ? { departmentId } : {}),
            ...(warehouseId ? { warehouseId } : {}),
            issueCount: issueIds.size,
            totalIssuedCost,
            totalReturnedCost,
            totalNetCost: roundMoney(totalIssuedCost - totalReturnedCost),
            rows,
            truncated: snap.size >= 5000,
        };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تحميل تقرير مستهلكات الأقسام.');
    }
}
