import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

const db = getDb();
const ITEM_TYPES = new Set(['finished_good', 'raw_material', 'material', 'semi_finished', 'consumable', 'packaging']);
const PURPOSES = new Set(['production', 'packaging', 'maintenance', 'lubricants', 'department', 'waste', 'sample', 'other']);

const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max);
const qty = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new HttpsError('invalid-argument', 'كل كمية صرف يجب أن تكون أكبر من صفر.');
  return Math.round(number * 10000) / 10000;
};

export const postGeneralStockIssueHandler = async (request: CallableRequest) => {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() as Record<string, unknown> | undefined;
  if (!userSnap.exists || user?.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير صالح.');
  const tenantId = clean(user?.tenantId);
  const roleId = clean(user?.roleId);
  const roleSnap = roleId ? await db.collection('roles').doc(roleId).get() : null;
  const permissions = (roleSnap?.data()?.permissions || {}) as Record<string, boolean>;
  if (user?.isSuperAdmin !== true && permissions['inventory.transactions.create'] !== true) {
    throw new HttpsError('permission-denied', 'ليس لديك صلاحية إنشاء إذن صرف.');
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const warehouseId = clean(data.warehouseId);
  const purpose = clean(data.purpose);
  const destinationId = clean(data.destinationId);
  const destinationName = clean(data.destinationName);
  const workOrderId = clean(data.workOrderId);
  const workOrderNumber = clean(data.workOrderNumber);
  const note = clean(data.note, 500);
  const draftId = clean(data.draftId);
  if (!warehouseId || !PURPOSES.has(purpose)) throw new HttpsError('invalid-argument', 'المخزن وغرض الصرف مطلوبان.');
  if ((purpose === 'production' || purpose === 'packaging') && !workOrderId) {
    throw new HttpsError('invalid-argument', 'أمر الشغل مطلوب لهذا النوع من الصرف.');
  }
  if (['maintenance', 'lubricants', 'department', 'other'].includes(purpose) && !destinationName) {
    throw new HttpsError('invalid-argument', 'الجهة المستلمة مطلوبة لهذا النوع من الصرف.');
  }

  const warehouseSnap = await db.collection('warehouses').doc(warehouseId).get();
  if (!warehouseSnap.exists || clean(warehouseSnap.data()?.tenantId) !== tenantId) {
    throw new HttpsError('not-found', 'المخزن غير موجود داخل الشركة.');
  }
  const assignedWarehouseId = clean(user?.inventoryWarehouseId);
  if (user?.isSuperAdmin !== true && assignedWarehouseId && assignedWarehouseId !== warehouseId) {
    throw new HttpsError('permission-denied', 'لا يمكنك الصرف من مخزن غير المخزن المرتبط بحسابك.');
  }
  if (workOrderId) {
    const workOrderSnap = await db.collection('work_orders').doc(workOrderId).get();
    if (!workOrderSnap.exists || clean(workOrderSnap.data()?.tenantId) !== tenantId) {
      throw new HttpsError('not-found', 'أمر الشغل غير موجود داخل الشركة.');
    }
  }

  const rawLines = Array.isArray(data.lines) ? data.lines as Array<Record<string, unknown>> : [];
  if (!rawLines.length || rawLines.length > 100) throw new HttpsError('invalid-argument', 'إذن الصرف يجب أن يحتوي من 1 إلى 100 بند.');
  const seen = new Set<string>();
  const lines = rawLines.map((line) => {
    const itemType = clean(line.itemType);
    const itemId = clean(line.itemId);
    const locationId = clean(line.locationId);
    if (!ITEM_TYPES.has(itemType) || !itemId) throw new HttpsError('invalid-argument', 'يوجد بند غير صالح في الإذن.');
    const key = `${itemType}:${itemId}:${locationId}`;
    if (seen.has(key)) throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس البند واللوكيشن في الإذن.');
    seen.add(key);
    return { itemType, itemId, locationId, quantity: qty(line.quantity) };
  });

  const voucherRef = db.collection('general_stock_issues').doc();
  const at = new Date().toISOString();
  const referenceNo = `ISS-${at.slice(0, 10).replaceAll('-', '')}-${voucherRef.id.slice(0, 5).toUpperCase()}`;
  const actorName = clean(user?.displayName || user?.name || user?.email || uid);
  const draftRef = draftId ? db.collection('general_stock_issues').doc(draftId) : null;

  await db.runTransaction(async (tx) => {
    const balanceRefs = lines.map((line) => db.collection('stock_items').doc(`${warehouseId}__${line.itemType}__${line.itemId}`));
    const locationRefs = lines.map((line) => line.locationId
      ? db.collection('stock_location_balances').doc(`${warehouseId}__${line.locationId}__${line.itemType}__${line.itemId}`)
      : null);
    const balanceSnaps = await Promise.all(balanceRefs.map((ref) => tx.get(ref)));
    const locationSnaps = await Promise.all(locationRefs.map((ref) => ref ? tx.get(ref) : Promise.resolve(null)));
    const draftSnap = draftRef ? await tx.get(draftRef) : null;
    if (draftSnap && (!draftSnap.exists || clean(draftSnap.data()?.tenantId) !== tenantId || draftSnap.data()?.status !== 'draft')) {
      throw new HttpsError('failed-precondition', 'المسودة غير صالحة للترحيل أو سبق ترحيلها.');
    }
    const postedLines = lines.map((line, index) => {
      const balance = balanceSnaps[index].data() as Record<string, unknown> | undefined;
      const currentQty = Number(balance?.quantity || 0);
      if (!balanceSnaps[index].exists || clean(balance?.tenantId) !== tenantId || currentQty < line.quantity) {
        throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${clean(balance?.itemName || line.itemId)}.`);
      }
      const location = locationSnaps[index]?.data() as Record<string, unknown> | undefined;
      if (line.locationId && (!locationSnaps[index]?.exists || Number(location?.quantity || 0) < line.quantity)) {
        throw new HttpsError('failed-precondition', `رصيد اللوكيشن غير كافٍ للصنف ${clean(balance?.itemName || line.itemId)}.`);
      }
      tx.set(balanceRefs[index], { quantity: currentQty - line.quantity, updatedAt: at, lastMovementAt: at }, { merge: true });
      if (locationRefs[index] && location) {
        tx.set(locationRefs[index]!, { quantity: Number(location.quantity || 0) - line.quantity, updatedAt: at, lastMovementAt: at }, { merge: true });
      }
      const posted = {
        itemType: line.itemType, itemId: line.itemId,
        itemName: clean(balance?.itemName || line.itemId), itemCode: clean(balance?.itemCode),
        unit: clean(balance?.unit || 'unit'), quantity: line.quantity,
        locationId: line.locationId || null, locationCode: clean(location?.locationCode),
      };
      tx.create(db.collection('stock_transactions').doc(), {
        tenantId, warehouseId, warehouseName: clean(warehouseSnap.data()?.name),
        ...posted, locationId: line.locationId || null,
        movementType: 'OUT', quantity: -line.quantity, referenceNo,
        sourceModule: 'manual_movement', sourceId: voucherRef.id,
        issuePurpose: purpose, destinationId: destinationId || null, destinationName: destinationName || null,
        sourceWorkOrderId: workOrderId || null, workOrderNumber: workOrderNumber || null,
        note: note || null, createdBy: actorName, createdAt: at,
      });
      return posted;
    });
    tx.create(voucherRef, {
      tenantId, referenceNo, status: 'posted', warehouseId, warehouseName: clean(warehouseSnap.data()?.name),
      purpose, destinationId: destinationId || null, destinationName: destinationName || null,
      workOrderId: workOrderId || null, workOrderNumber: workOrderNumber || null,
      note: note || null, lines: postedLines, createdBy: uid, createdByName: actorName, createdAt: at, postedAt: at,
    });
    if (draftRef) tx.set(draftRef, { status: 'converted', postedVoucherId: voucherRef.id, postedReferenceNo: referenceNo, updatedAt: at }, { merge: true });
  });
  return { ok: true as const, id: voucherRef.id, referenceNo };
};
