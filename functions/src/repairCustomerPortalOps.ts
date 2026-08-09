import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { FieldPath, FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getDb } from './adminApp.js';
import {
  canWritePortalPin,
  CUSTOMER_PORTAL_PIN_DIGITS,
  CUSTOMER_PORTAL_SESSION_MS,
  nextPortalCredentialVersion,
  portalSessionMatchesCredential,
} from './customerPortalCredentialPolicy.js';
import { resolveUnrepairableReason } from './repairUnrepairableReasonPolicy.js';

const db = getDb();
const JOBS = 'repair_jobs';
const BRANCHES = 'repair_branches';
const WAREHOUSES = 'warehouses';
const STOCK = 'stock_items';
const STOCK_TX = 'stock_transactions';
const CUSTODY = 'repair_custody_records';
const REQUESTS = 'customer_service_requests';
const EVENTS = 'customer_service_events';
const REPLACEMENTS = 'repair_replacement_requests';
const COMPLAINTS = 'repair_complaints';
const FOLLOWUPS = 'repair_followups';
const CREDENTIALS = 'customer_portal_credentials';
const SESSIONS = 'customer_portal_sessions';
const LOGIN_LIMITS = 'customer_portal_login_limits';
const COUNTERS = '_counters';

type Json = Record<string, unknown>;
type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  branchIds: string[];
};

const nowIso = () => new Date().toISOString();
const text = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const positiveInt = (value: unknown, name = 'الكمية') => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) throw new HttpsError('invalid-argument', `${name} يجب أن تكون أكبر من صفر.`);
  return n;
};
const nonNegativeInt = (value: unknown, name = 'الكمية') => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) throw new HttpsError('invalid-argument', `${name} غير صالحة.`);
  return n;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
const balanceId = (warehouseId: string, productId: string) => `${warehouseId}__finished_good__${productId}`;
const custodyId = (jobId: string, itemId: string) => `${jobId}__${safeId(itemId)}`;

function pepper(): string {
  const value = String(process.env.CUSTOMER_PORTAL_PIN_PEPPER || '').trim();
  if (!value) throw new HttpsError('failed-precondition', 'سر تشفير بوابة العملاء غير مضبوط.');
  return value;
}

function pinHash(pin: string, salt: string): string {
  return scryptSync(`${pin}:${pepper()}`, salt, 32).toString('hex');
}

function pinMatches(pin: string, salt: string, expected: string): boolean {
  const actual = Buffer.from(pinHash(pin, salt), 'hex');
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function actorFor(request: CallableRequest): Promise<Actor> {
  const uid = text(request.auth?.uid, 128);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Json;
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = text(user.tenantId, 128);
  if (!tenantId) throw new HttpsError('failed-precondition', 'المستخدم غير مرتبط بشركة.');
  let permissions: Record<string, boolean> = {};
  const roleId = text(user.roleId, 128);
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    const role = roleSnap.data() as Json | undefined;
    if (!roleSnap.exists || text(role?.tenantId, 128) !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (role?.permissions || {}) as Record<string, boolean>;
  }
  const branchIds = Array.from(new Set([
    ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds.map(String) : []),
    text(user.repairBranchId, 128),
  ].filter(Boolean)));
  return {
    uid,
    tenantId,
    displayName: text(user.displayName || user.name || user.email || uid, 160),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    branchIds,
  };
}

function requirePermission(actor: Actor, permissions: string[], message: string): void {
  if (actor.isSuperAdmin || permissions.some((key) => actor.permissions[key] === true)) return;
  throw new HttpsError('permission-denied', message);
}

function requireBranch(actor: Actor, branchId: string, allowAll = false): void {
  if (actor.isSuperAdmin || actor.permissions['repair.callCenter.viewAll'] === true || allowAll) return;
  if (!actor.branchIds.includes(branchId)) throw new HttpsError('permission-denied', 'لا يمكنك الوصول إلى مركز آخر.');
}

type BranchWarehouses = {
  branchId: string;
  branchName: string;
  custodyWarehouseId: string;
  unrepairableWarehouseId: string;
};

export async function ensureRepairCustomerWarehouses(
  tenantId: string,
  branchId: string,
): Promise<BranchWarehouses> {
  const branchRef = db.collection(BRANCHES).doc(branchId);
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists) throw new HttpsError('not-found', 'مركز الصيانة غير موجود.');
  const branch = branchSnap.data() as Json;
  if (text(branch.tenantId, 128) !== tenantId) throw new HttpsError('permission-denied', 'المركز خارج الشركة.');
  const branchName = text(branch.name, 160) || 'مركز';
  const suffix = safeId(text(branch.warehouseCode || branchId, 40)).toUpperCase();
  const custodyWarehouseId = text(branch.custodyWarehouseId, 128) || `repair-custody-${branchId}`;
  const unrepairableWarehouseId = text(branch.unrepairableWarehouseId, 128) || `repair-unrepairable-${branchId}`;
  const at = nowIso();
  const batch = db.batch();
  batch.set(db.collection(WAREHOUSES).doc(custodyWarehouseId), {
    tenantId,
    name: `عهدة أجهزة العملاء - ${branchName}`,
    code: `RCW-${suffix}`.slice(0, 64),
    warehouseRole: 'repair_customer_custody',
    isActive: true,
    createdAt: at,
    updatedAt: at,
  }, { merge: true });
  batch.set(db.collection(WAREHOUSES).doc(unrepairableWarehouseId), {
    tenantId,
    name: `غير قابل للإصلاح - ${branchName}`,
    code: `RUW-${suffix}`.slice(0, 64),
    warehouseRole: 'repair_unrepairable',
    isActive: true,
    createdAt: at,
    updatedAt: at,
  }, { merge: true });
  batch.set(branchRef, {
    custodyWarehouseId,
    custodyWarehouseCode: `RCW-${suffix}`.slice(0, 64),
    unrepairableWarehouseId,
    unrepairableWarehouseCode: `RUW-${suffix}`.slice(0, 64),
    updatedAt: at,
  }, { merge: true });
  await batch.commit();
  return { branchId, branchName, custodyWarehouseId, unrepairableWarehouseId };
}

function stockWrite(
  tx: Transaction,
  ref: DocumentReference,
  current: number,
  delta: number,
  meta: Json,
): void {
  const next = current + delta;
  if (next < 0) throw new HttpsError('failed-precondition', 'رصيد عهدة المركز غير كافٍ.');
  tx.set(ref, {
    ...meta,
    quantity: next,
    reservedQty: 0,
    availableQty: next,
    minStock: 0,
    unit: 'قطعة',
    updatedAt: nowIso(),
    lastMovementAt: nowIso(),
  }, { merge: true });
}

function movementPayload(params: {
  tenantId: string; warehouseId: string; productId: string; productName: string;
  productCode: string; movementType: 'IN' | 'OUT' | 'TRANSFER'; quantity: number;
  sourceModule: 'repair_customer_custody' | 'repair_unrepairable'; sourceId: string;
  createdBy: string; note: string; toWarehouseId?: string; direction?: 'IN' | 'OUT'; relatedId?: string;
}): Json {
  return {
    tenantId: params.tenantId,
    warehouseId: params.warehouseId,
    ...(params.toWarehouseId ? { toWarehouseId: params.toWarehouseId } : {}),
    itemType: 'finished_good',
    itemId: params.productId,
    itemName: params.productName,
    itemCode: params.productCode,
    movementType: params.movementType,
    quantity: params.quantity,
    unit: 'قطعة',
    sourceModule: params.sourceModule,
    sourceId: params.sourceId,
    note: params.note,
    createdBy: params.createdBy,
    createdAt: nowIso(),
    ...(params.direction ? { transferDirection: params.direction } : {}),
    ...(params.relatedId ? { relatedTransactionId: params.relatedId } : {}),
  };
}

async function postJobCustody(jobId: string): Promise<{ posted: number }> {
  const jobRef = db.collection(JOBS).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return { posted: 0 };
  const job = jobSnap.data() as Json;
  if (job.custodyPostedAt) return { posted: 0 };
  const tenantId = text(job.tenantId, 128);
  const branchId = text(job.branchId, 128);
  if (!tenantId || !branchId) return { posted: 0 };
  const warehouses = await ensureRepairCustomerWarehouses(tenantId, branchId);
  const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[];
  const lines = products.map((row, index) => ({
    row,
    itemId: text(row.itemId || `item-${index + 1}`, 100),
    productId: text(row.productId, 128),
    productName: text(row.productName, 200) || 'منتج',
    productCode: text(row.productCode || row.productId, 80),
    productBarcode: text(row.productBarcode || row.barcode, 120),
    quantity: Math.max(1, Math.round(Number(row.receivedQuantity || row.quantity || 1))),
  })).filter((row) => row.productId);
  if (!lines.length) {
    await jobRef.set({ custodyPostedAt: nowIso(), custodyWarehouseId: warehouses.custodyWarehouseId }, { merge: true });
    return { posted: 0 };
  }
  await db.runTransaction(async (tx) => {
    const freshJob = await tx.get(jobRef);
    if (!freshJob.exists || freshJob.data()?.custodyPostedAt) return;
    const reads = await Promise.all(lines.map((line) => tx.get(db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, line.productId)))));
    lines.forEach((line, index) => {
      const balRef = db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, line.productId));
      const current = reads[index].exists ? Number(reads[index].data()?.quantity || 0) : 0;
      stockWrite(tx, balRef, current, line.quantity, {
        tenantId, warehouseId: warehouses.custodyWarehouseId, warehouseName: `عهدة أجهزة العملاء - ${warehouses.branchName}`,
        warehouseRole: 'repair_customer_custody', itemType: 'finished_good', itemId: line.productId,
        itemName: line.productName, itemCode: line.productCode,
      });
      const recordRef = db.collection(CUSTODY).doc(custodyId(jobId, line.itemId));
      tx.set(recordRef, {
        tenantId, branchId, jobId, receiptNo: text(job.receiptNo, 80), jobProductItemId: line.itemId,
        customerId: text(job.customerId, 128), customerName: text(job.customerName, 160),
        customerPhone: text(job.customerPhone, 40), jobStatus: text(job.status, 40) || 'received',
        productId: line.productId, productName: line.productName, productCode: line.productCode,
        productBarcode: line.productBarcode,
        receivedQuantity: line.quantity, unrepairableQuantity: 0, handedOverQuantity: 0,
        custodyWarehouseId: warehouses.custodyWarehouseId,
        unrepairableWarehouseId: warehouses.unrepairableWarehouseId,
        createdAt: nowIso(), updatedAt: nowIso(),
      }, { merge: true });
      tx.set(db.collection(STOCK_TX).doc(`custody-in__${jobId}__${safeId(line.itemId)}`), movementPayload({
        tenantId, warehouseId: warehouses.custodyWarehouseId, productId: line.productId,
        productName: line.productName, productCode: line.productCode, movementType: 'IN', quantity: line.quantity,
        sourceModule: 'repair_customer_custody', sourceId: jobId, createdBy: text(job.createdBy || 'system', 128),
        note: `استلام عهدة طلب الصيانة ${text(job.receiptNo, 80)}`,
      }), { merge: false });
    });
    tx.set(jobRef, { custodyPostedAt: nowIso(), custodyWarehouseId: warehouses.custodyWarehouseId }, { merge: true });
  });
  return { posted: lines.reduce((sum, line) => sum + line.quantity, 0) };
}

