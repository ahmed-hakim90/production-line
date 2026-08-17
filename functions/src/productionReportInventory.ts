/**
 * Secure callables for production report inventory posting (V2 core path).
 * Consumes BOM from production floor using issued production-issue lines,
 * posts finished qty to WIP, and creates packaging handover request.
 */
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { resolveInventoryRoutingFromSettings } from './productionInventoryRouting.js';
import {
  assertActorWarehouseInvolved,
  resolveBoundInventoryWarehouseId,
} from './inventoryWarehouseScope.js';
import {
  buildDeterministicHandoverRequestId,
  buildDeterministicMovementPlan,
  isExplicitlyActiveUser,
  roleBelongsToTenant,
  resolveApplyOperationAction,
  resolveReverseOperationAction,
  type DeterministicInventoryMovement,
  type InventoryMovementIntent,
  type InventoryOperationState,
} from './productionReportInventoryCore.js';
import {
  assertOperationPathEnabledServer,
  isOperationPathEnabledServer,
} from './operationPathGuard.js';
import { resolveRequiresProductionIssueOnReport } from './requiresProductionIssue.js';

const REPORT_CREATE_OPERATION_KEY = 'production.report.create';
const REPORT_DELETE_OPERATION_KEY = 'production.report.delete';

const db = getDb();

const USERS = 'users';
const ROLES = 'roles';
const REPORTS = 'production_reports';
const PRODUCTS = 'products';
const MATERIALS = 'materials';
const RAW_MATERIALS = 'raw_materials';
const ORDERS = 'production_issue_orders';
const WORK_ORDERS = 'work_orders';
const PRODUCTION_PLANS = 'production_plans';
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';
const REQUESTS = 'inventory_transfer_requests';
const INVENTORY_COUNTERS = 'inventory_counters';
const SYSTEM_SETTINGS = 'system_settings';
const INVENTORY_OPERATION_SUBCOLLECTION = 'inventory_operations';
const INVENTORY_OPERATION_DOC = 'current';

type ActorContext = {
  uid: string;
  tenantId: string;
  displayName: string;
  isSuperAdmin: boolean;
  permissions: Record<string, boolean>;
  boundWarehouseId: string | null;
};

type IssueLine = {
  itemType: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  unit?: string;
  qtyPerUnit?: number;
  requiredQty?: number;
};

type InventoryPostingOperation = {
  tenantId: string;
  reportId: string;
  state: InventoryOperationState;
  applyPlan?: DeterministicInventoryMovement[];
  handover?: HandoverIntent | null;
  createdAt?: string;
  updatedAt?: string;
};

type HandoverIntent = {
  requestId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  reportedQuantity: number;
  itemType: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  minStock: number;
  note: string;
};

type ExistingMovement = {
  id: string;
  warehouseId?: string;
  toWarehouseId?: string;
  itemType?: string;
  itemId?: string;
  movementType?: string;
  transferDirection?: string;
  quantity?: number;
  sourceModule?: string;
  sourceId?: string;
  tenantId?: string;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toIsoNow = () => new Date().toISOString();

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

const balanceDocId = (warehouseId: string, itemType: string, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const requireReportId = (request: CallableRequest): string => {
  const data = request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'بيانات الطلب غير صالحة.');
  }
  const keys = Object.keys(data as Record<string, unknown>);
  if (keys.some((key) => key !== 'reportId')) {
    throw new HttpsError('invalid-argument', 'يتضمن الطلب حقولاً غير مسموحة.');
  }
  const reportId = String((data as { reportId?: unknown }).reportId || '').trim();
  if (!reportId) throw new HttpsError('invalid-argument', 'معرّف التقرير مطلوب.');
  if (reportId.includes('/') || reportId.length > 200) {
    throw new HttpsError('invalid-argument', 'معرّف التقرير غير صالح.');
  }
  return reportId;
};

const loadActor = async (uid: string): Promise<ActorContext> => {
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as {
    tenantId?: string;
    displayName?: string;
    email?: string;
    isActive?: boolean;
    isSuperAdmin?: boolean;
    roleId?: string;
    inventoryWarehouseId?: string | null;
  };
  if (!isExplicitlyActiveUser(user.isActive)) {
    throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  }
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    if (!roleSnap.exists) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير موجود.');
    }
    const role = roleSnap.data() as {
      tenantId?: string;
      permissions?: Record<string, boolean>;
    };
    if (!roleBelongsToTenant(role.tenantId, tenantId)) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح لهذه الشركة.');
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

const hasPermission = (actor: ActorContext, keys: string[]) =>
  actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true);

const operationRefForReport = (reportId: string) => db
  .collection(REPORTS)
  .doc(reportId)
  .collection(INVENTORY_OPERATION_SUBCOLLECTION)
  .doc(INVENTORY_OPERATION_DOC);

async function findIssuedOrder(params: {
  tenantId: string;
  reportId: string;
  workOrderId?: string;
  productionPlanId?: string;
}): Promise<{ id: string; lines: IssueLine[]; quantity: number } | null> {
  const byReport = await db.collection(ORDERS)
    .where('tenantId', '==', params.tenantId)
    .where('productionReportId', '==', params.reportId)
    .where('status', '==', 'issued')
    .limit(1)
    .get();
  if (!byReport.empty) {
    const doc = byReport.docs[0];
    const data = doc.data() as { lines?: IssueLine[]; quantity?: number };
    return { id: doc.id, lines: data.lines || [], quantity: toNumber(data.quantity) };
  }

  const workOrderId = String(params.workOrderId || '').trim();
  if (workOrderId) {
    const byWo = await db.collection(ORDERS)
      .where('tenantId', '==', params.tenantId)
      .where('workOrderId', '==', workOrderId)
      .where('status', '==', 'issued')
      .limit(5)
      .get();
    const match = byWo.docs.find((d) => {
      const sourceType = String((d.data() as { sourceType?: string }).sourceType || '');
      return sourceType !== 'production_report';
    });
    if (match) {
      const data = match.data() as { lines?: IssueLine[]; quantity?: number };
      return { id: match.id, lines: data.lines || [], quantity: toNumber(data.quantity) };
    }
  }

  const planId = String(params.productionPlanId || '').trim();
  if (planId) {
    const byPlan = await db.collection(ORDERS)
      .where('tenantId', '==', params.tenantId)
      .where('productionPlanId', '==', planId)
      .where('status', '==', 'issued')
      .limit(5)
      .get();
    const match = byPlan.docs.find((d) => {
      const sourceType = String((d.data() as { sourceType?: string }).sourceType || '');
      return sourceType !== 'production_report';
    });
    if (match) {
      const data = match.data() as { lines?: IssueLine[]; quantity?: number };
      return { id: match.id, lines: data.lines || [], quantity: toNumber(data.quantity) };
    }
  }
  return null;
}

