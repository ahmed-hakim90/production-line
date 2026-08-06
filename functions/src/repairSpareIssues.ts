/**
 * Secure callables for repair spare-part issues (maintenance_center warehouses).
 * Posts OUT/IN to stock_items (+ locations). Linked optionally to repair jobs.
 */
import {
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import {
  assertActorWarehousesAllowed,
  resolveBoundInventoryWarehouseId,
} from './inventoryWarehouseScope.js';
import {
  loadCustomerTypeInTx,
  pickRepairSalePrice,
  roundRepairMoney,
} from './repairSalePrice.js';

const db = getDb();

const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
const BRANCHES_COLLECTION = 'repair_branches';
const JOBS_COLLECTION = 'repair_jobs';
const WAREHOUSES_COLLECTION = 'warehouses';
const WAREHOUSE_LOCATIONS_COLLECTION = 'warehouse_locations';
const MATERIALS_COLLECTION = 'materials';
const SPARE_PARTS_COLLECTION = 'repair_spare_parts';
const SPARE_PARTS_STOCK_COLLECTION = 'repair_spare_parts_stock';
const SPARE_PARTS_TX_COLLECTION = 'repair_parts_transactions';
const ISSUES_COLLECTION = 'repair_spare_issues';
const STOCK_ITEMS_COLLECTION = 'stock_items';
const STOCK_LOCATION_BALANCES_COLLECTION = 'stock_location_balances';
const STOCK_TRANSACTIONS_COLLECTION = 'stock_transactions';
const INVENTORY_COUNTERS_COLLECTION = 'inventory_counters';
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';

const MAX_LINES = 40;
const SOURCE_ISSUE = 'repair_spare_issue';
const SOURCE_RETURN = 'repair_spare_return';

type ApprovalMode = 'direct' | 'required';
type IssueStatus = 'draft' | 'submitted' | 'approved' | 'issued' | 'rejected' | 'cancelled';

type ActorContext = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  boundWarehouseId: string | null;
};

type DraftLineInput = {
  itemId?: string;
  quantity?: number;
  locationId?: string;
  locationCode?: string;
};

type ResolvedLine = {
  lineId: string;
  itemType: 'material';
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  locationId?: string;
  locationCode?: string;
  unitCostSnapshot: number;
  totalCostSnapshot: number;
  returnedQty?: number;
};

type JobPartUsageMeta = {
  partId: string;
  partName?: string;
  scope?: 'job' | 'product';
  productItemId?: string;
  productName?: string;
  /** When set, issue updates this existing partsUsed line instead of appending. */
  usageId?: string;
};

type IssueDoc = {
  referenceNo: string;
  status: IssueStatus;
  approvalMode: ApprovalMode;
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  jobId?: string;
  jobCode?: string;
  /** Optional catalog/spare-part metadata when issue is created from a repair job. */
  jobPartUsage?: JobPartUsageMeta;
  lines: ResolvedLine[];
  note?: string;
  totalCostSnapshot?: number;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  submittedAt?: string;
  submittedBy?: string;
  submittedByUserId?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  issuedAt?: string;
  issuedBy?: string;
  issuedByUserId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByUserId?: string;
  tenantId: string;
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const roundMoney = (value: number): number =>
  Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

const toIsoNow = () => new Date().toISOString();

const materialPurchaseCostPerBaseUnit = (material: {
  purchaseCost?: number;
  conversionRate?: number;
}): number => {
  const cost = toNumber(material.purchaseCost);
  const rate = toNumber(material.conversionRate);
  if (rate > 0) return cost / rate;
  return cost;
};

const balanceDocId = (warehouseId: string, itemId: string) =>
  `${warehouseId}__material__${itemId}`;

const locationBalanceDocId = (warehouseId: string, locationId: string, itemId: string) =>
  `${warehouseId}__${locationId}__material__${itemId}`;

const issueLineId = (itemId: string, locationId?: string) =>
  JSON.stringify([String(itemId || '').trim(), String(locationId || '').trim()]);

const formatRsiReference = (seq: number) =>
  `RSI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;

const formatInvReference = (seq: number) =>
  `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

const userSafeError = (error: unknown, fallback: string): HttpsError => {
  if (error instanceof HttpsError) return error;
  const message = error instanceof Error ? error.message : '';
  if (
    message
    && !message.includes('Firebase')
    && !message.includes('Firestore')
    && !message.includes('PERMISSION')
    && message.length < 180
  ) {
    return new HttpsError('failed-precondition', message);
  }
  return new HttpsError('failed-precondition', fallback);
};

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<ActorContext> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as {
    tenantId?: string;
    isActive?: boolean;
    isSuperAdmin?: boolean;
    roleId?: string;
    name?: string;
    displayName?: string;
    email?: string;
    inventoryWarehouseId?: string | null;
  };
  if (user.isActive === false) {
    throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  }
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId && user.isSuperAdmin !== true) {
    throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');
  }
  const roleId = String(user.roleId || '').trim();
  let permissions: Record<string, boolean> = {};
  if (roleId) {
    const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
    if (roleSnap.exists) {
      const role = roleSnap.data() as { permissions?: Record<string, boolean>; tenantId?: string };
      if (role.tenantId && tenantId && role.tenantId !== tenantId && user.isSuperAdmin !== true) {
        throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
      }
      permissions = role.permissions || {};
    }
  }
  return {
    uid,
    tenantId: tenantId || String(user.tenantId || ''),
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    boundWarehouseId: resolveBoundInventoryWarehouseId(user),
  };
};

const hasPermission = (actor: ActorContext, keys: string[]): boolean => {
  if (actor.isSuperAdmin) return true;
  return keys.some((key) => actor.permissions[key] === true);
};

const requirePermission = (actor: ActorContext, keys: string[], message: string) => {
  if (!hasPermission(actor, keys)) {
    throw new HttpsError('permission-denied', message);
  }
};

const assertActorIssueWarehouse = (actor: ActorContext, warehouseId: string) => {
  assertActorWarehousesAllowed(actor.boundWarehouseId, [warehouseId]);
};

const writeAudit = async (params: {
  actor: ActorContext;
  action: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
}) => {
  await db.collection(ACTIVITY_LOGS_COLLECTION).add({
    tenantId: params.actor.tenantId,
    module: 'repair',
    action: params.action,
    entityType: 'repair_spare_issue',
    entityId: params.entityId,
    description: params.description,
    performedBy: params.actor.displayName,
    performedByUserId: params.actor.uid,
    createdAt: toIsoNow(),
    metadata: params.metadata || {},
  });
};