async function createDirectRepairJob(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.jobs.create', 'repair.jobs.reception'], 'لا تملك صلاحية استلام طلبات الصيانة.');
  const jobId = text(data.jobId, 128);
  const incoming = (data.job && typeof data.job === 'object' ? data.job : {}) as Json;
  const branchId = text(incoming.branchId, 128);
  const receiptNo = text(incoming.receiptNo, 80);
  if (!jobId || !branchId || !receiptNo) throw new HttpsError('invalid-argument', 'بيانات طلب الصيانة غير مكتملة.');
  requireBranch(actor, branchId);
  const warehouses = await ensureRepairCustomerWarehouses(actor.tenantId, branchId);
  const rawProducts = (Array.isArray(incoming.jobProducts) ? incoming.jobProducts : []) as Json[];
  if (!rawProducts.length || rawProducts.length > 50) throw new HttpsError('invalid-argument', 'أضف منتجًا واحدًا على الأقل.');
  const products = rawProducts.map((row, index) => {
    const productId = text(row.productId, 128);
    if (!productId) throw new HttpsError('invalid-argument', `منتج السطر ${index + 1} غير صالح.`);
    const quantity = positiveInt(row.receivedQuantity || row.quantity || 1);
    return {
      ...row,
      itemId: text(row.itemId || `item-${index + 1}`, 100),
      productId,
      productName: text(row.productName, 160) || 'منتج',
      productCode: text(row.productCode || productId, 80),
      productBarcode: text(row.productBarcode || row.barcode, 120),
      quantity,
      receivedQuantity: quantity,
      unrepairableQuantity: 0,
      handedOverQuantity: 0,
    };
  });
  const productSnaps = await Promise.all(products.map((line) => db.collection('products').doc(line.productId).get()));
  productSnaps.forEach((snap, index) => {
    if (!snap.exists || text(snap.data()?.tenantId, 128) !== actor.tenantId) {
      throw new HttpsError('not-found', `منتج السطر ${index + 1} غير موجود.`);
    }
    products[index].productName = text(snap.data()?.name, 160) || products[index].productName;
    products[index].productCode = text(snap.data()?.code, 80) || products[index].productCode;
    products[index].productBarcode = text(snap.data()?.barcode, 120);
  });
  const jobRef = db.collection(JOBS).doc(jobId);
  const at = nowIso();
  let alreadyCreated = false;
  await db.runTransaction(async (tx) => {
    const [existingJob, ...balances] = await Promise.all([
      tx.get(jobRef),
      ...products.map((line) => tx.get(db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, line.productId)))),
    ]);
    if (existingJob.exists) {
      if (text(existingJob.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('already-exists', 'معرف الطلب مستخدم.');
      alreadyCreated = true;
      return;
    }
    products.forEach((line, index) => {
      const balRef = db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, line.productId));
      const balance = balances[index];
      stockWrite(tx, balRef, balance.exists ? Number(balance.data()?.quantity || 0) : 0, Number(line.quantity), {
        tenantId: actor.tenantId, warehouseId: warehouses.custodyWarehouseId,
        warehouseName: `عهدة أجهزة العملاء - ${warehouses.branchName}`, warehouseRole: 'repair_customer_custody',
        itemType: 'finished_good', itemId: line.productId, itemName: line.productName, itemCode: line.productCode,
      });
      tx.set(db.collection(CUSTODY).doc(custodyId(jobId, line.itemId)), {
        tenantId: actor.tenantId, branchId, jobId, receiptNo, jobProductItemId: line.itemId,
        customerId: text(incoming.customerId, 128), customerName: text(incoming.customerName, 160),
        customerPhone: text(incoming.customerPhone, 40), jobStatus: 'received',
        productId: line.productId, productName: line.productName, productCode: line.productCode,
        productBarcode: text(line.productBarcode, 120),
        receivedQuantity: line.quantity, unrepairableQuantity: 0, handedOverQuantity: 0,
        custodyWarehouseId: warehouses.custodyWarehouseId, unrepairableWarehouseId: warehouses.unrepairableWarehouseId,
        createdAt: at, updatedAt: at,
      });
      tx.set(db.collection(STOCK_TX).doc(`custody-in__${jobId}__${safeId(line.itemId)}`), movementPayload({
        tenantId: actor.tenantId, warehouseId: warehouses.custodyWarehouseId, productId: line.productId,
        productName: line.productName, productCode: line.productCode, movementType: 'IN', quantity: Number(line.quantity),
        sourceModule: 'repair_customer_custody', sourceId: jobId, createdBy: actor.uid,
        note: `استلام عهدة طلب الصيانة ${receiptNo}`,
      }));
    });
    const safeJob = { ...incoming };
    delete safeJob.id;
    delete safeJob.tenantId;
    delete safeJob.custodyPostedAt;
    delete safeJob.custodyWarehouseId;
    tx.set(jobRef, {
      ...safeJob,
      tenantId: actor.tenantId,
      branchId,
      receiptNo,
      jobProducts: products,
      custodyPostedAt: at,
      custodyWarehouseId: warehouses.custodyWarehouseId,
      createdAt: text(incoming.createdAt, 80) || at,
      updatedAt: at,
      createdBy: text(incoming.createdBy, 128) || actor.uid,
    });
    tx.set(jobRef.collection('service_events').doc(`job-created__${jobId}`), {
      tenantId: actor.tenantId, branchId, jobId, at, actorUid: actor.uid, actorName: actor.displayName,
      action: 'job_created', domainEvent: 'job.created', eventSchemaVersion: 1,
      statusAfter: text(incoming.status, 80) || 'received', note: `إنشاء طلب صيانة — إيصال ${receiptNo}`,
    });
  });
  if (text(incoming.customerId, 128)) {
    await db.collection(EVENTS).doc(`job-created__${jobId}`).set({
      tenantId: actor.tenantId, customerId: text(incoming.customerId, 128), referenceType: 'repair_job',
      referenceId: jobId, action: 'job.created', title: 'تم استلام طلب الصيانة',
      message: `تم إنشاء الإيصال ${receiptNo} وإدخال المنتج في عهدة المركز.`, branchId,
      actorUid: actor.uid, actorName: actor.displayName, createdAt: at,
    }, { merge: true });
  }
  return { ok: true as const, jobId, receiptNo, alreadyCreated };
}

export const onRepairJobCreatedCustody = onDocumentCreated(
  { document: 'repair_jobs/{jobId}', region: 'us-central1', retry: true },
  async (event) => { await postJobCustody(event.params.jobId); },
);

async function addEvent(input: {
  tenantId: string; customerId: string; referenceType: string; referenceId: string;
  action: string; title: string; message: string; branchId?: string; actor?: Actor;
}): Promise<void> {
  if (!input.customerId) return;
  await db.collection(EVENTS).add({
    ...input,
    actorUid: input.actor?.uid || 'system',
    actorName: input.actor?.displayName || 'النظام',
    createdAt: nowIso(),
  });
}

async function sessionContext(request: CallableRequest): Promise<{ tenantId: string; customerId: string; customer: Json }> {
  const token = text((request.data as Json)?.sessionToken, 256);
  if (token.length < 40) throw new HttpsError('unauthenticated', 'جلسة العميل غير صالحة.');
  const sessionSnap = await db.collection(SESSIONS).doc(hash(token)).get();
  if (!sessionSnap.exists) throw new HttpsError('unauthenticated', 'انتهت جلسة العميل.');
  const session = sessionSnap.data() as Json;
  if (Number(session.expiresAtMs || 0) <= Date.now() || session.revoked === true) {
    throw new HttpsError('unauthenticated', 'انتهت جلسة العميل.');
  }
  const tenantId = text(session.tenantId, 128);
  const customerId = text(session.customerId, 128);
  const [customerSnap, credentialSnap] = await Promise.all([
    db.collection('customers').doc(customerId).get(),
    db.collection(CREDENTIALS).doc(`${tenantId}__${customerId}`).get(),
  ]);
  const customer = customerSnap.data() as Json | undefined;
  const credential = credentialSnap.data() as Json | undefined;
  if (!customerSnap.exists || customer?.isActive === false || text(customer?.tenantId, 128) !== tenantId
    || !credentialSnap.exists || credential?.isActive === false
    || !portalSessionMatchesCredential(credential?.version, session.credentialVersion)) {
    throw new HttpsError('unauthenticated', 'جلسة العميل لم تعد صالحة.');
  }
  return { tenantId, customerId, customer: customer || {} };
}

