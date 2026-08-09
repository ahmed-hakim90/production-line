import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { assertActorWarehousesAllowed, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
import { loadCustomerTypeInTx, pickRepairSalePrice, roundRepairMoney, } from './repairSalePrice.js';
const db = getDb();
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
const BRANCHES_COLLECTION = 'repair_branches';
const JOBS_COLLECTION = 'repair_jobs';
const WAREHOUSES_COLLECTION = 'warehouses';
const WAREHOUSE_LOCATIONS_COLLECTION = 'warehouse_locations';
const MATERIALS_COLLECTION = 'materials';
const SPARE_PARTS_COLLECTION = 'repair_spare_parts';
const SPARE_PARTS_STOCK_COLLECTION = 'repair_spare_parts_stock';
const SPARE_PARTS_TX_COLLECTION = 'repair_parts_transactions';
const ISSUES_COLLECTION = 'repair_spare_issues';
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const INVENTORY_COUNTERS_COLLECTION = 'inventory_counters';
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';
const MAX_LINES = 40;
const SOURCE_ISSUE = 'repair_spare_issue';
const SOURCE_RETURN = 'repair_spare_return';
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
/** Prefer item-keyed line ids when multi-location allocations are used. */
const issueLineIdForItem = (itemId) => issueLineId(itemId, '');
const formatRsiReference = (seq) => `RSI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;
const allocateFromLocationBalances = (balances, requiredQty, preferredLocationId) => {
    let remaining = requiredQty;
    const allocations = [];
    const sorted = balances
        .filter((row) => toNumber(row.quantity) > 0 && String(row.locationId || '').trim())
        .sort((a, b) => {
        if (preferredLocationId) {
            if (a.locationId === preferredLocationId && b.locationId !== preferredLocationId)
                return -1;
            if (b.locationId === preferredLocationId && a.locationId !== preferredLocationId)
                return 1;
        }
        return String(a.lastMovementAt || a.updatedAt || '').localeCompare(String(b.lastMovementAt || b.updatedAt || ''));
    });
    const availableQty = sorted.reduce((sum, row) => sum + toNumber(row.quantity), 0);
    for (const row of sorted) {
        if (remaining <= 0)
            break;
        const take = Math.min(remaining, toNumber(row.quantity));
        allocations.push({
            locationId: String(row.locationId),
            locationCode: String(row.locationCode || row.locationId),
            ...(row.rack ? { rack: String(row.rack) } : {}),
            ...(row.shelf ? { shelf: String(row.shelf) } : {}),
            quantity: take,
        });
        remaining -= take;
    }
    return {
        allocations,
        availableQty,
        shortageQty: Math.max(0, requiredQty - availableQty),
    };
};
const normalizeLineAllocations = (line) => {
    if (Array.isArray(line.allocations) && line.allocations.length > 0) {
        return line.allocations
            .map((row) => ({
            locationId: String(row.locationId || '').trim(),
            locationCode: String(row.locationCode || row.locationId || '').trim(),
            ...(row.rack ? { rack: String(row.rack) } : {}),
            ...(row.shelf ? { shelf: String(row.shelf) } : {}),
            quantity: toNumber(row.quantity),
        }))
            .filter((row) => row.locationId && row.quantity > 0);
    }
    const locationId = String(line.locationId || '').trim();
    if (!locationId)
        return [];
    return [{
            locationId,
            locationCode: String(line.locationCode || locationId).trim(),
            quantity: toNumber(line.quantity),
        }];
};
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
        module: 'repair',
        action: params.action,
        entityType: 'repair_spare_issue',
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
    return data.planSettings?.repairSpareIssueApprovalMode === 'required'
        ? 'required'
        : 'direct';
};
const assertSameTenant = (resourceTenantId, actorTenantId) => {
    const tid = String(resourceTenantId || '').trim();
    if (!tid || tid !== actorTenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول إلى هذا المورد.');
    }
};
const resolveBranch = async (tenantId, branchId) => {
    const id = String(branchId || '').trim();
    if (!id)
        throw new HttpsError('invalid-argument', 'حدد فرع الصيانة.');
    const snap = await db.collection(BRANCHES_COLLECTION).doc(id).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
    const data = snap.data();
    assertSameTenant(data.tenantId, tenantId);
    if (data.isActive === false)
        throw new HttpsError('failed-precondition', 'فرع الصيانة غير نشط.');
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
    const role = String(data.warehouseRole || 'general');
    const code = String(data.code || '').trim().toUpperCase();
    const okRole = role === 'maintenance_center' || /^RWH-\d{3}$/.test(code);
    if (!okRole) {
        throw new HttpsError('failed-precondition', 'المخزن يجب أن يكون مخزن مركز صيانة.');
    }
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
        throw new HttpsError('invalid-argument', 'أضف بند قطعة غيار واحد على الأقل.');
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
        if (!itemId)
            throw new HttpsError('invalid-argument', 'حدد الصنف لكل بند.');
        if (!(quantity > 0)) {
            throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
        }
        if (seen.has(itemId)) {
            throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس الصنف في نفس السند.');
        }
        seen.add(itemId);
        let allocations = normalizeLineAllocations({
            quantity,
            locationId: line.locationId,
            locationCode: line.locationCode,
            allocations: line.allocations,
        });
        let availableQty;
        let shortageQty;
        if (locationsRequired) {
            if (allocations.length === 0) {
                const balSnap = await db
                    .collection(STOCK_LOCATION_BALANCES_COLLECTION)
                    .where('tenantId', '==', params.tenantId)
                    .where('warehouseId', '==', params.warehouseId)
                    .where('itemType', '==', 'material')
                    .where('itemId', '==', itemId)
                    .get();
                const balances = balSnap.docs.map((docSnap) => {
                    const data = docSnap.data();
                    return {
                        locationId: String(data.locationId || ''),
                        locationCode: String(data.locationCode || data.locationId || ''),
                        rack: data.rack,
                        shelf: data.shelf,
                        quantity: toNumber(data.quantity),
                        lastMovementAt: data.lastMovementAt,
                        updatedAt: data.updatedAt,
                    };
                }).filter((row) => locationById.has(row.locationId));
                const preferred = String(line.locationId || '').trim() || undefined;
                const allocated = allocateFromLocationBalances(balances, quantity, preferred);
                allocations = allocated.allocations;
                availableQty = allocated.availableQty;
                shortageQty = allocated.shortageQty;
                if (allocations.length === 0) {
                    throw new HttpsError('failed-precondition', 'لا يوجد رصيد على الأرفف لتحضير هذا الصنف. راجع أرصدة الرفوف أولاً.');
                }
                if (shortageQty > 0.000001) {
                    throw new HttpsError('failed-precondition', `رصيد الأرفف غير كافٍ للصنف. المتاح ${availableQty} والمطلوب ${quantity}.`);
                }
            }
            else {
                const allocatedQty = allocations.reduce((sum, row) => sum + toNumber(row.quantity), 0);
                if (Math.abs(allocatedQty - quantity) > 0.000001) {
                    throw new HttpsError('invalid-argument', 'مجموع توزيع الرفوف يجب أن يساوي كمية البند.');
                }
                for (const allocation of allocations) {
                    if (!locationById.has(allocation.locationId)) {
                        throw new HttpsError('failed-precondition', 'الرف غير نشط أو غير تابع للمخزن.');
                    }
                    allocation.locationCode = String(allocation.locationCode || locationById.get(allocation.locationId)?.code || allocation.locationId);
                }
            }
        }
        else if (allocations.length > 0) {
            throw new HttpsError('failed-precondition', 'هذا المخزن لا يستخدم مواقع أرفف — أزل توزيع الرفوف.');
        }
        const materialSnap = await db.collection(MATERIALS_COLLECTION).doc(itemId).get();
        if (!materialSnap.exists)
            throw new HttpsError('not-found', 'المادة غير موجودة.');
        const material = materialSnap.data();
        assertSameTenant(material.tenantId, params.tenantId);
        if (material.isActive === false) {
            throw new HttpsError('failed-precondition', 'المادة غير نشطة.');
        }
        const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(material));
        const first = allocations[0];
        resolved.push({
            lineId: issueLineIdForItem(itemId),
            itemType: 'material',
            itemId,
            itemName: String(material.name || itemId),
            itemCode: String(material.code || ''),
            unit: String(material.baseUnit || 'piece'),
            quantity,
            ...(first ? { locationId: first.locationId, locationCode: first.locationCode } : {}),
            ...(allocations.length > 0 ? { allocations } : {}),
            ...(availableQty != null ? { availableQty } : {}),
            ...(shortageQty != null ? { shortageQty } : {}),
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
/** Job-facing usage price: Material consumer/trader sale, then legacy part catalog. */
const resolveSparePartSalePrice = async (t, tenantId, input) => {
    const materialIdDirect = String(input.materialId || '').trim();
    const partId = String(input.partId || '').trim();
    let materialId = materialIdDirect;
    if (partId && !materialId) {
        const snap = await t.get(db.collection(SPARE_PARTS_COLLECTION).doc(partId));
        if (snap.exists) {
            const data = snap.data();
            if (String(data.tenantId || '').trim() === tenantId) {
                materialId = String(data.materialId || data.rawMaterialId || '').trim();
            }
        }
    }
    let consumer = 0;
    let trader = 0;
    if (materialId) {
        const matSnap = await t.get(db.collection(MATERIALS_COLLECTION).doc(materialId));
        if (matSnap.exists) {
            const data = matSnap.data();
            if (String(data.tenantId || '').trim() === tenantId) {
                consumer = Number(data.defaultSalePrice || 0);
                trader = Number(data.traderSalePrice || 0);
            }
        }
    }
    const sale = pickRepairSalePrice({
        customerType: input.customerType,
        consumerSalePrice: consumer,
        traderSalePrice: trader,
    });
    return sale > 0 ? roundRepairMoney(sale) : 0;
};
/**
 * Keep center UI ledger (`repair_spare_parts_stock`) in sync with inventory RSI movements.
 * Failures are logged only — inventory SoT already posted.
 */
async function syncRepairBranchStockDelta(input) {
    const branchId = String(input.branchId || '').trim();
    const warehouseId = String(input.warehouseId || '').trim();
    if (!branchId || !warehouseId)
        return;
    const qtyByItem = new Map();
    for (const line of input.lines) {
        const itemId = String(line.itemId || '').trim();
        const quantity = toNumber(line.quantity);
        if (!itemId || !(quantity > 0))
            continue;
        const prev = qtyByItem.get(itemId);
        if (prev) {
            prev.quantity += quantity;
        }
        else {
            qtyByItem.set(itemId, {
                quantity,
                itemName: String(line.itemName || itemId),
            });
        }
    }
    if (qtyByItem.size === 0)
        return;
    const now = toIsoNow();
    const hintPartId = String(input.partIdHint || '').trim();
    for (const [materialId, row] of qtyByItem.entries()) {
        let partId = '';
        if (hintPartId && qtyByItem.size === 1) {
            const hintSnap = await db.collection(SPARE_PARTS_COLLECTION).doc(hintPartId).get();
            if (hintSnap.exists) {
                const hint = hintSnap.data();
                if (String(hint.tenantId || '') === input.tenantId
                    && String(hint.branchId || '') === branchId
                    && (!String(hint.materialId || '').trim()
                        || String(hint.materialId || '').trim() === materialId)) {
                    partId = hintPartId;
                }
            }
        }
        if (!partId) {
            const existingParts = await db
                .collection(SPARE_PARTS_COLLECTION)
                .where('tenantId', '==', input.tenantId)
                .where('branchId', '==', branchId)
                .where('materialId', '==', materialId)
                .limit(1)
                .get();
            if (existingParts.empty)
                continue;
            partId = existingParts.docs[0].id;
        }
        const stockDocId = `${branchId}__${warehouseId}__${partId}`;
        const stockRef = db.collection(SPARE_PARTS_STOCK_COLLECTION).doc(stockDocId);
        const delta = input.direction === 'OUT' ? -row.quantity : row.quantity;
        await db.runTransaction(async (tx) => {
            const stockSnap = await tx.get(stockRef);
            const current = stockSnap.exists ? toNumber(stockSnap.data()?.quantity) : 0;
            const next = current + delta;
            if (next < -0.000001) {
                throw new Error(`رصيد دفتر الفرع غير كافٍ للصنف ${row.itemName}`);
            }
            tx.set(stockRef, {
                tenantId: input.tenantId,
                branchId,
                warehouseId,
                partId,
                quantity: Math.max(0, next),
                updatedAt: now,
            }, { merge: true });
            const txRef = db.collection(SPARE_PARTS_TX_COLLECTION).doc();
            tx.set(txRef, {
                tenantId: input.tenantId,
                branchId,
                warehouseId,
                partId,
                partName: row.itemName,
                quantity: row.quantity,
                type: input.direction,
                notes: `${input.direction === 'OUT' ? 'صرف' : 'مرتجع'} ${input.referenceNo}`,
                createdAt: now,
                createdBy: input.actorName,
                sourceId: input.sourceId,
                sourceModule: input.direction === 'OUT' ? SOURCE_ISSUE : SOURCE_RETURN,
            });
        });
    }
}
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
        const stockByItem = new Map();
        const locationRows = [];
        const movementLegs = [];
        for (const line of lines) {
            const allocations = normalizeLineAllocations(line);
            if (allocations.length > 0) {
                const allocatedQty = allocations.reduce((sum, row) => sum + toNumber(row.quantity), 0);
                if (Math.abs(allocatedQty - toNumber(line.quantity)) > 0.000001) {
                    throw new HttpsError('failed-precondition', `يجب أن يطابق مجموع التوزيع الكمية للصنف ${line.itemName}.`);
                }
            }
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
            if (allocations.length > 0) {
                for (const allocation of allocations) {
                    locationRows.push({
                        line,
                        allocation,
                        locRef: db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(locationBalanceDocId(current.warehouseId, allocation.locationId, line.itemId)),
                    });
                    movementLegs.push({
                        line,
                        quantity: allocation.quantity,
                        locationId: allocation.locationId,
                        locationCode: allocation.locationCode,
                    });
                }
            }
            else {
                movementLegs.push({ line, quantity: line.quantity });
            }
        }
        const movementRefs = movementLegs.map(() => db.collection(STOCK_TRANSACTIONS_COLLECTION).doc());
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
            if (locQty - toNumber(row.allocation.quantity) < -0.000001) {
                throw new HttpsError('failed-precondition', `رصيد الرف غير كافٍ للصنف ${row.line.itemName}.`);
            }
        }
        // All reads must complete before writes in this transaction.
        const jobId = String(current.jobId || '').trim();
        const jobRef = jobId ? db.collection(JOBS_COLLECTION).doc(jobId) : null;
        const jobSnap = jobRef ? await t.get(jobRef) : null;
        const jobCustomerId = jobSnap?.exists
            ? String(jobSnap.data()?.customerId || '').trim()
            : '';
        const customerType = await loadCustomerTypeInTx(t, db, actor.tenantId, jobCustomerId);
        const branchRef = current.branchId
            ? db.collection('repair_branches').doc(String(current.branchId))
            : null;
        const branchSnap = branchRef ? await t.get(branchRef) : null;
        const cogsJournalRef = jobId
            ? db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_parts_cogs__${issueId}`)
            : null;
        const cogsJournalSnap = cogsJournalRef ? await t.get(cogsJournalRef) : null;
        const meta = current.jobPartUsage;
        const primaryMaterialId = String(lines[0]?.itemId || '').trim();
        const salePrice = await resolveSparePartSalePrice(t, actor.tenantId, {
            partId: meta?.partId,
            materialId: primaryMaterialId,
            customerType,
        });
        const salePriceByMaterialId = new Map();
        const uniqueMaterialIds = Array.from(new Set(lines.map((line) => String(line.itemId || '').trim()).filter(Boolean)));
        for (const materialId of uniqueMaterialIds) {
            if (materialId === primaryMaterialId && (!meta?.partId || uniqueMaterialIds.length === 1)) {
                salePriceByMaterialId.set(materialId, salePrice);
                continue;
            }
            salePriceByMaterialId.set(materialId, await resolveSparePartSalePrice(t, actor.tenantId, { materialId, customerType }));
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
                locationId: row.allocation.locationId,
                locationCode: row.allocation.locationCode || row.allocation.locationId,
                itemType: 'material',
                itemId: row.line.itemId,
                itemName: row.line.itemName,
                itemCode: row.line.itemCode,
                unit: row.line.unit,
                quantity: locQty - toNumber(row.allocation.quantity),
                minStock: toNumber(locSnap?.data()?.minStock),
                updatedAt: now,
                lastMovementAt: now,
                tenantId: actor.tenantId,
            }), { merge: true });
        }
        for (let i = 0; i < movementLegs.length; i += 1) {
            const leg = movementLegs[i];
            const line = leg.line;
            const invRef = formatInvReference(nextInv);
            nextInv += 1;
            const unitCost = toNumber(line.unitCostSnapshot);
            t.set(movementRefs[i], stripUndefined({
                warehouseId: current.warehouseId,
                warehouseName: current.warehouseName,
                locationId: leg.locationId,
                locationCode: leg.locationCode,
                itemType: 'material',
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                movementType: 'OUT',
                quantity: leg.quantity,
                unit: line.unit,
                note: `صرف قطع غيار ${current.referenceNo} — ${current.branchName}`,
                referenceNo: invRef,
                sourceModule: SOURCE_ISSUE,
                sourceId: issueId,
                branchId: current.branchId,
                branchName: current.branchName,
                sourceLineId: line.lineId || issueLineIdForItem(line.itemId),
                unitCostSnapshot: unitCost,
                totalCostSnapshot: roundMoney(unitCost * leg.quantity),
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
        const issueCost = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
        if (jobId && cogsJournalRef && !cogsJournalSnap?.exists && issueCost > 0) {
            const branch = branchSnap?.data();
            const accounts = branch?.accountingAccounts;
            const costCenterId = String(branch?.costCenterId || '').trim();
            const cogsCode = String(accounts?.partsCogs || '').trim();
            const inventoryCode = String(accounts?.partsInventory || '').trim();
            if (!costCenterId || !cogsCode || !inventoryCode) {
                throw new HttpsError('failed-precondition', 'أكمل مركز التكلفة وحسابات مخزون وتكلفة قطع الغيار للفرع.');
            }
            t.create(cogsJournalRef, {
                tenantId: actor.tenantId,
                branchId: current.branchId,
                costCenterId,
                source: 'repair_parts_issue',
                sourceId: issueId,
                referenceNo: current.referenceNo,
                status: 'posted',
                postedAt: now,
                createdBy: actor.uid,
                createdByName: actor.displayName,
                totalDebit: issueCost,
                totalCredit: issueCost,
                lines: [
                    { accountCode: cogsCode, accountName: 'تكلفة قطع الغيار المباعة', debit: issueCost, credit: 0, costCenterId },
                    { accountCode: inventoryCode, accountName: 'مخزون قطع غيار الصيانة', debit: 0, credit: issueCost, costCenterId },
                ],
            });
        }
        if (jobRef && jobSnap?.exists) {
            const jobData = jobSnap.data();
            assertSameTenant(jobData.tenantId, actor.tenantId);
            const prev = Array.isArray(jobData.partsUsed) ? [...jobData.partsUsed] : [];
            for (const line of lines) {
                const scope = meta?.scope === 'product' ? 'product' : 'job';
                const usageId = String(meta?.usageId || '').trim();
                const nextRow = stripUndefined({
                    ...(usageId ? { usageId } : {}),
                    partId: String(meta?.partId || line.itemId).trim(),
                    partName: String(meta?.partName || line.itemName).trim(),
                    quantity: line.quantity,
                    // Job customer totals use sale/usage price; inventory movements keep purchase snapshots.
                    unitCost: salePriceByMaterialId.get(String(line.itemId || '').trim()) ?? salePrice,
                    unitCostSnapshot: toNumber(line.unitCostSnapshot),
                    totalCostSnapshot: toNumber(line.totalCostSnapshot),
                    materialId: line.itemId,
                    scope,
                    fulfillmentStatus: 'issued',
                    availabilityAtRequest: 'center',
                    ...(scope === 'product' && meta?.productItemId
                        ? {
                            productItemId: String(meta.productItemId).trim(),
                            productName: String(meta.productName || '').trim() || undefined,
                        }
                        : {}),
                    issueId,
                    issueReferenceNo: current.referenceNo,
                });
                if (usageId) {
                    const idx = prev.findIndex((row) => String(row.usageId || '').trim() === usageId);
                    if (idx >= 0) {
                        prev[idx] = { ...prev[idx], ...nextRow };
                        continue;
                    }
                }
                prev.push(nextRow);
            }
            t.update(jobRef, { partsUsed: prev, updatedAt: now });
        }
        return { referenceNo: current.referenceNo, issue: current, changed: true };
    });
}
export async function createRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.create', 'repair.parts.manage'], 'لا تملك صلاحية إنشاء سند صرف قطع الغيار.');
        if (!actor.tenantId)
            throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');
        const data = (request.data || {});
        const [warehouse, branch, approvalMode] = await Promise.all([
            resolveWarehouse(actor.tenantId, String(data.warehouseId || '')),
            resolveBranch(actor.tenantId, String(data.branchId || '')),
            loadApprovalMode(actor.tenantId),
        ]);
        assertActorIssueWarehouse(actor, warehouse.id);
        const lines = await resolveLines({
            tenantId: actor.tenantId,
            warehouseId: warehouse.id,
            lines: data.lines || [],
        });
        const jobId = String(data.jobId || '').trim() || undefined;
        const jobCode = String(data.jobCode || '').trim() || undefined;
        if (jobId) {
            const jobSnap = await db.collection(JOBS_COLLECTION).doc(jobId).get();
            if (!jobSnap.exists)
                throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
            const job = jobSnap.data();
            assertSameTenant(job.tenantId, actor.tenantId);
            if (String(job.branchId || '').trim() && String(job.branchId || '').trim() !== branch.id) {
                throw new HttpsError('failed-precondition', 'طلب الصيانة لا يتبع نفس الفرع.');
            }
        }
        const rawMeta = data.jobPartUsage;
        const jobPartUsage = rawMeta && String(rawMeta.partId || '').trim()
            ? stripUndefined({
                partId: String(rawMeta.partId).trim(),
                partName: String(rawMeta.partName || '').trim() || undefined,
                scope: rawMeta.scope === 'product' ? 'product' : 'job',
                productItemId: String(rawMeta.productItemId || '').trim() || undefined,
                productName: String(rawMeta.productName || '').trim() || undefined,
                usageId: String(rawMeta.usageId || '').trim() || undefined,
            })
            : undefined;
        const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
        const now = toIsoNow();
        const issueRef = db.collection(ISSUES_COLLECTION).doc();
        const referenceNo = await db.runTransaction(async (t) => {
            const counterSnap = await t.get(counterRef);
            const nextSeq = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastRsiSeq) + 1));
            const refNo = formatRsiReference(nextSeq);
            t.set(counterRef, {
                tenantId: actor.tenantId,
                lastRsiSeq: nextSeq,
                updatedAt: now,
            }, { merge: true });
            const payload = {
                referenceNo: refNo,
                status: 'draft',
                approvalMode,
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                branchId: branch.id,
                branchName: branch.name,
                ...(jobId ? { jobId } : {}),
                ...(jobCode ? { jobCode } : {}),
                ...(jobPartUsage ? { jobPartUsage } : {}),
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
            description: `إنشاء سند صرف قطع غيار ${referenceNo}`,
            metadata: {
                branchId: branch.id,
                warehouseId: warehouse.id,
                ...(jobId ? { jobId } : {}),
                approvalMode,
            },
        });
        return { id: issueRef.id, referenceNo, status: 'draft', approvalMode };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر إنشاء سند صرف قطع الغيار.');
    }
}
export async function submitRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.create', 'repair.parts.manage'], 'لا تملك صلاحية تقديم سند الصرف.');
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
            description: `تقديم سند صرف قطع غيار ${data.referenceNo}`,
        });
        return { id, status: 'submitted' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تقديم سند الصرف.');
    }
}
export async function approveRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.approve', 'repair.parts.manage'], 'لا تملك صلاحية اعتماد سند الصرف.');
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
            description: `اعتماد سند صرف قطع غيار ${data.referenceNo}`,
        });
        return { id, status: 'approved' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر اعتماد سند الصرف.');
    }
}
export async function rejectRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.reject', 'repairSpareIssues.approve', 'repair.parts.manage'], 'لا تملك صلاحية رفض سند الصرف.');
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
            description: `رفض سند صرف قطع غيار ${data.referenceNo}`,
        });
        return { id, status: 'rejected' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر رفض سند الصرف.');
    }
}
export async function issueRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.issue', 'repair.parts.manage'], 'لا تملك صلاحية تنفيذ صرف قطع الغيار.');
        const issueId = String(request.data?.issueId || '').trim();
        const { id } = await loadIssue(issueId, actor);
        const result = await postIssueMovements({ actor, issueId: id });
        if (result.changed) {
            try {
                await syncRepairBranchStockDelta({
                    tenantId: actor.tenantId,
                    branchId: result.issue.branchId,
                    warehouseId: result.issue.warehouseId,
                    lines: (result.issue.lines || []).map((line) => ({
                        itemId: line.itemId,
                        quantity: line.quantity,
                        itemName: line.itemName,
                    })),
                    partIdHint: result.issue.jobPartUsage?.partId,
                    direction: 'OUT',
                    actorName: actor.displayName,
                    referenceNo: result.referenceNo,
                    sourceId: id,
                });
            }
            catch (syncErr) {
                console.error('repair_spare_issue.issue repair stock sync failed', {
                    issueId: id,
                    tenantId: actor.tenantId,
                    message: syncErr instanceof Error ? syncErr.message : String(syncErr),
                });
            }
            await writeAudit({
                actor,
                action: 'issue',
                entityId: id,
                description: `تنفيذ صرف قطع غيار ${result.referenceNo}`,
                metadata: {
                    branchId: result.issue.branchId,
                    warehouseId: result.issue.warehouseId,
                },
            });
        }
        return { id, status: 'issued', referenceNo: result.referenceNo };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تنفيذ صرف قطع الغيار.');
    }
}
export async function cancelRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.cancel', 'repairSpareIssues.create', 'repair.parts.manage'], 'لا تملك صلاحية إلغاء سند الصرف.');
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
                description: `إلغاء سند صرف قطع غيار ${data.referenceNo}`,
            });
        }
        return { id, status: 'cancelled' };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر إلغاء سند الصرف.');
    }
}
export async function returnRepairSpareIssueHandler(request) {
    try {
        const uid = requireAuth(request);
        const actor = await loadActor(uid);
        requirePermission(actor, ['repairSpareIssues.issue', 'repair.parts.manage'], 'لا تملك صلاحية تسجيل مرتجع قطع الغيار.');
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
                const candidates = [
                    requestedLineId,
                    itemId ? issueLineId(itemId, locationId) : '',
                    itemId ? issueLineIdForItem(itemId) : '',
                ].filter(Boolean);
                let idx;
                let targetLineId = '';
                for (const candidate of candidates) {
                    const found = indexByLineId.get(candidate);
                    if (found != null) {
                        idx = found;
                        targetLineId = candidate;
                        break;
                    }
                }
                if (idx == null && itemId) {
                    const byItem = nextLines.findIndex((line) => line.itemId === itemId);
                    if (byItem >= 0) {
                        idx = byItem;
                        targetLineId = nextLines[byItem].lineId || issueLineIdForItem(itemId);
                    }
                }
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
                const sourceAllocations = normalizeLineAllocations(source);
                if (locationId) {
                    const allowed = sourceAllocations.length > 0
                        ? sourceAllocations.some((a) => a.locationId === locationId)
                        : locationId === String(source.locationId || '');
                    if (!allowed) {
                        throw new HttpsError('invalid-argument', 'الرف لا يطابق بند المرتجع.');
                    }
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
                const preferredReturnLoc = String(resolved.row.locationId || '').trim()
                    || String(resolved.source.locationId || '').trim()
                    || String(normalizeLineAllocations(resolved.source)[0]?.locationId || '').trim();
                if (preferredReturnLoc) {
                    const ref = db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(locationBalanceDocId(current.warehouseId, preferredReturnLoc, resolved.source.itemId));
                    const locationRow = locationByPath.get(ref.path);
                    const sourceForLoc = {
                        ...resolved.source,
                        locationId: preferredReturnLoc,
                        locationCode: String(resolved.row.locationCode
                            || resolved.source.locationCode
                            || normalizeLineAllocations(resolved.source).find((a) => a.locationId === preferredReturnLoc)?.locationCode
                            || preferredReturnLoc),
                    };
                    if (locationRow) {
                        locationRow.quantity += resolved.quantity;
                    }
                    else {
                        locationByPath.set(ref.path, {
                            source: sourceForLoc,
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
                    note: `مرتجع قطع الغيار ${current.referenceNo}${row.note ? ` — ${String(row.note).trim().slice(0, 500)}` : ''}`,
                    referenceNo: formatInvReference(nextInv),
                    sourceModule: SOURCE_RETURN,
                    sourceId: id,
                    branchId: current.branchId,
                    branchName: current.branchName,
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
        try {
            const returnLines = returns.map((row) => ({
                itemId: String(row.itemId || '').trim(),
                quantity: toNumber(row.quantity),
                itemName: undefined,
            })).filter((line) => line.itemId && line.quantity > 0);
            // Prefer resolved item ids from the issued document when payload omits them.
            const byLineId = new Map((data.lines || []).map((line) => [
                String(line.lineId || ''),
                line,
            ]));
            const synced = returns.map((row) => {
                const lineId = String(row.lineId || '').trim();
                const fromDoc = lineId ? byLineId.get(lineId) : undefined;
                return {
                    itemId: String(row.itemId || fromDoc?.itemId || '').trim(),
                    quantity: toNumber(row.quantity),
                    itemName: fromDoc?.itemName,
                };
            }).filter((line) => line.itemId && line.quantity > 0);
            await syncRepairBranchStockDelta({
                tenantId: actor.tenantId,
                branchId: data.branchId,
                warehouseId: data.warehouseId,
                lines: synced.length > 0 ? synced : returnLines,
                partIdHint: data.jobPartUsage?.partId,
                direction: 'IN',
                actorName: actor.displayName,
                referenceNo: data.referenceNo,
                sourceId: id,
            });
        }
        catch (syncErr) {
            console.error('repair_spare_issue.return repair stock sync failed', {
                issueId: id,
                tenantId: actor.tenantId,
                message: syncErr instanceof Error ? syncErr.message : String(syncErr),
            });
        }
        await writeAudit({
            actor,
            action: 'return',
            entityId: id,
            description: `مرتجع قطع الغيار لسند ${data.referenceNo}`,
        });
        return { id, ok: true };
    }
    catch (error) {
        throw userSafeError(error, 'تعذر تسجيل مرتجع قطع الغيار.');
    }
}
