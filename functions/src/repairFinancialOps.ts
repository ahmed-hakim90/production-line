import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import {
  buildInventoryMaterialMovements,
  buildPartQuantityDeltas,
  stockItemsBalanceDocId,
} from './repairSalesInvoiceStock.js';
import { loadCustomerType, pickRepairSalePrice } from './repairSalePrice.js';

const db = getDb();
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const INVENTORY_COUNTERS_COLLECTION = 'inventory_counters';
const SOURCE_SALES_INVOICE = 'repair_sales_invoice';

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  repairBranchIds: string[];
  inventoryWarehouseId: string;
};

type BranchDoc = {
  tenantId?: string;
  name?: string;
  warehouseId?: string;
  costCenterId?: string;
  accountingAccounts?: Record<string, unknown>;
  technicianIds?: string[];
  managerEmployeeId?: string;
  salesInvoicesLocked?: boolean;
  allowCreditSalesInvoices?: boolean;
};

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<Actor> => {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as {
    tenantId?: string;
    displayName?: string;
    name?: string;
    email?: string;
    roleId?: string;
    isActive?: boolean;
    isSuperAdmin?: boolean;
    repairBranchId?: string;
    repairBranchIds?: string[];
    inventoryWarehouseId?: string | null;
  };
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');

  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    if (!roleSnap.exists) throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    const role = roleSnap.data() as { tenantId?: string; permissions?: Record<string, boolean> };
    if (String(role.tenantId || '').trim() !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم خارج الشركة.');
    }
    permissions = role.permissions || {};
  }

  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid).trim() || uid,
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    repairBranchIds: Array.from(new Set([
      ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds : []),
      String(user.repairBranchId || ''),
    ].map((id) => String(id || '').trim()).filter(Boolean))),
    inventoryWarehouseId: String(user.inventoryWarehouseId || '').trim(),
  };
};

const requirePermission = (actor: Actor, keys: string[], message: string) => {
  if (actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true)) return;
  throw new HttpsError('permission-denied', message);
};

const assertBranchAccess = async (actor: Actor, branchId: string, branch: BranchDoc) => {
  if (
    actor.isSuperAdmin
    || actor.permissions['repair.branches.manage'] === true
    || actor.permissions['repair.callCenter.viewAll'] === true
    || actor.repairBranchIds.includes(branchId)
    || (
      actor.inventoryWarehouseId
      && actor.inventoryWarehouseId === String(branch.warehouseId || '').trim()
    )
  ) return;

  const technicianIds = Array.isArray(branch.technicianIds)
    ? branch.technicianIds.map(String).filter(Boolean).slice(0, 100)
    : [];
  if (technicianIds.includes(actor.uid)) return;
  const employeeIds = Array.from(new Set([
    ...technicianIds,
    String(branch.managerEmployeeId || '').trim(),
  ].filter(Boolean)));
  if (employeeIds.length > 0) {
    const snaps = await db.getAll(
      ...employeeIds.map((id) => db.collection('employees').doc(id)),
    );
    if (snaps.some((snap) => {
      const row = snap.data() as { tenantId?: string; userId?: string } | undefined;
      return snap.exists
        && String(row?.tenantId || '').trim() === actor.tenantId
        && String(row?.userId || '').trim() === actor.uid;
    })) return;
  }
  throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
};

const isActorBranchManager = async (actor: Actor, branch: BranchDoc): Promise<boolean> => {
  if (actor.isSuperAdmin || actor.permissions['repair.branches.manage'] === true) return true;
  const managerEmployeeId = String(branch.managerEmployeeId || '').trim();
  if (!managerEmployeeId) return false;
  const snap = await db.collection('employees').doc(managerEmployeeId).get();
  const row = snap.data() as { tenantId?: string; userId?: string } | undefined;
  return snap.exists
    && String(row?.tenantId || '').trim() === actor.tenantId
    && String(row?.userId || '').trim() === actor.uid;
};

const computeFinalCost = (job: Record<string, unknown>): number => {
  const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
  const products = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const partsCost = parts.reduce((sum, raw) => {
    const row = raw as Record<string, unknown>;
    return sum + money(row.quantity) * money(row.unitCost);
  }, 0);
  const computed = partsCost
    + money(job.laborCost)
    + money(job.serviceOnlyCost)
    + products.reduce((sum, raw) => sum + money((raw as Record<string, unknown>).finalCost), 0);
  const hasComponents = computed > 0;
  return money(job.finalCostOverride ?? (hasComponents ? computed : job.finalCost));
};

/**
 * Atomically closes a repair job and posts the exact outstanding amount to its
 * open treasury session. A deterministic entry id makes retries idempotent.
 */