export async function customerPortalLoginHandler(request: CallableRequest) {
  const data = (request.data || {}) as Json;
  const tenantSlug = text(data.tenantSlug, 80).toLowerCase();
  const customerCode = text(data.customerCode, 80).toUpperCase();
  const pin = text(data.pin, 12);
  if (!tenantSlug || !customerCode || !new RegExp(`^\\d{${CUSTOMER_PORTAL_PIN_DIGITS}}$`).test(pin)) throw new HttpsError('invalid-argument', 'بيانات الدخول غير صالحة.');
  const slugSnap = await db.collection('tenant_slugs').doc(tenantSlug).get();
  const tenantId = text(slugSnap.data()?.tenantId, 128);
  if (!slugSnap.exists || !tenantId) throw new HttpsError('not-found', 'الشركة غير موجودة.');
  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists || text(tenantSnap.data()?.status, 40) !== 'active') throw new HttpsError('permission-denied', 'الشركة غير متاحة.');
  const ip = text(request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'], 100);
  const limitRef = db.collection(LOGIN_LIMITS).doc(hash(`${tenantId}:${customerCode}`));
  const limitSnap = await limitRef.get();
  const limitData = limitSnap.data() as Json | undefined;
  if (Number(limitData?.lockedUntilMs || 0) > Date.now()) throw new HttpsError('resource-exhausted', 'محاولات كثيرة. حاول بعد 15 دقيقة.');
  const customerQuery = await db.collection('customers').where('tenantId', '==', tenantId).where('code', '==', customerCode).limit(1).get();
  const customerDoc = customerQuery.docs[0];
  const credentialSnap = customerDoc ? await db.collection(CREDENTIALS).doc(`${tenantId}__${customerDoc.id}`).get() : null;
  const credential = credentialSnap?.data() as Json | undefined;
  const ok = Boolean(customerDoc && customerDoc.data()?.isActive !== false && credentialSnap?.exists && credential?.isActive !== false
    && pinMatches(pin, text(credential?.salt, 128), text(credential?.pinHash, 256)));
  if (!ok) {
    const failures = Number(limitData?.failures || 0) + 1;
    await limitRef.set({ tenantId, customerCodeHash: hash(customerCode), ipHash: hash(ip), failures: failures >= 5 ? 0 : failures,
      lockedUntilMs: failures >= 5 ? Date.now() + 15 * 60_000 : 0, updatedAt: nowIso() }, { merge: true });
    throw new HttpsError('unauthenticated', 'كود العميل أو PIN غير صحيح.');
  }
  await limitRef.delete().catch(() => undefined);
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAtMs = Date.now() + CUSTOMER_PORTAL_SESSION_MS;
  await db.collection(SESSIONS).doc(hash(rawToken)).set({
    tenantId, customerId: customerDoc.id, credentialVersion: Number(credential?.version || 1),
    expiresAtMs, createdAt: nowIso(), revoked: false,
  });
  return { ok: true as const, sessionToken: rawToken, expiresAtMs };
}

