import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

const db = getDb();
const ITEM_TYPES = new Set(['finished_good', 'raw_material', 'material', 'semi_finished', 'consumable', 'packaging']);
const ISSUE_PURPOSES = new Set(['production', 'packaging', 'maintenance', 'lubricants', 'department', 'waste', 'sample', 'other']);
const RECEIPT_REASONS = new Set(['purchase', 'issue_return', 'opening_balance', 'department_return', 'maintenance_return', 'other']);
const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max);
const roundQty = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new HttpsError('invalid-argument', 'كل كمية يجب أن تكون أكبر من صفر.');
  return Math.round(number * 10000) / 10000;
};

async function actor(request: CallableRequest, permission: 'create' | 'void') {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const snap = await db.collection('users').doc(uid).get();
  const user = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || user?.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير صالح.');
  const roleId = clean(user?.roleId);
  const role = roleId ? await db.collection('roles').doc(roleId).get() : null;
  const permissions = (role?.data()?.permissions || {}) as Record<string, boolean>;
  const allowed = permission === 'create'
    ? permissions['inventory.transactions.create'] === true
    : permissions['inventory.transactions.delete'] === true;
  if (user?.isSuperAdmin !== true && !allowed) {
    throw new HttpsError('permission-denied', permission === 'create' ? 'ليس لديك صلاحية حفظ السند.' : 'ليس لديك صلاحية إلغاء السند.');
  }
  return {
    uid,
    tenantId: clean(user?.tenantId),
    assignedWarehouseIds: [...new Set([
      ...(Array.isArray(user?.inventoryWarehouseIds) ? user.inventoryWarehouseIds : []),
      user?.inventoryWarehouseId,
    ].map(clean).filter(Boolean))],
    isSuperAdmin: user?.isSuperAdmin === true,
    name: clean(user?.displayName || user?.name || user?.email || uid),
  };
}

async function assertWarehouse(warehouseId: string, tenantId: string, assignedWarehouseIds: string[], isSuperAdmin: boolean) {
  const snap = await db.collection('warehouses').doc(warehouseId).get();
  if (!snap.exists || clean(snap.data()?.tenantId) !== tenantId) throw new HttpsError('not-found', 'المخزن غير موجود داخل الشركة.');
  if (!isSuperAdmin && assignedWarehouseIds.length && !assignedWarehouseIds.includes(warehouseId)) throw new HttpsError('permission-denied', 'المخزن خارج نطاق المخازن المسموح بها للحساب.');
  return snap;
}

function parseLines(value: unknown) {
  const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  if (!rows.length || rows.length > 100) throw new HttpsError('invalid-argument', 'السند يجب أن يحتوي من 1 إلى 100 بند.');
  const seen = new Set<string>();
  return rows.map((row) => {
    const itemType = clean(row.itemType);
    const itemId = clean(row.itemId);
    const locationId = clean(row.locationId);
    if (!ITEM_TYPES.has(itemType) || !itemId) throw new HttpsError('invalid-argument', 'يوجد بند غير صالح.');
    const key = `${itemType}:${itemId}:${locationId}`;
    if (seen.has(key)) throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس الصنف واللوكيشن.');
    seen.add(key);
    return { itemType, itemId, locationId, quantity: roundQty(row.quantity) };
  });
}