export const deliverRepairJobAndCollectHandler = async (request: CallableRequest) => {
  const actor = await loadActor(requireAuth(request));
  requirePermission(actor, ['repair.jobs.edit', 'repair.jobs.technician'], 'ليس لديك صلاحية تسليم الطلب.');
  const payload = (request.data || {}) as { jobId?: string; warranty?: string };
  const jobId = String(payload.jobId || '').trim();
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId مطلوب.');

  const jobRef = db.collection('repair_jobs').doc(jobId);
  const initialJobSnap = await jobRef.get();
  if (!initialJobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  const initialJob = initialJobSnap.data() as Record<string, unknown>;
  if (String(initialJob.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'طلب الصيانة خارج شركتك.');
  }
  const branchId = String(initialJob.branchId || '').trim();
  if (!branchId) throw new HttpsError('failed-precondition', 'طلب الصيانة بلا فرع.');
  const branchSnap = await db.collection('repair_branches').doc(branchId).get();
  if (!branchSnap.exists) throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
  const branch = branchSnap.data() as BranchDoc;
  if (String(branch.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الفرع خارج شركتك.');
  }
  await assertBranchAccess(actor, branchId, branch);

  const settingsSnap = await db.collection('system_settings').doc(actor.tenantId).get();
  const configuredStatuses = (settingsSnap.data() as {
    repairSettings?: { workflow?: { statuses?: Array<{
      id?: string;
      order?: number;
      isEnabled?: boolean;
      isTerminal?: boolean;
    }> } };
  } | undefined)?.repairSettings?.workflow?.statuses;
  const enabledStatuses = (Array.isArray(configuredStatuses) && configuredStatuses.length > 0
    ? configuredStatuses
    : [
        { id: 'received', order: 1, isTerminal: false, isEnabled: true },
        { id: 'diagnosing', order: 2, isTerminal: false, isEnabled: true },
        { id: 'waiting_approval', order: 3, isTerminal: false, isEnabled: true },
        { id: 'waiting_parts', order: 4, isTerminal: false, isEnabled: true },
        { id: 'repairing', order: 5, isTerminal: false, isEnabled: true },
        { id: 'testing', order: 6, isTerminal: false, isEnabled: true },
        { id: 'ready', order: 7, isTerminal: false, isEnabled: true },
        { id: 'delivered', order: 8, isTerminal: true, isEnabled: true },
      ])
    .filter((row) => row.isEnabled !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const readyStatus = enabledStatuses.find((row) => String(row.id || '') === 'ready');
  const deliveredIndex = enabledStatuses.findIndex((row) => String(row.id || '') === 'delivered');
  const deliverySourceStatus = String(
    readyStatus?.id
    || enabledStatuses.slice(0, deliveredIndex >= 0 ? deliveredIndex : undefined)
      .filter((row) => row.isTerminal !== true)
      .at(-1)?.id
    || 'ready',
  );

  const previewFinalCost = computeFinalCost(initialJob);
  const previewPaid = Math.min(previewFinalCost, money(initialJob.paidAmount));
  const previewBalance = Math.max(0, previewFinalCost - previewPaid);
  let sessionRef: FirebaseFirestore.DocumentReference | null = null;
  if (previewBalance > 0.00001) {
    const openSessions = await db.collection('repair_treasury_sessions')
      .where('branchId', '==', branchId)
      .where('status', '==', 'open')
      .limit(5)
      .get();
    const session = openSessions.docs
      .filter((snap) => String(snap.data().tenantId || '').trim() === actor.tenantId)
      .sort((a, b) => String(b.data().openedAt || '').localeCompare(String(a.data().openedAt || '')))[0];
    if (!session) throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لهذا الفرع.');
    sessionRef = session.ref;
  }

  const entryRef = db.collection('repair_treasury_entries')
    .doc(`${actor.tenantId}__repair_delivery__${jobId}`);
  const eventRef = jobRef.collection('service_events').doc();
  const result = await db.runTransaction(async (tx) => {
    const currentJobSnap = await tx.get(jobRef);
    if (!currentJobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = currentJobSnap.data() as Record<string, unknown>;
    if (String(job.tenantId || '').trim() !== actor.tenantId || String(job.branchId || '').trim() !== branchId) {
      throw new HttpsError('permission-denied', 'تغيّر نطاق الطلب أثناء التنفيذ.');
    }
    const status = String(job.status || '').trim();
    const alreadyDelivered = status === 'delivered' || status === 'completed';
    if (job.isClosed === true && !alreadyDelivered) {
      throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن تسليمه.');
    }
    if (!alreadyDelivered && status !== deliverySourceStatus) {
      throw new HttpsError('failed-precondition', 'التسليم مسموح فقط بعد وصول الطلب إلى حالة «جاهز للتسليم».');
    }
    const pendingParts = (Array.isArray(job.partsUsed) ? job.partsUsed : [])
      .some((raw) => ['pending_supply', 'ready_to_issue']
        .includes(String((raw as Record<string, unknown>).fulfillmentStatus || '')));
    if (!alreadyDelivered && pendingParts) {
      throw new HttpsError('failed-precondition', 'لا يمكن التسليم قبل استلام وصرف كل قطع الغيار المعلقة.');
    }

    const finalCost = computeFinalCost(job);
    const paidAmount = Math.min(finalCost, money(job.paidAmount));
    const balanceDue = Math.max(0, finalCost - paidAmount);
    let treasuryEntryCreated = false;
    if (balanceDue > 0.00001) {
      if (!sessionRef) throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لهذا الفرع.');
      const [sessionSnap, existingEntrySnap] = await Promise.all([
        tx.get(sessionRef),
        tx.get(entryRef),
      ]);
      if (!sessionSnap.exists) throw new HttpsError('failed-precondition', 'جلسة الخزينة غير موجودة.');
      const session = sessionSnap.data() as Record<string, unknown>;
      if (
        String(session.tenantId || '').trim() !== actor.tenantId
        || String(session.branchId || '').trim() !== branchId
        || String(session.status || '') !== 'open'
      ) throw new HttpsError('failed-precondition', 'جلسة الخزينة لم تعد مفتوحة لهذا الفرع.');
      if (session.needsManualClose === true) {
        throw new HttpsError('failed-precondition', 'الخزينة تحتاج إقفالًا يدويًا قبل تسجيل التحصيل.');
      }
      const openedAt = String(session.openedAt || new Date().toISOString());
      const month = openedAt.slice(0, 7);
      const monthCloseRef = db.collection('repair_treasury_month_closes')
        .doc(`${actor.tenantId}_${branchId}_${month}`);
      const monthCloseSnap = await tx.get(monthCloseRef);
      if (monthCloseSnap.exists && String(monthCloseSnap.data()?.status || '') === 'closed') {
        throw new HttpsError('failed-precondition', `شهر ${month} مقفول لخزينة هذا الفرع.`);
      }
      if (!existingEntrySnap.exists) {
        tx.create(entryRef, {
          tenantId: actor.tenantId,
          branchId,
          sessionId: sessionRef.id,
          entryType: 'INCOME',
          amount: balanceDue,
          note: `تحصيل تسليم طلب صيانة #${String(job.receiptNo || jobId)}`,
          referenceId: jobId,
          source: 'repair_job_delivery',
          createdBy: actor.uid,
          createdByName: actor.displayName,
          createdAt: new Date().toISOString(),
        });
        treasuryEntryCreated = true;
      }
    }

    const at = new Date().toISOString();
    const history = Array.isArray(job.statusHistory) ? [...job.statusHistory] : [];
    if (!alreadyDelivered) {
      history.push({ status: 'delivered', at, technicianId: actor.uid });
      tx.create(eventRef, {
        tenantId: actor.tenantId,
        branchId,
        jobId,
        at,
        actorUid: actor.uid,
        actorName: actor.displayName,
        action: 'status_change',
        domainEvent: 'job.delivered',
        eventSchemaVersion: 1,
        statusBefore: status,
        statusAfter: 'delivered',
        note: balanceDue > 0 ? `تم التحصيل والترحيل للخزينة: ${balanceDue}` : 'تم التسليم بدون رصيد مستحق',
      });
    }
    const assignedAtMs = Date.parse(String(job.assignedAt || ''));
    const deliveredAt = String(job.deliveredAt || at);
    const deliveryAuthorizationNo = String(
      job.deliveryAuthorizationNo || `DEL-${String(job.receiptNo || jobId)}`,
    );
    tx.update(jobRef, {
      status: 'delivered',
      statusHistory: history,
      updatedAt: at,
      deliveredAt,
      deliveryAuthorizationNo,
      deliveryAuthorizationIssuedAt: String(job.deliveryAuthorizationIssuedAt || deliveredAt),
      deliveryAuthorizationIssuedBy: String(job.deliveryAuthorizationIssuedBy || actor.uid),
      deliveryAuthorizationIssuedByName: String(job.deliveryAuthorizationIssuedByName || actor.displayName),
      resolvedAt: String(job.resolvedAt || at),
      isClosed: true,
      closedReason: String(job.closedReason || 'delivered'),
      finalCost,
      paidAmount: finalCost,
      balanceDue: 0,
      paymentStatus: 'paid',
      warranty: String(payload.warranty || job.warranty || 'none'),
      ...(Number.isFinite(assignedAtMs)
        ? { resolutionMinutes: Math.max(0, Math.round((Date.parse(at) - assignedAtMs) / 60000)) }
        : {}),
    });
    return { finalCost, collectedAmount: balanceDue, treasuryEntryCreated, deliveryAuthorizationNo };
  });

  return { ok: true as const, jobId, ...result };
};

type SalesInvoiceLine = {
  partId: string;
  partName: string;
  materialId?: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  lineTotal: number;
};

const normalizeStoredInvoiceLines = (raw: unknown): SalesInvoiceLine[] => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new HttpsError('invalid-argument', 'أضف من بند واحد إلى 100 بند للفاتورة.');
  }
  return raw.map((value) => {
    const row = (value || {}) as Record<string, unknown>;
    const partId = String(row.partId || '').trim();
    const partName = String(row.partName || '').trim();
    const materialId = String(row.materialId || '').trim();
    const quantity = money(row.quantity);
    const unitPrice = money(row.unitPrice);
    const unitCost = money(row.unitCost);
    if (!partId || !partName || !(quantity > 0)) {
      throw new HttpsError('invalid-argument', 'يوجد بند غير صالح في الفاتورة.');
    }
    return {
      partId,
      partName,
      ...(materialId ? { materialId } : {}),
      quantity,
      unitPrice,
      unitCost,
      lineTotal: Math.round(quantity * unitPrice * 100) / 100,
    };
  });
};

type SalesInvoiceLineRequest = { partId: string; quantity: number };

const normalizeInvoiceLineRequests = (raw: unknown): SalesInvoiceLineRequest[] => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new HttpsError('invalid-argument', 'أضف من بند واحد إلى 100 بند للفاتورة.');
  }
  return raw.map((value) => {
    const row = (value || {}) as Record<string, unknown>;
    const partId = String(row.partId || '').trim();
    const quantity = money(row.quantity);
    if (!partId || !(quantity > 0)) {
      throw new HttpsError('invalid-argument', 'يوجد بند غير صالح في الفاتورة.');
    }
    return { partId, quantity };
  });
};

