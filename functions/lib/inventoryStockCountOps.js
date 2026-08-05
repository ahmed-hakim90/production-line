import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
const db = getDb();
const roundQty = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0)
        throw new HttpsError('invalid-argument', 'توجد كمية جرد غير صالحة.');
    return Math.round(number * 10000) / 10000;
};
export const createInventoryCountSessionHandler = async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!userSnap.exists || user?.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير صالح.');
    const tenantId = String(user?.tenantId || '').trim();
    const roleId = String(user?.roleId || '').trim();
    const roleSnap = roleId ? await db.collection('roles').doc(roleId).get() : null;
    const permissions = (roleSnap?.data()?.permissions || {});
    if (user?.isSuperAdmin !== true && permissions['inventory.counts.manage'] !== true) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية إنشاء جلسة جرد.');
    }
    const data = (request.data || {});
    const warehouseId = String(data.warehouseId || '').trim();
    const warehouseSnap = await db.collection('warehouses').doc(warehouseId).get();
    if (!warehouseId || !warehouseSnap.exists || String(warehouseSnap.data()?.tenantId || '') !== tenantId) {
        throw new HttpsError('not-found', 'المخزن غير موجود داخل الشركة.');
    }
    const requested = Array.isArray(data.lines) ? data.lines : [];
    if (!requested.length || requested.length > 450)
        throw new HttpsError('invalid-argument', 'جلسة الجرد يجب أن تحتوي من 1 إلى 450 صنفًا في الملف الواحد.');
    const keys = new Set();
    const normalized = requested.map((line) => {
        const itemType = String(line.itemType || '').trim();
        const itemId = String(line.itemId || '').trim();
        if (!['finished_good', 'raw_material', 'material', 'semi_finished', 'consumable', 'packaging'].includes(itemType) || !itemId) {
            throw new HttpsError('invalid-argument', 'يوجد صنف غير صالح في الجرد.');
        }
        const key = `${itemType}:${itemId}`;
        if (keys.has(key))
            throw new HttpsError('invalid-argument', `الصنف ${itemId} مكرر في ملف الجرد.`);
        keys.add(key);
        return { itemType, itemId, expectedQty: roundQty(line.expectedQty), countedQty: roundQty(line.countedQty) };
    });
    const balanceRefs = normalized.map((line) => db.collection('stock_items').doc(`${warehouseId}__${line.itemType}__${line.itemId}`));
    const countRef = db.collection('stock_counts').doc();
    const at = new Date().toISOString();
    const result = await db.runTransaction(async (tx) => {
        const balances = await Promise.all(balanceRefs.map((ref) => tx.get(ref)));
        const lines = balances.map((snap, index) => {
            const requestedLine = normalized[index];
            const balance = snap.data();
            if (!snap.exists || String(balance?.tenantId || '') !== tenantId || String(balance?.warehouseId || '') !== warehouseId) {
                throw new HttpsError('failed-precondition', `الصنف ${requestedLine.itemId} لم يعد موجودًا في المخزن.`);
            }
            const currentExpected = roundQty(balance?.quantity);
            if (Math.abs(currentExpected - requestedLine.expectedQty) > 0.0001) {
                throw new HttpsError('aborted', `تغير رصيد ${String(balance?.itemName || requestedLine.itemId)} بعد المعاينة. أعد رفع الملف.`);
            }
            return {
                itemType: requestedLine.itemType,
                itemId: requestedLine.itemId,
                itemName: String(balance?.itemName || requestedLine.itemId),
                itemCode: String(balance?.itemCode || ''),
                expectedQty: currentExpected,
                countedQty: requestedLine.countedQty,
            };
        });
        tx.create(countRef, {
            tenantId, warehouseId, warehouseName: String(warehouseSnap.data()?.name || data.warehouseName || warehouseId),
            status: 'open', note: String(data.note || '').trim(), lines,
            previewConfirmed: true, previewConfirmedAt: at, createdBy: String(user?.displayName || user?.name || user?.email || uid), createdAt: at,
        });
        return { importedRows: lines.length, changedRows: lines.filter((line) => Math.abs(line.countedQty - line.expectedQty) > 0.0001).length };
    });
    return { ok: true, id: countRef.id, ...result };
};