export async function getCustomerPortalHomeHandler(request: CallableRequest) {
  const ctx = await sessionContext(request);
  const [requestsSnap, jobsSnap, replacementsSnap, eventsSnap] = await Promise.all([
    db.collection(REQUESTS).where('tenantId', '==', ctx.tenantId).where('customerId', '==', ctx.customerId).limit(200).get(),
    db.collection(JOBS).where('tenantId', '==', ctx.tenantId).where('customerId', '==', ctx.customerId).limit(300).get(),
    db.collection(REPLACEMENTS).where('tenantId', '==', ctx.tenantId).where('customerId', '==', ctx.customerId).limit(200).get(),
    db.collection(EVENTS).where('tenantId', '==', ctx.tenantId).where('customerId', '==', ctx.customerId).limit(500).get(),
  ]);
  const publicJob = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const row = doc.data() as Json;
    return { id: doc.id, receiptNo: text(row.receiptNo, 80), status: text(row.status, 80), branchId: text(row.branchId, 128),
      createdAt: text(row.createdAt, 80), updatedAt: text(row.updatedAt, 80),
      products: ((Array.isArray(row.jobProducts) ? row.jobProducts : []) as Json[]).map((p) => ({
        name: text(p.productName, 160), quantity: Number(p.quantity || 1), unrepairableQuantity: Number(p.unrepairableQuantity || 0),
      })) };
  };
  const publicRequest = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const row = doc.data() as Json;
    return { id: doc.id, requestNo: text(row.requestNo, 80), status: text(row.status, 40),
      branchId: text(row.branchId, 128), branchName: text(row.branchName, 160),
      convertedJobId: text(row.convertedJobId, 128), convertedReceiptNo: text(row.convertedReceiptNo, 80),
      createdAt: text(row.createdAt, 80), updatedAt: text(row.updatedAt, 80),
      lines: ((Array.isArray(row.lines) ? row.lines : []) as Json[]).map((line) => ({
        lineId: text(line.lineId, 100), productName: text(line.productName, 160), productCode: text(line.productCode, 80),
        barcode: text(line.barcode, 120), requestedQuantity: Number(line.requestedQuantity || 0),
        receivedQuantity: line.receivedQuantity == null ? undefined : Number(line.receivedQuantity),
        note: text(line.note, 1000), differenceNote: text(line.differenceNote, 1000),
      })) };
  };
  const publicReplacement = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const row = doc.data() as Json;
    return { id: doc.id, jobId: text(row.jobId, 128), receiptNo: text(row.receiptNo, 80), status: text(row.status, 40),
      originalProductName: text(row.originalProductName, 160), requestedQuantity: Number(row.requestedQuantity || 0),
      replacementProductName: text(row.replacementProductName, 160), approvedQuantity: Number(row.approvedQuantity || 0),
      createdAt: text(row.createdAt, 80), updatedAt: text(row.updatedAt, 80), deliveredAt: text(row.deliveredAt, 80) };
  };
  const publicEvent = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const row = doc.data() as Json;
    return { id: doc.id, referenceType: text(row.referenceType, 80), referenceId: text(row.referenceId, 128),
      action: text(row.action, 100), title: text(row.title, 200), message: text(row.message, 1000),
      branchId: text(row.branchId, 128), createdAt: text(row.createdAt, 80) };
  };
  return {
    ok: true as const,
    customer: { id: ctx.customerId, code: text(ctx.customer.code, 80), name: text(ctx.customer.name, 160),
      type: text(ctx.customer.type, 40), phone: text(ctx.customer.phone, 40), address: text(ctx.customer.address, 300) },
    requests: requestsSnap.docs.map(publicRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    jobs: jobsSnap.docs.map(publicJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    replacements: replacementsSnap.docs.map(publicReplacement).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    events: eventsSnap.docs.map(publicEvent).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function lookupPortalProductHandler(request: CallableRequest) {
  const ctx = await sessionContext(request);
  const barcode = text((request.data as Json)?.barcode, 120);
  if (!barcode) throw new HttpsError('invalid-argument', 'الباركود مطلوب.');
  const normalized = barcode.toUpperCase();
  let snap = await db.collection('products').where('tenantId', '==', ctx.tenantId).where('barcodeNormalized', '==', normalized).limit(1).get();
  if (snap.empty) snap = await db.collection('products').where('tenantId', '==', ctx.tenantId).where('barcode', '==', barcode).limit(1).get();
  const product = snap.docs[0];
  if (!product) throw new HttpsError('not-found', 'الباركود غير مسجل على أي منتج.');
  const row = product.data();
  return { ok: true as const, product: { id: product.id, name: text(row.name, 160), code: text(row.code, 80), barcode } };
}

export async function createCustomerServiceRequestHandler(request: CallableRequest) {
  const ctx = await sessionContext(request);
  const incoming = Array.isArray((request.data as Json)?.lines) ? (request.data as Json).lines as Json[] : [];
  if (!incoming.length || incoming.length > 30) throw new HttpsError('invalid-argument', 'أضف منتجًا واحدًا على الأقل.');
  const merged = new Map<string, { barcode: string; quantity: number; note: string }>();
  incoming.forEach((line) => {
    const barcode = text(line.barcode, 120);
    if (!barcode) throw new HttpsError('invalid-argument', 'الباركود مطلوب.');
    const key = barcode.toUpperCase();
    const previous = merged.get(key);
    merged.set(key, { barcode, quantity: (previous?.quantity || 0) + positiveInt(line.quantity),
      note: [previous?.note, text(line.note, 1000)].filter(Boolean).join(' — ').slice(0, 1000) });
  });
  const normalizedIncoming = Array.from(merged.values());
  const lines: Json[] = [];
  for (let index = 0; index < normalizedIncoming.length; index += 1) {
    const barcode = normalizedIncoming[index].barcode;
    let productSnap = await db.collection('products').where('tenantId', '==', ctx.tenantId)
      .where('barcodeNormalized', '==', barcode.toUpperCase()).limit(1).get();
    if (productSnap.empty) productSnap = await db.collection('products').where('tenantId', '==', ctx.tenantId)
      .where('barcode', '==', barcode).limit(1).get();
    const product = productSnap.docs[0];
    if (!product) throw new HttpsError('not-found', `الباركود في السطر ${index + 1} غير مسجل.`);
    const row = product.data();
    lines.push({ lineId: `line-${index + 1}`, productId: product.id, productName: text(row.name, 160),
      productCode: text(row.code, 80), barcode, requestedQuantity: normalizedIncoming[index].quantity,
      note: normalizedIncoming[index].note });
  }
  const ref = db.collection(REQUESTS).doc();
  const counterRef = db.collection(COUNTERS).doc(`customer_requests_${ctx.tenantId}`);
  const at = nowIso();
  let requestNo = '';
  await db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const seq = Number(counter.data()?.value || 0) + 1;
    requestNo = `CSR-${String(seq).padStart(5, '0')}`;
    tx.set(counterRef, { tenantId: ctx.tenantId, value: seq, updatedAt: at }, { merge: true });
    tx.set(ref, { tenantId: ctx.tenantId, requestNo, customerId: ctx.customerId,
      customerCode: text(ctx.customer.code, 80), customerName: text(ctx.customer.name, 160),
      customerPhone: text(ctx.customer.phone, 40), customerAddress: text(ctx.customer.address, 300),
      status: 'submitted', lines, createdAt: at, updatedAt: at });
  });
  await addEvent({ tenantId: ctx.tenantId, customerId: ctx.customerId, referenceType: 'customer_request',
    referenceId: ref.id, action: 'request.created', title: 'تم إنشاء طلب الصيانة', message: `تم استلام الطلب ${requestNo}.` });
  return { ok: true as const, requestId: ref.id, requestNo };
}

async function generatePin(actor: Actor, data: Json) {
  requirePermission(actor, ['customers.edit', 'repair.customerPortal.manage'], 'لا تملك صلاحية إدارة بوابة العملاء.');
  const customerId = text(data.customerId, 128);
  const customer = await db.collection('customers').doc(customerId).get();
  if (!customer.exists || text(customer.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'العميل غير موجود.');
  const ref = db.collection(CREDENTIALS).doc(`${actor.tenantId}__${customerId}`);
  const old = await ref.get();
  const isConfigured = old.exists && old.data()?.isActive !== false;
  if (!canWritePortalPin(isConfigured, data.confirmReset)) {
    throw new HttpsError(
      'failed-precondition',
      'يوجد PIN ثابت ومفعل لهذا العميل. استخدم إعادة تعيين PIN فقط إذا كنت تريد إلغاء الرقم الحالي.',
    );
  }
  const pin = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString('hex');
  const version = nextPortalCredentialVersion(old.data()?.version);
  await ref.set({ tenantId: actor.tenantId, customerId, salt, pinHash: pinHash(pin, salt), version,
    isActive: true, updatedAt: nowIso(), updatedBy: actor.uid }, { merge: true });
  return { ok: true as const, pin, reset: isConfigured };
}

async function getPortalPinStatus(actor: Actor, data: Json) {
  requirePermission(actor, ['customers.edit', 'repair.customerPortal.manage'], 'لا تملك صلاحية إدارة بوابة العملاء.');
  const customerId = text(data.customerId, 128);
  const customer = await db.collection('customers').doc(customerId).get();
  if (!customer.exists || text(customer.data()?.tenantId, 128) !== actor.tenantId) {
    throw new HttpsError('not-found', 'العميل غير موجود.');
  }
  const credential = await db.collection(CREDENTIALS).doc(`${actor.tenantId}__${customerId}`).get();
  return {
    ok: true as const,
    configured: credential.exists && credential.data()?.isActive !== false,
    updatedAt: text(credential.data()?.updatedAt, 40),
  };
}

async function assignRequest(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.customerRequests.assign', 'repair.callCenter.viewAll'], 'لا تملك صلاحية توزيع الطلبات.');
  const requestId = text(data.requestId, 128);
  const branchId = text(data.branchId, 128);
  const [requestSnap, branchSnap] = await Promise.all([db.collection(REQUESTS).doc(requestId).get(), db.collection(BRANCHES).doc(branchId).get()]);
  if (!requestSnap.exists || text(requestSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'طلب العميل غير موجود.');
  if (!branchSnap.exists || text(branchSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'المركز غير موجود.');
  const requestRow = requestSnap.data() as Json;
  if (text(requestRow.status, 40) === 'converted') throw new HttpsError('failed-precondition', 'تم تحويل الطلب بالفعل.');
  const previous = text(requestRow.branchId, 128);
  const branchName = text(branchSnap.data()?.name, 160);
  await requestSnap.ref.set({ status: 'assigned', branchId, branchName, assignedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
  await addEvent({ tenantId: actor.tenantId, customerId: text(requestRow.customerId, 128), referenceType: 'customer_request',
    referenceId: requestId, action: previous ? 'request.reassigned' : 'request.assigned', title: 'تم توزيع الطلب',
    message: `تم توزيع الطلب على ${branchName}.`, branchId, actor });
  return { ok: true as const };
}

async function receiveRequest(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.customerRequests.receive', 'repair.jobs.reception'], 'لا تملك صلاحية تأكيد الاستلام.');
  const requestId = text(data.requestId, 128);
  const requestRef = db.collection(REQUESTS).doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists || text(requestSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'طلب العميل غير موجود.');
  const requestRow = requestSnap.data() as Json;
  const branchId = text(requestRow.branchId, 128);
  requireBranch(actor, branchId);
  if (text(requestRow.status, 40) !== 'assigned') throw new HttpsError('failed-precondition', 'الطلب غير متاح للاستلام.');
  const warehouses = await ensureRepairCustomerWarehouses(actor.tenantId, branchId);
  const submitted = (Array.isArray(data.lines) ? data.lines : []) as Json[];
  const byLine = new Map(submitted.map((line) => [text(line.lineId, 100), line]));
  const requestLines = (Array.isArray(requestRow.lines) ? requestRow.lines : []) as Json[];
  const actualLines: Json[] = requestLines.map((line): Json => {
    const received = byLine.get(text(line.lineId, 100));
    const requestedQuantity = positiveInt(line.requestedQuantity);
    const receivedQuantity = nonNegativeInt(received?.receivedQuantity ?? requestedQuantity);
    const differenceNote = text(received?.differenceNote, 1000);
    if (receivedQuantity !== requestedQuantity && !differenceNote) throw new HttpsError('invalid-argument', 'ملاحظة اختلاف الكمية مطلوبة.');
    return { ...line, requestedQuantity, receivedQuantity, differenceNote };
  });
  if (!actualLines.some((line) => Number(line.receivedQuantity) > 0)) throw new HttpsError('invalid-argument', 'يجب استلام وحدة واحدة على الأقل.');
  const jobRef = db.collection(JOBS).doc();
  const counterRef = db.collection(COUNTERS).doc(`repair_jobs_${actor.tenantId}`);
  const at = nowIso();
  let receiptNo = '';
  await db.runTransaction(async (tx) => {
    const [freshRequest, counter, ...balances] = await Promise.all([
      tx.get(requestRef), tx.get(counterRef),
      ...actualLines.filter((line) => Number(line.receivedQuantity) > 0).map((line) => tx.get(db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, text(line.productId, 128))))),
    ]);
    if (!freshRequest.exists || freshRequest.data()?.status !== 'assigned') throw new HttpsError('already-exists', 'تم استلام الطلب من قبل.');
    const seq = Number(counter.data()?.value || 0) + 1;
    receiptNo = `REP-${String(seq).padStart(4, '0')}`;
    tx.set(counterRef, { tenantId: actor.tenantId, value: seq, updatedAt: at }, { merge: true });
    let balanceIndex = 0;
    const jobProducts = actualLines.filter((line) => Number(line.receivedQuantity) > 0).map((line, index) => {
      const productId = text(line.productId, 128);
      const qty = Number(line.receivedQuantity);
      const productName = text(line.productName, 160);
      const productCode = text(line.productCode, 80);
      const itemId = text(line.lineId || `item-${index + 1}`, 100);
      const balSnap = balances[balanceIndex++];
      const balRef = db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, productId));
      stockWrite(tx, balRef, balSnap.exists ? Number(balSnap.data()?.quantity || 0) : 0, qty, {
        tenantId: actor.tenantId, warehouseId: warehouses.custodyWarehouseId,
        warehouseName: `عهدة أجهزة العملاء - ${warehouses.branchName}`, warehouseRole: 'repair_customer_custody',
        itemType: 'finished_good', itemId: productId, itemName: productName, itemCode: productCode,
      });
      tx.set(db.collection(CUSTODY).doc(custodyId(jobRef.id, itemId)), {
        tenantId: actor.tenantId, branchId, jobId: jobRef.id, receiptNo, jobProductItemId: itemId,
        customerId: text(requestRow.customerId, 128), customerName: text(requestRow.customerName, 160),
        customerPhone: text(requestRow.customerPhone, 40), jobStatus: 'received',
        productId, productName, productCode, productBarcode: text(line.barcode, 120),
        receivedQuantity: qty, unrepairableQuantity: 0, handedOverQuantity: 0,
        custodyWarehouseId: warehouses.custodyWarehouseId, unrepairableWarehouseId: warehouses.unrepairableWarehouseId,
        createdAt: at, updatedAt: at,
      });
      tx.set(db.collection(STOCK_TX).doc(`custody-in__${jobRef.id}__${safeId(itemId)}`), movementPayload({
        tenantId: actor.tenantId, warehouseId: warehouses.custodyWarehouseId, productId, productName, productCode,
        movementType: 'IN', quantity: qty, sourceModule: 'repair_customer_custody', sourceId: jobRef.id,
        createdBy: actor.uid, note: `استلام عهدة طلب العميل ${text(requestRow.requestNo, 80)}`,
      }));
      return { itemId, productId, productName, quantity: qty, receivedQuantity: qty, diagnosis: text(line.note, 1000),
        unrepairableQuantity: 0, handedOverQuantity: 0, estimatedCost: 0, finalCost: 0, inWarranty: false };
    });
    const lead = jobProducts[0];
    tx.set(jobRef, { tenantId: actor.tenantId, receiptNo, branchId, customerId: text(requestRow.customerId, 128),
      customerName: text(requestRow.customerName, 160), customerPhone: text(requestRow.customerPhone, 40),
      customerAddress: text(requestRow.customerAddress, 300), jobProducts, productId: lead.productId,
      productName: lead.productName, deviceType: lead.productName, deviceBrand: '', deviceModel: '',
      problemDescription: text(lead.diagnosis, 1000), status: 'received', partsUsed: [], warranty: 'none',
      priority: 'normal', paymentStatus: 'unpaid', paidAmount: 0, balanceDue: 0, finalCost: 0,
      sourceCustomerRequestId: requestId, custodyPostedAt: at, custodyWarehouseId: warehouses.custodyWarehouseId,
      statusHistory: [{ status: 'received', at }], createdAt: at, updatedAt: at, isClosed: false });
    tx.set(requestRef, { status: 'converted', lines: actualLines, convertedJobId: jobRef.id,
      convertedReceiptNo: receiptNo, convertedAt: at, updatedAt: at }, { merge: true });
  });
  await addEvent({ tenantId: actor.tenantId, customerId: text(requestRow.customerId, 128), referenceType: 'customer_request',
    referenceId: requestId, action: 'request.received', title: 'تم استلام المنتجات', message: 'أكد مركز الصيانة الكميات المستلمة.', branchId, actor });
  await addEvent({ tenantId: actor.tenantId, customerId: text(requestRow.customerId, 128), referenceType: 'repair_job',
    referenceId: jobRef.id, action: 'request.converted', title: 'تم فتح طلب الصيانة', message: `رقم إيصال الصيانة ${receiptNo}.`, branchId, actor });
  return { ok: true as const, jobId: jobRef.id, receiptNo };
}

async function recordUnrepairable(actor: Actor, data: Json, options: {
  allowCrossBranch?: boolean;
  allowNegativeCorrection?: boolean;
  allowLegacyReason?: boolean;
} = {}) {
  requirePermission(actor, ['repair.custody.record', 'repair.jobs.technician', 'repair.jobs.edit'], 'لا تملك صلاحية تسجيل غير القابل للإصلاح.');
  const jobId = text(data.jobId, 128);
  const itemId = text(data.itemId, 100);
  const nextQty = nonNegativeInt(data.quantity);
  const reasonNote = text(data.reasonNote || data.reason, 1000);
  const reasonCode = text(data.reasonCode, 80);
  await postJobCustody(jobId);
  const jobRef = db.collection(JOBS).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  const job = jobSnap.data() as Json;
  const branchId = text(job.branchId, 128);
  requireBranch(
    actor,
    branchId,
    options.allowCrossBranch === true || actor.permissions['repair.custody.correct'] === true,
  );
  const warehouses = await ensureRepairCustomerWarehouses(actor.tenantId, branchId);
  const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[];
  const index = products.findIndex((row) => text(row.itemId, 100) === itemId);
  if (index < 0) throw new HttpsError('not-found', 'منتج الطلب غير موجود.');
  const line = products[index];
  const totalQty = Math.max(1, Number(line.receivedQuantity || line.quantity || 1));
  if (nextQty > totalQty) throw new HttpsError('invalid-argument', 'الكمية غير القابلة للإصلاح أكبر من المستلم.');
  const recordRef = db.collection(CUSTODY).doc(custodyId(jobId, itemId));
  const recordBefore = await recordRef.get();
  if (!recordBefore.exists) throw new HttpsError('failed-precondition', 'سجل عهدة المنتج غير موجود.');
  const oldQty = nonNegativeInt(recordBefore.data()?.unrepairableQuantity || 0);
  const delta = nextQty - oldQty;
  if (delta < 0 && !options.allowNegativeCorrection && !actor.isSuperAdmin && actor.permissions['repair.custody.correct'] !== true) {
    throw new HttpsError('permission-denied', 'تصحيح الكمية يحتاج صلاحية مستقلة.');
  }
  let reasonLabel = text(line.unrepairableReasonLabel || line.unrepairableReason, 200);
  let normalizedReasonCode = text(line.unrepairableReasonCode, 80);
  if (delta > 0) {
    if (reasonCode) {
      const settingsSnap = await db.collection('system_settings').doc(actor.tenantId).get();
      const settings = settingsSnap.data() as Json | undefined;
      const repairSettings = (settings?.repairSettings && typeof settings.repairSettings === 'object'
        ? settings.repairSettings : {}) as Json;
      const selectedReason = resolveUnrepairableReason(repairSettings.unrepairableReasons, reasonCode);
      if (!selectedReason) throw new HttpsError('invalid-argument', 'اختر سببًا معتمدًا لعدم قابلية الإصلاح.');
      normalizedReasonCode = selectedReason.id;
      reasonLabel = selectedReason.label;
    } else if (options.allowLegacyReason) {
      normalizedReasonCode = normalizedReasonCode || 'legacy_unclassified';
      reasonLabel = reasonLabel || reasonNote || 'بيانات تاريخية غير مصنفة';
    } else {
      throw new HttpsError('invalid-argument', 'اختر سبب عدم قابلية الإصلاح من القائمة المعتمدة.');
    }
    if (normalizedReasonCode === 'other' && !reasonNote) {
      throw new HttpsError('invalid-argument', 'اكتب تفاصيل السبب الآخر.');
    }
  }
  const reason = [reasonLabel, reasonNote].filter(Boolean).join(' — ');
  if (delta !== 0) {
    const custodyBalRef = db.collection(STOCK).doc(balanceId(warehouses.custodyWarehouseId, text(line.productId, 128)));
    const unrepairableBalRef = db.collection(STOCK).doc(balanceId(warehouses.unrepairableWarehouseId, text(line.productId, 128)));
    await db.runTransaction(async (tx) => {
      const [freshJob, custodyBal, unrepairableBal, record] = await Promise.all([
        tx.get(jobRef), tx.get(custodyBalRef), tx.get(unrepairableBalRef), tx.get(recordRef),
      ]);
      const freshProducts = (Array.isArray(freshJob.data()?.jobProducts) ? freshJob.data()?.jobProducts : []) as Json[];
      const freshIndex = freshProducts.findIndex((row) => text(row.itemId, 100) === itemId);
      if (freshIndex < 0) throw new HttpsError('not-found', 'منتج الطلب غير موجود.');
      const freshOld = nonNegativeInt(record.data()?.unrepairableQuantity || 0);
      if (freshOld !== oldQty) throw new HttpsError('aborted', 'تم تعديل السطر من مستخدم آخر.');
      const recordRow = (record.data() || {}) as Json;
      const custodyHanded = nonNegativeInt(recordRow.custodyHandedOverQuantity || 0);
      const unrepairableHanded = nonNegativeInt(recordRow.unrepairableHandedOverQuantity || 0);
      if (nextQty < unrepairableHanded || nextQty + custodyHanded > totalQty) {
        throw new HttpsError('failed-precondition', 'التصحيح يتعارض مع كميات سُلمت فعليًا للعميل.');
      }
      const abs = Math.abs(delta);
      const fromId = delta > 0 ? warehouses.custodyWarehouseId : warehouses.unrepairableWarehouseId;
      const toId = delta > 0 ? warehouses.unrepairableWarehouseId : warehouses.custodyWarehouseId;
      stockWrite(tx, custodyBalRef, custodyBal.exists ? Number(custodyBal.data()?.quantity || 0) : 0, -delta, {
        tenantId: actor.tenantId, warehouseId: warehouses.custodyWarehouseId, warehouseRole: 'repair_customer_custody',
        itemType: 'finished_good', itemId: text(line.productId, 128), itemName: text(line.productName, 160), itemCode: text(line.productCode, 80),
      });
      stockWrite(tx, unrepairableBalRef, unrepairableBal.exists ? Number(unrepairableBal.data()?.quantity || 0) : 0, delta, {
        tenantId: actor.tenantId, warehouseId: warehouses.unrepairableWarehouseId, warehouseRole: 'repair_unrepairable',
        itemType: 'finished_good', itemId: text(line.productId, 128), itemName: text(line.productName, 160), itemCode: text(line.productCode, 80),
      });
      const previousDecisionQuantity = Math.max(
        Number(freshProducts[freshIndex].unrepairableDecisionQuantity || 0),
        freshOld,
      );
      freshProducts[freshIndex] = {
        ...freshProducts[freshIndex],
        unrepairableQuantity: nextQty,
        unrepairableDecisionQuantity: delta > 0 ? Math.max(previousDecisionQuantity, nextQty) : previousDecisionQuantity,
        ...(delta > 0 ? {
          unrepairableReason: reason,
          unrepairableReasonCode: normalizedReasonCode,
          unrepairableReasonLabel: reasonLabel,
          unrepairableReasonNote: reasonNote,
          unrepairableRecordedAt: nowIso(),
          unrepairableRecordedBy: actor.uid,
          unrepairableRecordedByName: actor.displayName,
        } : {
          unrepairableCorrectedAt: nowIso(),
          unrepairableCorrectedBy: actor.uid,
        }),
      };
      const allUnrepairable = freshProducts.every((row) => Number(row.unrepairableQuantity || 0) >= Number(row.receivedQuantity || row.quantity || 1));
      tx.set(jobRef, { jobProducts: freshProducts, ...(allUnrepairable ? { status: 'unrepairable', isClosed: true,
        closedAt: nowIso(), resolvedAt: nowIso(), closedReason: reason } : {}), updatedAt: nowIso() }, { merge: true });
      tx.set(recordRef, {
        unrepairableQuantity: nextQty,
        ...(allUnrepairable ? { jobStatus: 'unrepairable' } : {}),
        ...(delta > 0 ? {
          unrepairableReasonCode: normalizedReasonCode,
          unrepairableReasonLabel: reasonLabel,
          unrepairableReasonNote: reasonNote,
        } : {}),
        updatedAt: nowIso(),
      }, { merge: true });
      const outRef = db.collection(STOCK_TX).doc();
      const inRef = db.collection(STOCK_TX).doc();
      tx.set(outRef, movementPayload({ tenantId: actor.tenantId, warehouseId: fromId, toWarehouseId: toId,
        productId: text(line.productId, 128), productName: text(line.productName, 160), productCode: text(line.productCode, 80),
        movementType: 'TRANSFER', quantity: abs, sourceModule: 'repair_unrepairable', sourceId: jobId, createdBy: actor.uid,
        note: delta > 0 ? `تحويل غير قابل للإصلاح: ${reason}` : `تصحيح كمية غير القابل للإصلاح: ${reason}`,
        direction: 'OUT', relatedId: inRef.id }));
      tx.set(inRef, movementPayload({ tenantId: actor.tenantId, warehouseId: toId, toWarehouseId: fromId,
        productId: text(line.productId, 128), productName: text(line.productName, 160), productCode: text(line.productCode, 80),
        movementType: 'TRANSFER', quantity: abs, sourceModule: 'repair_unrepairable', sourceId: jobId, createdBy: actor.uid,
        note: delta > 0 ? `استلام غير قابل للإصلاح: ${reason}` : `عكس تصحيح غير القابل للإصلاح: ${reason}`,
        direction: 'IN', relatedId: outRef.id }));
      void record;
    });
  }
  if (delta !== 0) await addEvent({ tenantId: actor.tenantId, customerId: text(job.customerId, 128), referenceType: 'repair_job', referenceId: jobId,
    action: 'job.unrepairable_recorded', title: 'تم تحديث نتيجة الفحص', message: `تم تسجيل ${nextQty} وحدة غير قابلة للإصلاح.`, branchId, actor });
  return { ok: true as const };
}

/**
 * The technician's whole-job decision must use the same audited custody transfer
 * as the line-level reception action. The caller has already verified that the
 * job is assigned to this technician, so cross-branch work is intentionally allowed.
 */
export async function recordAssignedJobFullyUnrepairable(input: {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  jobId: string;
  reasonCode: string;
  reasonNote?: string;
}) {
  const jobSnap = await db.collection(JOBS).doc(input.jobId).get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== input.tenantId) {
    throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  }
  const products = (Array.isArray(jobSnap.data()?.jobProducts) ? jobSnap.data()?.jobProducts : []) as Json[];
  if (products.length === 0) {
    throw new HttpsError('failed-precondition', 'لا توجد منتجات في الطلب لتسجيلها كغير قابلة للإصلاح.');
  }
  const actor: Actor = {
    uid: input.uid,
    tenantId: input.tenantId,
    displayName: input.displayName,
    permissions: { ...input.permissions, 'repair.jobs.technician': true },
    isSuperAdmin: input.isSuperAdmin,
    branchIds: [],
  };
  for (let index = 0; index < products.length; index += 1) {
    const line = products[index];
    await recordUnrepairable(actor, {
      jobId: input.jobId,
      itemId: text(line.itemId || `item-${index + 1}`, 100),
      quantity: Math.max(1, Number(line.receivedQuantity || line.quantity || 1)),
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
    }, { allowCrossBranch: true });
  }
  return { productLines: products.length };
}

async function reopenUnrepairable(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.custody.correct', 'repair.jobs.edit'], 'لا تملك صلاحية إعادة فتح الطلب للصيانة.');
  const jobId = text(data.jobId, 128);
  const itemId = text(data.itemId, 100);
  const quantity = positiveInt(data.quantity);
  const note = text(data.note, 1000) || 'أصبحت قطع الغيار متوفرة';
  const jobRef = db.collection(JOBS).doc(jobId);
  const [jobSnap, activeReplacementSnap] = await Promise.all([
    jobRef.get(),
    db.collection(REPLACEMENTS).where('jobId', '==', jobId).limit(100).get(),
  ]);
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) {
    throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  }
  const job = jobSnap.data() as Json;
  const branchId = text(job.branchId, 128);
  requireBranch(actor, branchId, actor.permissions['repair.custody.correct'] === true);
  const blockingReplacement = activeReplacementSnap.docs.some((doc) => {
    const row = doc.data() as Json;
    return text(row.tenantId, 128) === actor.tenantId
      && text(row.jobProductItemId, 100) === itemId
      && ['pending_approval', 'approved', 'delivered'].includes(text(row.status, 40));
  });
  if (blockingReplacement) {
    throw new HttpsError('failed-precondition', 'يوجد طلب استبدال نشط أو مُسلّم لهذا المنتج. ألغِه أولًا قبل إعادة فتح الإصلاح.');
  }
  const recordRef = db.collection(CUSTODY).doc(custodyId(jobId, itemId));
  const recordSnap = await recordRef.get();
  if (!recordSnap.exists) throw new HttpsError('failed-precondition', 'سجل مخزن غير القابل للإصلاح غير موجود.');
  const record = recordSnap.data() as Json;
  const currentUnrepairable = nonNegativeInt(record.unrepairableQuantity || 0);
  const handed = nonNegativeInt(record.unrepairableHandedOverQuantity || 0);
  if (quantity > currentUnrepairable - handed) {
    throw new HttpsError('failed-precondition', 'الكمية المطلوب إعادتها أكبر من الرصيد المتاح.');
  }
  await recordUnrepairable(actor, {
    jobId,
    itemId,
    quantity: currentUnrepairable - quantity,
    reasonNote: note,
  }, { allowCrossBranch: true, allowNegativeCorrection: true });
  const fresh = await jobRef.get();
  const products = (Array.isArray(fresh.data()?.jobProducts) ? fresh.data()?.jobProducts : []) as Json[];
  const index = products.findIndex((row) => text(row.itemId, 100) === itemId);
  if (index >= 0) {
    products[index] = {
      ...products[index],
      reopenedFromUnrepairableQuantity: Number(products[index].reopenedFromUnrepairableQuantity || 0) + quantity,
      lastReopenedAt: nowIso(),
      lastReopenedBy: actor.uid,
      lastReopenReason: note,
    };
  }
  const statusHistory = Array.isArray(fresh.data()?.statusHistory) ? [...fresh.data()?.statusHistory as Json[]] : [];
  statusHistory.push({ status: 'repairing', at: nowIso(), actorUid: actor.uid, reason: note, source: 'unrepairable_reopen' });
  await jobRef.set({
    jobProducts: products,
    status: 'repairing',
    isClosed: false,
    statusHistory,
    reopenedAt: nowIso(),
    reopenedBy: actor.uid,
    reopenedByName: actor.displayName,
    reopenReason: note,
    reopenCount: Number(fresh.data()?.reopenCount || 0) + 1,
    closedAt: FieldValue.delete(),
    closedReason: FieldValue.delete(),
    updatedAt: nowIso(),
  }, { merge: true });
  await recordRef.set({
    jobStatus: 'repairing',
    reopenedQuantity: Number(record.reopenedQuantity || 0) + quantity,
    lastReopenedAt: nowIso(),
    updatedAt: nowIso(),
  }, { merge: true });
  await addEvent({
    tenantId: actor.tenantId,
    customerId: text(job.customerId, 128),
    referenceType: 'repair_job',
    referenceId: jobId,
    action: 'job.reopened',
    title: 'تمت إعادة فتح طلب الصيانة',
    message: `أُعيدت ${quantity} وحدة للورشة بعد توفر قطع الغيار.`,
    branchId,
    actor,
  });
  return { ok: true as const, status: 'repairing', quantity };
}

