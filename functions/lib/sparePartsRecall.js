/**
 * Central spare-parts operator: read maintenance-center balances + recall stock to central.
 * Recall: submitted → confirmed (TRANSFER center → central) | cancelled
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { assertActorWarehouseInvolved, resolveBoundInventoryWarehouseId, } from './inventoryWarehouseScope.js';
const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const WAREHOUSES = 'warehouses';
const MATERIALS = 'materials';
const REQUESTS = 'spare_parts_recall_requests';
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';
const COUNTERS = 'inventory_counters';
const ACTIVITY = 'activity_logs';
const MAX_LINES = 40;
const SOURCE = 'spare_parts_recall';
const CENTRAL_ROLE = 'spare_parts_central';
const CENTER_ROLE = 'maintenance_center';
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
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
        if (String(role.tenantId || '') !== tenantId && user.isSuperAdmin !== true) {
            throw new HttpsError('permission-denied', 'دور المستخدم خارج المستأجر.');
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
const hasPerm = (actor, key) => actor.isSuperAdmin || actor.permissions[key] === true;
const requirePerm = (actor, key, message) => {
    if (!hasPerm(actor, key))
        throw new HttpsError('permission-denied', message);
};
const writeActivity = async (actor, action, entityId, meta) => {
    await db.collection(ACTIVITY).add({
        tenantId: actor.tenantId,
        actorUserId: actor.uid,
        actorName: actor.displayName,
        action,
        entityType: 'spare_parts_recall',
        entityId,
        meta: meta || {},
        createdAt: toIsoNow(),
    });
};
const loadWarehouse = async (tenantId, warehouseId) => {
    const snap = await db.collection(WAREHOUSES).doc(warehouseId).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'المخزن غير موجود.');
    const data = snap.data();
    if (String(data.tenantId || '') !== tenantId) {
        throw new HttpsError('permission-denied', 'المخزن خارج المستأجر.');
    }
    if (data.isActive === false) {
        throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
    }
    return {
        id: warehouseId,
        name: String(data.name || warehouseId),
        warehouseRole: String(data.warehouseRole || 'general'),
    };
};
const assertBoundIsCentral = async (actor) => {
    if (!actor.boundWarehouseId && !actor.isSuperAdmin) {
        throw new HttpsError('failed-precondition', 'يجب ربط الحساب بمخزن قطع الغيار المركزي لعرض أرصدة المراكز أو إنشاء سحب.');
    }
    if (actor.isSuperAdmin && !actor.boundWarehouseId) {
        const snap = await db
            .collection(WAREHOUSES)
            .where('tenantId', '==', actor.tenantId)
            .where('warehouseRole', '==', CENTRAL_ROLE)
            .limit(5)
            .get();
        const active = snap.docs.find((d) => d.data()?.isActive !== false);
        if (!active)
            throw new HttpsError('failed-precondition', 'لا يوجد مخزن قطع غيار مركزي.');
        return { id: active.id, name: String(active.data()?.name || active.id) };
    }
    const wh = await loadWarehouse(actor.tenantId, String(actor.boundWarehouseId));
    if (wh.warehouseRole !== CENTRAL_ROLE) {
        throw new HttpsError('permission-denied', 'هذه العملية لمخزن قطع الغيار المركزي فقط.');
    }
    return { id: wh.id, name: wh.name };
};
const nextReferenceNo = async (tenantId) => {
    const counterRef = db.collection(COUNTERS).doc(`${tenantId}__spare_parts_recall`);
    const year = new Date().getFullYear();
    const seq = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? toNumber(snap.data()?.seq) : 0;
        const next = current + 1;
        tx.set(counterRef, { tenantId, seq: next, updatedAt: toIsoNow() }, { merge: true });
        return next;
    });
    return `SPR-${year}-${String(seq).padStart(5, '0')}`;
};
/** List positive stock balances across all maintenance_center warehouses (central operator). */
export const listMaintenanceCenterSpareBalancesHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPerm(actor, 'sparePartsRecall.view')
        && !hasPerm(actor, 'sparePartsReplenishment.view')
        && !hasPerm(actor, 'inventory.view')) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية عرض أرصدة المراكز.');
    }
    await assertBoundIsCentral(actor);
    const data = (request.data || {});
    const filterWarehouseId = String(data.warehouseId || '').trim();
    const search = String(data.search || '').trim().toLowerCase();
    const centersSnap = await db
        .collection(WAREHOUSES)
        .where('tenantId', '==', actor.tenantId)
        .where('warehouseRole', '==', CENTER_ROLE)
        .get();
    const centers = centersSnap.docs
        .filter((d) => d.data()?.isActive !== false)
        .map((d) => ({
        id: d.id,
        name: String(d.data()?.name || d.id),
    }))
        .filter((c) => !filterWarehouseId || c.id === filterWarehouseId);
    const rows = [];
    for (const center of centers) {
        const balSnap = await db
            .collection(STOCK_ITEMS)
            .where('tenantId', '==', actor.tenantId)
            .where('warehouseId', '==', center.id)
            .get();
        for (const doc of balSnap.docs) {
            const bal = doc.data();
            const quantity = toNumber(bal.quantity);
            if (!(quantity > 0))
                continue;
            const itemType = String(bal.itemType || 'material');
            if (itemType !== 'material')
                continue;
            const itemName = String(bal.itemName || '');
            const itemCode = String(bal.itemCode || '');
            if (search) {
                const hay = `${itemName} ${itemCode} ${center.name}`.toLowerCase();
                if (!hay.includes(search))
                    continue;
            }
            rows.push({
                warehouseId: center.id,
                warehouseName: center.name,
                itemType,
                itemId: String(bal.itemId || ''),
                itemName,
                itemCode,
                unit: String(bal.unit || 'piece'),
                quantity,
                minStock: toNumber(bal.minStock),
            });
        }
    }
    rows.sort((a, b) => {
        const byName = a.itemName.localeCompare(b.itemName, 'ar');
        if (byName !== 0)
            return byName;
        return a.warehouseName.localeCompare(b.warehouseName, 'ar');
    });
    return { ok: true, rows, centers };
};
export const createSparePartsRecallHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPerm(actor, 'sparePartsRecall.create')
        && !hasPerm(actor, 'sparePartsReplenishment.prepare')
        && !hasPerm(actor, 'inventory.transactions.create')) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية إنشاء طلب سحب.');
    }
    const central = await assertBoundIsCentral(actor);
    const input = (request.data || {});
    const fromWarehouseId = String(input.fromWarehouseId || '').trim();
    if (!fromWarehouseId)
        throw new HttpsError('invalid-argument', 'حدد مخزن المركز.');
    if (fromWarehouseId === central.id) {
        throw new HttpsError('invalid-argument', 'لا يمكن السحب من المخزن المركزي إلى نفسه.');
    }
    const center = await loadWarehouse(actor.tenantId, fromWarehouseId);
    if (center.warehouseRole !== CENTER_ROLE) {
        throw new HttpsError('failed-precondition', 'المصدر يجب أن يكون مخزن مركز صيانة.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [central.id, fromWarehouseId]);
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (!rawLines.length)
        throw new HttpsError('invalid-argument', 'أضف بنداً واحداً على الأقل.');
    if (rawLines.length > MAX_LINES) {
        throw new HttpsError('invalid-argument', `الحد الأقصى ${MAX_LINES} بنداً.`);
    }
    const seen = new Set();
    const lines = [];
    for (const row of rawLines) {
        const itemId = String(row.itemId || '').trim();
        const qty = toNumber(row.quantity);
        if (!itemId)
            throw new HttpsError('invalid-argument', 'حدد المكوّن لكل بند.');
        if (!(qty > 0))
            throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
        if (seen.has(itemId))
            throw new HttpsError('invalid-argument', 'لا تكرر نفس المكوّن.');
        seen.add(itemId);
        const matSnap = await db.collection(MATERIALS).doc(itemId).get();
        if (!matSnap.exists)
            throw new HttpsError('not-found', `المكوّن ${itemId} غير موجود.`);
        const mat = matSnap.data();
        if (String(mat.tenantId || '') !== actor.tenantId) {
            throw new HttpsError('permission-denied', 'مكوّن خارج المستأجر.');
        }
        if (mat.isActive === false) {
            throw new HttpsError('failed-precondition', `المكوّن ${mat.name || itemId} غير نشط.`);
        }
        const balRef = db.collection(STOCK_ITEMS).doc(balanceDocId(fromWarehouseId, 'material', itemId));
        const balSnap = await balRef.get();
        const available = balSnap.exists ? toNumber(balSnap.data()?.quantity) : 0;
        if (qty > available + 1e-9) {
            throw new HttpsError('failed-precondition', `الكمية المطلوبة لـ ${mat.name || itemId} أكبر من رصيد المركز (${available}).`);
        }
        const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(mat));
        lines.push({
            lineId: itemId,
            itemType: 'material',
            itemId,
            itemName: String(mat.name || itemId),
            itemCode: String(mat.code || ''),
            unit: String(mat.baseUnit || 'piece'),
            requestedQty: qty,
            unitCostSnapshot: unitCost,
            totalCostSnapshot: roundMoney(unitCost * qty),
        });
    }
    const referenceNo = await nextReferenceNo(actor.tenantId);
    const ref = db.collection(REQUESTS).doc();
    const now = toIsoNow();
    const totalCostSnapshot = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
    const doc = {
        referenceNo,
        status: 'submitted',
        fromWarehouseId,
        fromWarehouseName: center.name,
        toWarehouseId: central.id,
        toWarehouseName: central.name,
        lines,
        note: String(input.note || '').trim() || undefined,
        totalCostSnapshot,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
    };
    await ref.set(doc);
    await writeActivity(actor, 'spare_parts_recall.create', ref.id, { referenceNo });
    return { ok: true, id: ref.id, referenceNo };
};
export const confirmSparePartsRecallHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPerm(actor, 'sparePartsRecall.confirm')
        && !hasPerm(actor, 'sparePartsReplenishment.receive')
        && !hasPerm(actor, 'inventory.transactions.create')
        && !hasPerm(actor, 'inventory.transfers.approve')) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية تأكيد السحب.');
    }
    const requestId = String(request.data?.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'معرّف الطلب مطلوب.');
    const ref = db.collection(REQUESTS).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'طلب السحب غير موجود.');
    const current = snap.data();
    if (current.tenantId !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'طلب خارج المستأجر.');
    }
    if (current.status !== 'submitted') {
        throw new HttpsError('failed-precondition', 'لا يمكن تأكيد هذا الطلب في حالته الحالية.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [
        current.fromWarehouseId,
        current.toWarehouseId,
    ]);
    const now = toIsoNow();
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists)
            throw new HttpsError('not-found', 'طلب السحب غير موجود.');
        const data = fresh.data();
        if (data.status !== 'submitted') {
            throw new HttpsError('aborted', 'تغيرت حالة الطلب. أعد المحاولة.');
        }
        const nextLines = [];
        for (const line of data.lines || []) {
            const qty = toNumber(line.requestedQty);
            if (!(qty > 0))
                continue;
            const sourceBalRef = db
                .collection(STOCK_ITEMS)
                .doc(balanceDocId(data.fromWarehouseId, line.itemType, line.itemId));
            const targetBalRef = db
                .collection(STOCK_ITEMS)
                .doc(balanceDocId(data.toWarehouseId, line.itemType, line.itemId));
            const [sourceBalSnap, targetBalSnap] = await Promise.all([
                tx.get(sourceBalRef),
                tx.get(targetBalRef),
            ]);
            const sourceQty = sourceBalSnap.exists ? toNumber(sourceBalSnap.data()?.quantity) : 0;
            if (qty > sourceQty + 1e-9) {
                throw new HttpsError('failed-precondition', `رصيد المركز غير كافٍ للصنف ${line.itemName || line.itemId}.`);
            }
            const targetQty = targetBalSnap.exists ? toNumber(targetBalSnap.data()?.quantity) : 0;
            const outTxRef = db.collection(STOCK_TX).doc();
            const inTxRef = db.collection(STOCK_TX).doc();
            const referenceNo = data.referenceNo;
            tx.set(outTxRef, {
                warehouseId: data.fromWarehouseId,
                toWarehouseId: data.toWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                movementType: 'TRANSFER',
                quantity: qty,
                transferDirection: 'OUT',
                relatedTransactionId: inTxRef.id,
                referenceNo,
                note: `سحب قطع غيار ${data.referenceNo}`,
                unitCost: line.unitCostSnapshot,
                totalCost: roundMoney(line.unitCostSnapshot * qty),
                sourceModule: SOURCE,
                sourceId: requestId,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                tenantId: actor.tenantId,
            });
            tx.set(inTxRef, {
                warehouseId: data.toWarehouseId,
                toWarehouseId: data.fromWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                movementType: 'TRANSFER',
                quantity: qty,
                transferDirection: 'IN',
                relatedTransactionId: outTxRef.id,
                referenceNo,
                note: `سحب قطع غيار ${data.referenceNo}`,
                unitCost: line.unitCostSnapshot,
                totalCost: roundMoney(line.unitCostSnapshot * qty),
                sourceModule: SOURCE,
                sourceId: requestId,
                createdBy: actor.displayName,
                createdByUserId: actor.uid,
                createdAt: now,
                tenantId: actor.tenantId,
            });
            tx.set(sourceBalRef, {
                warehouseId: data.fromWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                minStock: toNumber(sourceBalSnap.data()?.minStock),
                quantity: sourceQty - qty,
                updatedAt: now,
                tenantId: actor.tenantId,
            }, { merge: true });
            tx.set(targetBalRef, {
                warehouseId: data.toWarehouseId,
                itemType: line.itemType,
                itemId: line.itemId,
                itemName: line.itemName,
                itemCode: line.itemCode,
                unit: line.unit,
                minStock: toNumber(targetBalSnap.data()?.minStock),
                quantity: targetQty + qty,
                updatedAt: now,
                tenantId: actor.tenantId,
            }, { merge: true });
            nextLines.push({
                ...line,
                confirmedQty: qty,
                totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * qty),
            });
        }
        const totalCostSnapshot = roundMoney(nextLines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
        tx.update(ref, {
            status: 'confirmed',
            lines: nextLines,
            totalCostSnapshot,
            confirmedAt: now,
            confirmedBy: actor.displayName,
            confirmedByUserId: actor.uid,
        });
    });
    await writeActivity(actor, 'spare_parts_recall.confirm', requestId, {
        referenceNo: current.referenceNo,
    });
    // Best-effort sync: decrease repair branch spare ledger at the center.
    try {
        await syncRecallOutFromRepairBranchStock({
            tenantId: actor.tenantId,
            fromWarehouseId: current.fromWarehouseId,
            lines: current.lines,
            actorName: actor.displayName,
            referenceNo: current.referenceNo,
            requestId,
        });
    }
    catch (syncErr) {
        console.error('spare_parts_recall.confirm repair sync failed', {
            requestId,
            message: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
    }
    return { ok: true, id: requestId };
};
export const cancelSparePartsRecallHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPerm(actor, 'sparePartsRecall.cancel')
        && !hasPerm(actor, 'sparePartsRecall.create')
        && !hasPerm(actor, 'sparePartsReplenishment.approve')
        && !hasPerm(actor, 'inventory.transfers.approve')) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية إلغاء طلب السحب.');
    }
    const requestId = String(request.data?.requestId || '').trim();
    if (!requestId)
        throw new HttpsError('invalid-argument', 'معرّف الطلب مطلوب.');
    const ref = db.collection(REQUESTS).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'طلب السحب غير موجود.');
    const current = snap.data();
    if (current.tenantId !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'طلب خارج المستأجر.');
    }
    if (current.status !== 'submitted') {
        throw new HttpsError('failed-precondition', 'لا يمكن إلغاء هذا الطلب في حالته الحالية.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [
        current.fromWarehouseId,
        current.toWarehouseId,
    ]);
    const now = toIsoNow();
    await ref.update({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actor.displayName,
        cancelledByUserId: actor.uid,
    });
    await writeActivity(actor, 'spare_parts_recall.cancel', requestId, {
        referenceNo: current.referenceNo,
    });
    return { ok: true, id: requestId };
};
async function syncRecallOutFromRepairBranchStock(input) {
    const warehouseId = String(input.fromWarehouseId || '').trim();
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
    const branchId = branchSnap.docs[0].id;
    const now = toIsoNow();
    for (const line of input.lines || []) {
        const qty = toNumber(line.confirmedQty ?? line.requestedQty);
        if (!(qty > 0))
            continue;
        const materialId = String(line.itemId || '').trim();
        if (!materialId)
            continue;
        const parts = await db
            .collection('repair_spare_parts')
            .where('tenantId', '==', input.tenantId)
            .where('branchId', '==', branchId)
            .where('materialId', '==', materialId)
            .limit(1)
            .get();
        if (parts.empty)
            continue;
        const partId = parts.docs[0].id;
        const stockDocId = `${branchId}__${warehouseId}__${partId}`;
        const stockRef = db.collection('repair_spare_parts_stock').doc(stockDocId);
        await db.runTransaction(async (tx) => {
            const stockSnap = await tx.get(stockRef);
            const current = stockSnap.exists ? toNumber(stockSnap.data()?.quantity) : 0;
            const next = Math.max(0, current - qty);
            tx.set(stockRef, {
                tenantId: input.tenantId,
                branchId,
                warehouseId,
                partId,
                quantity: next,
                updatedAt: now,
            }, { merge: true });
        });
    }
}