const nearlyEqual = (left: unknown, right: unknown): boolean =>
  Math.abs(toNumber(left) - toNumber(right)) <= 0.000001;

const movementMatches = (
  movement: InventoryMovementIntent,
  existing: ExistingMovement,
): boolean => {
  if (String(existing.tenantId || '') === '') return false;
  if (String(existing.sourceModule || '') !== movement.sourceModule) return false;
  if (String(existing.sourceId || '') !== movement.sourceId) return false;
  if (String(existing.warehouseId || '') !== movement.warehouseId) return false;
  if (String(existing.itemType || '') !== movement.itemType) return false;
  if (String(existing.itemId || '') !== movement.itemId) return false;
  if (!nearlyEqual(existing.quantity, movement.quantity)) return false;
  if (movement.movementType === 'TRANSFER') {
    return existing.movementType === 'TRANSFER'
      && existing.transferDirection !== 'IN'
      && String(existing.toWarehouseId || '') === String(movement.toWarehouseId || '');
  }
  return existing.movementType === movement.movementType;
};

function attachLegacyMovementMatches(
  plan: DeterministicInventoryMovement[],
  existingMovements: ExistingMovement[],
): DeterministicInventoryMovement[] {
  const unused = new Map(existingMovements.map((movement) => [movement.id, movement]));
  return plan.map((movement) => {
    const legacy = Array.from(unused.values()).find((candidate) => movementMatches(movement, candidate));
    if (!legacy) return movement;
    unused.delete(legacy.id);
    return { ...movement, legacyMovementId: legacy.id };
  });
}

async function loadSourceMovements(tenantId: string, sourceId: string): Promise<ExistingMovement[]> {
  const snap = await db.collection(STOCK_TX)
    .where('tenantId', '==', tenantId)
    .where('sourceId', '==', sourceId)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ExistingMovement));
}

async function claimApplyOperation(params: {
  actor: ActorContext;
  reportId: string;
  applyPlan: DeterministicInventoryMovement[];
  handover: HandoverIntent | null;
  reportBasis: {
    productId: string;
    quantityProduced: number;
    reportType: string;
    workOrderId: string;
    productionPlanId: string;
  };
}): Promise<{ operation: InventoryPostingOperation; idempotent: boolean }> {
  const reportRef = db.collection(REPORTS).doc(params.reportId);
  const operationRef = operationRefForReport(params.reportId);
  return db.runTransaction(async (t) => {
    const reportSnap = await t.get(reportRef);
    const operationSnap = await t.get(operationRef);
    if (!reportSnap.exists) throw new HttpsError('not-found', 'تقرير الإنتاج غير موجود.');
    const report = reportSnap.data() as {
      tenantId?: string;
      inventoryAppliedAt?: string;
      productId?: string;
      quantityProduced?: number;
      reportType?: string;
      workOrderId?: string;
      productionPlanId?: string;
    };
    if (String(report.tenantId || '') !== params.actor.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكن الوصول لتقرير خارج شركتك.');
    }

    const existing = operationSnap.exists
      ? operationSnap.data() as InventoryPostingOperation
      : null;
    if (existing && existing.tenantId !== params.actor.tenantId) {
      throw new HttpsError('permission-denied', 'عملية المخزون خارج شركتك.');
    }
    const action = resolveApplyOperationAction(existing?.state);
    if (action === 'blocked') {
      throw new HttpsError(
        'failed-precondition',
        'تم بدء عكس مخزون التقرير ولا يمكن إعادة ترحيله في الوقت نفسه.',
      );
    }
    if (action === 'done') {
      return { operation: existing!, idempotent: true };
    }
    if (action === 'resume') {
      if (!Array.isArray(existing?.applyPlan)) {
        throw new HttpsError('failed-precondition', 'حالة ترحيل المخزون غير مكتملة.');
      }
      return { operation: existing!, idempotent: false };
    }
    const currentBasis = {
      productId: String(report.productId || '').trim(),
      quantityProduced: toNumber(report.quantityProduced),
      reportType: String(report.reportType || 'finished_product').trim() || 'finished_product',
      workOrderId: String(report.workOrderId || '').trim(),
      productionPlanId: String(report.productionPlanId || '').trim(),
    };
    if (JSON.stringify(currentBasis) !== JSON.stringify(params.reportBasis)) {
      throw new HttpsError('aborted', 'تم تعديل التقرير أثناء تجهيز الترحيل. أعد المحاولة.');
    }

    const now = toIsoNow();
    const operation: InventoryPostingOperation = report.inventoryAppliedAt
      ? {
        tenantId: params.actor.tenantId,
        reportId: params.reportId,
        state: 'applied',
        applyPlan: [],
        handover: null,
        createdAt: now,
        updatedAt: now,
      }
      : {
        tenantId: params.actor.tenantId,
        reportId: params.reportId,
        state: 'applying',
        applyPlan: params.applyPlan,
        handover: params.handover,
        createdAt: now,
        updatedAt: now,
      };
    t.set(operationRef, operation);
    if (!report.inventoryAppliedAt) {
      t.set(reportRef, {
        inventoryPostingState: 'applying',
        inventoryPostingUpdatedAt: now,
      }, { merge: true });
    }
    return { operation, idempotent: Boolean(report.inventoryAppliedAt) };
  });
}