/** Resolve names and prices exclusively from the protected server-side material master. */
const resolveInvoiceLinesFromMaterials = async (
  actor: Actor,
  branchId: string,
  raw: unknown,
  customerType: string | null,
): Promise<SalesInvoiceLine[]> => {
  const requests = normalizeInvoiceLineRequests(raw);
  const partIds = Array.from(new Set(requests.map((row) => row.partId)));
  const partSnaps = await db.getAll(...partIds.map((id) => db.collection('repair_spare_parts').doc(id)));
  const partById = new Map<string, { name: string; materialId: string }>();
  for (const snap of partSnaps) {
    if (!snap.exists) throw new HttpsError('not-found', 'قطعة الغيار غير موجودة في كتالوج الفرع.');
    const row = snap.data() as Record<string, unknown>;
    if (String(row.tenantId || '') !== actor.tenantId || String(row.branchId || '') !== branchId) {
      throw new HttpsError('permission-denied', 'قطعة الغيار خارج الفرع أو الشركة.');
    }
    const materialId = String(row.materialId || row.rawMaterialId || '').trim();
    if (!materialId) {
      throw new HttpsError('failed-precondition', `اربط القطعة ${String(row.name || snap.id)} بماستر الخامات قبل البيع.`);
    }
    partById.set(snap.id, { name: String(row.name || '').trim(), materialId });
  }
  const materialIds = Array.from(new Set(Array.from(partById.values()).map((row) => row.materialId)));
  const materialSnaps = await db.getAll(...materialIds.map((id) => db.collection('materials').doc(id)));
  const materialById = new Map<string, { name: string; unitPrice: number; unitCost: number }>();
  for (const snap of materialSnaps) {
    const row = snap.data() as Record<string, unknown> | undefined;
    if (!snap.exists || String(row?.tenantId || '') !== actor.tenantId || row?.isActive === false) {
      throw new HttpsError('failed-precondition', 'أحد أصناف الفاتورة غير نشط أو خارج الشركة.');
    }
    const rawConsumer = Number(row?.defaultSalePrice);
    if (!Number.isFinite(rawConsumer) || rawConsumer < 0) {
      throw new HttpsError('failed-precondition', `سعر البيع غير مضبوط للصنف ${String(row?.name || snap.id)}.`);
    }
    const unitPrice = pickRepairSalePrice({
      customerType,
      consumerSalePrice: rawConsumer,
      traderSalePrice: row?.traderSalePrice,
    });
    materialById.set(snap.id, {
      name: String(row?.name || '').trim(),
      unitPrice: Math.round(unitPrice * 100) / 100,
      unitCost: Math.round(money(row?.purchaseCost) * 100) / 100,
    });
  }
  return requests.map((requestRow) => {
    const part = partById.get(requestRow.partId)!;
    const material = materialById.get(part.materialId);
    if (!material) throw new HttpsError('failed-precondition', 'تعذر قراءة سعر الصنف من ماستر الخامات.');
    return {
      partId: requestRow.partId,
      partName: material.name || part.name || requestRow.partId,
      materialId: part.materialId,
      quantity: requestRow.quantity,
      unitPrice: material.unitPrice,
      unitCost: material.unitCost,
      lineTotal: Math.round(requestRow.quantity * material.unitPrice * 100) / 100,
    };
  });
};

const invoiceLineQuantities = (lines: SalesInvoiceLine[]) => {
  const result = new Map<string, { quantity: number; partName: string }>();
  for (const line of lines) {
    const previous = result.get(line.partId);
    result.set(line.partId, {
      quantity: money(previous?.quantity) + line.quantity,
      partName: line.partName || previous?.partName || '',
    });
  }
  return result;
};