const loadApprovalMode = async (tenantId: string): Promise<ApprovalMode> => {
  const snap = await db.collection(SYSTEM_SETTINGS_COLLECTION).doc(tenantId).get();
  if (!snap.exists) return 'direct';
  const data = snap.data() as {
    planSettings?: { repairSpareIssueApprovalMode?: string };
  };
  return data.planSettings?.repairSpareIssueApprovalMode === 'required'
    ? 'required'
    : 'direct';
};

const assertSameTenant = (resourceTenantId: unknown, actorTenantId: string) => {
  const tid = String(resourceTenantId || '').trim();
  if (!tid || tid !== actorTenantId) {
    throw new HttpsError('permission-denied', 'لا يمكن الوصول إلى هذا المورد.');
  }
};

const resolveBranch = async (tenantId: string, branchId: string) => {
  const id = String(branchId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'حدد فرع الصيانة.');
  const snap = await db.collection(BRANCHES_COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
  const data = snap.data() as { tenantId?: string; name?: string; isActive?: boolean };
  assertSameTenant(data.tenantId, tenantId);
  if (data.isActive === false) throw new HttpsError('failed-precondition', 'فرع الصيانة غير نشط.');
  return { id, name: String(data.name || id) };
};

const resolveWarehouse = async (tenantId: string, warehouseId: string) => {
  const id = String(warehouseId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'حدد المخزن.');
  const snap = await db.collection(WAREHOUSES_COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'المخزن غير موجود.');
  const data = snap.data() as {
    tenantId?: string;
    name?: string;
    isActive?: boolean;
    warehouseRole?: string;
    code?: string;
  };
  assertSameTenant(data.tenantId, tenantId);
  if (data.isActive === false) throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
  const role = String(data.warehouseRole || 'general');
  const code = String(data.code || '').trim().toUpperCase();
  const okRole = role === 'maintenance_center' || /^RWH-\d{3}$/.test(code);
  if (!okRole) {
    throw new HttpsError('failed-precondition', 'المخزن يجب أن يكون مخزن مركز صيانة.');
  }
  return { id, name: String(data.name || id) };
};

const activeLocationsForWarehouse = async (tenantId: string, warehouseId: string) => {
  const snap = await db
    .collection(WAREHOUSE_LOCATIONS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('warehouseId', '==', warehouseId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as { code?: string; isActive?: boolean }) }))
    .filter((loc) => loc.isActive !== false);
};

const resolveLines = async (params: {
  tenantId: string;
  warehouseId: string;
  lines: DraftLineInput[];
}): Promise<ResolvedLine[]> => {
  const rawLines = Array.isArray(params.lines) ? params.lines : [];
  if (rawLines.length === 0) {
    throw new HttpsError('invalid-argument', 'أضف بند قطعة غيار واحد على الأقل.');
  }
  if (rawLines.length > MAX_LINES) {
    throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
  }

  const locations = await activeLocationsForWarehouse(params.tenantId, params.warehouseId);
  const locationsRequired = locations.length > 0;
  const locationById = new Map(locations.map((loc) => [loc.id, loc]));
  const seen = new Set<string>();
  const resolved: ResolvedLine[] = [];

  for (const line of rawLines) {
    const itemId = String(line.itemId || '').trim();
    const quantity = toNumber(line.quantity);
    const locationId = String(line.locationId || '').trim();
    if (!itemId) throw new HttpsError('invalid-argument', 'حدد الصنف لكل بند.');
    if (!(quantity > 0)) {
      throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
    }
    if (locationsRequired && !locationId) {
      throw new HttpsError('invalid-argument', 'حدد رف المصدر لكل بند.');
    }
    if (locationId) {
      const loc = locationById.get(locationId);
      if (!loc) throw new HttpsError('failed-precondition', 'الرف غير نشط أو غير تابع للمخزن.');
    }
    const key = `${itemId}__${locationId || '_'}`;
    if (seen.has(key)) {
      throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس الصنف والرف في نفس السند.');
    }
    seen.add(key);

    const materialSnap = await db.collection(MATERIALS_COLLECTION).doc(itemId).get();
    if (!materialSnap.exists) throw new HttpsError('not-found', 'المادة غير موجودة.');
    const material = materialSnap.data() as {
      tenantId?: string;
      name?: string;
      code?: string;
      type?: string;
      baseUnit?: string;
      purchaseCost?: number;
      conversionRate?: number;
      isActive?: boolean;
    };
    assertSameTenant(material.tenantId, params.tenantId);
    if (material.isActive === false) {
      throw new HttpsError('failed-precondition', 'المادة غير نشطة.');
    }
    const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(material));
    const locationCode = locationId
      ? String(line.locationCode || locationById.get(locationId)?.code || locationId)
      : undefined;
    resolved.push({
      lineId: issueLineId(itemId, locationId),
      itemType: 'material',
      itemId,
      itemName: String(material.name || itemId),
      itemCode: String(material.code || ''),
      unit: String(material.baseUnit || 'piece'),
      quantity,
      ...(locationId ? { locationId, locationCode } : {}),
      unitCostSnapshot: unitCost,
      totalCostSnapshot: roundMoney(unitCost * quantity),
      returnedQty: 0,
    });
  }

  return resolved;
};

const loadIssue = async (issueId: string, actor: ActorContext): Promise<{ id: string; data: IssueDoc }> => {
  const id = String(issueId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'معرّف السند غير صالح.');
  const snap = await db.collection(ISSUES_COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'سند الصرف غير موجود.');
  const data = snap.data() as IssueDoc;
  assertSameTenant(data.tenantId, actor.tenantId);
  assertActorIssueWarehouse(actor, data.warehouseId);
  return { id: snap.id, data };
};

