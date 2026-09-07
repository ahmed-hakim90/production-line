import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
const db = getDb();
const REASONS = new Set(['purchase', 'production_output', 'issue_return', 'opening_balance', 'department_return', 'maintenance_return', 'other']);
const ITEM_TYPES = new Set(['finished_good', 'raw_material', 'material', 'semi_finished', 'consumable', 'packaging']);
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);
const round = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        throw new HttpsError('invalid-argument', 'كل كمية إضافة يجب أن تكون أكبر من صفر.');
    return Math.round(n * 10000) / 10000;
};
const catalogCollection = (itemType) => itemType === 'finished_good'
    ? 'products'
    : itemType === 'raw_material' ? 'raw_materials' : 'materials';
export const postGeneralStockReceiptHandler = async (request) => {
    const uid = clean(request.auth?.uid);
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!userSnap.exists || user?.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير صالح.');
    const tenantId = clean(user?.tenantId);
    const roleId = clean(user?.roleId);
    const roleSnap = roleId ? await db.collection('roles').doc(roleId).get() : null;
    const permissions = (roleSnap?.data()?.permissions || {});
    if (user?.isSuperAdmin !== true && permissions['inventory.transactions.create'] !== true) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية إنشاء إذن إضافة.');
    }
    const data = (request.data || {});
    const warehouseId = clean(data.warehouseId);
    const reason = clean(data.reason);
    const workOrderId = clean(data.workOrderId);
    const workOrderNumber = clean(data.workOrderNumber);
    const sourceIssueId = clean(data.sourceIssueId);
    const sourceParty = clean(data.sourceParty);
    const sourceDocumentNo = clean(data.sourceDocumentNo);
    const note = clean(data.note, 500);
    const draftId = clean(data.draftId);
    if (!warehouseId || !REASONS.has(reason))
        throw new HttpsError('invalid-argument', 'المخزن وسبب الإضافة مطلوبان.');
    if (reason === 'production_output' && !workOrderId)
        throw new HttpsError('invalid-argument', 'أمر الشغل مطلوب لناتج الإنتاج.');
    if (reason === 'issue_return' && !sourceIssueId)
        throw new HttpsError('invalid-argument', 'إذن الصرف الأصلي مطلوب للمرتجع.');
    if (['purchase', 'department_return', 'maintenance_return', 'other'].includes(reason) && !sourceParty) {
        throw new HttpsError('invalid-argument', 'مصدر الإضافة مطلوب.');
    }
    const warehouseSnap = await db.collection('warehouses').doc(warehouseId).get();
    if (!warehouseSnap.exists || clean(warehouseSnap.data()?.tenantId) !== tenantId)
        throw new HttpsError('not-found', 'المخزن غير موجود داخل الشركة.');
    const assignedWarehouseIds = [...new Set([
            ...(Array.isArray(user?.inventoryWarehouseIds) ? user.inventoryWarehouseIds : []),
            user?.inventoryWarehouseId,
        ].map(clean).filter(Boolean))];
    if (user?.isSuperAdmin !== true && assignedWarehouseIds.length && !assignedWarehouseIds.includes(warehouseId)) {
        throw new HttpsError('permission-denied', 'لا يمكنك الإضافة إلى مخزن غير المخزن المرتبط بحسابك.');
    }
    if (workOrderId) {
        const snap = await db.collection('work_orders').doc(workOrderId).get();
        if (!snap.exists || clean(snap.data()?.tenantId) !== tenantId)
            throw new HttpsError('not-found', 'أمر الشغل غير موجود داخل الشركة.');
    }
    const issueRef = sourceIssueId ? db.collection('general_stock_issues').doc(sourceIssueId) : null;
    const issueSnap = issueRef ? await issueRef.get() : null;
    if (issueRef && (!issueSnap?.exists || clean(issueSnap.data()?.tenantId) !== tenantId))
        throw new HttpsError('not-found', 'إذن الصرف الأصلي غير موجود داخل الشركة.');
    const requested = Array.isArray(data.lines) ? data.lines : [];
    if (!requested.length || requested.length > 100)
        throw new HttpsError('invalid-argument', 'إذن الإضافة يجب أن يحتوي من 1 إلى 100 بند.');
    const seen = new Set();
    const lines = requested.map((line) => {
        const itemType = clean(line.itemType);
        const itemId = clean(line.itemId);
        const locationId = clean(line.locationId);
        if (!ITEM_TYPES.has(itemType) || !itemId)
            throw new HttpsError('invalid-argument', 'يوجد بند غير صالح في الإذن.');
        const key = `${itemType}:${itemId}:${locationId}`;
        if (seen.has(key))
            throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس البند واللوكيشن.');
        seen.add(key);
        return { itemType, itemId, locationId, quantity: round(line.quantity) };
    });
    const catalogSnaps = await Promise.all(lines.map((line) => db.collection(catalogCollection(line.itemType)).doc(line.itemId).get()));
    const catalogRows = catalogSnaps.map((snap, index) => {
        const row = snap.data();
        if (!snap.exists || clean(row?.tenantId) !== tenantId)
            throw new HttpsError('not-found', `الصنف ${lines[index].itemId} غير موجود داخل الشركة.`);
        return row;
    });
    const locationSnaps = await Promise.all(lines.map((line) => line.locationId ? db.collection('warehouse_locations').doc(line.locationId).get() : Promise.resolve(null)));
    locationSnaps.forEach((snap, index) => {
        if (!snap)
            return;
        const row = snap.data();
        if (!snap.exists || clean(row?.tenantId) !== tenantId || clean(row?.warehouseId) !== warehouseId)
            throw new HttpsError('not-found', `اللوكيشن في البند ${index + 1} لا يتبع المخزن.`);
    });
    const receiptRef = db.collection('general_stock_receipts').doc();
    const at = new Date().toISOString();
    const referenceNo = `RCV-${at.slice(0, 10).replaceAll('-', '')}-${receiptRef.id.slice(0, 5).toUpperCase()}`;
    const actorName = clean(user?.displayName || user?.name || user?.email || uid);
    const draftRef = draftId ? db.collection('general_stock_receipts').doc(draftId) : null;
    await db.runTransaction(async (tx) => {
        const balanceRefs = lines.map((line) => db.collection('stock_items').doc(`${warehouseId}__${line.itemType}__${line.itemId}`));
        const locationRefs = lines.map((line) => line.locationId ? db.collection('stock_location_balances').doc(`${warehouseId}__${line.locationId}__${line.itemType}__${line.itemId}`) : null);
        const balances = await Promise.all(balanceRefs.map((ref) => tx.get(ref)));
        const locationBalances = await Promise.all(locationRefs.map((ref) => ref ? tx.get(ref) : Promise.resolve(null)));
        const originalIssue = issueRef ? (await tx.get(issueRef)).data() : null;
        const draftSnap = draftRef ? await tx.get(draftRef) : null;
        if (draftSnap && (!draftSnap.exists || clean(draftSnap.data()?.tenantId) !== tenantId || draftSnap.data()?.status !== 'draft')) {
            throw new HttpsError('failed-precondition', 'المسودة غير صالحة للترحيل أو سبق ترحيلها.');
        }
        const returned = { ...(originalIssue?.returnedQuantities || {}) };
        const originalLines = Array.isArray(originalIssue?.lines) ? originalIssue.lines : [];
        const postedLines = lines.map((line, index) => {
            const catalog = catalogRows[index];
            const balance = balances[index].data();
            const location = locationBalances[index]?.data();
            const itemName = clean(catalog.name || catalog.productName || line.itemId);
            const itemCode = clean(catalog.code || catalog.productCode);
            const unit = clean(catalog.baseUnit || catalog.unit || 'unit');
            const minStock = Number(catalog.minStock || 0);
            if (originalIssue) {
                const original = originalLines.filter((row) => clean(row.itemType) === line.itemType && clean(row.itemId) === line.itemId)
                    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
                const key = `${line.itemType}:${line.itemId}`;
                if (original <= 0 || Number(returned[key] || 0) + line.quantity > original + 0.0001)
                    throw new HttpsError('failed-precondition', `مرتجع ${itemName} أكبر من الكمية المصروفة.`);
                returned[key] = Number(returned[key] || 0) + line.quantity;
            }
            tx.set(balanceRefs[index], {
                tenantId, warehouseId, itemType: line.itemType, itemId: line.itemId, itemName, itemCode, unit, minStock,
                quantity: Number(balance?.quantity || 0) + line.quantity, updatedAt: at, lastMovementAt: at,
            }, { merge: true });
            if (locationRefs[index]) {
                const locMeta = locationSnaps[index]?.data() || {};
                tx.set(locationRefs[index], {
                    tenantId, warehouseId, locationId: line.locationId, locationCode: clean(locMeta.code || line.locationId),
                    rackId: clean(locMeta.rackId) || null, rackName: clean(locMeta.rackName || locMeta.rack) || null,
                    shelfName: clean(locMeta.shelfName || locMeta.shelf) || null,
                    itemType: line.itemType, itemId: line.itemId, itemName, itemCode, unit, minStock,
                    quantity: Number(location?.quantity || 0) + line.quantity, updatedAt: at, lastMovementAt: at,
                }, { merge: true });
            }
            tx.create(db.collection('stock_transactions').doc(), {
                tenantId, warehouseId, warehouseName: clean(warehouseSnap.data()?.name), locationId: line.locationId || null,
                locationCode: clean(locationSnaps[index]?.data()?.code) || null,
                itemType: line.itemType, itemId: line.itemId, itemName, itemCode, unit,
                movementType: 'IN', quantity: line.quantity, referenceNo, sourceModule: 'manual_movement', sourceId: receiptRef.id,
                receiptReason: reason, sourceWorkOrderId: workOrderId || null, workOrderNumber: workOrderNumber || null,
                sourceIssueOrderId: sourceIssueId || null, sourceParty: sourceParty || null, sourceDocumentNo: sourceDocumentNo || null,
                note: note || null, createdBy: actorName, createdAt: at,
            });
            return { itemType: line.itemType, itemId: line.itemId, itemName, itemCode, unit, quantity: line.quantity, locationId: line.locationId || null, locationCode: clean(locationSnaps[index]?.data()?.code) || null };
        });
        if (issueRef)
            tx.set(issueRef, { returnedQuantities: returned, updatedAt: at }, { merge: true });
        tx.create(receiptRef, {
            tenantId, referenceNo, status: 'posted', warehouseId, warehouseName: clean(warehouseSnap.data()?.name), reason,
            workOrderId: workOrderId || null, workOrderNumber: workOrderNumber || null, sourceIssueId: sourceIssueId || null,
            sourceParty: sourceParty || null, sourceDocumentNo: sourceDocumentNo || null, note: note || null, lines: postedLines,
            createdBy: uid, createdByName: actorName, createdAt: at, postedAt: at,
        });
        if (draftRef)
            tx.set(draftRef, { status: 'converted', postedVoucherId: receiptRef.id, postedReferenceNo: referenceNo, updatedAt: at }, { merge: true });
    });
    return { ok: true, id: receiptRef.id, referenceNo };
};