export const saveGeneralStockIssueDraftHandler = async (request: CallableRequest) => {
  const current = await actor(request, 'create');
  const data = (request.data || {}) as Record<string, unknown>;
  const warehouseId = clean(data.warehouseId);
  const purpose = clean(data.purpose);
  const destinationName = clean(data.destinationName);
  if (!warehouseId || !ISSUE_PURPOSES.has(purpose)) throw new HttpsError('invalid-argument', 'المخزن وغرض الصرف المباشر مطلوبان.');
  if ((purpose === 'production' || purpose === 'packaging') && !clean(data.workOrderId)) throw new HttpsError('invalid-argument', 'أمر الشغل مطلوب لهذا النوع من الصرف.');
  if (['maintenance', 'lubricants', 'department', 'other'].includes(purpose) && !destinationName) throw new HttpsError('invalid-argument', 'الجهة المستلمة مطلوبة.');
  const warehouse = await assertWarehouse(warehouseId, current.tenantId, current.assignedWarehouseIds, current.isSuperAdmin);
  const workOrderId = clean(data.workOrderId);
  const productionStageId = clean(data.productionStageId);
  if (workOrderId) {
    const workOrder = await db.collection('work_orders').doc(workOrderId).get();
    if (!workOrder.exists || clean(workOrder.data()?.tenantId) !== current.tenantId) throw new HttpsError('not-found', 'أمر الشغل غير موجود داخل الشركة.');
    if (productionStageId) {
      const stage = await db.collection('production_routing_steps').doc(productionStageId).get();
      const plan = stage.exists ? await db.collection('production_routing_plans').doc(clean(stage.data()?.planId)).get() : null;
      if (!stage.exists || clean(stage.data()?.tenantId) !== current.tenantId || !plan?.exists || clean(plan.data()?.productId) !== clean(workOrder.data()?.productId)) {
        throw new HttpsError('invalid-argument', 'المرحلة لا تتبع مسار منتج أمر الشغل.');
      }
    }
  }
  const lines = parseLines(data.lines);
  const balances = await Promise.all(lines.map((line) => db.collection('stock_items').doc(`${warehouseId}__${line.itemType}__${line.itemId}`).get()));
  const locations = await Promise.all(lines.map((line) => line.locationId ? db.collection('warehouse_locations').doc(line.locationId).get() : Promise.resolve(null)));
  const savedLines = lines.map((line, index) => ({
    ...line,
    locationId: line.locationId || null,
    locationCode: line.locationId ? clean(locations[index]?.data()?.code || line.locationId) : null,
    itemName: clean(balances[index].data()?.itemName || line.itemId),
    itemCode: clean(balances[index].data()?.itemCode),
    unit: clean(balances[index].data()?.unit || 'unit'),
  }));
  const requestedId = clean(data.draftId);
  const ref = requestedId ? db.collection('general_stock_issues').doc(requestedId) : db.collection('general_stock_issues').doc();
  if (requestedId) {
    const existing = await ref.get();
    if (!existing.exists || clean(existing.data()?.tenantId) !== current.tenantId || existing.data()?.status !== 'draft') throw new HttpsError('failed-precondition', 'المسودة غير صالحة للتعديل.');
  }
  const at = new Date().toISOString();
  const referenceNo = requestedId ? clean((await ref.get()).data()?.referenceNo) : `ISS-D-${at.slice(0, 10).replaceAll('-', '')}-${ref.id.slice(0, 5).toUpperCase()}`;
  await ref.set({
    tenantId: current.tenantId, referenceNo, status: 'draft', warehouseId, warehouseName: clean(warehouse.data()?.name), purpose,
    destinationId: clean(data.destinationId) || null, destinationName: destinationName || null, note: clean(data.note, 500) || null,
    workOrderId: workOrderId || null, workOrderNumber: clean(data.workOrderNumber) || null,
    productionStageId: productionStageId || null, productionStageName: clean(data.productionStageName) || null,
    lines: savedLines, createdBy: current.uid, createdByName: current.name,
    createdAt: requestedId ? ((await ref.get()).data()?.createdAt || at) : at, updatedAt: at,
  }, { merge: true });
  return { ok: true as const, id: ref.id, referenceNo };
};

const catalogCollection = (itemType: string) => itemType === 'finished_good' ? 'products' : itemType === 'raw_material' ? 'raw_materials' : 'materials';