async function finalizeApplyOperation(
  actor: ActorContext,
  reportId: string,
): Promise<'applied' | 'reversed'> {
  const reportRef = db.collection(REPORTS).doc(reportId);
  const operationRef = operationRefForReport(reportId);
  return db.runTransaction(async (t) => {
    const reportSnap = await t.get(reportRef);
    const operationSnap = await t.get(operationRef);
    if (!reportSnap.exists) throw new HttpsError('not-found', 'تقرير الإنتاج غير موجود.');
    const report = reportSnap.data() as { tenantId?: string };
    const operation = operationSnap.data() as InventoryPostingOperation | undefined;
    if (String(report.tenantId || '') !== actor.tenantId || operation?.tenantId !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكن الوصول لتقرير خارج شركتك.');
    }
    if (operation.state === 'reversing' || operation.state === 'reversed') return 'reversed';
    if (operation.state !== 'applying' && operation.state !== 'applied') {
      throw new HttpsError('failed-precondition', 'حالة ترحيل المخزون غير صالحة.');
    }
    if (operation.state === 'applied') return 'applied';

    const now = toIsoNow();
    t.set(operationRef, { state: 'applied', updatedAt: now }, { merge: true });
    t.set(reportRef, {
      inventoryAppliedAt: now,
      inventoryAppliedBy: actor.displayName,
      inventoryAppliedByUserId: actor.uid,
      inventoryPostingState: 'applied',
      inventoryPostingUpdatedAt: now,
    }, { merge: true });
    return 'applied';
  });
}

