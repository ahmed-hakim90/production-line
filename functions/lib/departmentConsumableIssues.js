import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { assertActorWarehousesAllowed, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
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
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';
const MAX_LINES = 40;
const SOURCE_ISSUE = 'department_consumable_issue';
const SOURCE_RETURN = 'department_consumable_return';
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
    if (roleId) {
        const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
        if (roleSnap.exists) {
            const role = roleSnap.data();
            if (role.tenantId && tenantId && role.tenantId !== tenantId && user.isSuperAdmin !== true) {
                throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
            }
            permissions = role.permissions || {};
        }
    }
    return {
        uid,
        tenantId: tenantId || String(user.tenantId || ''),
        displayName: String(user.displayName || user.name || user.email || uid),
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
        boundWarehouseId: resolveBoundInventoryWarehouseId(user),
    };
};
const hasPermission = (actor, keys) => {
    if (actor.isSuperAdmin)
        return true;
    return keys.some((key) => actor.permissions[key] === true);
};
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
const resolveLines = async (params) => {
    const rawLines = Array.isArray(params.lines) ? params.lines : [];
    if (rawLines.length === 0) {
        throw new HttpsError('invalid-argument', 'أضف بند مستهلك واحد على الأقل.');
    }
    if (rawLines.length > MAX_LINES) {
        throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
    }
    const locations = await activeLocationsForWarehouse(params.tenantId, params.warehouseId);
    const locationsRequired = locations.length > 0;
    const locationById = new Map(locations.map((loc) => [loc.id, loc]));
    const seen = new Set();
    const resolved = [];
    for (const line of rawLines) {
        const itemId = String(line.itemId || '').trim();
        const quantity = toNumber(line.quantity);
        const locationId = String(line.locationId || '').trim();
        if (!itemId)
            throw new HttpsError('invalid-argument', 'حدد الصنف لكل بند.');
        if (!(quantity > 0)) {
            throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
        }
        if (locationsRequired && !locationId) {
            throw new HttpsError('invalid-argument', 'حدد رف المصدر لكل بند.');
        }
        if (locationId) {
            const loc = locationById.get(locationId);
            if (!loc)
                throw new HttpsError('failed-precondition', 'الرف غير نشط أو غير تابع للمخزن.');
        }
        const key = `${itemId}__${locationId || '_'}`;
        if (seen.has(key)) {
            throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس الصنف والرف في نفس السند.');
        }
        seen.add(key);
        const materialSnap = await db.collection(MATERIALS_COLLECTION).doc(itemId).get();
        if (!materialSnap.exists)
            throw new HttpsError('not-found', 'المادة غير موجودة.');
        const material = materialSnap.data();
        assertSameTenant(material.tenantId, params.tenantId);
        if (material.isActive === false) {
            throw new HttpsError('failed-precondition', 'المادة غير نشطة.');
        }
        if (material.type !== 'consumable') {
            throw new HttpsError('failed-precondition', 'يُسمح فقط بالمواد من نوع مستهلكات.');
        }
        const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(material));
        const locationCode = locationId
            ? String(line.locationCode || locationById.get(locationId)?.code || locationId)
            : undefined;
        resolved.push({
            lineId: issueLineId(itemId, locationId),
            itemType: 'material',
            itemId,
            itemName: String(material.name || itemId),
            itemCode: String(material.code || ''),
            unit: String(material.baseUnit || 'piece'),
            quantity,
            ...(locationId ? { locationId, locationCode } : {}),
            unitCostSnapshot: unitCost,
            totalCostSnapshot: roundMoney(unitCost * quantity),
            returnedQty: 0,
        });
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
    return db.runTransaction(async (t) => {
        const issueRef = db.collection(ISSUES_COLLECTION).doc(issueId);
        const issueSnap = await t.get(issueRef);
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
        const lines = current.lines || [];
        if (lines.length === 0) {
            throw new HttpsError('failed-precondition', 'السند لا يحتوي بنوداً.');
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
            if (balQty - row.quantity < -0.000001) {
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
                quantity: balQty - row.quantity,
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
            issuedAt: now,
            issuedBy: actor.displayName,
            issuedByUserId: actor.uid,
            totalCostSnapshot: roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0)),
        });
        return { referenceNo: current.referenceNo, issue: current, changed: true };
    });
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