const getOpenTreasurySession = async (actor: Actor, branchId: string, required: boolean) => {
  if (!required) return null;
  const snap = await db.collection('repair_treasury_sessions')
    .where('branchId', '==', branchId)
    .where('status', '==', 'open')
    .limit(5)
    .get();
  const session = snap.docs
    .filter((row) => String(row.data().tenantId || '').trim() === actor.tenantId)
    .sort((a, b) => String(b.data().openedAt || '').localeCompare(String(a.data().openedAt || '')))[0];
  if (!session) throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لهذا الفرع.');
  return session.ref;
};

const formatInvoiceNo = (sequence: number) => `RSI-${String(sequence).padStart(5, '0')}`;
const stockDocId = (branchId: string, partId: string, warehouseId?: string) =>
  warehouseId ? `${branchId}__${warehouseId}__${partId}` : `${branchId}__${partId}`;

type SalesInvoiceOperation = 'prepare' | 'resolve_discount' | 'post' | 'cancel';
type SalesInvoicePaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'credit';

const invoiceDiscount = (gross: number, type: string, rawValue: unknown) => {
  const value = money(rawValue);
  if (type === 'percent' && value > 100) throw new HttpsError('invalid-argument', 'نسبة الخصم لا تتجاوز 100%.');
  const amount = type === 'amount'
    ? value
    : type === 'percent' ? Math.round(gross * value) / 100 : 0;
  if (amount > gross + 0.001) throw new HttpsError('invalid-argument', 'الخصم أكبر من إجمالي الفاتورة.');
  return { type: ['amount', 'percent'].includes(type) ? type : 'none', value, amount: Math.round(amount * 100) / 100 };
};

const requireInvoiceAccounting = async (
  actor: Actor,
  branch: BranchDoc,
  opts?: { credit?: boolean },
) => {
  const costCenterId = String(branch.costCenterId || '').trim();
  const accounts = branch.accountingAccounts && typeof branch.accountingAccounts === 'object'
    ? branch.accountingAccounts : {};
  const required = opts?.credit
    ? ['receivables', 'partsRevenue', 'discounts', 'partsInventory', 'partsCogs']
    : ['cash', 'card', 'bankTransfer', 'partsRevenue', 'discounts', 'partsInventory', 'partsCogs'];
  const missing = required.filter((key) => !String(accounts[key] || '').trim());
  if (!costCenterId) throw new HttpsError('failed-precondition', 'اربط الفرع بمركز تكلفة قبل ترحيل الفاتورة.');
  if (missing.length) throw new HttpsError('failed-precondition', `أكمل ربط حسابات الفرع: ${missing.join(', ')}`);
  const costCenterSnap = await db.collection('cost_centers').doc(costCenterId).get();
  if (!costCenterSnap.exists || String(costCenterSnap.data()?.tenantId || '') !== actor.tenantId || costCenterSnap.data()?.isActive === false) {
    throw new HttpsError('failed-precondition', 'مركز تكلفة الفرع غير صالح أو غير نشط.');
  }
  return { costCenterId, accounts };
};

const assertBranchAllowsCreditSalesInvoice = (branch: BranchDoc) => {
  if (branch.allowCreditSalesInvoices === true) return;
  throw new HttpsError(
    'failed-precondition',
    'فواتير البيع الآجلة غير مفعّلة لهذا المركز من إعدادات الفرع.',
  );
};