export const saveGeneralStockReceiptDraftHandler = async (request: CallableRequest) => {
  const current = await actor(request, 'create');
  const data = (request.data || {}) as Record<string, unknown>;
  const warehouseId = clean(data.warehouseId);
  const reason = clean(data.reason);
  if (!warehouseId || !RECEIPT_REASONS.has(reason)) throw new HttpsError('invalid-argument', 'المخزن وسبب الإضافة المباشرة مطلوبان.');
  const warehouse = await assertWarehouse(warehouseId, current.tenantId, current.assignedWarehouseIds, current.isSuperAdmin);
  const lines = parseLines(data.lines);
  const catalog = await Promise.all(lines.map((line) => db.collection(catalogCollection(line.itemType)).doc(line.itemId).get()));
  const locations = await Promise.all(lines.map((line) => line.locationId ? db.collection('warehouse_locations').doc(line.locationId).get() : Promise.resolve(null)));
  const savedLines = lines.map((line, index) => {
    const row = catalog[index].data() || {};
    if (!catalog[index].exists || clean(row.tenantId) !== current.tenantId) throw new HttpsError('not-found', `الصنف ${line.itemId} غير موجود.`);
    return { ...line, locationId: line.locationId || null, locationCode: line.locationId ? clean(locations[index]?.data()?.code || line.locationId) : null, itemName: clean(row.name || row.productName || line.itemId), itemCode: clean(row.code || row.productCode), unit: clean(row.baseUnit || row.unit || 'unit') };
  });
  const requestedId = clean(data.draftId);
  const ref = requestedId ? db.collection('general_stock_receipts').doc(requestedId) : db.collection('general_stock_receipts').doc();
  if (requestedId) {
    const existing = await ref.get();
    if (!existing.exists || clean(existing.data()?.tenantId) !== current.tenantId || existing.data()?.status !== 'draft') throw new HttpsError('failed-precondition', 'المسودة غير صالحة للتعديل.');
  }
  const at = new Date().toISOString();
  const previous = requestedId ? (await ref.get()).data() : undefined;
  const referenceNo = clean(previous?.referenceNo) || `RCV-D-${at.slice(0, 10).replaceAll('-', '')}-${ref.id.slice(0, 5).toUpperCase()}`;
  await ref.set({
    tenantId: current.tenantId, referenceNo, status: 'draft', warehouseId, warehouseName: clean(warehouse.data()?.name), reason,
    sourceIssueId: clean(data.sourceIssueId) || null, sourceParty: clean(data.sourceParty) || null, sourceDocumentNo: clean(data.sourceDocumentNo) || null,
    note: clean(data.note, 500) || null, lines: savedLines, createdBy: current.uid, createdByName: current.name,
    createdAt: previous?.createdAt || at, updatedAt: at,
  }, { merge: true });
  return { ok: true as const, id: ref.id, referenceNo };
};