async function handover(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.custody.handover', 'repair.jobs.reception'], 'لا تملك صلاحية تسليم أجهزة العملاء.');
  const jobId = text(data.jobId, 128);
  const itemId = text(data.itemId, 100);
  const source = data.source === 'unrepairable' ? 'unrepairable' : 'custody';
  const quantity = positiveInt(data.quantity);
  await postJobCustody(jobId);
  const jobRef = db.collection(JOBS).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'الطلب غير موجود.');
  const job = jobSnap.data() as Json;
  const jobStatus = text(job.status, 40);
  const allowed = source === 'unrepairable'
    ? true
    : ['delivered', 'cancelled'].includes(jobStatus);
  if (!allowed) {
    throw new HttpsError(
      'failed-precondition',
      'خروج الجهاز من العهدة متاح بعد التسليم المالي المعتمد أو إلغاء الطلب فقط.',
    );
  }
  const branchId = text(job.branchId, 128);
  requireBranch(actor, branchId);
  const warehouses = await ensureRepairCustomerWarehouses(actor.tenantId, branchId);
  const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[];
  const index = products.findIndex((row) => text(row.itemId, 100) === itemId);
  if (index < 0) throw new HttpsError('not-found', 'منتج الطلب غير موجود.');
  const line = products[index];
  const recordRef = db.collection(CUSTODY).doc(custodyId(jobId, itemId));
  const warehouseId = source === 'unrepairable' ? warehouses.unrepairableWarehouseId : warehouses.custodyWarehouseId;
  const balRef = db.collection(STOCK).doc(balanceId(warehouseId, text(line.productId, 128)));
  await db.runTransaction(async (tx) => {
    const [record, balance] = await Promise.all([tx.get(recordRef), tx.get(balRef)]);
    if (!record.exists) throw new HttpsError('failed-precondition', 'سجل العهدة غير موجود.');
    const row = record.data() as Json;
    const received = Number(row.receivedQuantity || 0);
    const unrepairable = Number(row.unrepairableQuantity || 0);
    const handed = Number(row.handedOverQuantity || 0);
    const sourceHanded = Number(source === 'unrepairable' ? row.unrepairableHandedOverQuantity || 0 : row.custodyHandedOverQuantity || 0);
    const available = source === 'unrepairable' ? unrepairable - sourceHanded : received - unrepairable - sourceHanded;
    if (quantity > available) throw new HttpsError('failed-precondition', 'الكمية المطلوب تسليمها أكبر من العهدة المتاحة.');
    stockWrite(tx, balRef, balance.exists ? Number(balance.data()?.quantity || 0) : 0, -quantity, {
      tenantId: actor.tenantId, warehouseId, warehouseRole: source === 'unrepairable' ? 'repair_unrepairable' : 'repair_customer_custody',
      itemType: 'finished_good', itemId: text(line.productId, 128), itemName: text(line.productName, 160), itemCode: text(line.productCode, 80),
    });
    tx.set(recordRef, { handedOverQuantity: handed + quantity, jobStatus,
      ...(source === 'unrepairable' ? { unrepairableHandedOverQuantity: sourceHanded + quantity } : { custodyHandedOverQuantity: sourceHanded + quantity }),
      updatedAt: nowIso() }, { merge: true });
    products[index] = { ...line, handedOverQuantity: Number(line.handedOverQuantity || 0) + quantity };
    tx.set(jobRef, { jobProducts: products, updatedAt: nowIso() }, { merge: true });
    tx.set(db.collection(STOCK_TX).doc(), movementPayload({ tenantId: actor.tenantId, warehouseId,
      productId: text(line.productId, 128), productName: text(line.productName, 160), productCode: text(line.productCode, 80),
      movementType: 'OUT', quantity, sourceModule: source === 'unrepairable' ? 'repair_unrepairable' : 'repair_customer_custody',
      sourceId: jobId, createdBy: actor.uid, note: `تسليم فعلي للعميل - ${text(job.receiptNo, 80)}` }));
  });
  await addEvent({ tenantId: actor.tenantId, customerId: text(job.customerId, 128), referenceType: 'repair_job', referenceId: jobId,
    action: 'job.handed_over', title: 'تم تسليم المنتج', message: `تم تأكيد تسليم ${quantity} وحدة للعميل.`, branchId, actor });
  return { ok: true as const };
}