async function postWarehouseMovement(params: DeterministicInventoryMovement & {
  actor: ActorContext;
  reportId: string;
  expectedOperationState: 'applying' | 'reversing';
}): Promise<string> {
  const qty = params.quantity;
  if (!(qty > 0)) return '';

  return db.runTransaction(async (t) => {
    const operationRef = operationRefForReport(params.reportId);
    const operationSnap = await t.get(operationRef);
    const operation = operationSnap.data() as InventoryPostingOperation | undefined;
    if (
      !operationSnap.exists
      || operation?.tenantId !== params.actor.tenantId
      || operation.state !== params.expectedOperationState
    ) {
      throw new HttpsError('aborted', 'تغيرت حالة عملية المخزون. أعد المحاولة.');
    }

    const legacyRef = params.legacyMovementId
      ? db.collection(STOCK_TX).doc(params.legacyMovementId)
      : null;
    const legacySnap = legacyRef ? await t.get(legacyRef) : null;
    if (
      legacySnap?.exists
      && String(legacySnap.data()?.tenantId || '') === params.actor.tenantId
      && movementMatches(params, { id: legacySnap.id, ...legacySnap.data() } as ExistingMovement)
    ) {
      return legacySnap.id;
    }

    const counterRef = db.collection(INVENTORY_COUNTERS).doc(params.actor.tenantId);

    if (params.movementType === 'TRANSFER') {
      const toWarehouseId = String(params.toWarehouseId || '').trim();
      if (!toWarehouseId) {
        throw new HttpsError('failed-precondition', 'مخزن الوجهة مطلوب للتحويل.');
      }
      const sourceRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(params.warehouseId, params.itemType, params.itemId),
      );
      const targetRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(toWarehouseId, params.itemType, params.itemId),
      );
      const outTx = db.collection(STOCK_TX).doc(`${params.movementId}__out`);
      const inTx = db.collection(STOCK_TX).doc(`${params.movementId}__in`);
      const outTxSnap = await t.get(outTx);
      const inTxSnap = await t.get(inTx);
      if (outTxSnap.exists || inTxSnap.exists) {
        if (!outTxSnap.exists || !inTxSnap.exists) {
          throw new HttpsError('data-loss', 'زوج حركة التحويل غير مكتمل.');
        }
        const existingOut = { id: outTxSnap.id, ...outTxSnap.data() } as ExistingMovement;
        if (
          existingOut.tenantId !== params.actor.tenantId
          || !movementMatches(params, existingOut)
        ) {
          throw new HttpsError('data-loss', 'هوية حركة المخزون مستخدمة ببيانات مختلفة.');
        }
        return outTx.id;
      }
      const counterSnap = await t.get(counterRef);
      const sourceSnap = await t.get(sourceRef);
      const targetSnap = await t.get(targetRef);
      if (
        (sourceSnap.exists && String(sourceSnap.data()?.tenantId || '') !== params.actor.tenantId)
        || (targetSnap.exists && String(targetSnap.data()?.tenantId || '') !== params.actor.tenantId)
      ) {
        throw new HttpsError('permission-denied', 'رصيد المخزون خارج شركتك.');
      }
      const nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
      const referenceNo = formatInvReference(nextInv);
      const now = toIsoNow();
      const sourceQty = sourceSnap.exists ? toNumber(sourceSnap.data()?.quantity) : 0;
      const targetQty = targetSnap.exists ? toNumber(targetSnap.data()?.quantity) : 0;
      if (!params.allowNegative && sourceQty - qty < -0.000001) {
        throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${params.itemName}.`);
      }
      t.set(sourceRef, stripUndefined({
        warehouseId: params.warehouseId,
        itemType: params.itemType,
        itemId: params.itemId,
        itemName: params.itemName,
        itemCode: params.itemCode || '',
        unit: params.unit || 'unit',
        quantity: sourceQty - qty,
        updatedAt: now,
        tenantId: params.actor.tenantId,
      }), { merge: true });
      t.set(targetRef, stripUndefined({
        warehouseId: toWarehouseId,
        itemType: params.itemType,
        itemId: params.itemId,
        itemName: params.itemName,
        itemCode: params.itemCode || '',
        unit: params.unit || 'unit',
        quantity: targetQty + qty,
        updatedAt: now,
        tenantId: params.actor.tenantId,
      }), { merge: true });
      t.set(outTx, stripUndefined({
        warehouseId: params.warehouseId,
        toWarehouseId,
        itemType: params.itemType,
        itemId: params.itemId,
        itemName: params.itemName,
        itemCode: params.itemCode || '',
        unit: params.unit || 'unit',
        movementType: 'TRANSFER',
        transferDirection: 'OUT',
        quantity: qty,
        relatedTransactionId: inTx.id,
        referenceNo,
        note: params.note,
        sourceModule: params.sourceModule,
        sourceId: params.sourceId,
        operationReportId: params.reportId,
        movementIdentity: params.movementId,
        sourceMovementId: params.sourceMovementId,
        createdBy: params.actor.displayName,
        createdByUserId: params.actor.uid,
        createdAt: now,
        tenantId: params.actor.tenantId,
      }));
      t.set(inTx, stripUndefined({
        warehouseId: toWarehouseId,
        toWarehouseId: params.warehouseId,
        itemType: params.itemType,
        itemId: params.itemId,
        itemName: params.itemName,
        itemCode: params.itemCode || '',
        unit: params.unit || 'unit',
        movementType: 'TRANSFER',
        transferDirection: 'IN',
        quantity: qty,
        relatedTransactionId: outTx.id,
        referenceNo,
        note: params.note,
        sourceModule: params.sourceModule,
        sourceId: params.sourceId,
        operationReportId: params.reportId,
        movementIdentity: params.movementId,
        sourceMovementId: params.sourceMovementId,
        createdBy: params.actor.displayName,
        createdByUserId: params.actor.uid,
        createdAt: now,
        tenantId: params.actor.tenantId,
      }));
      t.set(counterRef, {
        tenantId: params.actor.tenantId,
        lastInvSeq: nextInv,
        updatedAt: now,
      }, { merge: true });
      return outTx.id;
    }

    const balRef = db.collection(STOCK_ITEMS).doc(
      balanceDocId(params.warehouseId, params.itemType, params.itemId),
    );
    const txRef = db.collection(STOCK_TX).doc(params.movementId);
    const txSnap = await t.get(txRef);
    if (txSnap.exists) {
      const existing = { id: txSnap.id, ...txSnap.data() } as ExistingMovement;
      if (existing.tenantId !== params.actor.tenantId || !movementMatches(params, existing)) {
        throw new HttpsError('data-loss', 'هوية حركة المخزون مستخدمة ببيانات مختلفة.');
      }
      return txRef.id;
    }
    const counterSnap = await t.get(counterRef);
    const balSnap = await t.get(balRef);
    if (balSnap.exists && String(balSnap.data()?.tenantId || '') !== params.actor.tenantId) {
      throw new HttpsError('permission-denied', 'رصيد المخزون خارج شركتك.');
    }
    const nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
    const referenceNo = formatInvReference(nextInv);
    const now = toIsoNow();
    const balQty = balSnap.exists ? toNumber(balSnap.data()?.quantity) : 0;
    const nextQty = params.movementType === 'IN' ? balQty + qty : balQty - qty;
    if (!params.allowNegative && nextQty < -0.000001) {
      throw new HttpsError('failed-precondition', `الرصيد غير كافٍ للصنف ${params.itemName}.`);
    }
    t.set(balRef, stripUndefined({
      warehouseId: params.warehouseId,
      itemType: params.itemType,
      itemId: params.itemId,
      itemName: params.itemName,
      itemCode: params.itemCode || '',
      unit: params.unit || 'unit',
      quantity: nextQty,
      updatedAt: now,
      tenantId: params.actor.tenantId,
    }), { merge: true });
    t.set(txRef, stripUndefined({
      warehouseId: params.warehouseId,
      itemType: params.itemType,
      itemId: params.itemId,
      itemName: params.itemName,
      itemCode: params.itemCode || '',
      unit: params.unit || 'unit',
      movementType: params.movementType,
      quantity: qty,
      referenceNo,
      note: params.note,
      sourceModule: params.sourceModule,
      sourceId: params.sourceId,
      operationReportId: params.reportId,
      movementIdentity: params.movementId,
      sourceMovementId: params.sourceMovementId,
      createdBy: params.actor.displayName,
      createdByUserId: params.actor.uid,
      createdAt: now,
      tenantId: params.actor.tenantId,
    }));
    t.set(counterRef, {
      tenantId: params.actor.tenantId,
      lastInvSeq: nextInv,
      updatedAt: now,
    }, { merge: true });
    return txRef.id;
  });
}

async function postHandoverRequest(params: {
  actor: ActorContext;
  reportId: string;
  handover: HandoverIntent;
}): Promise<void> {
  const requestRef = db.collection(REQUESTS).doc(params.handover.requestId);
  const operationRef = operationRefForReport(params.reportId);
  const counterRef = db.collection(INVENTORY_COUNTERS).doc(params.actor.tenantId);
  await db.runTransaction(async (t) => {
    const operationSnap = await t.get(operationRef);
    const requestSnap = await t.get(requestRef);
    const operation = operationSnap.data() as InventoryPostingOperation | undefined;
    if (
      !operationSnap.exists
      || operation?.tenantId !== params.actor.tenantId
      || operation.state !== 'applying'
    ) {
      throw new HttpsError('aborted', 'تغيرت حالة عملية المخزون. أعد المحاولة.');
    }
    if (requestSnap.exists) {
      const existing = requestSnap.data() as {
        tenantId?: string;
        sourceReportId?: string;
        requestType?: string;
      };
      if (
        existing.tenantId !== params.actor.tenantId
        || existing.sourceReportId !== params.reportId
        || existing.requestType !== 'production_handover'
      ) {
        throw new HttpsError('data-loss', 'هوية طلب التسليم مستخدمة ببيانات مختلفة.');
      }
      return;
    }
    const counterSnap = await t.get(counterRef);
    const nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
    const now = toIsoNow();
    t.set(requestRef, {
      requestType: 'production_handover',
      fromWarehouseId: params.handover.fromWarehouseId,
      toWarehouseId: params.handover.toWarehouseId,
      referenceNo: formatInvReference(nextInv),
      status: 'pending',
      reportedQuantity: params.handover.reportedQuantity,
      receivedQuantity: 0,
      remainingQuantity: params.handover.reportedQuantity,
      lines: [{
        itemType: params.handover.itemType,
        itemId: params.handover.itemId,
        itemName: params.handover.itemName,
        itemCode: params.handover.itemCode,
        unit: params.handover.unit,
        quantity: params.handover.reportedQuantity,
        reportedQuantity: params.handover.reportedQuantity,
        receivedQuantity: 0,
        minStock: params.handover.minStock,
      }],
      note: params.handover.note,
      sourceModule: 'production_report',
      sourceId: params.reportId,
      sourceReportId: params.reportId,
      operationReportId: params.reportId,
      createdBy: params.actor.displayName,
      createdByUserId: params.actor.uid,
      createdAt: now,
      submittedAt: now,
      tenantId: params.actor.tenantId,
    });
    t.set(counterRef, {
      tenantId: params.actor.tenantId,
      lastInvSeq: nextInv,
      updatedAt: now,
    }, { merge: true });
  });
}

async function claimReverseOperation(
  actor: ActorContext,
  reportId: string,
): Promise<'reverse' | 'done' | 'missing'> {
  const reportRef = db.collection(REPORTS).doc(reportId);
  const operationRef = operationRefForReport(reportId);
  return db.runTransaction(async (t) => {
    const reportSnap = await t.get(reportRef);
    const operationSnap = await t.get(operationRef);
    const operation = operationSnap.exists
      ? operationSnap.data() as InventoryPostingOperation
      : null;
    if (!reportSnap.exists && !operation) return 'missing';
    if (reportSnap.exists) {
      const report = reportSnap.data() as { tenantId?: string };
      if (String(report.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول لتقرير خارج شركتك.');
      }
    }
    if (operation && operation.tenantId !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'عملية المخزون خارج شركتك.');
    }
    const action = resolveReverseOperationAction(operation?.state);
    if (action === 'done') return 'done';
    if (action === 'resume') return 'reverse';

    const now = toIsoNow();
    t.set(operationRef, {
      tenantId: actor.tenantId,
      reportId,
      state: 'reversing',
      createdAt: operation?.createdAt || now,
      updatedAt: now,
    }, { merge: true });
    if (reportSnap.exists) {
      t.set(reportRef, {
        inventoryPostingState: 'reversing',
        inventoryPostingUpdatedAt: now,
      }, { merge: true });
    }
    return 'reverse';
  });
}

async function rejectPendingHandoverRequest(params: {
  actor: ActorContext;
  reportId: string;
  requestId: string;
}): Promise<void> {
  const requestRef = db.collection(REQUESTS).doc(params.requestId);
  const operationRef = operationRefForReport(params.reportId);
  await db.runTransaction(async (t) => {
    const operationSnap = await t.get(operationRef);
    const requestSnap = await t.get(requestRef);
    const operation = operationSnap.data() as InventoryPostingOperation | undefined;
    if (
      !operationSnap.exists
      || operation?.tenantId !== params.actor.tenantId
      || operation.state !== 'reversing'
    ) {
      throw new HttpsError('aborted', 'تغيرت حالة عكس المخزون. أعد المحاولة.');
    }
    if (!requestSnap.exists) return;
    const requestData = requestSnap.data() as {
      tenantId?: string;
      sourceReportId?: string;
      status?: string;
    };
    if (
      requestData.tenantId !== params.actor.tenantId
      || requestData.sourceReportId !== params.reportId
    ) {
      throw new HttpsError('permission-denied', 'طلب التسليم خارج شركتك.');
    }
    if (requestData.status !== 'pending') return;
    const now = toIsoNow();
    t.set(requestRef, {
      status: 'rejected',
      rejectedBy: params.actor.displayName,
      rejectedByUserId: params.actor.uid,
      rejectedAt: now,
      rejectionReason: 'Report deleted/reversed',
      resolvedAt: now,
    }, { merge: true });
  });
}

async function finalizeReverseOperation(actor: ActorContext, reportId: string): Promise<void> {
  const reportRef = db.collection(REPORTS).doc(reportId);
  const operationRef = operationRefForReport(reportId);
  await db.runTransaction(async (t) => {
    const reportSnap = await t.get(reportRef);
    const operationSnap = await t.get(operationRef);
    const operation = operationSnap.data() as InventoryPostingOperation | undefined;
    if (!operationSnap.exists || operation?.tenantId !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'عملية المخزون خارج شركتك.');
    }
    if (operation.state === 'reversed') return;
    if (operation.state !== 'reversing') {
      throw new HttpsError('aborted', 'تغيرت حالة عكس المخزون. أعد المحاولة.');
    }
    if (reportSnap.exists) {
      const report = reportSnap.data() as { tenantId?: string };
      if (String(report.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن الوصول لتقرير خارج شركتك.');
      }
    }
    const now = toIsoNow();
    t.set(operationRef, { state: 'reversed', updatedAt: now }, { merge: true });
    if (reportSnap.exists) {
      t.set(reportRef, {
        inventoryAppliedAt: null,
        inventoryPostingState: 'reversed',
        inventoryPostingUpdatedAt: now,
        inventoryReversedAt: now,
        inventoryReversedBy: actor.displayName,
        inventoryReversedByUserId: actor.uid,
      }, { merge: true });
    }
  });
}

type BackgroundReportInventoryData = {
  tenantId?: string;
  productId?: string;
  productNameSnapshot?: string;
  quantityProduced?: number;
  reportType?: string;
  workOrderId?: string;
  productionPlanId?: string;
  inventoryAppliedAt?: string;
  packagingLines?: Array<{ productId?: string; quantityPieces?: number }>;
  componentScrapItems?: Array<{ materialId?: string; materialName?: string; quantity?: number }>;
};

async function resolveMaterialMovementLine(actor: ActorContext, id: string, fallbackName = ''): Promise<{
  itemType: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
} | null> {
  const itemId = String(id || '').trim();
  if (!itemId) return null;
  const [materialSnap, rawSnap] = await Promise.all([
    db.collection(MATERIALS).doc(itemId).get(),
    db.collection(RAW_MATERIALS).doc(itemId).get(),
  ]);
  const material = materialSnap.data() as { tenantId?: string; name?: string; code?: string; baseUnit?: string; legacyRawMaterialId?: string } | undefined;
  if (materialSnap.exists && String(material?.tenantId || '') === actor.tenantId) {
    return {
      itemType: 'material',
      itemId,
      itemName: String(material?.name || fallbackName || itemId),
      itemCode: String(material?.code || ''),
      unit: String(material?.baseUnit || 'unit'),
    };
  }
  const raw = rawSnap.data() as { tenantId?: string; name?: string; code?: string; unit?: string } | undefined;
  if (rawSnap.exists && String(raw?.tenantId || '') === actor.tenantId) {
    return {
      itemType: 'raw_material',
      itemId,
      itemName: String(raw?.name || fallbackName || itemId),
      itemCode: String(raw?.code || ''),
      unit: String(raw?.unit || 'unit'),
    };
  }
  return null;
}

async function applyNonFinishedProductionReportInventory(
  actor: ActorContext,
  reportId: string,
  report: BackgroundReportInventoryData,
): Promise<Record<string, unknown>> {
  const settingsSnap = await db.collection(SYSTEM_SETTINGS).doc(actor.tenantId).get();
  const routing = resolveInventoryRoutingFromSettings(
    (settingsSnap.data() || {}) as { planSettings?: Record<string, unknown> },
  );
  const reportType = String(report.reportType || '').trim();
  const intents: InventoryMovementIntent[] = [];

  if (reportType === 'packaging') {
    if (!routing.enablePackagingStockTransfer) return { ok: true, skipped: true, reportId };
    const source = String(routing.packagingSourceWarehouseId || '').trim();
    const target = String(routing.packagingTargetWarehouseId || '').trim();
    if (!source || !target || source === target) {
      throw new HttpsError('failed-precondition', 'مخزنا مصدر ووجهة التغليف غير مضبوطين بشكل صحيح.');
    }
    assertActorWarehouseInvolved(actor.boundWarehouseId, [source, target]);
    const quantities = new Map<string, number>();
    const lines = Array.isArray(report.packagingLines) && report.packagingLines.length > 0
      ? report.packagingLines
      : [{ productId: report.productId, quantityPieces: report.quantityProduced }];
    for (const line of lines) {
      const productId = String(line.productId || '').trim();
      const quantity = toNumber(line.quantityPieces);
      if (productId && quantity > 0) quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }
    for (const [productId, quantity] of quantities) {
      const productSnap = await db.collection(PRODUCTS).doc(productId).get();
      const product = productSnap.data() as { tenantId?: string; name?: string; code?: string } | undefined;
      if (!productSnap.exists || String(product?.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'يتضمن تقرير التغليف منتجاً خارج شركتك.');
      }
      intents.push({
        warehouseId: source,
        toWarehouseId: target,
        itemType: 'finished_good',
        itemId: productId,
        itemName: String(product?.name || productId),
        itemCode: String(product?.code || ''),
        unit: 'piece',
        movementType: 'TRANSFER',
        quantity,
        allowNegative: routing.allowNegativeFinishedTransferStock,
        sourceModule: 'packaging',
        sourceId: reportId,
        note: `Packaging stock transfer from report ${reportId}`,
      });
    }
  } else if (reportType === 'component_injection') {
    const wip = String(routing.productionWipWarehouseId || '').trim();
    if (!wip) throw new HttpsError('failed-precondition', 'مخزن تحت التسليم غير مضبوط.');
    assertActorWarehouseInvolved(actor.boundWarehouseId, [wip, routing.wasteWarehouseId]);
    const producedLine = await resolveMaterialMovementLine(
      actor,
      String(report.productId || ''),
      String(report.productNameSnapshot || ''),
    );
    if (!producedLine) throw new HttpsError('failed-precondition', 'مكون الحقن غير موجود في مواد الشركة.');
    const producedQty = toNumber(report.quantityProduced);
    if (producedQty > 0) {
      intents.push({
        warehouseId: wip,
        ...producedLine,
        movementType: 'IN',
        quantity: producedQty,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Production WIP entry (component) from report ${reportId}`,
      });
    }
    const wasteWarehouse = String(routing.wasteWarehouseId || '').trim();
    for (const scrap of report.componentScrapItems || []) {
      const quantity = toNumber(scrap.quantity);
      if (!(quantity > 0) || !wasteWarehouse) continue;
      const scrapLine = await resolveMaterialMovementLine(actor, String(scrap.materialId || ''), String(scrap.materialName || '')) || producedLine;
      intents.push({
        warehouseId: wasteWarehouse,
        ...scrapLine,
        movementType: 'IN',
        quantity,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Component scrap IN from production report ${reportId}`,
      });
    }
  } else if (reportType === 'component_waste') {
    const source = String(routing.decomposedWarehouseId || '').trim();
    const target = String(routing.wasteWarehouseId || '').trim();
    if (!source || !target) throw new HttpsError('failed-precondition', 'مخزنا المفكك والهالك غير مضبوطين.');
    assertActorWarehouseInvolved(actor.boundWarehouseId, [source, target]);
    for (const scrap of report.componentScrapItems || []) {
      const quantity = toNumber(scrap.quantity);
      const line = await resolveMaterialMovementLine(actor, String(scrap.materialId || ''), String(scrap.materialName || ''));
      if (!(quantity > 0) || !line) continue;
      intents.push({
        warehouseId: source,
        toWarehouseId: target,
        ...line,
        movementType: 'TRANSFER',
        quantity,
        allowNegative: routing.allowNegativeDecomposedStock,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Component waste transfer from production report ${reportId}`,
      });
    }
  }

  const existingMovements = await loadSourceMovements(actor.tenantId, reportId);
  const applyPlan = attachLegacyMovementMatches(
    buildDeterministicMovementPlan(reportId, 'apply', intents),
    existingMovements,
  );
  const claimed = await claimApplyOperation({
    actor,
    reportId,
    applyPlan,
    handover: null,
    reportBasis: {
      productId: String(report.productId || '').trim(),
      quantityProduced: toNumber(report.quantityProduced),
      reportType,
      workOrderId: String(report.workOrderId || '').trim(),
      productionPlanId: String(report.productionPlanId || '').trim(),
    },
  });
  if (claimed.idempotent) return { ok: true, idempotent: true, reportId };
  for (const movement of claimed.operation.applyPlan || []) {
    await postWarehouseMovement({ ...movement, actor, reportId, expectedOperationState: 'applying' });
  }
  const finalState = await finalizeApplyOperation(actor, reportId);
  if (finalState !== 'applied') throw new HttpsError('aborted', 'بدأ عكس المخزون أثناء الترحيل.');
  return { ok: true, reportId };
}

