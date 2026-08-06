import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { assertActorWarehouseInvolved, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
import { releaseStockInTx, reserveStockInTx, stockAvailableQty, stockReservedQty, } from './stockReservation.js';
const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const WAREHOUSES = 'warehouses';
const MATERIALS = 'materials';
const REQUESTS = 'spare_parts_replenishment_requests';
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';
const COUNTERS = 'inventory_counters';
const ACTIVITY = 'activity_logs';
const MAX_LINES = 40;
const SOURCE = 'spare_parts_replenishment';
const CENTRAL_ROLE = 'spare_parts_central';
const CENTER_ROLE = 'maintenance_center';
const releaseRequestReservations = async (tenantId, fromWarehouseId, reservedLines) => {
    const lines = reservedLines || [];
    if (lines.length === 0)
        return;
    await db.runTransaction(async (tx) => {
        for (const line of lines) {
            const qty = toNumber(line.reservedQty);
            if (!(qty > 0))
                continue;
            const ref = db.collection(STOCK_ITEMS).doc(balanceDocId(fromWarehouseId, line.itemType || 'material', line.itemId));
            const snap = await tx.get(ref);
            releaseStockInTx(tx, ref, { tenantId, qty, label: 'رصيد المخزن المركزي' }, snap.exists ? snap.data() : undefined);
        }
    });
};
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const toIsoNow = () => new Date().toISOString();
const balanceDocId = (warehouseId, itemType, itemId) => `${warehouseId}__${itemType}__${itemId}`;
const materialPurchaseCostPerBaseUnit = (material) => {
    const cost = toNumber(material.purchaseCost);
    const rate = toNumber(material.conversionRate);
    if (rate > 0)
        return cost / rate;
    return cost;
};
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
    if (user.isActive !== true) {
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    }
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId) {
        throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }
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
        displayName: String(user.displayName || user.email || uid).trim() || uid,
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
        boundWarehouseId: resolveBoundInventoryWarehouseId(user),
    };
};
const hasPerm = (actor, key, fallbacks = []) => {
    if (actor.isSuperAdmin)
        return true;
    if (actor.permissions[key] === true)
        return true;
    return fallbacks.some((fb) => actor.permissions[fb] === true);
};
const assertPerm = (actor, key, fallbacks = []) => {
    if (!hasPerm(actor, key, fallbacks)) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    }
};
const loadWarehouse = async (tenantId, warehouseId) => {
    const snap = await db.collection(WAREHOUSES).doc(warehouseId).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'المخزن غير موجود.');
    const data = snap.data();
    if (String(data.tenantId || '').trim() !== tenantId) {
        throw new HttpsError('permission-denied', 'المخزن خارج شركتك.');
    }
    if (data.isActive === false) {
        throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
    }
    return {
        id: snap.id,
        name: String(data.name || snap.id).trim(),
        role: String(data.warehouseRole || 'general').trim(),
        isActive: data.isActive === true || data.isActive == null,
    };
};
/** Prefer explicit fromWarehouseId; otherwise pick the tenant's active spare_parts_central warehouse. */
const resolveCentralWarehouseId = async (tenantId, requestedFromWarehouseId) => {
    const requested = String(requestedFromWarehouseId || '').trim();
    if (requested)
        return requested;
    const snap = await db
        .collection(WAREHOUSES)
        .where('tenantId', '==', tenantId)
        .where('warehouseRole', '==', CENTRAL_ROLE)
        .limit(5)
        .get();
    const active = snap.docs.find((doc) => {
        const data = doc.data();
        return data.isActive !== false;
    });
    if (!active) {
        throw new HttpsError('failed-precondition', 'لا يوجد مخزن قطع غيار مركزي نشط لهذه الشركة.');
    }
    return active.id;
};
const validateDraftLines = (lines) => {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new HttpsError('invalid-argument', 'أضف بند مكوّن واحد على الأقل.');
    }
    if (lines.length > MAX_LINES) {
        throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
    }
    const seen = new Set();
    const out = [];
    for (const line of lines) {
        const itemId = String(line.itemId || '').trim();
        const quantity = toNumber(line.quantity);
        if (!itemId)
            throw new HttpsError('invalid-argument', 'حدد المكوّن لكل بند.');
        if (!(quantity > 0))
            throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
        if (seen.has(itemId)) {
            throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس المكوّن في نفس الطلب.');
        }
        seen.add(itemId);
        out.push({ itemId, quantity });
    }
    return out;
};
const resolveLinesFromMaterials = async (tenantId, drafts) => {
    const resolved = [];
    for (const draft of drafts) {
        const snap = await db.collection(MATERIALS).doc(draft.itemId).get();
        if (!snap.exists) {
            throw new HttpsError('not-found', `المكوّن غير موجود: ${draft.itemId}`);
        }
        const material = snap.data();
        if (String(material.tenantId || '').trim() !== tenantId) {
            throw new HttpsError('permission-denied', 'المكوّن خارج شركتك.');
        }
        if (material.isActive === false) {
            throw new HttpsError('failed-precondition', `المكوّن غير نشط: ${material.name || draft.itemId}`);
        }
        const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(material));
        resolved.push({
            lineId: draft.itemId,
            itemType: 'material',
            itemId: draft.itemId,
            itemName: String(material.name || draft.itemId).trim(),
            itemCode: String(material.code || '').trim(),
            unit: String(material.unit || 'piece').trim() || 'piece',
            requestedQty: draft.quantity,
            preparedQty: draft.quantity,
            unitCostSnapshot: unitCost,
            totalCostSnapshot: roundMoney(unitCost * draft.quantity),
        });
    }
    return resolved;
};
const nextReferenceNo = async (tenantId) => {
    const counterRef = db.collection(COUNTERS).doc(`${tenantId}__spare_parts_replenishment`);
    const next = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? toNumber(snap.data()?.value) : 0;
        const value = current + 1;
        tx.set(counterRef, { value, tenantId, updatedAt: toIsoNow() }, { merge: true });
        return value;
    });
    return `SPR-${String(next).padStart(5, '0')}`;
};
const loadRequest = async (requestId, tenantId) => {
    const ref = db.collection(REQUESTS).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'الطلب غير موجود.');
    const data = snap.data();
    if (String(data.tenantId || '').trim() !== tenantId) {
        throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
    }
    return { ref, data };
};
const writeActivity = async (actor, action, requestId, details) => {
    await db.collection(ACTIVITY).add({
        action,
        entityType: 'spare_parts_replenishment',
        entityId: requestId,
        details,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: toIsoNow(),
        tenantId: actor.tenantId,
    });
};
export const createSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.create', ['inventory.transactions.create']);
    const payload = (request.data || {});
    const toWarehouseId = String(payload.toWarehouseId || '').trim();
    if (!toWarehouseId) {
        throw new HttpsError('invalid-argument', 'حدد مخزن المركز المستلم.');
    }
    const fromWarehouseId = await resolveCentralWarehouseId(actor.tenantId, String(payload.fromWarehouseId || ''));
    if (fromWarehouseId === toWarehouseId) {
        throw new HttpsError('invalid-argument', 'مخزن المصدر والوجهة يجب أن يكونا مختلفين.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [fromWarehouseId, toWarehouseId]);
    const [fromWh, toWh] = await Promise.all([
        loadWarehouse(actor.tenantId, fromWarehouseId),
        loadWarehouse(actor.tenantId, toWarehouseId),
    ]);
    if (fromWh.role !== CENTRAL_ROLE) {
        throw new HttpsError('failed-precondition', 'المخزن المصدر يجب أن يكون دوره «قطع غيار (مركزي)».');
    }
    if (toWh.role !== CENTER_ROLE) {
        throw new HttpsError('failed-precondition', 'المخزن الوجهة يجب أن يكون دوره «مخزن مركز صيانة».');
    }
    const drafts = validateDraftLines(payload.lines || []);
    const lines = await resolveLinesFromMaterials(actor.tenantId, drafts);
    const totalCostSnapshot = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
    const referenceNo = await nextReferenceNo(actor.tenantId);
    const now = toIsoNow();
    const doc = stripUndefined({
        referenceNo,
        status: 'submitted',
        fromWarehouseId,
        fromWarehouseName: fromWh.name,
        toWarehouseId,
        toWarehouseName: toWh.name,
        lines,
        note: String(payload.note || '').trim() || undefined,
        totalCostSnapshot,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
    });
    const ref = db.collection(REQUESTS).doc();
    await ref.set(doc);
    await writeActivity(actor, 'spare_parts_replenishment.create', ref.id, {
        referenceNo,
        fromWarehouseId,
        toWarehouseId,
        lineCount: lines.length,
    });
    return { id: ref.id, referenceNo, status: doc.status };
};
export const approveSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.approve', ['inventory.transfers.approve']);
    const requestId = String(request.data?.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'submitted') {
        throw new HttpsError('failed-precondition', 'لا يمكن اعتماد الطلب في حالته الحالية.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    const now = toIsoNow();
    const reservedLines = [];
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new HttpsError('not-found', 'الطلب غير موجود.');
        const current = snap.data();
        if (current.status !== 'submitted') {
            throw new HttpsError('failed-precondition', 'لا يمكن اعتماد الطلب في حالته الحالية.');
        }
        if (String(current.tenantId || '').trim() !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
        }
        if (current.stockReserved) {
            throw new HttpsError('failed-precondition', 'تم حجز مخزون هذا الطلب مسبقاً.');
        }
        for (const line of current.lines || []) {
            const qty = toNumber(line.requestedQty);
            if (!(qty > 0))
                continue;
            const balRef = db.collection(STOCK_ITEMS).doc(balanceDocId(current.fromWarehouseId, line.itemType, line.itemId));
            const balSnap = await tx.get(balRef);
            const bal = balSnap.exists ? balSnap.data() : undefined;
            reserveStockInTx(tx, balRef, {
                tenantId: actor.tenantId,
                qty,
                warehouseId: current.fromWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                label: `الصنف ${line.itemName}`,
            }, bal);
            reservedLines.push({
                itemId: line.itemId,
                itemType: 'material',
                reservedQty: qty,
            });
        }
        tx.update(ref, {
            status: 'approved',
            approvedAt: now,
            approvedBy: actor.displayName,
            approvedByUserId: actor.uid,
            stockReserved: true,
            reservedLines,
        });
    });
    await writeActivity(actor, 'spare_parts_replenishment.approve', requestId, {
        referenceNo: data.referenceNo,
    });
    return { id: requestId };
};
export const prepareSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.prepare', [
        'inventory.transfers.approve',
        'inventory.transactions.create',
    ]);
    const payload = (request.data || {});
    const requestId = String(payload.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'approved') {
        throw new HttpsError('failed-precondition', 'التجهيز متاح فقط بعد الاعتماد.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    const prepMap = new Map();
    for (const row of payload.lines || []) {
        const key = String(row.lineId || row.itemId || '').trim();
        if (!key)
            continue;
        const qty = toNumber(row.preparedQty);
        if (!(qty > 0)) {
            throw new HttpsError('invalid-argument', 'كمية التجهيز يجب أن تكون أكبر من صفر.');
        }
        prepMap.set(key, qty);
    }
    const lines = (data.lines || []).map((line) => {
        const preparedQty = prepMap.has(line.lineId)
            ? prepMap.get(line.lineId)
            : toNumber(line.preparedQty) > 0
                ? toNumber(line.preparedQty)
                : toNumber(line.requestedQty);
        return {
            ...line,
            preparedQty,
            totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * preparedQty),
        };
    });
    const totalCostSnapshot = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
    const now = toIsoNow();
    await ref.update({
        status: 'prepared',
        lines,
        totalCostSnapshot,
        preparedAt: now,
        preparedBy: actor.displayName,
        preparedByUserId: actor.uid,
    });
    await writeActivity(actor, 'spare_parts_replenishment.prepare', requestId, {
        referenceNo: data.referenceNo,
    });
    return { id: requestId };
};
export const responsibleApproveSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.responsibleApprove', [
        'inventory.transfers.approve',
    ]);
    const requestId = String(request.data?.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'prepared') {
        throw new HttpsError('failed-precondition', 'موافقة المسؤول متاحة بعد التجهيز فقط.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    const now = toIsoNow();
    await ref.update({
        status: 'responsible_approved',
        responsibleApprovedAt: now,
        responsibleApprovedBy: actor.displayName,
        responsibleApprovedByUserId: actor.uid,
    });
    await writeActivity(actor, 'spare_parts_replenishment.responsible_approve', requestId, {
        referenceNo: data.referenceNo,
    });
    return { id: requestId };
};
export const receiveSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.receive', [
        'inventory.transactions.create',
        'inventory.transfers.approve',
    ]);
    const payload = (request.data || {});
    const requestId = String(payload.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'responsible_approved') {
        throw new HttpsError('failed-precondition', 'تأكيد الاستلام متاح بعد موافقة المسؤول فقط.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    const recvMap = new Map();
    for (const row of payload.lines || []) {
        const key = String(row.lineId || row.itemId || '').trim();
        if (!key)
            continue;
        const qty = toNumber(row.receivedQty);
        if (!(qty > 0)) {
            throw new HttpsError('invalid-argument', 'كمية الاستلام يجب أن تكون أكبر من صفر.');
        }
        recvMap.set(key, qty);
    }
    const now = toIsoNow();
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new HttpsError('not-found', 'الطلب غير موجود.');
        const current = snap.data();
        if (current.status !== 'responsible_approved') {
            throw new HttpsError('failed-precondition', 'لا يمكن استلام الطلب في حالته الحالية.');
        }
        if (String(current.tenantId || '').trim() !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
        }
        const nextLines = [];
        for (const line of current.lines || []) {
            const prepared = toNumber(line.preparedQty) > 0
                ? toNumber(line.preparedQty)
                : toNumber(line.requestedQty);
            const receivedQty = recvMap.has(line.lineId)
                ? recvMap.get(line.lineId)
                : prepared;
            if (!(receivedQty > 0)) {
                throw new HttpsError('invalid-argument', `كمية استلام غير صالحة للصنف ${line.itemName}.`);
            }
            const sourceBalRef = db.collection(STOCK_ITEMS).doc(balanceDocId(current.fromWarehouseId, line.itemType, line.itemId));
            const targetBalRef = db.collection(STOCK_ITEMS).doc(balanceDocId(current.toWarehouseId, line.itemType, line.itemId));
            const [sourceBalSnap, targetBalSnap] = await Promise.all([
                tx.get(sourceBalRef),
                tx.get(targetBalRef),
            ]);
            if ((sourceBalSnap.exists
                && String(sourceBalSnap.data()?.tenantId || '') !== actor.tenantId)
                || (targetBalSnap.exists
                    && String(targetBalSnap.data()?.tenantId || '') !== actor.tenantId)) {
                throw new HttpsError('permission-denied', 'رصيد المخزن خارج شركتك.');
            }
            const sourceBal = sourceBalSnap.exists
                ? sourceBalSnap.data()
                : undefined;
            const sourceQty = toNumber(sourceBal?.quantity);
            const targetQty = targetBalSnap.exists ? toNumber(targetBalSnap.data()?.quantity) : 0;
            if (sourceQty < receivedQty) {
                throw new HttpsError('failed-precondition', `الرصيد غير كافٍ في مخزن قطع الغيار للصنف ${line.itemName}.`);
            }
            const reservedForLine = (current.reservedLines || []).find((row) => String(row.itemId) === String(line.itemId));
            // Drop this request's entire hold on receive (covers short receipts too).
            const releaseReserveQty = Math.max(0, toNumber(reservedForLine?.reservedQty));
            const availableAfterOwnHold = stockAvailableQty(sourceBal) + releaseReserveQty;
            if (availableAfterOwnHold + 1e-9 < receivedQty) {
                throw new HttpsError('failed-precondition', `الرصيد المتاح غير كافٍ في مخزن قطع الغيار للصنف ${line.itemName}.`);
            }
            const outTxRef = db.collection(STOCK_TX).doc(`spr_${requestId}_${line.itemId}_out`);
            const inTxRef = db.collection(STOCK_TX).doc(`spr_${requestId}_${line.itemId}_in`);
            const referenceNo = `${current.referenceNo}-R`;
            tx.set(outTxRef, {
                warehouseId: current.fromWarehouseId,
                toWarehouseId: current.toWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                movementType: 'TRANSFER',
                quantity: receivedQty,
                transferDirection: 'OUT',
                relatedTransactionId: inTxRef.id,
                referenceNo,
                note: `تموين قطع غيار ${current.referenceNo}`,
                unitCost: line.unitCostSnapshot,
                totalCost: roundMoney(line.unitCostSnapshot * receivedQty),
                sourceModule: SOURCE,
                sourceId: requestId,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                tenantId: actor.tenantId,
            });
            tx.set(inTxRef, {
                warehouseId: current.toWarehouseId,
                toWarehouseId: current.fromWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                movementType: 'TRANSFER',
                quantity: receivedQty,
                transferDirection: 'IN',
                relatedTransactionId: outTxRef.id,
                referenceNo,
                note: `تموين قطع غيار ${current.referenceNo}`,
                unitCost: line.unitCostSnapshot,
                totalCost: roundMoney(line.unitCostSnapshot * receivedQty),
                sourceModule: SOURCE,
                sourceId: requestId,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                tenantId: actor.tenantId,
            });
            tx.set(sourceBalRef, {
                warehouseId: current.fromWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                minStock: toNumber(sourceBal?.minStock),
                quantity: sourceQty - receivedQty,
                reservedQty: Math.max(0, stockReservedQty(sourceBal) - releaseReserveQty),
                updatedAt: now,
                tenantId: actor.tenantId,
            }, { merge: true });
            tx.set(targetBalRef, {
                warehouseId: current.toWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                minStock: toNumber(targetBalSnap.data()?.minStock),
                quantity: targetQty + receivedQty,
                updatedAt: now,
                tenantId: actor.tenantId,
            }, { merge: true });
            nextLines.push({
                ...line,
                preparedQty: prepared,
                receivedQty,
                totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * receivedQty),
            });
        }
        const totalCostSnapshot = roundMoney(nextLines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
        tx.update(ref, {
            status: 'received',
            lines: nextLines,
            totalCostSnapshot,
            receivedAt: now,
            receivedBy: actor.displayName,
            receivedByUserId: actor.uid,
            stockReserved: false,
            reservedLines: [],
        });
    });
    await writeActivity(actor, 'spare_parts_replenishment.receive', requestId, {
        referenceNo: data.referenceNo,
    });
    // Sync received qty into repair branch spare-parts ledger (jobs consume from that ledger).
    try {
        await syncReceivedQtyToRepairBranchStock({
            tenantId: actor.tenantId,
            toWarehouseId: data.toWarehouseId,
            lines: (await ref.get()).data()?.lines || data.lines,
            actorName: actor.displayName,
            referenceNo: data.referenceNo,
            requestId,
        });
    }
    catch (syncErr) {
        console.error('spare_parts_replenishment.receive repair sync failed', {
            requestId,
            tenantId: actor.tenantId,
            message: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
    }
    // Mark job demand links ready and attempt auto-issue to repair jobs.
    let fulfillSummary = { marked: 0, issued: 0, failed: 0 };
    try {
        const { fulfillJobDemandsAfterReplenishmentReceive } = await import('./repairJobSparePartRequest.js');
        const receivedLines = (await ref.get()).data()?.lines || data.lines;
        fulfillSummary = await fulfillJobDemandsAfterReplenishmentReceive({
            request,
            tenantId: actor.tenantId,
            requestId,
            lines: receivedLines || [],
        });
    }
    catch (fulfillErr) {
        console.error('spare_parts_replenishment.receive job fulfill failed', {
            requestId,
            tenantId: actor.tenantId,
            message: fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr),
        });
    }
    return { id: requestId, fulfillSummary };
};
async function syncReceivedQtyToRepairBranchStock(input) {
    const warehouseId = String(input.toWarehouseId || '').trim();
    if (!warehouseId)
        return;
    const branchSnap = await db
        .collection('repair_branches')
        .where('tenantId', '==', input.tenantId)
        .where('warehouseId', '==', warehouseId)
        .limit(1)
        .get();
    if (branchSnap.empty)
        return;
    const branchDoc = branchSnap.docs[0];
    const branchId = branchDoc.id;
    const now = toIsoNow();
    for (const line of input.lines || []) {
        const receivedQty = toNumber(line.receivedQty);
        if (!(receivedQty > 0))
            continue;
        const materialId = String(line.itemId || '').trim();
        if (!materialId)
            continue;
        const existingParts = await db
            .collection('repair_spare_parts')
            .where('tenantId', '==', input.tenantId)
            .where('branchId', '==', branchId)
            .where('materialId', '==', materialId)
            .limit(1)
            .get();
        let partId = existingParts.empty ? '' : existingParts.docs[0].id;
        if (!partId) {
            const partRef = db.collection('repair_spare_parts').doc();
            await partRef.set({
                tenantId: input.tenantId,
                branchId,
                name: String(line.itemName || materialId),
                code: String(line.itemCode || ''),
                category: 'تموين',
                unit: String(line.unit || 'قطعة'),
                minStock: 0,
                materialId,
                purchaseUnitCost: toNumber(line.unitCostSnapshot),
                createdAt: now,
            });
            partId = partRef.id;
        }
        const stockDocId = `${branchId}__${warehouseId}__${partId}`;
        const stockRef = db.collection('repair_spare_parts_stock').doc(stockDocId);
        await db.runTransaction(async (tx) => {
            const stockSnap = await tx.get(stockRef);
            const current = stockSnap.exists ? toNumber(stockSnap.data()?.quantity) : 0;
            tx.set(stockRef, {
                tenantId: input.tenantId,
                branchId,
                warehouseId,
                partId,
                quantity: current + receivedQty,
                updatedAt: now,
            }, { merge: true });
            const txRef = db.collection('repair_parts_transactions').doc();
            tx.set(txRef, {
                tenantId: input.tenantId,
                branchId,
                warehouseId,
                partId,
                partName: String(line.itemName || ''),
                type: 'IN',
                quantity: receivedQty,
                unitCost: toNumber(line.unitCostSnapshot),
                note: `تموين ${input.referenceNo}`,
                createdBy: input.actorName,
                createdAt: now,
                sourceModule: 'spare_parts_replenishment',
                sourceId: input.requestId,
            });
        });
    }
}
export const rejectSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.approve', ['inventory.transfers.approve']);
    const payload = (request.data || {});
    const requestId = String(payload.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'submitted' && data.status !== 'approved') {
        throw new HttpsError('failed-precondition', 'لا يمكن رفض الطلب في حالته الحالية.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    if (data.stockReserved) {
        await releaseRequestReservations(actor.tenantId, data.fromWarehouseId, data.reservedLines);
    }
    const now = toIsoNow();
    await ref.update(stripUndefined({
        status: 'rejected',
        rejectedAt: now,
        rejectedBy: actor.displayName,
        rejectedByUserId: actor.uid,
        rejectionReason: String(payload.reason || '').trim() || undefined,
        stockReserved: false,
        reservedLines: [],
    }));
    await writeActivity(actor, 'spare_parts_replenishment.reject', requestId, {
        referenceNo: data.referenceNo,
    });
    return { id: requestId };
};
export const cancelSparePartsReplenishmentHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, 'sparePartsReplenishment.create', [
        'inventory.transactions.create',
        'inventory.transfers.approve',
    ]);
    const requestId = String(request.data?.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'requestId مطلوب.');
    const { ref, data } = await loadRequest(requestId, actor.tenantId);
    if (data.status !== 'submitted'
        && data.status !== 'approved'
        && data.status !== 'prepared'
        && data.status !== 'responsible_approved') {
        throw new HttpsError('failed-precondition', 'لا يمكن إلغاء الطلب في حالته الحالية.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);
    if (data.stockReserved) {
        await releaseRequestReservations(actor.tenantId, data.fromWarehouseId, data.reservedLines);
    }
    const now = toIsoNow();
    await ref.update({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actor.displayName,
        cancelledByUserId: actor.uid,
        stockReserved: false,
        reservedLines: [],
    });
    await writeActivity(actor, 'spare_parts_replenishment.cancel', requestId, {
        referenceNo: data.referenceNo,
    });
    return { id: requestId };
};