async function listComplaintJobOptions(actor: Actor) {
  requirePermission(actor, ['repair.complaints.manage'], 'لا تملك صلاحية إدارة شكاوى الصيانة.');
  const snap = await db.collection(JOBS).where('tenantId', '==', actor.tenantId).limit(1000).get();
  const jobs = snap.docs.map((doc) => {
    const row = doc.data() as Json;
    const products = (Array.isArray(row.jobProducts) ? row.jobProducts : []) as Json[];
    return {
      id: doc.id,
      receiptNo: text(row.receiptNo, 80),
      branchId: text(row.branchId, 128),
      customerId: text(row.customerId, 128),
      customerName: text(row.customerName, 160),
      customerPhone: text(row.customerPhone, 40),
      productName: text(row.productName || products[0]?.productName, 160),
      status: text(row.status, 40),
      createdAt: text(row.createdAt, 40),
      jobProducts: products.slice(0, 20).map((line) => ({ productName: text(line.productName, 160) })),
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true as const, jobs };
}

async function createRepairComplaint(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.complaints.manage'], 'لا تملك صلاحية إنشاء شكاوى الصيانة.');
  const jobId = text(data.jobId, 128);
  const subject = text(data.subject, 240);
  const notes = text(data.notes, 2000);
  if (!jobId) throw new HttpsError('invalid-argument', 'اختر طلب الصيانة المرتبط بالشكوى.');
  if (!subject) throw new HttpsError('invalid-argument', 'أدخل موضوع الشكوى.');
  const jobRef = db.collection(JOBS).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) {
    throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  }
  const job = jobSnap.data() as Json;
  const branchId = text(job.branchId, 128);
  const ref = db.collection(COMPLAINTS).doc();
  const at = nowIso();
  const batch = db.batch();
  batch.set(ref, {
    tenantId: actor.tenantId,
    branchId,
    customerId: text(job.customerId, 128) || null,
    customerName: text(job.customerName, 160),
    customerPhone: text(job.customerPhone, 40),
    jobId,
    receiptNo: text(job.receiptNo, 80),
    subject,
    notes: notes || null,
    status: 'open',
    followUps: [],
    createdAt: at,
    updatedAt: at,
    createdByUid: actor.uid,
    createdByName: actor.displayName,
  });
  batch.set(jobRef, {
    complaintCount: Number(job.complaintCount || 0) + 1,
    lastComplaintId: ref.id,
    lastComplaintAt: at,
    updatedAt: at,
  }, { merge: true });
  await batch.commit();
  await addEvent({
    tenantId: actor.tenantId,
    customerId: text(job.customerId, 128),
    referenceType: 'repair_complaint',
    referenceId: ref.id,
    action: 'complaint.created',
    title: 'تم تسجيل شكوى على طلب الصيانة',
    message: `تم تسجيل الشكوى «${subject}» على الطلب ${text(job.receiptNo, 80)} وجارٍ متابعتها.`,
    branchId,
    actor,
  });
  return { ok: true as const, complaintId: ref.id };
}

function callCenterJobPayload(id: string, row: Json) {
  const products = (Array.isArray(row.jobProducts) ? row.jobProducts : []) as Json[];
  return {
    id,
    tenantId: text(row.tenantId, 128),
    receiptNo: text(row.receiptNo, 80),
    branchId: text(row.branchId, 128),
    customerId: text(row.customerId, 128),
    customerName: text(row.customerName, 160),
    customerPhone: text(row.customerPhone, 40),
    customerAddress: text(row.customerAddress, 300),
    productId: text(row.productId, 128),
    productName: text(row.productName, 160),
    deviceType: text(row.deviceType, 160),
    deviceBrand: text(row.deviceBrand, 160),
    deviceModel: text(row.deviceModel, 160),
    deviceSerial: text(row.deviceSerial, 160),
    problemDescription: text(row.problemDescription, 2000),
    accessories: text(row.accessories, 1000),
    status: text(row.status, 40),
    priority: text(row.priority, 40),
    dueAt: text(row.dueAt, 40),
    createdAt: text(row.createdAt, 40),
    updatedAt: text(row.updatedAt, 40),
    statusHistory: (Array.isArray(row.statusHistory) ? row.statusHistory : []).slice(-30),
    jobProducts: products.slice(0, 50).map((line, index) => ({
      itemId: text(line.itemId || `item-${index + 1}`, 100),
      productId: text(line.productId, 128),
      productName: text(line.productName, 160),
      productCode: text(line.productCode, 80),
      quantity: Math.max(1, Number(line.quantity || line.receivedQuantity || 1)),
      deviceBrand: text(line.deviceBrand, 160),
      deviceModel: text(line.deviceModel, 160),
      serialNo: text(line.serialNo, 160),
      diagnosis: text(line.diagnosis, 1000),
    })),
  };
}

async function listCallCenterJobs(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.callCenter.viewAll', 'repair.branches.manage'], 'لا تملك صلاحية عرض كل طلبات مركز الاتصال.');
  const queryText = text(data.query, 200).toLowerCase();
  if (queryText.length < 3) return { ok: true as const, jobs: [] };
  const queryDigits = queryText.replace(/\D/g, '');
  const snap = await db.collection(JOBS).where('tenantId', '==', actor.tenantId).limit(5000).get();
  const jobs = snap.docs
    .filter((doc) => {
      const row = doc.data() as Json;
      const phoneDigits = text(row.customerPhone, 40).replace(/\D/g, '');
      const haystack = [row.receiptNo, row.customerName].map((value) => text(value, 200).toLowerCase());
      return haystack.some((value) => value.includes(queryText))
        || (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));
    })
    .map((doc) => callCenterJobPayload(doc.id, doc.data() as Json))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500);
  return { ok: true as const, jobs };
}