export async function applyProductionReportInventoryInternal(
  uid: string,
  reportId: string,
): Promise<Record<string, unknown>> {
    const actor = await loadActor(uid);
    if (!hasPermission(actor, [
      'reports.create',
      'reports.edit',
      'inventory.transactions.create',
    ])) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية ترحيل مخزون تقرير الإنتاج.');
    }

    {
      const pathSettingsSnap = await db.collection(SYSTEM_SETTINGS).doc(actor.tenantId).get();
      assertOperationPathEnabledServer(
        pathSettingsSnap.data() || {},
        REPORT_CREATE_OPERATION_KEY,
      );
    }

    const reportSnap = await db.collection(REPORTS).doc(reportId).get();
    if (!reportSnap.exists) throw new HttpsError('not-found', 'تقرير الإنتاج غير موجود.');
    const report = reportSnap.data() as BackgroundReportInventoryData;
    if (String(report.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'لا يمكن الوصول لتقرير خارج شركتك.');
    }

    const reportType = String(report.reportType || 'finished_product').trim() || 'finished_product';
    if (reportType !== 'finished_product') {
      return applyNonFinishedProductionReportInventory(actor, reportId, report);
    }

    const producedQty = toNumber(report.quantityProduced);
    if (report.inventoryAppliedAt) {
      const claimed = await claimApplyOperation({
        actor,
        reportId,
        applyPlan: [],
        handover: null,
        reportBasis: {
          productId: String(report.productId || '').trim(),
          quantityProduced: producedQty,
          reportType,
          workOrderId: String(report.workOrderId || '').trim(),
          productionPlanId: String(report.productionPlanId || '').trim(),
        },
      });
      return { ok: true as const, idempotent: claimed.idempotent, reportId };
    }
    if (!(producedQty > 0)) {
      return { ok: true as const, skipped: true, reportId };
    }

    const settingsSnap = await db.collection(SYSTEM_SETTINGS).doc(actor.tenantId).get();
    const routing = resolveInventoryRoutingFromSettings(
      (settingsSnap.data() || {}) as { planSettings?: Record<string, unknown> },
    );

    const issued = await findIssuedOrder({
      tenantId: actor.tenantId,
      reportId,
      workOrderId: report.workOrderId,
      productionPlanId: report.productionPlanId,
    });

    const workOrderId = String(report.workOrderId || '').trim();
    let workOrderRequiresProductionIssue: boolean | null | undefined;
    let planRequiresProductionIssue: boolean | null | undefined;
    let planId = String(report.productionPlanId || '').trim();

    if (workOrderId) {
      const woSnap = await db.collection(WORK_ORDERS).doc(workOrderId).get();
      if (woSnap.exists) {
        const wo = woSnap.data() as {
          tenantId?: string;
          planId?: string;
          productionPlanId?: string;
          requiresProductionIssue?: boolean;
        };
        if (String(wo.tenantId || '') === actor.tenantId) {
          workOrderRequiresProductionIssue = wo.requiresProductionIssue;
          if (!planId) {
            planId = String(wo.planId || wo.productionPlanId || '').trim();
          }
        }
      }
    }
    if (planId) {
      const planSnap = await db.collection(PRODUCTION_PLANS).doc(planId).get();
      if (planSnap.exists) {
        const plan = planSnap.data() as {
          tenantId?: string;
          requiresProductionIssue?: boolean;
        };
        if (String(plan.tenantId || '') === actor.tenantId) {
          planRequiresProductionIssue = plan.requiresProductionIssue;
        }
      }
    }

    const requiresIssue = resolveRequiresProductionIssueOnReport({
      companyRequire: routing.requireIssuedProductionIssueOnReport,
      workOrderRequiresProductionIssue,
      planRequiresProductionIssue,
    });

    if (requiresIssue && !issued) {
      throw new HttpsError(
        'failed-precondition',
        'لا يمكن ترحيل مخزون تقرير الإنتاج قبل اعتماد وإصدار إذن صرف إنتاج.',
      );
    }

    const movementIntents: InventoryMovementIntent[] = [];
    const floorId = String(routing.productionFloorWarehouseId || '').trim();
    assertActorWarehouseInvolved(actor.boundWarehouseId, [
      floorId,
      routing.productionWipWarehouseId,
      routing.finishedStagingWarehouseId,
    ]);
    if (issued && floorId) {
      for (const line of issued.lines) {
        const qtyPerUnit = toNumber(line.qtyPerUnit);
        const consumeQty = qtyPerUnit > 0
          ? qtyPerUnit * producedQty
          : (issued.quantity > 0
            ? (toNumber(line.requiredQty) / issued.quantity) * producedQty
            : 0);
        if (!(consumeQty > 0)) continue;
        const itemType = String(line.itemType || '').trim();
        const itemId = String(line.itemId || '').trim();
        if (!itemType || !itemId) {
          throw new HttpsError('failed-precondition', 'يتضمن إذن الصرف صنفاً غير صالح.');
        }
        movementIntents.push({
          warehouseId: floorId,
          itemType,
          itemId,
          itemName: line.itemName || line.itemId,
          itemCode: line.itemCode,
          unit: line.unit,
          movementType: 'OUT',
          quantity: consumeQty,
          allowNegative: routing.allowNegativeDecomposedStock,
          sourceModule: 'production_report',
          sourceId: reportId,
          note: `BOM consumption from production report ${reportId}`,
        });
      }
    }

    const wipId = String(routing.productionWipWarehouseId || '').trim();
    if (!wipId) {
      throw new HttpsError('failed-precondition', 'مخزن تحت التسليم غير مضبوط.');
    }

    const productId = String(report.productId || '').trim();
    const productSnap = productId ? await db.collection(PRODUCTS).doc(productId).get() : null;
    const product = productSnap?.exists
      ? productSnap.data() as { name?: string; code?: string; minStock?: number; tenantId?: string }
      : null;
    if (!product || String(product.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'المنتج خارج شركتك.');
    }

    movementIntents.push({
      warehouseId: wipId,
      itemType: 'finished_good',
      itemId: productId,
      itemName: String(product?.name || productId),
      itemCode: String(product?.code || ''),
      unit: 'piece',
      movementType: 'IN',
      quantity: producedQty,
      sourceModule: 'production_report',
      sourceId: reportId,
      note: `Production WIP entry from report ${reportId}`,
    });

    const stagingId = String(routing.finishedStagingWarehouseId || '').trim();
    const useHandover = routing.requirePackagingHandoverReceipt !== false
      && Boolean(stagingId)
      && stagingId !== wipId;

    let handover: HandoverIntent | null = useHandover
      ? {
        requestId: buildDeterministicHandoverRequestId(reportId),
        fromWarehouseId: wipId,
        toWarehouseId: stagingId,
        reportedQuantity: producedQty,
        itemType: 'finished_good',
        itemId: productId,
        itemName: String(product.name || productId),
        itemCode: String(product.code || ''),
        unit: 'piece',
        minStock: toNumber(product.minStock),
        note: `استلام تغليف لتقرير الإنتاج ${reportId}`,
      }
      : null;
    if (!useHandover && routing.autoTransferProductionToFinished && stagingId && stagingId !== wipId) {
      movementIntents.push({
        warehouseId: wipId,
        toWarehouseId: stagingId,
        itemType: 'finished_good',
        itemId: productId,
        itemName: String(product?.name || productId),
        itemCode: String(product?.code || ''),
        unit: 'piece',
        movementType: 'TRANSFER',
        quantity: producedQty,
        allowNegative: routing.allowNegativeFinishedTransferStock,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Auto transfer WIP to finished staging from report ${reportId}`,
      });
    }

    const existingMovements = await loadSourceMovements(actor.tenantId, reportId);
    const applyPlan = attachLegacyMovementMatches(
      buildDeterministicMovementPlan(reportId, 'apply', movementIntents),
      existingMovements,
    );
    if (handover) {
      const existingRequests = await db.collection(REQUESTS)
        .where('tenantId', '==', actor.tenantId)
        .where('sourceReportId', '==', reportId)
        .get();
      const legacyRequest = existingRequests.docs.find((doc) => {
        const data = doc.data() as { requestType?: string; status?: string };
        return data.requestType === 'production_handover'
          && data.status !== 'rejected'
          && data.status !== 'cancelled';
      });
      if (legacyRequest) handover = { ...handover, requestId: legacyRequest.id };
    }

    const claimed = await claimApplyOperation({
      actor,
      reportId,
      applyPlan,
      handover,
      reportBasis: {
        productId,
        quantityProduced: producedQty,
        reportType,
        workOrderId: String(report.workOrderId || '').trim(),
        productionPlanId: String(report.productionPlanId || '').trim(),
      },
    });
    if (claimed.idempotent) {
      return { ok: true as const, idempotent: true, reportId };
    }
    for (const movement of claimed.operation.applyPlan || []) {
      await postWarehouseMovement({
        ...movement,
        actor,
        reportId,
        expectedOperationState: 'applying',
      });
    }
    if (claimed.operation.handover) {
      await postHandoverRequest({
        actor,
        reportId,
        handover: claimed.operation.handover,
      });
    }
    const finalState = await finalizeApplyOperation(actor, reportId);
    if (finalState !== 'applied') {
      throw new HttpsError('aborted', 'بدأ عكس مخزون التقرير أثناء الترحيل.');
    }

    return { ok: true as const, reportId, handover: useHandover };
}

export const applyProductionReportInventory = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
  },
  async (request) => applyProductionReportInventoryInternal(
    requireAuth(request),
    requireReportId(request),
  ),
);

export const reverseProductionReportInventory = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
  },
  async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    if (!hasPermission(actor, [
      'reports.edit',
      'reports.delete',
      'inventory.transactions.create',
    ])) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية عكس مخزون تقرير الإنتاج.');
    }

    const reportId = requireReportId(request);
    {
      const pathSettingsSnap = await db.collection(SYSTEM_SETTINGS).doc(actor.tenantId).get();
      const settings = pathSettingsSnap.data() || {};
      // Reverse stays available while create or delete pipelines remain enabled.
      if (
        !isOperationPathEnabledServer(settings, REPORT_DELETE_OPERATION_KEY)
        && !isOperationPathEnabledServer(settings, REPORT_CREATE_OPERATION_KEY)
      ) {
        assertOperationPathEnabledServer(settings, REPORT_DELETE_OPERATION_KEY);
      }
    }

    const claim = await claimReverseOperation(actor, reportId);
    if (claim === 'missing' || claim === 'done') {
      return { ok: true as const, idempotent: true, reportId };
    }

    const linkedRequests = await db.collection(REQUESTS)
      .where('tenantId', '==', actor.tenantId)
      .where('sourceReportId', '==', reportId)
      .get();
    for (const doc of linkedRequests.docs) {
      await rejectPendingHandoverRequest({
        actor,
        reportId,
        requestId: doc.id,
      });
    }

    const sourceMovements = await loadSourceMovements(actor.tenantId, reportId);

    assertActorWarehouseInvolved(
      actor.boundWarehouseId,
      sourceMovements.flatMap((movement) => {
        return [movement.warehouseId, movement.toWarehouseId];
      }),
    );

    const reversalIntents: InventoryMovementIntent[] = [];
    for (const movement of sourceMovements) {
      const tx = movement as ExistingMovement & {
        warehouseId?: string;
        toWarehouseId?: string;
        itemType?: string;
        itemId?: string;
        itemName?: string;
        itemCode?: string;
        unit?: string;
        movementType?: string;
        transferDirection?: string;
        quantity?: number;
        sourceModule?: string;
      };
      if (tx.sourceModule !== 'production_report' && tx.sourceModule !== 'packaging') continue;
      const qty = toNumber(tx.quantity);
      if (!(qty > 0) || !tx.warehouseId || !tx.itemType || !tx.itemId) continue;

      if (tx.movementType === 'TRANSFER') {
        // Only reverse OUT legs to avoid double reverse.
        if (tx.transferDirection === 'IN') continue;
        const toWarehouseId = String(tx.toWarehouseId || '').trim();
        if (!toWarehouseId) continue;
        reversalIntents.push({
          warehouseId: toWarehouseId,
          toWarehouseId: tx.warehouseId,
          itemType: tx.itemType,
          itemId: tx.itemId,
          itemName: tx.itemName || tx.itemId,
          itemCode: tx.itemCode,
          unit: tx.unit,
          movementType: 'TRANSFER',
          quantity: qty,
          allowNegative: true,
          sourceModule: 'production_report',
          sourceId: `${reportId}:reverse`,
          note: `Reverse transfer for report ${reportId}`,
          sourceMovementId: movement.id,
        });
        continue;
      }

      if (tx.movementType !== 'IN' && tx.movementType !== 'OUT') continue;
      reversalIntents.push({
        warehouseId: tx.warehouseId,
        itemType: tx.itemType,
        itemId: tx.itemId,
        itemName: tx.itemName || tx.itemId,
        itemCode: tx.itemCode,
        unit: tx.unit,
        movementType: tx.movementType === 'IN' ? 'OUT' : 'IN',
        quantity: qty,
        allowNegative: true,
        sourceModule: 'production_report',
        sourceId: `${reportId}:reverse`,
        note: `Reverse movement for report ${reportId}`,
        sourceMovementId: movement.id,
      });
    }

    const existingReversals = await loadSourceMovements(actor.tenantId, `${reportId}:reverse`);
    const reversalPlan = attachLegacyMovementMatches(
      buildDeterministicMovementPlan(reportId, 'reverse', reversalIntents),
      existingReversals,
    );
    for (const movement of reversalPlan) {
      await postWarehouseMovement({
        ...movement,
        actor,
        reportId,
        expectedOperationState: 'reversing',
      });
    }
    await finalizeReverseOperation(actor, reportId);

    return { ok: true as const, reportId };
  },
);