async function transitionIssueStatus(params: {
  actor: ActorContext;
  issueId: string;
  nextStatus: IssueStatus;
  validate: (current: IssueDoc) => void;
  fields: (now: string) => Record<string, unknown>;
  idempotent?: boolean;
}): Promise<{ data: IssueDoc; changed: boolean }> {
  const issueRef = db.collection(ISSUES_COLLECTION).doc(params.issueId);
  return db.runTransaction(async (t) => {
    const issueSnap = await t.get(issueRef);
    if (!issueSnap.exists) throw new HttpsError('not-found', 'سند الصرف غير موجود.');
    const current = issueSnap.data() as IssueDoc;
    assertSameTenant(current.tenantId, params.actor.tenantId);
    assertActorIssueWarehouse(params.actor, current.warehouseId);
    if (params.idempotent && current.status === params.nextStatus) {
      return { data: current, changed: false };
    }
    params.validate(current);
    const now = toIsoNow();
    t.update(issueRef, {
      status: params.nextStatus,
      ...params.fields(now),
    });
    return { data: current, changed: true };
  });
}

const canIssueNow = (status: IssueStatus, approvalMode: ApprovalMode) =>
  approvalMode === 'direct' ? status === 'draft' : status === 'approved';

/** Job-facing usage price: Material consumer/trader sale, then legacy part catalog. */
const resolveSparePartSalePrice = async (
  t: Transaction,
  tenantId: string,
  input: { partId?: string; materialId?: string; customerType?: string | null },
): Promise<number> => {
  const materialIdDirect = String(input.materialId || '').trim();
  const partId = String(input.partId || '').trim();

  let materialId = materialIdDirect;

  if (partId && !materialId) {
    const snap = await t.get(db.collection(SPARE_PARTS_COLLECTION).doc(partId));
    if (snap.exists) {
      const data = snap.data() as {
        tenantId?: string;
        materialId?: string;
        rawMaterialId?: string;
      };
      if (String(data.tenantId || '').trim() === tenantId) {
        materialId = String(data.materialId || data.rawMaterialId || '').trim();
      }
    }
  }

  let consumer = 0;
  let trader = 0;
  if (materialId) {
    const matSnap = await t.get(db.collection(MATERIALS_COLLECTION).doc(materialId));
    if (matSnap.exists) {
      const data = matSnap.data() as {
        tenantId?: string;
        defaultSalePrice?: number;
        traderSalePrice?: number;
      };
      if (String(data.tenantId || '').trim() === tenantId) {
        consumer = Number(data.defaultSalePrice || 0);
        trader = Number(data.traderSalePrice || 0);
      }
    }
  }

  const sale = pickRepairSalePrice({
    customerType: input.customerType,
    consumerSalePrice: consumer,
    traderSalePrice: trader,
  });
  return sale > 0 ? roundRepairMoney(sale) : 0;
};

/**
 * Keep center UI ledger (`repair_spare_parts_stock`) in sync with inventory RSI movements.
 * Failures are logged only — inventory SoT already posted.
 */
async function syncRepairBranchStockDelta(input: {
  tenantId: string;
  branchId: string;
  warehouseId: string;
  lines: Array<{ itemId: string; quantity: number; itemName?: string }>;
  partIdHint?: string;
  direction: 'OUT' | 'IN';
  actorName: string;
  referenceNo: string;
  sourceId: string;
}): Promise<void> {
  const branchId = String(input.branchId || '').trim();
  const warehouseId = String(input.warehouseId || '').trim();
  if (!branchId || !warehouseId) return;

  const qtyByItem = new Map<string, { quantity: number; itemName: string }>();
  for (const line of input.lines) {
    const itemId = String(line.itemId || '').trim();
    const quantity = toNumber(line.quantity);
    if (!itemId || !(quantity > 0)) continue;
    const prev = qtyByItem.get(itemId);
    if (prev) {
      prev.quantity += quantity;
    } else {
      qtyByItem.set(itemId, {
        quantity,
        itemName: String(line.itemName || itemId),
      });
    }
  }
  if (qtyByItem.size === 0) return;

  const now = toIsoNow();
  const hintPartId = String(input.partIdHint || '').trim();

  for (const [materialId, row] of qtyByItem.entries()) {
    let partId = '';
    if (hintPartId && qtyByItem.size === 1) {
      const hintSnap = await db.collection(SPARE_PARTS_COLLECTION).doc(hintPartId).get();
      if (hintSnap.exists) {
        const hint = hintSnap.data() as {
          tenantId?: string;
          branchId?: string;
          materialId?: string;
        };
        if (
          String(hint.tenantId || '') === input.tenantId
          && String(hint.branchId || '') === branchId
          && (
            !String(hint.materialId || '').trim()
            || String(hint.materialId || '').trim() === materialId
          )
        ) {
          partId = hintPartId;
        }
      }
    }
    if (!partId) {
      const existingParts = await db
        .collection(SPARE_PARTS_COLLECTION)
        .where('tenantId', '==', input.tenantId)
        .where('branchId', '==', branchId)
        .where('materialId', '==', materialId)
        .limit(1)
        .get();
      if (existingParts.empty) continue;
      partId = existingParts.docs[0].id;
    }

    const stockDocId = `${branchId}__${warehouseId}__${partId}`;
    const stockRef = db.collection(SPARE_PARTS_STOCK_COLLECTION).doc(stockDocId);
    const delta = input.direction === 'OUT' ? -row.quantity : row.quantity;

    await db.runTransaction(async (tx) => {
      const stockSnap = await tx.get(stockRef);
      const current = stockSnap.exists ? toNumber(stockSnap.data()?.quantity) : 0;
      const next = current + delta;
      if (next < -0.000001) {
        throw new Error(`رصيد دفتر الفرع غير كافٍ للصنف ${row.itemName}`);
      }
      tx.set(stockRef, {
        tenantId: input.tenantId,
        branchId,
        warehouseId,
        partId,
        quantity: Math.max(0, next),
        updatedAt: now,
      }, { merge: true });
      const txRef = db.collection(SPARE_PARTS_TX_COLLECTION).doc();
      tx.set(txRef, {
        tenantId: input.tenantId,
        branchId,
        warehouseId,
        partId,
        partName: row.itemName,
        quantity: row.quantity,
        type: input.direction,
        notes: `${input.direction === 'OUT' ? 'صرف' : 'مرتجع'} ${input.referenceNo}`,
        createdAt: now,
        createdBy: input.actorName,
        sourceId: input.sourceId,
        sourceModule: input.direction === 'OUT' ? SOURCE_ISSUE : SOURCE_RETURN,
      });
    });
  }
}