async function listRepairFollowUps(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.callCenter.viewAll', 'repair.jobs.reception', 'repair.view'], 'لا تملك صلاحية عرض متابعات الطلب.');
  const jobId = text(data.jobId, 128);
  const jobSnap = await db.collection(JOBS).doc(jobId).get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) {
    throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  }
  const branchId = text(jobSnap.data()?.branchId, 128);
  requireBranch(actor, branchId, actor.permissions['repair.callCenter.viewAll'] === true);
  const snap = await db.collection(FOLLOWUPS)
    .where('tenantId', '==', actor.tenantId)
    .where('jobId', '==', jobId)
    .limit(500)
    .get();
  const followUps = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: unknown }))
    .sort((a, b) => text(b.createdAt, 40).localeCompare(text(a.createdAt, 40)));
  return { ok: true as const, followUps };
}

async function createRepairFollowUp(actor: Actor, data: Json) {
  requirePermission(actor, ['repair.callCenter.viewAll', 'repair.jobs.reception'], 'لا تملك صلاحية إضافة متابعة على الطلب.');
  const jobId = text(data.jobId, 128);
  const note = text(data.note, 2000);
  const followUpAt = text(data.followUpAt, 40);
  if (!note) throw new HttpsError('invalid-argument', 'اكتب ملاحظة المتابعة.');
  const jobRef = db.collection(JOBS).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) {
    throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  }
  const job = jobSnap.data() as Json;
  const branchId = text(job.branchId, 128);
  requireBranch(actor, branchId, actor.permissions['repair.callCenter.viewAll'] === true);
  const at = nowIso();
  const followUpRef = db.collection(FOLLOWUPS).doc();
  const eventRef = jobRef.collection('service_events').doc();
  const batch = db.batch();
  batch.set(followUpRef, {
    tenantId: actor.tenantId,
    branchId,
    jobId,
    note,
    ...(followUpAt ? { followUpAt } : {}),
    actorUid: actor.uid,
    actorName: actor.displayName,
    createdAt: at,
  });
  batch.set(eventRef, {
    tenantId: actor.tenantId,
    branchId,
    jobId,
    at,
    actorUid: actor.uid,
    actorName: actor.displayName,
    action: 'note',
    note: `متابعة مركز الاتصال: ${note}`,
    source: 'call_center',
  });
  batch.set(jobRef, {
    followUpCount: Number(job.followUpCount || 0) + 1,
    lastFollowUpAt: at,
    lastFollowUpNote: note,
    lastFollowUpActorName: actor.displayName,
    updatedAt: at,
  }, { merge: true });
  await batch.commit();
  return { ok: true as const, followUpId: followUpRef.id };
}

async function mutateReplacement(actor: Actor, data: Json) {
  const action = text(data.action, 40);
  if (action === 'createReplacement') {
    requirePermission(actor, ['repair.replacements.create', 'repair.jobs.reception'], 'لا تملك صلاحية إنشاء الاستبدال.');
    const jobId = text(data.jobId, 128);
    const itemId = text(data.itemId, 100);
    const quantity = positiveInt(data.quantity);
    const jobSnap = await db.collection(JOBS).doc(jobId).get();
    if (!jobSnap.exists || text(jobSnap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = jobSnap.data() as Json;
    const branchId = text(job.branchId, 128);
    requireBranch(actor, branchId);
    const line = ((Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[]).find((row) => text(row.itemId, 100) === itemId);
    if (!line) throw new HttpsError('not-found', 'منتج الطلب غير موجود.');
    const ref = db.collection(REPLACEMENTS).doc();
    const replacementsQuery = db.collection(REPLACEMENTS).where('tenantId', '==', actor.tenantId).where('jobId', '==', jobId)
      .where('jobProductItemId', '==', itemId).limit(100);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(replacementsQuery);
      const used = existing.docs.filter((doc) => ['pending_approval', 'approved', 'delivered'].includes(text(doc.data().status, 40)))
        .reduce((sum, doc) => sum + Number(doc.data().approvedQuantity || doc.data().requestedQuantity || 0), 0);
      if (used + quantity > Number(line.unrepairableQuantity || 0)) throw new HttpsError('failed-precondition', 'الكمية تتجاوز غير القابل للإصلاح المتاح.');
      tx.set(ref, { tenantId: actor.tenantId, branchId, jobId, receiptNo: text(job.receiptNo, 80), jobProductItemId: itemId,
        customerId: text(job.customerId, 128), customerName: text(job.customerName, 160), customerPhone: text(job.customerPhone, 40),
        originalProductId: text(line.productId, 128), originalProductName: text(line.productName, 160), requestedQuantity: quantity,
        status: 'pending_approval', reason: text(data.reason, 1000), createdBy: actor.uid, createdByName: actor.displayName,
        createdAt: nowIso(), updatedAt: nowIso() });
    });
    await addEvent({ tenantId: actor.tenantId, customerId: text(job.customerId, 128), referenceType: 'replacement_request',
      referenceId: ref.id, action: 'replacement.created', title: 'تم إنشاء طلب استبدال', message: 'طلب الاستبدال بانتظار اعتماد الإدارة.', branchId, actor });
    return { ok: true as const, replacementId: ref.id };
  }
  const replacementId = text(data.replacementId, 128);
  const ref = db.collection(REPLACEMENTS).doc(replacementId);
  const snap = await ref.get();
  if (!snap.exists || text(snap.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'طلب الاستبدال غير موجود.');
  const row = snap.data() as Json;
  const branchId = text(row.branchId, 128);
  if (action === 'approveReplacement') {
    requirePermission(actor, ['repair.replacements.approve'], 'لا تملك صلاحية اعتماد الاستبدال.');
    const productId = text(data.productId, 128);
    const product = await db.collection('products').doc(productId).get();
    if (!product.exists || text(product.data()?.tenantId, 128) !== actor.tenantId) throw new HttpsError('not-found', 'المنتج البديل غير موجود.');
    const quantity = positiveInt(data.quantity);
    if (quantity > Number(row.requestedQuantity || 0)) throw new HttpsError('invalid-argument', 'الكمية المعتمدة أكبر من المطلوبة.');
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (text(fresh.data()?.status, 40) !== 'pending_approval') throw new HttpsError('failed-precondition', 'طلب الاستبدال ليس قيد الاعتماد.');
      tx.set(ref, { status: 'approved', replacementProductId: productId, replacementProductName: text(product.data()?.name, 160),
        replacementProductCode: text(product.data()?.code, 80), approvedQuantity: quantity, resolutionNote: text(data.note, 1000),
        approvedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
    });
    await addEvent({ tenantId: actor.tenantId, customerId: text(row.customerId, 128), referenceType: 'replacement_request',
      referenceId: replacementId, action: 'replacement.approved', title: 'تم اعتماد الاستبدال',
      message: `تم اعتماد الاستبدال بمنتج ${text(product.data()?.name, 160)}.`, branchId, actor });
    return { ok: true as const };
  }
  if (action === 'deliverReplacement') {
    requirePermission(actor, ['repair.replacements.deliver', 'repair.jobs.reception'], 'لا تملك صلاحية تسليم البديل.');
    requireBranch(actor, branchId);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (text(fresh.data()?.status, 40) !== 'approved') throw new HttpsError('failed-precondition', 'طلب الاستبدال غير معتمد.');
      tx.set(ref, { status: 'delivered', deliveredAt: nowIso(), updatedAt: nowIso() }, { merge: true });
    });
    await addEvent({ tenantId: actor.tenantId, customerId: text(row.customerId, 128), referenceType: 'replacement_request',
      referenceId: replacementId, action: 'replacement.delivered', title: 'تم تسليم المنتج البديل',
      message: 'تم تأكيد تسليم المنتج البديل، والجهاز القديم ما زال في مخزن غير القابل للإصلاح.', branchId, actor });
    return { ok: true as const };
  }
  if (action === 'rejectReplacement' || action === 'cancelReplacement') {
    requirePermission(actor, ['repair.replacements.approve'], 'لا تملك صلاحية إنهاء طلب الاستبدال.');
    const status = action === 'rejectReplacement' ? 'rejected' : 'cancelled';
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const currentStatus = text(fresh.data()?.status, 40);
      if (action === 'rejectReplacement' && currentStatus !== 'pending_approval') throw new HttpsError('failed-precondition', 'لا يمكن رفض الطلب بحالته الحالية.');
      if (action === 'cancelReplacement' && !['pending_approval', 'approved'].includes(currentStatus)) throw new HttpsError('failed-precondition', 'لا يمكن إلغاء الطلب بحالته الحالية.');
      tx.set(ref, { status, resolutionNote: text(data.note, 1000), updatedAt: nowIso() }, { merge: true });
    });
    await addEvent({ tenantId: actor.tenantId, customerId: text(row.customerId, 128), referenceType: 'replacement_request',
      referenceId: replacementId, action: action === 'rejectReplacement' ? 'replacement.rejected' : 'replacement.cancelled',
      title: action === 'rejectReplacement' ? 'تم رفض الاستبدال' : 'تم إلغاء الاستبدال', message: text(data.note, 1000) || 'تم تحديث طلب الاستبدال.', branchId, actor });
    return { ok: true as const };
  }
  throw new HttpsError('invalid-argument', 'إجراء الاستبدال غير معروف.');
}