/** Draft/approval/post/reversal workflow for spare-parts sales invoices. */
export const mutateRepairSalesInvoiceHandler = async (request: CallableRequest) => {
  const actor = await loadActor(requireAuth(request));
  const payload = (request.data || {}) as {
    operation?: SalesInvoiceOperation;
    id?: string;
    branchId?: string;
    repairJobId?: string;
    lines?: unknown;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    cancelReason?: string;
    discountType?: 'none' | 'amount' | 'percent';
    discountValue?: number;
    approve?: boolean;
    rejectionReason?: string;
    paymentMethod?: SalesInvoicePaymentMethod;
  };
  const operation = String(payload.operation || '') as SalesInvoiceOperation;
  if (!['prepare', 'resolve_discount', 'post', 'cancel'].includes(operation)) {
    throw new HttpsError('invalid-argument', 'نوع عملية الفاتورة غير صالح.');
  }
  const requiredPermission = operation === 'prepare' ? 'repair.salesInvoice.create'
    : operation === 'resolve_discount' ? 'repair.discounts.approve'
      : operation === 'post' ? 'repair.salesInvoice.create' : 'repair.salesInvoice.cancel';
  requirePermission(actor, [requiredPermission], 'ليس لديك صلاحية تنفيذ عملية الفاتورة.');

  const existingRef = payload.id
    ? db.collection('repair_sales_invoices').doc(String(payload.id).trim())
    : null;
  const existingSnap = existingRef ? await existingRef.get() : null;
  const existing = existingSnap?.exists ? existingSnap.data() as Record<string, unknown> : null;
  if (operation !== 'prepare' && (!existingRef || !existing)) {
    throw new HttpsError('not-found', 'الفاتورة غير موجودة.');
  }
  if (existing && String(existing.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الفاتورة خارج شركتك.');
  }
  const branchId = String(operation === 'prepare' && !existing ? payload.branchId : existing?.branchId || '').trim();
  if (!branchId) throw new HttpsError('invalid-argument', 'الفرع مطلوب.');
  if (operation === 'prepare' && existing && payload.branchId && String(payload.branchId).trim() !== branchId) {
    throw new HttpsError('failed-precondition', 'لا يمكن نقل الفاتورة إلى فرع آخر.');
  }
  const branchSnap = await db.collection('repair_branches').doc(branchId).get();
  if (!branchSnap.exists) throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
  const branch = branchSnap.data() as BranchDoc;
  if (String(branch.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الفرع خارج شركتك.');
  }
  await assertBranchAccess(actor, branchId, branch);
  if (
    operation !== 'prepare'
    && !actor.isSuperAdmin
    && actor.permissions[requiredPermission] !== true
    && !(await isActorBranchManager(actor, branch))
  ) {
    throw new HttpsError('permission-denied', 'هذه العملية متاحة لمسؤول الفرع أو صاحب الصلاحية فقط.');
  }
  if (
    (operation === 'prepare' || operation === 'post')
    && branch.salesInvoicesLocked === true
  ) {
    throw new HttpsError('failed-precondition', 'فواتير مبيعات القطع مقفلة لهذا المركز من إعدادات الفرع.');
  }
  const requestedPaymentMethod = String(
    payload.paymentMethod
    || (existing ? existing.paymentMethod : '')
    || 'cash',
  ).trim() as SalesInvoicePaymentMethod;
  if (
    (operation === 'prepare' || operation === 'post')
    && requestedPaymentMethod === 'credit'
  ) {
    assertBranchAllowsCreditSalesInvoice(branch);
  }
  if (requestedPaymentMethod && !['cash', 'card', 'bank_transfer', 'credit'].includes(requestedPaymentMethod)) {
    throw new HttpsError('invalid-argument', 'وسيلة الدفع غير صالحة.');
  }
  const warehouseId = String(branch.warehouseId || '').trim();
  if (!warehouseId) throw new HttpsError('failed-precondition', 'لا يوجد مخزن مرتبط بفرع الصيانة.');

  let invoiceCustomer: Record<string, unknown> | null = null;
  const requestedCustomerId = String(payload.customerId || '').trim();
  if (operation === 'prepare') {
    if (!requestedCustomerId) throw new HttpsError('invalid-argument', 'اختيار العميل مطلوب قبل حفظ الفاتورة.');
    const customerSnap = await db.collection('customers').doc(requestedCustomerId).get();
    const customer = customerSnap.data() as Record<string, unknown> | undefined;
    if (!customerSnap.exists || String(customer?.tenantId || '') !== actor.tenantId || customer?.isActive === false) {
      throw new HttpsError('failed-precondition', 'العميل غير موجود أو غير نشط أو خارج الشركة.');
    }
    invoiceCustomer = customer || null;
  }

  if (operation === 'resolve_discount') {
    const invoiceRef = existingRef!;
    const approve = payload.approve === true;
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(invoiceRef);
      const row = snap.data() as Record<string, unknown> | undefined;
      if (!snap.exists || String(row?.tenantId || '') !== actor.tenantId) throw new HttpsError('not-found', 'الفاتورة غير موجودة.');
      if (String(row?.status || '') !== 'pending_discount_approval') throw new HttpsError('failed-precondition', 'لا يوجد خصم معلق لهذه الفاتورة.');
      if (String(row?.discountRequestedBy || '') === actor.uid) throw new HttpsError('permission-denied', 'لا يمكن لمقدم الخصم اعتماد طلبه.');
      const at = new Date().toISOString();
      tx.update(invoiceRef, {
        status: approve ? 'ready_to_post' : 'draft',
        discountApprovalStatus: approve ? 'approved' : 'rejected',
        discountApprovedBy: approve ? actor.uid : '',
        discountApprovedByName: approve ? actor.displayName : '',
        discountApprovedAt: approve ? at : '',
        discountRejectionReason: approve ? '' : String(payload.rejectionReason || '').trim(),
        updatedAt: at,
      });
      return { invoiceNo: String(row?.invoiceNo || ''), total: money(row?.total), revision: money(row?.revision) };
    });
    return { ok: true as const, operation, id: invoiceRef.id, ...result };
  }

  const customerType = operation === 'prepare'
    ? await loadCustomerType(db, actor.tenantId, requestedCustomerId)
    : null;
  const nextLines = operation === 'prepare'
    ? await resolveInvoiceLinesFromMaterials(actor, branchId, payload.lines, customerType)
    : (operation === 'post' ? normalizeStoredInvoiceLines(existing?.lines) : []);
  const previousLines = Array.isArray(existing?.lines)
    ? normalizeStoredInvoiceLines(existing?.lines)
    : [];
  const previousTotal = money(existing?.total);
  const grossAmount = operation === 'prepare'
    ? Math.round(nextLines.reduce((sum, row) => sum + row.lineTotal, 0) * 100) / 100
    : money(existing?.grossAmount || existing?.total);
  const discount = operation === 'prepare'
    ? invoiceDiscount(grossAmount, String(payload.discountType || 'none'), payload.discountValue)
    : { type: String(existing?.discountType || 'none'), value: money(existing?.discountValue), amount: money(existing?.discountAmount) };
  const nextTotal = operation === 'cancel' ? 0 : Math.round((grossAmount - discount.amount) * 100) / 100;
  const invoiceRef = existingRef || db.collection('repair_sales_invoices').doc();

  if (operation === 'prepare') {
    const result = await db.runTransaction(async (tx) => {
      const currentSnap = existingRef ? await tx.get(invoiceRef) : null;
      const current = currentSnap?.data() as Record<string, unknown> | undefined;
      if (current && !['draft', 'pending_discount_approval', 'ready_to_post'].includes(String(current.status || ''))) {
        throw new HttpsError('failed-precondition', 'لا يمكن تعديل فاتورة مرحّلة أو معكوسة.');
      }
      const counterRef = db.collection('repair_counters').doc(`${actor.tenantId}__sales_invoice`);
      const counterSnap = existingRef ? null : await tx.get(counterRef);
      const sequence = existingRef ? 0 : Math.max(0, Math.floor(money(counterSnap?.data()?.value))) + 1;
      const invoiceNo = String(current?.invoiceNo || formatInvoiceNo(sequence));
      const revision = Math.max(0, Math.floor(money(current?.revision))) + 1;
      const at = new Date().toISOString();
      const status = discount.amount > 0 ? 'pending_discount_approval' : 'ready_to_post';
      const docData = {
        tenantId: actor.tenantId, branchId, invoiceNo, status, warehouseId,
        warehouseName: String(branch.name || '').trim() ? `مخزن ${String(branch.name || '').trim()}` : warehouseId,
        repairJobId: String(payload.repairJobId || current?.repairJobId || '').trim(),
        customerId: requestedCustomerId,
        customerName: String(invoiceCustomer?.name || '').trim(),
        customerPhone: String(invoiceCustomer?.phone || '').trim(),
        customerCode: String(invoiceCustomer?.code || '').trim(),
        notes: String(payload.notes || '').trim(),
        grossAmount, discountType: discount.type, discountValue: discount.value, discountAmount: discount.amount,
        total: nextTotal, taxRate: 0, taxAmount: 0,
        paymentMethod: String(payload.paymentMethod || current?.paymentMethod || 'cash'),
        isCreditSale: String(payload.paymentMethod || current?.paymentMethod || 'cash') === 'credit',
        lines: nextLines, revision, discountApprovalStatus: discount.amount > 0 ? 'pending' : 'not_required',
        discountRequestedBy: discount.amount > 0 ? actor.uid : '', discountRequestedByName: discount.amount > 0 ? actor.displayName : '',
        discountRequestedAt: discount.amount > 0 ? at : '', updatedAt: at, updatedBy: actor.uid, updatedByName: actor.displayName,
        createdBy: String(current?.createdBy || actor.uid), createdByName: String(current?.createdByName || actor.displayName),
        createdAt: String(current?.createdAt || at),
      };
      if (existingRef) tx.set(invoiceRef, docData, { merge: true });
      else {
        tx.set(counterRef, { tenantId: actor.tenantId, value: sequence, updatedAt: at }, { merge: true });
        tx.create(invoiceRef, docData);
      }
      tx.set(db.collection('customer_activities').doc(`repair-sales-invoice-prepared__${invoiceRef.id}__v${revision}`), {
        tenantId: actor.tenantId, customerId: requestedCustomerId, module: 'repair',
        action: 'repair.invoice_created', title: 'فاتورة بيع قطع غيار',
        summary: `فاتورة ${invoiceNo} · الصافي ${nextTotal}`,
        referenceType: 'repair_sales_invoice', referenceId: invoiceRef.id, referenceLabel: invoiceNo,
        at, actorUid: actor.uid, actorName: actor.displayName,
      });
      return { invoiceNo, total: nextTotal, revision, status };
    });
    return { ok: true as const, operation, id: invoiceRef.id, ...result };
  }

  const isCreditSale = String(
    operation === 'post'
      ? (existing?.paymentMethod || payload.paymentMethod || 'cash')
      : (existing?.paymentMethod || 'cash'),
  ) === 'credit'
    || existing?.isCreditSale === true;
  if (isCreditSale && operation === 'post') {
    assertBranchAllowsCreditSalesInvoice(branch);
  }
  const accounting = await requireInvoiceAccounting(actor, branch, { credit: isCreditSale });
  // Credit sales post to AR — no cash till movement on post/cancel of the receivable leg.
  const previewTreasuryDelta = isCreditSale
    ? 0
    : (operation === 'post' ? nextTotal : -previousTotal);
  const sessionRef = await getOpenTreasurySession(actor, branchId, Math.abs(previewTreasuryDelta) > 0.00001);

  const result = await db.runTransaction(async (tx) => {
    const currentInvoiceSnap = await tx.get(invoiceRef);
    const current = currentInvoiceSnap?.exists
      ? currentInvoiceSnap.data() as Record<string, unknown>
      : null;
    if (!current) throw new HttpsError('not-found', 'الفاتورة غير موجودة.');
    if (current && String(current.tenantId || '').trim() !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'الفاتورة خارج شركتك.');
    }
    if (current && String(current.status || 'active') === 'cancelled') {
      throw new HttpsError('failed-precondition', 'الفاتورة ملغاة بالفعل.');
    }
    if (operation === 'post' && String(current?.status || '') !== 'ready_to_post') {
      throw new HttpsError('failed-precondition', 'الفاتورة ليست جاهزة للترحيل أو الخصم لم يعتمد.');
    }
    if (operation === 'cancel' && String(current?.status || '') !== 'posted') {
      throw new HttpsError('failed-precondition', 'يمكن عكس الفاتورة بعد ترحيلها فقط.');
    }
    const currentPreviousTotal = money(current?.total);
    const creditInvoice = isCreditSale
      || String(current?.paymentMethod || '') === 'credit'
      || current?.isCreditSale === true;
    const treasuryDelta = creditInvoice
      ? 0
      : (operation === 'post' ? nextTotal : -currentPreviousTotal);
    if (Math.abs(treasuryDelta) > 0.00001 && !sessionRef) {
      throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لتسجيل تسوية الفاتورة الحالية.');
    }

    let invoiceNo = String(current?.invoiceNo || '');
    const revision = Math.max(0, Math.floor(money(current?.revision))) + 1;
    const treasuryEntryRef = db.collection('repair_treasury_entries')
      .doc(`${actor.tenantId}__repair_invoice__${invoiceRef.id}__v${revision}`);
    const journalRef = db.collection('accounting_journal_entries')
      .doc(`${actor.tenantId}__repair_invoice__${invoiceRef.id}__${operation}__v${revision}`);

    let session: Record<string, unknown> | null = null;
    let monthCloseSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let treasuryEntrySnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (sessionRef) {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new HttpsError('failed-precondition', 'جلسة الخزينة غير موجودة.');
      session = sessionSnap.data() as Record<string, unknown>;
      if (
        String(session.tenantId || '').trim() !== actor.tenantId
        || String(session.branchId || '').trim() !== branchId
        || String(session.status || '') !== 'open'
        || session.needsManualClose === true
      ) throw new HttpsError('failed-precondition', 'جلسة الخزينة غير متاحة لتسجيل الحركة.');
      const month = String(session.openedAt || new Date().toISOString()).slice(0, 7);
      monthCloseSnap = await tx.get(
        db.collection('repair_treasury_month_closes').doc(`${actor.tenantId}_${branchId}_${month}`),
      );
      treasuryEntrySnap = await tx.get(treasuryEntryRef);
    }
    if (monthCloseSnap?.exists && String(monthCloseSnap.data()?.status || '') === 'closed') {
      throw new HttpsError('failed-precondition', 'شهر جلسة الخزينة مقفول.');
    }

    const oldMap = invoiceLineQuantities(
      operation === 'post'
        ? []
        : (Array.isArray(current?.lines) ? normalizeStoredInvoiceLines(current.lines) : previousLines),
    );
    const newMap = invoiceLineQuantities(operation === 'cancel' ? [] : nextLines);
    const partDeltas = buildPartQuantityDeltas(oldMap, newMap);
    const partIds = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]));

    // Resolve material links from catalog (server SoT — ignore client materialId for path).
    const partMetaByPartId = new Map<string, { materialId?: string; partName?: string }>();
    const partSnaps = partIds.length > 0
      ? await Promise.all(partIds.map((partId) => tx.get(db.collection('repair_spare_parts').doc(partId))))
      : [];
    for (let i = 0; i < partIds.length; i += 1) {
      const partId = partIds[i];
      const snap = partSnaps[i];
      if (!snap.exists) {
        // Allow cancel/update of historical lines whose catalog row was removed: treat as legacy.
        partMetaByPartId.set(partId, {
          partName: newMap.get(partId)?.partName || oldMap.get(partId)?.partName || partId,
        });
        continue;
      }
      const data = snap.data() as {
        tenantId?: string;
        branchId?: string;
        materialId?: string;
        rawMaterialId?: string;
        name?: string;
      };
      if (String(data.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'قطعة خارج شركتك.');
      }
      if (String(data.branchId || '').trim() !== branchId) {
        throw new HttpsError('failed-precondition', 'القطعة لا تتبع فرع الفاتورة.');
      }
      const materialId = String(data.materialId || data.rawMaterialId || '').trim();
      partMetaByPartId.set(partId, {
        materialId: materialId || undefined,
        partName: String(data.name || '').trim()
          || newMap.get(partId)?.partName
          || oldMap.get(partId)?.partName
          || partId,
      });
    }

    const inventoryMovements = buildInventoryMaterialMovements(partDeltas, partMetaByPartId);
    const inventoryPartIds = new Set(
      inventoryMovements.flatMap((row) => row.partIds),
    );

    // Branch ledger rows (sync for inventory path + SoT for legacy).
    const stockRows = new Map<string, {
      ref: FirebaseFirestore.DocumentReference;
      current: number;
      partName: string;
      delta: number;
      isInventoryLinked: boolean;
    }>();
    for (const partId of partIds) {
      const exactRef = db.collection('repair_spare_parts_stock')
        .doc(stockDocId(branchId, partId, warehouseId));
      const legacyRef = db.collection('repair_spare_parts_stock')
        .doc(stockDocId(branchId, partId));
      const [exactSnap, legacySnap] = await Promise.all([tx.get(exactRef), tx.get(legacyRef)]);
      const selectedSnap = exactSnap.exists ? exactSnap : legacySnap;
      const selectedRef = exactSnap.exists ? exactRef : (legacySnap.exists ? legacyRef : exactRef);
      if (selectedSnap.exists && String(selectedSnap.data()?.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'رصيد قطعة خارج الشركة.');
      }
      const oldQty = money(oldMap.get(partId)?.quantity);
      const newQty = money(newMap.get(partId)?.quantity);
      const delta = oldQty - newQty;
      const currentQty = money(selectedSnap.data()?.quantity);
      const isInventoryLinked = inventoryPartIds.has(partId)
        || Boolean(partMetaByPartId.get(partId)?.materialId);
      if (!isInventoryLinked && currentQty + delta < -0.00001) {
        throw new HttpsError('failed-precondition', `الكمية غير كافية للقطعة: ${newMap.get(partId)?.partName || partId}`);
      }
      stockRows.set(partId, {
        ref: selectedRef,
        current: currentQty,
        partName: newMap.get(partId)?.partName || oldMap.get(partId)?.partName || partId,
        delta,
        isInventoryLinked,
      });
    }

    // Inventory SoT reads
    const invBalanceRefs = inventoryMovements.map((row) =>
      db.collection(STOCK_ITEMS_COLLECTION).doc(stockItemsBalanceDocId(warehouseId, row.materialId)));
    const invCounterRef = inventoryMovements.length > 0
      ? db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId)
      : null;
    const invBalanceSnaps = invBalanceRefs.length > 0
      ? await Promise.all(invBalanceRefs.map((ref) => tx.get(ref)))
      : [];
    const invCounterSnap = invCounterRef ? await tx.get(invCounterRef) : null;
    let nextInvSeq = invCounterSnap
      ? Math.max(1, Math.floor(money(invCounterSnap.data()?.lastInvSeq) + 1))
      : 1;

    for (let i = 0; i < inventoryMovements.length; i += 1) {
      const movement = inventoryMovements[i];
      const balSnap = invBalanceSnaps[i];
      if (balSnap.exists && String(balSnap.data()?.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'رصيد مخزن خارج الشركة.');
      }
      const balQty = money(balSnap.data()?.quantity);
      if (movement.direction === 'OUT' && balQty - movement.quantity < -0.00001) {
        throw new HttpsError(
          'failed-precondition',
          `الكمية غير كافية في مخزن المركز للصنف: ${movement.partName}`,
        );
      }
    }

    const at = new Date().toISOString();

    // Inventory SoT writes
    for (let i = 0; i < inventoryMovements.length; i += 1) {
      const movement = inventoryMovements[i];
      const balRef = invBalanceRefs[i];
      const balSnap = invBalanceSnaps[i];
      const balQty = money(balSnap.data()?.quantity);
      const nextQty = movement.direction === 'OUT'
        ? balQty - movement.quantity
        : balQty + movement.quantity;
      tx.set(balRef, {
        warehouseId,
        warehouseName: String(branch.name || '').trim()
          ? `مخزن ${String(branch.name || '').trim()}`
          : warehouseId,
        itemType: 'material',
        itemId: movement.materialId,
        itemName: movement.partName,
        quantity: Math.max(0, nextQty),
        updatedAt: at,
        lastMovementAt: at,
        tenantId: actor.tenantId,
      }, { merge: true });

      const txnRef = db.collection(STOCK_TRANSACTIONS_COLLECTION).doc();
      const referenceNo = `INV-${String(nextInvSeq).padStart(6, '0')}`;
      nextInvSeq += 1;
      tx.create(txnRef, {
        tenantId: actor.tenantId,
        warehouseId,
        itemType: 'material',
        itemId: movement.materialId,
        itemName: movement.partName,
        movementType: movement.direction,
        quantity: movement.quantity,
        sourceModule: SOURCE_SALES_INVOICE,
        sourceId: invoiceRef.id,
        referenceNo,
        notes: `${operation === 'post' ? 'بيع' : 'عكس'} فاتورة ${invoiceNo}`,
        createdBy: actor.uid,
        createdByName: actor.displayName,
        createdAt: at,
      });
    }
    if (invCounterRef && inventoryMovements.length > 0) {
      tx.set(invCounterRef, {
        tenantId: actor.tenantId,
        lastInvSeq: nextInvSeq - 1,
        updatedAt: at,
      }, { merge: true });
    }

    // Branch ledger sync / legacy SoT
    for (const [partId, stock] of stockRows.entries()) {
      if (Math.abs(stock.delta) <= 0.00001) continue;
      // Inventory-linked: sync mirror even if current ledger was 0 (seed from inventory path).
      const nextLegacyQty = stock.isInventoryLinked
        ? Math.max(0, stock.current + stock.delta)
        : Math.max(0, stock.current + stock.delta);
      tx.set(stock.ref, {
        tenantId: actor.tenantId,
        branchId,
        warehouseId,
        partId,
        partName: stock.partName,
        quantity: nextLegacyQty,
        updatedAt: at,
      }, { merge: true });
      const movementRef = db.collection('repair_parts_transactions').doc();
      tx.create(movementRef, {
        tenantId: actor.tenantId,
        branchId,
        partId,
        partName: stock.partName,
        type: stock.delta < 0 ? 'OUT' : 'IN',
        quantity: Math.abs(stock.delta),
        referenceId: invoiceRef.id,
        notes: `${operation === 'post' ? 'بيع' : 'عكس'} فاتورة ${invoiceNo}`,
        createdBy: actor.displayName,
        createdAt: at,
      });
    }

    const enrichedLines = (operation === 'cancel' ? [] : nextLines).map((line) => {
      const materialId = String(partMetaByPartId.get(line.partId)?.materialId || line.materialId || '').trim();
      return materialId ? { ...line, materialId } : line;
    });

    if (operation === 'post') {
      tx.update(invoiceRef, {
        lines: enrichedLines,
        total: nextTotal,
        status: 'posted',
        isCreditSale: creditInvoice,
        paymentStatus: creditInvoice ? 'unpaid' : 'paid',
        balanceDue: creditInvoice ? nextTotal : 0,
        postedAt: at,
        postedBy: actor.uid,
        postedByName: actor.displayName,
        revision,
        updatedAt: at,
        updatedBy: actor.uid,
        updatedByName: actor.displayName,
      });
      if (String(current.customerId || '').trim()) {
        tx.set(db.collection('customer_activities').doc(`repair-sales-invoice-posted__${invoiceRef.id}__v${revision}`), {
          tenantId: actor.tenantId, customerId: String(current.customerId || ''), module: 'repair',
          action: 'repair.invoice_posted', title: 'تم ترحيل فاتورة بيع قطع غيار',
          summary: `فاتورة ${invoiceNo} · الصافي ${nextTotal}`,
          referenceType: 'repair_sales_invoice', referenceId: invoiceRef.id, referenceLabel: invoiceNo,
          at, actorUid: actor.uid, actorName: actor.displayName,
        });
      }
    } else {
      tx.update(invoiceRef, {
        status: 'cancelled',
        revision,
        cancelledAt: at,
        cancelledBy: actor.uid,
        cancelledByName: actor.displayName,
        cancelReason: String(payload.cancelReason || '').trim(),
        updatedAt: at,
        updatedBy: actor.uid,
        updatedByName: actor.displayName,
      });
      if (String(current.customerId || '').trim()) {
        tx.set(db.collection('customer_activities').doc(`repair-sales-invoice-cancelled__${invoiceRef.id}__v${revision}`), {
          tenantId: actor.tenantId, customerId: String(current.customerId || ''), module: 'repair',
          action: 'repair.invoice_cancelled', title: 'تم إلغاء فاتورة بيع قطع غيار',
          summary: String(payload.cancelReason || '').trim() || invoiceNo,
          referenceType: 'repair_sales_invoice', referenceId: invoiceRef.id, referenceLabel: invoiceNo,
          at, actorUid: actor.uid, actorName: actor.displayName,
        });
      }
    }

    if (sessionRef && session && Math.abs(treasuryDelta) > 0.00001 && !treasuryEntrySnap?.exists) {
      tx.create(treasuryEntryRef, {
        tenantId: actor.tenantId,
        branchId,
        sessionId: sessionRef.id,
        entryType: treasuryDelta > 0 ? 'INCOME' : 'EXPENSE',
        amount: Math.abs(treasuryDelta),
        paymentMethod: String(current.paymentMethod || 'cash'),
        costCenterId: String(branch.costCenterId || ''),
        sourceId: invoiceRef.id,
        note: operation === 'post'
          ? `تحصيل فاتورة بيع قطع غيار ${invoiceNo}`
          : `عكس فاتورة بيع قطع غيار ${invoiceNo}`,
        referenceId: operation === 'post' ? invoiceRef.id : `${invoiceRef.id}:cancel:v${revision}`,
        source: 'repair_sales_invoice',
        journalEntryId: journalRef.id,
        createdBy: actor.uid,
        createdByName: actor.displayName,
        createdAt: at,
      });
    }

    const gross = money(current.grossAmount || current.total);
    const invoiceDiscountAmount = money(current.discountAmount);
    const net = money(current.total);
    const cogs = Math.round((Array.isArray(current.lines) ? current.lines : []).reduce((sum, raw) => {
      const row = raw as Record<string, unknown>;
      return sum + money(row.quantity) * money(row.unitCost);
    }, 0) * 100) / 100;
    const accountMap = accounting.accounts;
    const paymentMethod = String(current.paymentMethod || 'cash');
    const debitAccount = creditInvoice
      ? String(accountMap.receivables || '')
      : paymentMethod === 'card'
        ? String(accountMap.card || '')
        : paymentMethod === 'bank_transfer'
          ? String(accountMap.bankTransfer || '')
          : String(accountMap.cash || '');
    const debitAccountName = creditInvoice
      ? 'ذمم عملاء — فاتورة قطع آجلة'
      : 'وسيلة تحصيل فاتورة قطع الغيار';
    const costCenterId = accounting.costCenterId;
    const postLines = [
      ...(net > 0 ? [{ accountCode: debitAccount, accountName: debitAccountName, debit: net, credit: 0, costCenterId }] : []),
      ...(invoiceDiscountAmount > 0 ? [{ accountCode: String(accountMap.discounts || ''), accountName: 'خصومات قطع الغيار', debit: invoiceDiscountAmount, credit: 0, costCenterId }] : []),
      ...(gross > 0 ? [{ accountCode: String(accountMap.partsRevenue || ''), accountName: 'إيراد قطع الغيار', debit: 0, credit: gross, costCenterId }] : []),
      ...(cogs > 0 ? [
        { accountCode: String(accountMap.partsCogs || ''), accountName: 'تكلفة قطع الغيار المباعة', debit: cogs, credit: 0, costCenterId },
        { accountCode: String(accountMap.partsInventory || ''), accountName: 'مخزون قطع الغيار', debit: 0, credit: cogs, costCenterId },
      ] : []),
    ];
    const journalLines = operation === 'post' ? postLines : postLines.map((line) => ({
      ...line, debit: line.credit, credit: line.debit,
    }));
    const journalTotal = Math.round((gross + cogs) * 100) / 100;
    tx.create(journalRef, {
      tenantId: actor.tenantId, branchId, costCenterId, source: 'repair_sales_invoice', sourceId: invoiceRef.id,
      referenceNo: operation === 'post' ? invoiceNo : `${invoiceNo}-REV-${revision}`,
      status: 'posted', immutable: true, reversalOf: operation === 'cancel' ? String(current.journalEntryId || '') : '',
      postedAt: at, createdAt: at, createdBy: actor.uid, createdByName: actor.displayName,
      totalDebit: journalTotal, totalCredit: journalTotal, lines: journalLines,
    });
    const hasTreasuryMovement = Boolean(sessionRef) && Math.abs(treasuryDelta) > 0.00001;
    tx.update(invoiceRef, operation === 'post'
      ? { journalEntryId: journalRef.id, ...(hasTreasuryMovement ? { treasuryEntryId: treasuryEntryRef.id } : {}), costCenterId }
      : { reversalJournalEntryId: journalRef.id, ...(hasTreasuryMovement ? { reversalTreasuryEntryId: treasuryEntryRef.id } : {}) });

    return {
      id: invoiceRef.id,
      invoiceNo,
      total: operation === 'cancel' ? currentPreviousTotal : nextTotal,
      revision,
    };
  });
  return { ok: true as const, operation, ...result };
};
