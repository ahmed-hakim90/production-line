import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import {
  assertActorWarehouseInvolved,
  resolveBoundInventoryWarehouseId,
} from './inventoryWarehouseScope.js';
import {
  buildProductionHandoverIdempotencyKey,
  PRODUCTION_QUANTITY_TOLERANCE,
  quantitiesMatch,
} from './productionStockInvariants.js';

const db = getDb();

const USERS = 'users';
const ROLES = 'roles';
const REQUESTS = 'inventory_transfer_requests';
const RECEIPTS = 'production_handover_receipts';
const WAREHOUSES = 'warehouses';
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';

type TransferLine = {
  itemType: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  unit?: string;
  quantity?: number;
  reportedQuantity?: number;
  receivedQuantity?: number;
  minStock?: number;
};

type ActorContext = {
  uid: string;
  tenantId: string;
  displayName: string;
  isSuperAdmin: boolean;
  permissions: Record<string, boolean>;
  boundWarehouseId: string | null;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const balanceDocId = (warehouseId: string, itemType: string, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<ActorContext> => {
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as {
    tenantId?: string;
    displayName?: string;
    email?: string;
    roleId?: string;
    isSuperAdmin?: boolean;
    isActive?: boolean;
    inventoryWarehouseId?: string | null;
  };
  if (user.isActive !== true) {
    throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  }
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) {
    throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
  }

  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    if (!roleSnap.exists) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    const role = roleSnap.data() as {
      tenantId?: string;
      permissions?: Record<string, boolean>;
    };
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

const hasAnyPermission = (actor: ActorContext, permissionKeys: string[]): boolean =>
  actor.isSuperAdmin || permissionKeys.some((key) => actor.permissions[key] === true);

const receiptDocumentId = (
  tenantId: string,
  handoverRequestId: string,
  idempotencyKey: string,
): string => createHash('sha256')
  .update(`${tenantId}\u0000${handoverRequestId}\u0000${idempotencyKey}`, 'utf8')
  .digest('hex');

export const confirmProductionHandoverReceipt = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasAnyPermission(actor, [
      'productionHandover.approve',
      'inventory.transfers.approve',
    ])) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية اعتماد استلام التغليف.');
    }

    if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
      throw new HttpsError('invalid-argument', 'بيانات عملية الاستلام غير صالحة.');
    }
    const input = request.data as Record<string, unknown>;
    const allowedFields = new Set([
      'handoverRequestId',
      'quantity',
      'expectedReceivedQuantity',
      'note',
      'idempotencyKey',
    ]);
    if (Object.keys(input).some((key) => !allowedFields.has(key))) {
      throw new HttpsError('invalid-argument', 'تحتوي عملية الاستلام على حقول غير مسموحة.');
    }
    if (
      typeof input.handoverRequestId !== 'string'
      || typeof input.quantity !== 'number'
      || typeof input.expectedReceivedQuantity !== 'number'
      || typeof input.idempotencyKey !== 'string'
      || (input.note !== undefined && typeof input.note !== 'string')
    ) {
      throw new HttpsError('invalid-argument', 'بيانات عملية الاستلام غير صالحة.');
    }
    const handoverRequestId = input.handoverRequestId.trim();
    const qty = input.quantity;
    const expectedReceivedQuantity = input.expectedReceivedQuantity;
    const note = String(input.note || '').trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!handoverRequestId) throw new HttpsError('invalid-argument', 'معرف طلب الاستلام مطلوب.');
    if (handoverRequestId.includes('/') || handoverRequestId.length > 256) {
      throw new HttpsError('invalid-argument', 'معرف طلب الاستلام غير صالح.');
    }
    if (!Number.isFinite(qty) || !(qty > 0)) {
      throw new HttpsError('invalid-argument', 'كمية الاستلام يجب أن تكون أكبر من صفر.');
    }
    if (!Number.isFinite(expectedReceivedQuantity) || expectedReceivedQuantity < 0) {
      throw new HttpsError('invalid-argument', 'الكمية المستلمة السابقة غير صالحة.');
    }
    if (note.length > 1000) {
      throw new HttpsError('invalid-argument', 'ملاحظة الاستلام طويلة جداً.');
    }
    const expectedIdempotencyKey = buildProductionHandoverIdempotencyKey(
      handoverRequestId,
      expectedReceivedQuantity,
      qty,
    );
    if (idempotencyKey !== expectedIdempotencyKey) {
      throw new HttpsError('invalid-argument', 'مفتاح عملية الاستلام غير صالح.');
    }

    const receiptRef = db.collection(RECEIPTS).doc(
      receiptDocumentId(actor.tenantId, handoverRequestId, idempotencyKey),
    );
    const reqRef = db.collection(REQUESTS).doc(handoverRequestId);

    return db.runTransaction(async (t) => {
      const [existingReceiptSnap, reqSnap] = await Promise.all([
        t.get(receiptRef),
        t.get(reqRef),
      ]);
      if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'طلب استلام التغليف غير موجود.');
      }
      const req = reqSnap.data() as {
        tenantId?: string;
        requestType?: string;
        status?: string;
        createdBy?: string;
        createdByUserId?: string;
        referenceNo?: string;
        fromWarehouseId?: string;
        toWarehouseId?: string;
        sourceId?: string;
        sourceReportId?: string;
        reportedQuantity?: number;
        receivedQuantity?: number;
        remainingQuantity?: number;
        lines?: TransferLine[];
        firstReviewedAt?: string;
      };
      if (String(req.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول لطلب خارج شركتك.');
      }
      if (String(req.requestType || '') !== 'production_handover') {
        throw new HttpsError('failed-precondition', 'هذا الطلب ليس طلب استلام تغليف.');
      }

      const fromWarehouseId = String(req.fromWarehouseId || '').trim();
      const toWarehouseId = String(req.toWarehouseId || '').trim();
      if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
        throw new HttpsError('failed-precondition', 'مخازن الاستلام غير مكتملة.');
      }
      assertActorWarehouseInvolved(actor.boundWarehouseId, [fromWarehouseId, toWarehouseId]);

      if (existingReceiptSnap.exists) {
        const existing = existingReceiptSnap.data() as {
          tenantId?: string;
          handoverRequestId?: string;
          idempotencyKey?: string;
          remainingAfter?: number;
        };
        if (
          String(existing.tenantId || '') !== actor.tenantId
          || String(existing.handoverRequestId || '') !== handoverRequestId
          || String(existing.idempotencyKey || '') !== idempotencyKey
        ) {
          throw new HttpsError('permission-denied', 'تعذر التحقق من عملية الاستلام السابقة.');
        }
        return {
          receiptId: receiptRef.id,
          remainingQuantity: toNumber(existing.remainingAfter),
          idempotent: true,
        };
      }

      const [sourceWarehouseSnap, targetWarehouseSnap] = await Promise.all([
        t.get(db.collection(WAREHOUSES).doc(fromWarehouseId)),
        t.get(db.collection(WAREHOUSES).doc(toWarehouseId)),
      ]);
      if (!sourceWarehouseSnap.exists || !targetWarehouseSnap.exists) {
        throw new HttpsError('failed-precondition', 'مخازن الاستلام غير موجودة.');
      }
      if (
        String(sourceWarehouseSnap.data()?.tenantId || '') !== actor.tenantId
        || String(targetWarehouseSnap.data()?.tenantId || '') !== actor.tenantId
      ) {
        throw new HttpsError('permission-denied', 'مخازن الاستلام خارج شركتك.');
      }

      if (String(req.status || '') !== 'pending') {
        throw new HttpsError('failed-precondition', 'يمكن تأكيد الاستلام للطلبات المعلّقة فقط.');
      }
      if (
        (req.createdByUserId && req.createdByUserId === uid)
        || (
          req.createdBy
          && String(req.createdBy).trim().toLowerCase() === actor.displayName.toLowerCase()
        )
      ) {
        throw new HttpsError('failed-precondition', 'لا يمكن لمنشئ التقرير اعتماد استلامه.');
      }

      const line = (req.lines || [])[0];
      if (!line?.itemId || !line.itemType) {
        throw new HttpsError('failed-precondition', 'طلب الاستلام بلا بنود.');
      }
      const reported = toNumber(req.reportedQuantity ?? line.reportedQuantity ?? line.quantity);
      const received = toNumber(req.receivedQuantity ?? line.receivedQuantity);
      if (!(reported > 0) || received < -PRODUCTION_QUANTITY_TOLERANCE) {
        throw new HttpsError('failed-precondition', 'كميات طلب الاستلام غير صالحة.');
      }
      if (!quantitiesMatch(received, expectedReceivedQuantity)) {
        throw new HttpsError(
          'failed-precondition',
          'تم تحديث الكمية المستلمة. حدّث الصفحة ثم أعد المحاولة.',
        );
      }
      if (received > reported + PRODUCTION_QUANTITY_TOLERANCE) {
        throw new HttpsError('failed-precondition', 'إجمالي الاستلام المسجل يتجاوز الكمية المبلغة.');
      }
      const remaining = Math.max(0, reported - received);
      if (qty > remaining + PRODUCTION_QUANTITY_TOLERANCE) {
        throw new HttpsError('failed-precondition', `كمية الاستلام تتجاوز المتبقي (${remaining}).`);
      }

      const sourceBalRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(fromWarehouseId, line.itemType, line.itemId),
      );
      const targetBalRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(toWarehouseId, line.itemType, line.itemId),
      );
      const [sourceBalSnap, targetBalSnap] = await Promise.all([
        t.get(sourceBalRef),
        t.get(targetBalRef),
      ]);
      if (
        (sourceBalSnap.exists
          && String(sourceBalSnap.data()?.tenantId || '') !== actor.tenantId)
        || (targetBalSnap.exists
          && String(targetBalSnap.data()?.tenantId || '') !== actor.tenantId)
      ) {
        throw new HttpsError('permission-denied', 'رصيد المخزن خارج شركتك.');
      }
      const sourceQty = sourceBalSnap.exists ? toNumber(sourceBalSnap.data()?.quantity) : 0;
      const targetQty = targetBalSnap.exists ? toNumber(targetBalSnap.data()?.quantity) : 0;
      if (sourceQty - qty < -PRODUCTION_QUANTITY_TOLERANCE) {
        throw new HttpsError('failed-precondition', 'الرصيد غير كافٍ في مخزن تحت التسليم.');
      }

      const outTxRef = db.collection(STOCK_TX).doc(`handover_${receiptRef.id}_out`);
      const inTxRef = db.collection(STOCK_TX).doc(`handover_${receiptRef.id}_in`);
      const referenceNo = `${String(req.referenceNo || handoverRequestId)}-R-${receiptRef.id.slice(0, 10)}`;
      const receivedTotal = received + qty;
      const remainingTotal = receivedTotal >= reported - PRODUCTION_QUANTITY_TOLERANCE
        ? 0
        : reported - receivedTotal;
      const now = new Date().toISOString();
      const lineage = {
        unit: line.unit || 'piece',
        sourceModule: 'production_report',
        sourceId: req.sourceId || req.sourceReportId || handoverRequestId,
        sourceReportId: req.sourceReportId || null,
        tenantId: actor.tenantId,
      };
      const nextLines = (req.lines || []).map((row, index) => (
        index === 0
          ? {
            ...row,
            reportedQuantity: reported,
            receivedQuantity: receivedTotal,
            quantity: remainingTotal,
          }
          : row
      ));

      t.set(outTxRef, {
        warehouseId: fromWarehouseId,
        toWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName || line.itemId,
        itemCode: line.itemCode || '',
        movementType: 'TRANSFER',
        quantity: qty,
        transferDirection: 'OUT',
        relatedTransactionId: inTxRef.id,
        referenceNo,
        note: `Handover receipt ${referenceNo}`,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        ...lineage,
      });
      t.set(inTxRef, {
        warehouseId: toWarehouseId,
        toWarehouseId: fromWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName || line.itemId,
        itemCode: line.itemCode || '',
        movementType: 'TRANSFER',
        quantity: qty,
        transferDirection: 'IN',
        relatedTransactionId: outTxRef.id,
        referenceNo,
        note: `Handover receipt ${referenceNo}`,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        ...lineage,
      });
      t.set(sourceBalRef, {
        warehouseId: fromWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName || line.itemId,
        itemCode: line.itemCode || '',
        minStock: toNumber(line.minStock),
        quantity: Math.max(0, sourceQty - qty),
        updatedAt: now,
        tenantId: actor.tenantId,
      }, { merge: true });
      t.set(targetBalRef, {
        warehouseId: toWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName || line.itemId,
        itemCode: line.itemCode || '',
        minStock: toNumber(line.minStock),
        quantity: targetQty + qty,
        updatedAt: now,
        tenantId: actor.tenantId,
      }, { merge: true });
      t.set(reqRef, {
        lines: nextLines,
        reportedQuantity: reported,
        receivedQuantity: receivedTotal,
        remainingQuantity: remainingTotal,
        firstReviewedAt: req.firstReviewedAt || now,
        ...(remainingTotal <= PRODUCTION_QUANTITY_TOLERANCE
          ? {
            status: 'approved',
            approvedBy: actor.displayName,
            approvedByUserId: actor.uid,
            approvedAt: now,
            resolvedAt: now,
          }
          : {}),
      }, { merge: true });
      t.set(receiptRef, {
        handoverRequestId,
        handoverReferenceNo: req.referenceNo || null,
        productionReportId: req.sourceReportId || req.sourceId || null,
        productId: line.itemId,
        productName: line.itemName || line.itemId,
        productCode: line.itemCode || '',
        quantity: qty,
        fromWarehouseId,
        toWarehouseId,
        movementReferenceNo: outTxRef.id,
        note: note || null,
        receivedBy: actor.displayName,
        receivedByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
        remainingAfter: remainingTotal,
        idempotencyKey,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        receiptId: receiptRef.id,
        remainingQuantity: remainingTotal,
        idempotent: false,
      };
    });
  },
);