export async function mutateRepairCustomerOpsHandler(request: CallableRequest) {
  const actor = await actorFor(request);
  const data = (request.data || {}) as Json;
  const action = text(data.action, 60);
  if (action === 'generatePortalPin') return generatePin(actor, data);
  if (action === 'getPortalPinStatus') return getPortalPinStatus(actor, data);
  if (action === 'ensureWarehouses') {
    requirePermission(actor, ['repair.branches.manage'], 'لا تملك صلاحية إدارة المراكز.');
    const branchId = text(data.branchId, 128);
    return { ok: true as const, ...(await ensureRepairCustomerWarehouses(actor.tenantId, branchId)) };
  }
  if (action === 'backfillCustomerCustody') {
    requirePermission(actor, ['repair.branches.manage'], 'لا تملك صلاحية تشغيل ترحيل العهدة.');
    const cursor = text(data.cursor, 128);
    let jobsQuery = db.collection(JOBS).where('tenantId', '==', actor.tenantId)
      .orderBy(FieldPath.documentId()).limit(2000);
    if (cursor) jobsQuery = jobsQuery.startAfter(cursor);
    const [branchesSnap, jobsSnap, productsSnap] = await Promise.all([
      db.collection(BRANCHES).where('tenantId', '==', actor.tenantId).limit(500).get(),
      jobsQuery.get(),
      db.collection('products').where('tenantId', '==', actor.tenantId).limit(5000).get(),
    ]);
    const productCatalogById = new Map(productsSnap.docs.map((product) => [product.id, product.data() as Json]));
    for (const branch of branchesSnap.docs) await ensureRepairCustomerWarehouses(actor.tenantId, branch.id);
    let custodyJobs = 0;
    let unrepairableJobs = 0;
    let cancelledForReview = 0;
    for (const jobDoc of jobsSnap.docs) {
      const job = jobDoc.data() as Json;
      const status = text(job.status, 60);
      if (status === 'delivered') continue;
      if (status === 'cancelled') { cancelledForReview += 1; continue; }
      const openStatuses = new Set([
        'received',
        'assigned',
        'diagnosing',
        'inspection',
        'estimate_ready',
        'waiting_customer_approval',
        'waiting_approval',
        'waiting_parts',
        'in_progress',
        'repairing',
        'repair',
        'quality_check',
        'testing',
        'ready',
        'unrepairable',
      ]);
      if (!openStatuses.has(status)) continue;
      await postJobCustody(jobDoc.id);
      const jobProducts = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[];
      for (let index = 0; index < jobProducts.length; index += 1) {
        const line = jobProducts[index];
        const productId = text(line.productId, 128);
        const catalog = productCatalogById.get(productId);
        if (!catalog) continue;
        const itemId = text(line.itemId || `item-${index + 1}`, 100);
        await db.collection(CUSTODY).doc(custodyId(jobDoc.id, itemId)).set({
          productName: text(catalog.name, 160) || text(line.productName, 160),
          productCode: text(catalog.code, 80),
          productBarcode: text(catalog.barcode, 120),
          customerPhone: text(job.customerPhone, 40),
          jobStatus: status,
          updatedAt: nowIso(),
        }, { merge: true });
      }
      custodyJobs += 1;
      if (status === 'unrepairable') {
        const migrationActor: Actor = { ...actor, isSuperAdmin: true };
        const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as Json[];
        for (let index = 0; index < products.length; index += 1) {
          const line = products[index];
          const itemId = text(line.itemId || `item-${index + 1}`, 100);
          const qty = Math.max(1, Number(line.receivedQuantity || line.quantity || 1));
          await recordUnrepairable(migrationActor, { jobId: jobDoc.id, itemId, quantity: qty,
            reasonNote: text(job.closedReason, 1000) || 'ترحيل طلب قديم غير قابل للإصلاح' },
          { allowLegacyReason: true });
        }
        unrepairableJobs += 1;
      }
    }
    let barcodeClaims = 0;
    const preparedBarcodes = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const product of productsSnap.docs) {
      const barcode = text(product.data().barcode, 120);
      if (!barcode) continue;
      const normalized = barcode.toUpperCase();
      const duplicate = preparedBarcodes.get(normalized);
      if (duplicate && duplicate.id !== product.id) {
        throw new HttpsError('failed-precondition', `الباركود ${barcode} مكرر بين منتجين. صححه قبل إعادة الترحيل.`);
      }
      preparedBarcodes.set(normalized, product);
    }
    const preparedEntries = Array.from(preparedBarcodes.entries());
    for (let offset = 0; offset < preparedEntries.length; offset += 400) {
      const chunk = preparedEntries.slice(offset, offset + 400);
      const refs = chunk.map(([normalized]) => db.collection('product_barcode_claims').doc(`${actor.tenantId}__${encodeURIComponent(normalized)}`));
      const claims = await db.getAll(...refs);
      claims.forEach((claim, index) => {
        const expectedProduct = chunk[index][1];
        if (claim.exists && text(claim.data()?.productId, 128) !== expectedProduct.id) {
          throw new HttpsError('failed-precondition', `الباركود ${chunk[index][0]} محجوز لمنتج آخر.`);
        }
      });
    }
    const productBatches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let batchSize = 0;
    for (const [normalized, product] of preparedEntries) {
      const claimId = `${actor.tenantId}__${encodeURIComponent(normalized)}`;
      batch.set(db.collection('product_barcode_claims').doc(claimId), {
        tenantId: actor.tenantId, barcode: normalized, productId: product.id, updatedAt: nowIso(),
      }, { merge: true });
      batch.set(product.ref, { barcodeNormalized: normalized }, { merge: true });
      barcodeClaims += 1;
      batchSize += 2;
      if (batchSize >= 450) { productBatches.push(batch); batch = db.batch(); batchSize = 0; }
    }
    if (batchSize) productBatches.push(batch);
    for (const writeBatch of productBatches) await writeBatch.commit();
    return { ok: true as const, branches: branchesSnap.size, custodyJobs, unrepairableJobs,
      cancelledForReview, barcodeClaims, truncated: jobsSnap.size >= 2000,
      nextCursor: jobsSnap.size ? jobsSnap.docs[jobsSnap.size - 1].id : '' };
  }
  if (action === 'postCustody') {
    requirePermission(actor, ['repair.custody.record', 'repair.jobs.create'], 'لا تملك صلاحية تسجيل العهدة.');
    return { ok: true as const, ...(await postJobCustody(text(data.jobId, 128))) };
  }
  if (action === 'createRepairJobWithCustody') return createDirectRepairJob(actor, data);
  if (action === 'assignRequest') return assignRequest(actor, data);
  if (action === 'receiveRequest') return receiveRequest(actor, data);
  if (action === 'recordUnrepairable') return recordUnrepairable(actor, data);
  if (action === 'reopenUnrepairable') return reopenUnrepairable(actor, data);
  if (action === 'handover') return handover(actor, data);
  if (action === 'listComplaintJobOptions') return listComplaintJobOptions(actor);
  if (action === 'createRepairComplaint') return createRepairComplaint(actor, data);
  if (action === 'listCallCenterJobs') return listCallCenterJobs(actor, data);
  if (action === 'listRepairFollowUps') return listRepairFollowUps(actor, data);
  if (action === 'createRepairFollowUp') return createRepairFollowUp(actor, data);
  if (action.includes('Replacement')) return mutateReplacement(actor, data);
  throw new HttpsError('invalid-argument', 'العملية المطلوبة غير معروفة.');
}