async function postIssueMovements(params: {
  actor: ActorContext;
  issueId: string;
}): Promise<{ referenceNo: string; issue: IssueDoc; changed: boolean }> {
  const { actor, issueId } = params;
  return db.runTransaction(async (t) => {
    const issueRef = db.collection(ISSUES_COLLECTION).doc(issueId);
    const issueSnap = await t.get(issueRef);
    if (!issueSnap.exists) throw new HttpsError('not-found', 'سند الصرف غير موجود.');
    const current = issueSnap.data() as IssueDoc;
    assertSameTenant(current.tenantId, actor.tenantId);
    assertActorIssueWarehouse(actor, current.warehouseId);
    if (current.status === 'issued') {
      return { referenceNo: current.referenceNo, issue: current, changed: false };
    }
    if (!canIssueNow(current.status, current.approvalMode)) {
      throw new HttpsError('failed-precondition', 'لا يمكن تنفيذ الصرف في الحالة الحالية.');
    }
    const lines = current.lines || [];
    if (lines.length === 0) {
      throw new HttpsError('failed-precondition', 'السند لا يحتوي بنوداً.');
    }

    const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
    const counterSnap = await t.get(counterRef);
    let nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
    const now = toIsoNow();
    const movementRefs = lines.map(() => db.collection(STOCK_TRANSACTIONS_COLLECTION).doc());

    const stockByItem = new Map<string, {
      line: ResolvedLine;
      quantity: number;
      balRef: DocumentReference;
    }>();
    const locationRows: Array<{
      line: ResolvedLine;
      locRef: DocumentReference;
    }> = [];
    for (const line of lines) {
      const existing = stockByItem.get(line.itemId);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        stockByItem.set(line.itemId, {
          line,
          quantity: line.quantity,
          balRef: db.collection(STOCK_ITEMS_COLLECTION).doc(
            balanceDocId(current.warehouseId, line.itemId),
          ),
        });
      }
      if (line.locationId) {
        locationRows.push({
          line,
          locRef: db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(
            locationBalanceDocId(current.warehouseId, line.locationId, line.itemId),
          ),
        });
      }
    }

    const stockRows = Array.from(stockByItem.values());
    const balanceRefs = [
      ...stockRows.map((row) => row.balRef),
      ...locationRows.map((row) => row.locRef),
    ];
    const balanceSnaps = balanceRefs.length > 0 ? await t.getAll(...balanceRefs) : [];
    const balanceSnapByPath = new Map(
      balanceSnaps.map((snap) => [snap.ref.path, snap as DocumentSnapshot]),
    );

    for (const row of stockRows) {
      const balSnap = balanceSnapByPath.get(row.balRef.path);
      const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
      if (balQty - row.quantity < -0.000001) {
        throw new HttpsError(
          'failed-precondition',
          `الرصيد غير كافٍ للصنف ${row.line.itemName}.`,
        );
      }
    }
    for (const row of locationRows) {
      const locSnap = balanceSnapByPath.get(row.locRef.path);
      const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
      if (locQty - row.line.quantity < -0.000001) {
        throw new HttpsError(
          'failed-precondition',
          `رصيد الرف غير كافٍ للصنف ${row.line.itemName}.`,
        );
      }
    }

    // All reads must complete before writes in this transaction.
    const jobId = String(current.jobId || '').trim();
    const jobRef = jobId ? db.collection(JOBS_COLLECTION).doc(jobId) : null;
    const jobSnap = jobRef ? await t.get(jobRef) : null;
    const jobCustomerId = jobSnap?.exists
      ? String((jobSnap.data() as { customerId?: string })?.customerId || '').trim()
      : '';
    const customerType = await loadCustomerTypeInTx(t, db, actor.tenantId, jobCustomerId);
    const branchRef = current.branchId
      ? db.collection('repair_branches').doc(String(current.branchId))
      : null;
    const branchSnap = branchRef ? await t.get(branchRef) : null;
    const cogsJournalRef = jobId
      ? db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_parts_cogs__${issueId}`)
      : null;
    const cogsJournalSnap = cogsJournalRef ? await t.get(cogsJournalRef) : null;
    const meta = current.jobPartUsage;
    const primaryMaterialId = String(lines[0]?.itemId || '').trim();
    const salePrice = await resolveSparePartSalePrice(t, actor.tenantId, {
      partId: meta?.partId,
      materialId: primaryMaterialId,
      customerType,
    });
    const salePriceByMaterialId = new Map<string, number>();
    const uniqueMaterialIds = Array.from(
      new Set(lines.map((line) => String(line.itemId || '').trim()).filter(Boolean)),
    );
    for (const materialId of uniqueMaterialIds) {
      if (materialId === primaryMaterialId && (!meta?.partId || uniqueMaterialIds.length === 1)) {
        salePriceByMaterialId.set(materialId, salePrice);
        continue;
      }
      salePriceByMaterialId.set(
        materialId,
        await resolveSparePartSalePrice(t, actor.tenantId, { materialId, customerType }),
      );
    }

    for (const row of stockRows) {
      const balSnap = balanceSnapByPath.get(row.balRef.path);
      const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
      t.set(
        row.balRef,
        stripUndefined({
          warehouseId: current.warehouseId,
          warehouseName: current.warehouseName,
          itemType: 'material',
          itemId: row.line.itemId,
          itemName: row.line.itemName,
          itemCode: row.line.itemCode,
          unit: row.line.unit,
          quantity: balQty - row.quantity,
          minStock: toNumber(balSnap?.data()?.minStock),
          updatedAt: now,
          lastMovementAt: now,
          tenantId: actor.tenantId,
        }),
        { merge: true },
      );
    }

    for (const row of locationRows) {
      const locSnap = balanceSnapByPath.get(row.locRef.path);
      const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
      t.set(
        row.locRef,
        stripUndefined({
          warehouseId: current.warehouseId,
          warehouseName: current.warehouseName,
          locationId: row.line.locationId,
          locationCode: row.line.locationCode || row.line.locationId,
          itemType: 'material',
          itemId: row.line.itemId,
          itemName: row.line.itemName,
          itemCode: row.line.itemCode,
          unit: row.line.unit,
          quantity: locQty - row.line.quantity,
          minStock: toNumber(locSnap?.data()?.minStock),
          updatedAt: now,
          lastMovementAt: now,
          tenantId: actor.tenantId,
        }),
        { merge: true },
      );
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const invRef = formatInvReference(nextInv);
      nextInv += 1;
      t.set(
        movementRefs[i],
        stripUndefined({
          warehouseId: current.warehouseId,
          warehouseName: current.warehouseName,
          locationId: line.locationId,
          locationCode: line.locationCode,
          itemType: 'material',
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          movementType: 'OUT',
          quantity: line.quantity,
          unit: line.unit,
          note: `صرف قطع غيار ${current.referenceNo} — ${current.branchName}`,
          referenceNo: invRef,
          sourceModule: SOURCE_ISSUE,
          sourceId: issueId,
          branchId: current.branchId,
          branchName: current.branchName,
          sourceLineId: line.lineId || issueLineId(line.itemId, line.locationId),
          unitCostSnapshot: line.unitCostSnapshot,
          totalCostSnapshot: line.totalCostSnapshot,
          createdAt: now,
          createdBy: actor.displayName,
          createdByUserId: actor.uid,
          tenantId: actor.tenantId,
        }),
      );
    }

    t.set(
      counterRef,
      {
        tenantId: actor.tenantId,
        lastInvSeq: nextInv - 1,
        updatedAt: now,
      },
      { merge: true },
    );

    t.update(issueRef, {
      status: 'issued',
      issuedAt: now,
      issuedBy: actor.displayName,
      issuedByUserId: actor.uid,
      totalCostSnapshot: roundMoney(
        lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0),
      ),
    });

    const issueCost = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
    if (jobId && cogsJournalRef && !cogsJournalSnap?.exists && issueCost > 0) {
      const branch = branchSnap?.data() as Record<string, unknown> | undefined;
      const accounts = branch?.accountingAccounts as Record<string, unknown> | undefined;
      const costCenterId = String(branch?.costCenterId || '').trim();
      const cogsCode = String(accounts?.partsCogs || '').trim();
      const inventoryCode = String(accounts?.partsInventory || '').trim();
      if (!costCenterId || !cogsCode || !inventoryCode) {
        throw new HttpsError('failed-precondition', 'أكمل مركز التكلفة وحسابات مخزون وتكلفة قطع الغيار للفرع.');
      }
      t.create(cogsJournalRef, {
        tenantId: actor.tenantId,
        branchId: current.branchId,
        costCenterId,
        source: 'repair_parts_issue',
        sourceId: issueId,
        referenceNo: current.referenceNo,
        status: 'posted',
        postedAt: now,
        createdBy: actor.uid,
        createdByName: actor.displayName,
        totalDebit: issueCost,
        totalCredit: issueCost,
        lines: [
          { accountCode: cogsCode, accountName: 'تكلفة قطع الغيار المباعة', debit: issueCost, credit: 0, costCenterId },
          { accountCode: inventoryCode, accountName: 'مخزون قطع غيار الصيانة', debit: 0, credit: issueCost, costCenterId },
        ],
      });
    }

    if (jobRef && jobSnap?.exists) {
      const jobData = jobSnap.data() as { partsUsed?: Array<Record<string, unknown>>; tenantId?: string };
      assertSameTenant(jobData.tenantId, actor.tenantId);
      const prev = Array.isArray(jobData.partsUsed) ? [...jobData.partsUsed] : [];
      for (const line of lines) {
        const scope = meta?.scope === 'product' ? 'product' : 'job';
        const usageId = String(meta?.usageId || '').trim();
        const nextRow = stripUndefined({
          ...(usageId ? { usageId } : {}),
          partId: String(meta?.partId || line.itemId).trim(),
          partName: String(meta?.partName || line.itemName).trim(),
          quantity: line.quantity,
          // Job customer totals use sale/usage price; inventory movements keep purchase snapshots.
          unitCost: salePriceByMaterialId.get(String(line.itemId || '').trim()) ?? salePrice,
          unitCostSnapshot: toNumber(line.unitCostSnapshot),
          totalCostSnapshot: toNumber(line.totalCostSnapshot),
          materialId: line.itemId,
          scope,
          fulfillmentStatus: 'issued',
          availabilityAtRequest: 'center',
          ...(scope === 'product' && meta?.productItemId
            ? {
                productItemId: String(meta.productItemId).trim(),
                productName: String(meta.productName || '').trim() || undefined,
              }
            : {}),
          issueId,
          issueReferenceNo: current.referenceNo,
        });
        if (usageId) {
          const idx = prev.findIndex((row) => String(row.usageId || '').trim() === usageId);
          if (idx >= 0) {
            prev[idx] = { ...prev[idx], ...nextRow };
            continue;
          }
        }
        prev.push(nextRow);
      }
      t.update(jobRef, { partsUsed: prev, updatedAt: now });
    }

    return { referenceNo: current.referenceNo, issue: current, changed: true };
  });
}

export async function createRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; referenceNo: string; status: IssueStatus; approvalMode: ApprovalMode }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.create', 'repair.parts.manage'],
      'لا تملك صلاحية إنشاء سند صرف قطع الغيار.',
    );
    if (!actor.tenantId) throw new HttpsError('permission-denied', 'لا يمكن تحديد الشركة.');

    const data = (request.data || {}) as {
      warehouseId?: string;
      branchId?: string;
      jobId?: string;
      jobCode?: string;
      note?: string;
      lines?: DraftLineInput[];
      jobPartUsage?: JobPartUsageMeta;
    };

    const [warehouse, branch, approvalMode] = await Promise.all([
      resolveWarehouse(actor.tenantId, String(data.warehouseId || '')),
      resolveBranch(actor.tenantId, String(data.branchId || '')),
      loadApprovalMode(actor.tenantId),
    ]);
    assertActorIssueWarehouse(actor, warehouse.id);
    const lines = await resolveLines({
      tenantId: actor.tenantId,
      warehouseId: warehouse.id,
      lines: data.lines || [],
    });

    const jobId = String(data.jobId || '').trim() || undefined;
    const jobCode = String(data.jobCode || '').trim() || undefined;
    if (jobId) {
      const jobSnap = await db.collection(JOBS_COLLECTION).doc(jobId).get();
      if (!jobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
      const job = jobSnap.data() as { tenantId?: string; branchId?: string };
      assertSameTenant(job.tenantId, actor.tenantId);
      if (String(job.branchId || '').trim() && String(job.branchId || '').trim() !== branch.id) {
        throw new HttpsError('failed-precondition', 'طلب الصيانة لا يتبع نفس الفرع.');
      }
    }

    const rawMeta = data.jobPartUsage;
    const jobPartUsage: JobPartUsageMeta | undefined = rawMeta && String(rawMeta.partId || '').trim()
      ? stripUndefined({
          partId: String(rawMeta.partId).trim(),
          partName: String(rawMeta.partName || '').trim() || undefined,
          scope: rawMeta.scope === 'product' ? 'product' : 'job',
          productItemId: String(rawMeta.productItemId || '').trim() || undefined,
          productName: String(rawMeta.productName || '').trim() || undefined,
          usageId: String(rawMeta.usageId || '').trim() || undefined,
        }) as JobPartUsageMeta
      : undefined;

    const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
    const now = toIsoNow();
    const issueRef = db.collection(ISSUES_COLLECTION).doc();

    const referenceNo = await db.runTransaction(async (t) => {
      const counterSnap = await t.get(counterRef);
      const nextSeq = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastRsiSeq) + 1));
      const refNo = formatRsiReference(nextSeq);
      t.set(
        counterRef,
        {
          tenantId: actor.tenantId,
          lastRsiSeq: nextSeq,
          updatedAt: now,
        },
        { merge: true },
      );
      const payload: IssueDoc = {
        referenceNo: refNo,
        status: 'draft',
        approvalMode,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        branchId: branch.id,
        branchName: branch.name,
        ...(jobId ? { jobId } : {}),
        ...(jobCode ? { jobCode } : {}),
        ...(jobPartUsage ? { jobPartUsage } : {}),
        lines,
        note: String(data.note || '').trim() || undefined,
        totalCostSnapshot: roundMoney(
          lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0),
        ),
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
      };
      t.set(issueRef, stripUndefined(payload as unknown as Record<string, unknown>));
      return refNo;
    });

    await writeAudit({
      actor,
      action: 'create',
      entityId: issueRef.id,
      description: `إنشاء سند صرف قطع غيار ${referenceNo}`,
      metadata: {
        branchId: branch.id,
        warehouseId: warehouse.id,
        ...(jobId ? { jobId } : {}),
        approvalMode,
      },
    });

    return { id: issueRef.id, referenceNo, status: 'draft', approvalMode };
  } catch (error) {
    throw userSafeError(error, 'تعذر إنشاء سند صرف قطع الغيار.');
  }
}

export async function submitRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; status: IssueStatus }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.create', 'repair.parts.manage'],
      'لا تملك صلاحية تقديم سند الصرف.',
    );
    const issueId = String((request.data as { issueId?: string })?.issueId || '').trim();
    const { id } = await loadIssue(issueId, actor);
    const { data } = await transitionIssueStatus({
      actor,
      issueId: id,
      nextStatus: 'submitted',
      validate: (current) => {
        if (current.approvalMode !== 'required') {
          throw new HttpsError('failed-precondition', 'هذا السند لا يتطلب تقديم موافقة.');
        }
        if (current.status !== 'draft') {
          throw new HttpsError('failed-precondition', 'لا يمكن تقديم سند ليس مسودة.');
        }
      },
      fields: (now) => ({
        submittedAt: now,
        submittedBy: actor.displayName,
        submittedByUserId: actor.uid,
      }),
    });
    await writeAudit({
      actor,
      action: 'submit',
      entityId: id,
      description: `تقديم سند صرف قطع غيار ${data.referenceNo}`,
    });
    return { id, status: 'submitted' };
  } catch (error) {
    throw userSafeError(error, 'تعذر تقديم سند الصرف.');
  }
}

export async function approveRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; status: IssueStatus }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.approve', 'repair.parts.manage'],
      'لا تملك صلاحية اعتماد سند الصرف.',
    );
    const issueId = String((request.data as { issueId?: string })?.issueId || '').trim();
    const { id } = await loadIssue(issueId, actor);
    const { data } = await transitionIssueStatus({
      actor,
      issueId: id,
      nextStatus: 'approved',
      validate: (current) => {
        if (current.approvalMode !== 'required' || current.status !== 'submitted') {
          throw new HttpsError('failed-precondition', 'لا يمكن اعتماد هذا السند في حالته الحالية.');
        }
      },
      fields: (now) => ({
        approvedAt: now,
        approvedBy: actor.displayName,
        approvedByUserId: actor.uid,
      }),
    });
    await writeAudit({
      actor,
      action: 'approve',
      entityId: id,
      description: `اعتماد سند صرف قطع غيار ${data.referenceNo}`,
    });
    return { id, status: 'approved' };
  } catch (error) {
    throw userSafeError(error, 'تعذر اعتماد سند الصرف.');
  }
}

export async function rejectRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; status: IssueStatus }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.approve', 'repair.parts.manage'],
      'لا تملك صلاحية رفض سند الصرف.',
    );
    const payload = (request.data || {}) as { issueId?: string; reason?: string };
    const { id } = await loadIssue(String(payload.issueId || ''), actor);
    const { data } = await transitionIssueStatus({
      actor,
      issueId: id,
      nextStatus: 'rejected',
      validate: (current) => {
        if (
          current.approvalMode !== 'required'
          || (current.status !== 'submitted' && current.status !== 'approved')
        ) {
          throw new HttpsError('failed-precondition', 'لا يمكن رفض هذا السند في حالته الحالية.');
        }
      },
      fields: (now) => ({
        rejectedAt: now,
        rejectedBy: actor.displayName,
        rejectedByUserId: actor.uid,
        rejectionReason: String(payload.reason || '').trim().slice(0, 500) || 'مرفوض',
      }),
    });
    await writeAudit({
      actor,
      action: 'reject',
      entityId: id,
      description: `رفض سند صرف قطع غيار ${data.referenceNo}`,
    });
    return { id, status: 'rejected' };
  } catch (error) {
    throw userSafeError(error, 'تعذر رفض سند الصرف.');
  }
}

export async function issueRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; status: IssueStatus; referenceNo: string }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.issue', 'repair.parts.manage'],
      'لا تملك صلاحية تنفيذ صرف قطع الغيار.',
    );
    const issueId = String((request.data as { issueId?: string })?.issueId || '').trim();
    const { id } = await loadIssue(issueId, actor);
    const result = await postIssueMovements({ actor, issueId: id });
    if (result.changed) {
      try {
        await syncRepairBranchStockDelta({
          tenantId: actor.tenantId,
          branchId: result.issue.branchId,
          warehouseId: result.issue.warehouseId,
          lines: (result.issue.lines || []).map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            itemName: line.itemName,
          })),
          partIdHint: result.issue.jobPartUsage?.partId,
          direction: 'OUT',
          actorName: actor.displayName,
          referenceNo: result.referenceNo,
          sourceId: id,
        });
      } catch (syncErr) {
        console.error('repair_spare_issue.issue repair stock sync failed', {
          issueId: id,
          tenantId: actor.tenantId,
          message: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
      await writeAudit({
        actor,
        action: 'issue',
        entityId: id,
        description: `تنفيذ صرف قطع غيار ${result.referenceNo}`,
        metadata: {
          branchId: result.issue.branchId,
          warehouseId: result.issue.warehouseId,
        },
      });
    }
    return { id, status: 'issued', referenceNo: result.referenceNo };
  } catch (error) {
    throw userSafeError(error, 'تعذر تنفيذ صرف قطع الغيار.');
  }
}

export async function cancelRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; status: IssueStatus }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.create', 'repair.parts.manage'],
      'لا تملك صلاحية إلغاء سند الصرف.',
    );
    const issueId = String((request.data as { issueId?: string })?.issueId || '').trim();
    const { id } = await loadIssue(issueId, actor);
    const { data, changed } = await transitionIssueStatus({
      actor,
      issueId: id,
      nextStatus: 'cancelled',
      idempotent: true,
      validate: (current) => {
        if (!['draft', 'submitted', 'approved', 'rejected'].includes(current.status)) {
          const message = current.status === 'issued'
            ? 'لا يمكن إلغاء سند منفّذ. استخدم المرتجع.'
            : 'لا يمكن إلغاء السند في حالته الحالية.';
          throw new HttpsError('failed-precondition', message);
        }
      },
      fields: (now) => ({
        cancelledAt: now,
        cancelledBy: actor.displayName,
        cancelledByUserId: actor.uid,
      }),
    });
    if (changed) {
      await writeAudit({
        actor,
        action: 'cancel',
        entityId: id,
        description: `إلغاء سند صرف قطع غيار ${data.referenceNo}`,
      });
    }
    return { id, status: 'cancelled' };
  } catch (error) {
    throw userSafeError(error, 'تعذر إلغاء سند الصرف.');
  }
}

export async function returnRepairSpareIssueHandler(
  request: CallableRequest,
): Promise<{ id: string; ok: true }> {
  try {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    requirePermission(
      actor,
      ['repairSpareIssues.issue', 'repair.parts.manage'],
      'لا تملك صلاحية تسجيل مرتجع قطع الغيار.',
    );
    const payload = (request.data || {}) as {
      issueId?: string;
      lines?: Array<{
        lineId?: string;
        itemId?: string;
        quantity?: number;
        locationId?: string;
        locationCode?: string;
        note?: string;
      }>;
    };
    const { id, data } = await loadIssue(String(payload.issueId || ''), actor);
    const returns = Array.isArray(payload.lines) ? payload.lines : [];
    if (returns.length === 0) {
      throw new HttpsError('invalid-argument', 'أضف بند مرتجع واحد على الأقل.');
    }
    if (returns.length > MAX_LINES) {
      throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
    }

    await db.runTransaction(async (t) => {
      const issueRef = db.collection(ISSUES_COLLECTION).doc(id);
      const issueSnap = await t.get(issueRef);
      if (!issueSnap.exists) throw new HttpsError('not-found', 'سند الصرف غير موجود.');
      const current = issueSnap.data() as IssueDoc;
      assertSameTenant(current.tenantId, actor.tenantId);
      assertActorIssueWarehouse(actor, current.warehouseId);
      if (current.status !== 'issued') {
        throw new HttpsError('failed-precondition', 'لا يمكن تسجيل مرتجع إلا لسند منفّذ.');
      }

      const now = toIsoNow();
      const counterRef = db.collection(INVENTORY_COUNTERS_COLLECTION).doc(actor.tenantId);
      const counterSnap = await t.get(counterRef);
      let nextInv = Math.max(1, Math.floor(toNumber(counterSnap.data()?.lastInvSeq) + 1));
      const nextLines = current.lines.map((line) => ({
        ...line,
        lineId: line.lineId || issueLineId(line.itemId, line.locationId),
      }));
      const indexByLineId = new Map(nextLines.map((line, index) => [line.lineId, index]));
      const seenLineIds = new Set<string>();
      const resolvedReturns: Array<{
        row: (typeof returns)[number];
        source: ResolvedLine;
        quantity: number;
      }> = [];

      for (const row of returns) {
        const requestedLineId = String(row.lineId || '').trim();
        const itemId = String(row.itemId || '').trim();
        const locationId = String(row.locationId || '').trim();
        const quantity = toNumber(row.quantity);
        if ((!requestedLineId && !itemId) || !(quantity > 0)) {
          throw new HttpsError('invalid-argument', 'بيانات المرتجع غير صالحة.');
        }
        const targetLineId = requestedLineId || issueLineId(itemId, locationId);
        const idx = indexByLineId.get(targetLineId);
        if (idx == null) {
          throw new HttpsError(
            'failed-precondition',
            'بند الصنف والرف غير موجود في سند الصرف.',
          );
        }
        if (seenLineIds.has(targetLineId)) {
          throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس بند المرتجع.');
        }
        seenLineIds.add(targetLineId);
        const source = nextLines[idx];
        if (itemId && itemId !== source.itemId) {
          throw new HttpsError('invalid-argument', 'الصنف لا يطابق بند المرتجع.');
        }
        if (locationId && locationId !== String(source.locationId || '')) {
          throw new HttpsError('invalid-argument', 'الرف لا يطابق بند المرتجع.');
        }
        const remaining = toNumber(source.quantity) - toNumber(source.returnedQty);
        if (quantity > remaining + 0.000001) {
          throw new HttpsError(
            'failed-precondition',
            `كمية المرتجع لـ ${source.itemName} تتجاوز المتاح (${remaining}).`,
          );
        }
        nextLines[idx] = {
          ...source,
          returnedQty: toNumber(source.returnedQty) + quantity,
        };
        resolvedReturns.push({ row, source, quantity });
      }

      const stockByItem = new Map<string, {
        source: ResolvedLine;
        quantity: number;
        ref: DocumentReference;
      }>();
      const locationByPath = new Map<string, {
        source: ResolvedLine;
        quantity: number;
        ref: DocumentReference;
      }>();
      for (const resolved of resolvedReturns) {
        const stockRow = stockByItem.get(resolved.source.itemId);
        if (stockRow) {
          stockRow.quantity += resolved.quantity;
        } else {
          stockByItem.set(resolved.source.itemId, {
            source: resolved.source,
            quantity: resolved.quantity,
            ref: db.collection(STOCK_ITEMS_COLLECTION).doc(
              balanceDocId(current.warehouseId, resolved.source.itemId),
            ),
          });
        }
        if (resolved.source.locationId) {
          const ref = db.collection(STOCK_LOCATION_BALANCES_COLLECTION).doc(
            locationBalanceDocId(
              current.warehouseId,
              resolved.source.locationId,
              resolved.source.itemId,
            ),
          );
          const locationRow = locationByPath.get(ref.path);
          if (locationRow) {
            locationRow.quantity += resolved.quantity;
          } else {
            locationByPath.set(ref.path, {
              source: resolved.source,
              quantity: resolved.quantity,
              ref,
            });
          }
        }
      }
      const stockRows = Array.from(stockByItem.values());
      const locationRows = Array.from(locationByPath.values());
      const balanceRefs = [
        ...stockRows.map((row) => row.ref),
        ...locationRows.map((row) => row.ref),
      ];
      const balanceSnaps = balanceRefs.length > 0 ? await t.getAll(...balanceRefs) : [];
      const balanceSnapByPath = new Map(
        balanceSnaps.map((snap) => [snap.ref.path, snap as DocumentSnapshot]),
      );
      const movementRefs = resolvedReturns.map(() =>
        db.collection(STOCK_TRANSACTIONS_COLLECTION).doc());

      for (const stockRow of stockRows) {
        const balSnap = balanceSnapByPath.get(stockRow.ref.path);
        const balQty = balSnap?.exists ? toNumber(balSnap.data()?.quantity) : 0;
        t.set(
          stockRow.ref,
          stripUndefined({
            warehouseId: current.warehouseId,
            warehouseName: current.warehouseName,
            itemType: 'material',
            itemId: stockRow.source.itemId,
            itemName: stockRow.source.itemName,
            itemCode: stockRow.source.itemCode,
            unit: stockRow.source.unit,
            quantity: balQty + stockRow.quantity,
            minStock: toNumber(balSnap?.data()?.minStock),
            updatedAt: now,
            lastMovementAt: now,
            tenantId: actor.tenantId,
          }),
          { merge: true },
        );
      }

      for (const locationRow of locationRows) {
        const locSnap = balanceSnapByPath.get(locationRow.ref.path);
        const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
        t.set(
          locationRow.ref,
          stripUndefined({
            warehouseId: current.warehouseId,
            warehouseName: current.warehouseName,
            locationId: locationRow.source.locationId,
            locationCode: locationRow.source.locationCode || locationRow.source.locationId,
            itemType: 'material',
            itemId: locationRow.source.itemId,
            itemName: locationRow.source.itemName,
            itemCode: locationRow.source.itemCode,
            unit: locationRow.source.unit,
            quantity: locQty + locationRow.quantity,
            minStock: toNumber(locSnap?.data()?.minStock),
            updatedAt: now,
            lastMovementAt: now,
            tenantId: actor.tenantId,
          }),
          { merge: true },
        );
      }

      for (let i = 0; i < resolvedReturns.length; i += 1) {
        const { row, source, quantity } = resolvedReturns[i];
        const locationId = String(source.locationId || '').trim();
        const unitCost = toNumber(source.unitCostSnapshot);
        t.set(
          movementRefs[i],
          stripUndefined({
            warehouseId: current.warehouseId,
            warehouseName: current.warehouseName,
            locationId: locationId || undefined,
            locationCode: locationId
              ? String(source.locationCode || locationId)
              : undefined,
            itemType: 'material',
            itemId: source.itemId,
            itemName: source.itemName,
            itemCode: source.itemCode,
            movementType: 'IN',
            quantity,
            unit: source.unit,
            note: `مرتجع قطع الغيار ${current.referenceNo}${
              row.note ? ` — ${String(row.note).trim().slice(0, 500)}` : ''
            }`,
            referenceNo: formatInvReference(nextInv),
            sourceModule: SOURCE_RETURN,
            sourceId: id,
            branchId: current.branchId,
            branchName: current.branchName,
            sourceLineId: source.lineId,
            unitCostSnapshot: unitCost,
            totalCostSnapshot: roundMoney(unitCost * quantity),
            createdAt: now,
            createdBy: actor.displayName,
            createdByUserId: actor.uid,
            tenantId: actor.tenantId,
          }),
        );
        nextInv += 1;
      }

      t.set(
        counterRef,
        {
          tenantId: actor.tenantId,
          lastInvSeq: nextInv - 1,
          updatedAt: now,
        },
        { merge: true },
      );
      t.update(issueRef, { lines: nextLines });
    });

    try {
      const returnLines = returns.map((row) => ({
        itemId: String(row.itemId || '').trim(),
        quantity: toNumber(row.quantity),
        itemName: undefined as string | undefined,
      })).filter((line) => line.itemId && line.quantity > 0);
      // Prefer resolved item ids from the issued document when payload omits them.
      const byLineId = new Map(
        (data.lines || []).map((line) => [
          String(line.lineId || ''),
          line,
        ]),
      );
      const synced = returns.map((row) => {
        const lineId = String(row.lineId || '').trim();
        const fromDoc = lineId ? byLineId.get(lineId) : undefined;
        return {
          itemId: String(row.itemId || fromDoc?.itemId || '').trim(),
          quantity: toNumber(row.quantity),
          itemName: fromDoc?.itemName,
        };
      }).filter((line) => line.itemId && line.quantity > 0);
      await syncRepairBranchStockDelta({
        tenantId: actor.tenantId,
        branchId: data.branchId,
        warehouseId: data.warehouseId,
        lines: synced.length > 0 ? synced : returnLines,
        partIdHint: data.jobPartUsage?.partId,
        direction: 'IN',
        actorName: actor.displayName,
        referenceNo: data.referenceNo,
        sourceId: id,
      });
    } catch (syncErr) {
      console.error('repair_spare_issue.return repair stock sync failed', {
        issueId: id,
        tenantId: actor.tenantId,
        message: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

    await writeAudit({
      actor,
      action: 'return',
      entityId: id,
      description: `مرتجع قطع الغيار لسند ${data.referenceNo}`,
    });
    return { id, ok: true };
  } catch (error) {
    throw userSafeError(error, 'تعذر تسجيل مرتجع قطع الغيار.');
  }
}