async function voidVoucher(request: CallableRequest, kind: 'issue' | 'receipt') {
  const current = await actor(request, 'void');
  const voucherId = clean((request.data as Record<string, unknown> | undefined)?.voucherId);
  const reason = clean((request.data as Record<string, unknown> | undefined)?.reason, 500);
  if (!voucherId || !reason) throw new HttpsError('invalid-argument', 'السند وسبب الإلغاء مطلوبان.');
  const collection = kind === 'issue' ? 'general_stock_issues' : 'general_stock_receipts';
  const ref = db.collection(collection).doc(voucherId);
  const at = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const voucher = snap.data() as Record<string, unknown> | undefined;
    if (!snap.exists || clean(voucher?.tenantId) !== current.tenantId) throw new HttpsError('not-found', 'السند غير موجود.');
    if (voucher?.status === 'voided') return;
    if (voucher?.status !== 'posted') throw new HttpsError('failed-precondition', 'يمكن إلغاء السند المرحّل فقط.');
    if (kind === 'issue') {
      const returned = Object.values((voucher.returnedQuantities || {}) as Record<string, unknown>)
        .reduce((sum: number, value) => sum + Number(value || 0), 0);
      if (returned > 0.0001) throw new HttpsError('failed-precondition', 'يجب إلغاء أذونات المرتجع المرتبطة أولًا قبل إلغاء إذن الصرف.');
    }
    const warehouseId = clean(voucher.warehouseId);
    if (!current.isSuperAdmin && current.assignedWarehouseIds.length && !current.assignedWarehouseIds.includes(warehouseId)) throw new HttpsError('permission-denied', 'المخزن خارج نطاق المخازن المسموح بها للحساب.');
    const lines = Array.isArray(voucher.lines) ? voucher.lines as Array<Record<string, unknown>> : [];
    const balanceRefs = lines.map((line) => db.collection('stock_items').doc(`${warehouseId}__${clean(line.itemType)}__${clean(line.itemId)}`));
    const locationRefs = lines.map((line) => clean(line.locationId) ? db.collection('stock_location_balances').doc(`${warehouseId}__${clean(line.locationId)}__${clean(line.itemType)}__${clean(line.itemId)}`) : null);
    const balances = await Promise.all(balanceRefs.map((balanceRef) => tx.get(balanceRef)));
    const locations = await Promise.all(locationRefs.map((locationRef) => locationRef ? tx.get(locationRef) : Promise.resolve(null)));
    const sourceIssueId = kind === 'receipt' ? clean(voucher.sourceIssueId) : '';
    const sourceIssueRef = sourceIssueId ? db.collection('general_stock_issues').doc(sourceIssueId) : null;
    const sourceIssueSnap = sourceIssueRef ? await tx.get(sourceIssueRef) : null;
    lines.forEach((line, index) => {
      const quantity = roundQty(line.quantity);
      const currentQty = Number(balances[index].data()?.quantity || 0);
      const nextQty = kind === 'issue' ? currentQty + quantity : currentQty - quantity;
      if (nextQty < -0.0001) throw new HttpsError('failed-precondition', `لا يمكن إلغاء السند لأن رصيد ${clean(line.itemName || line.itemId)} غير كافٍ.`);
      tx.set(balanceRefs[index], { quantity: nextQty, updatedAt: at, lastMovementAt: at }, { merge: true });
      if (locationRefs[index]) {
        const currentLocationQty = Number(locations[index]?.data()?.quantity || 0);
        const nextLocationQty = kind === 'issue' ? currentLocationQty + quantity : currentLocationQty - quantity;
        if (nextLocationQty < -0.0001) throw new HttpsError('failed-precondition', `لا يمكن إلغاء السند لأن رصيد اللوكيشن للصنف ${clean(line.itemName || line.itemId)} غير كافٍ.`);
        tx.set(locationRefs[index]!, { quantity: nextLocationQty, updatedAt: at, lastMovementAt: at }, { merge: true });
      }
      tx.create(db.collection('stock_transactions').doc(), {
        tenantId: current.tenantId, warehouseId, warehouseName: clean(voucher.warehouseName), itemType: clean(line.itemType), itemId: clean(line.itemId),
        itemName: clean(line.itemName || line.itemId), itemCode: clean(line.itemCode), unit: clean(line.unit || 'unit'), locationId: clean(line.locationId) || null,
        locationCode: clean(line.locationCode) || null, movementType: kind === 'issue' ? 'IN' : 'OUT', quantity: kind === 'issue' ? quantity : -quantity,
        referenceNo: `${clean(voucher.referenceNo)}-VOID`, sourceModule: 'manual_movement_reversal', sourceId: voucherId,
        reversedSourceModule: 'manual_movement', reversedSourceId: voucherId, voidReason: reason, note: reason, createdBy: current.name, createdAt: at,
        sourceWorkOrderId: clean(voucher.workOrderId) || null, workOrderNumber: clean(voucher.workOrderNumber) || null,
        productId: clean(voucher.productId) || null, productName: clean(voucher.productName) || null,
        productionLineId: clean(voucher.productionLineId) || null, productionLineName: clean(voucher.productionLineName) || null,
        productionStageId: clean(voucher.productionStageId) || null, productionStageName: clean(voucher.productionStageName) || null,
      });
    });
    if (sourceIssueRef && sourceIssueSnap?.exists) {
      const returned = { ...((sourceIssueSnap.data()?.returnedQuantities || {}) as Record<string, number>) };
      lines.forEach((line) => {
        const key = `${clean(line.itemType)}:${clean(line.itemId)}`;
        returned[key] = Math.max(0, Number(returned[key] || 0) - Number(line.quantity || 0));
      });
      tx.set(sourceIssueRef, { returnedQuantities: returned, updatedAt: at }, { merge: true });
    }
    tx.set(ref, { status: 'voided', voidReason: reason, voidedAt: at, voidedBy: current.uid, voidedByName: current.name, updatedAt: at }, { merge: true });
  });
  return { ok: true as const };
}

export const voidGeneralStockIssueHandler = (request: CallableRequest) => voidVoucher(request, 'issue');
export const voidGeneralStockReceiptHandler = (request: CallableRequest) => voidVoucher(request, 'receipt');
