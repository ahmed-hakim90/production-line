/**
 * Spare-parts central warehouse → maintenance center replenishment.
 * Status: submitted → approved → prepared → responsible_approved → received
 * Stock posts only on receive. Unit costs always snapshotted from materials master.
 */
import { type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { toCallableUserSafeError } from './callableUserSafeError.js';
import { getDb } from './adminApp.js';
import {
  assertActorWarehouseInvolved,
  resolveBoundInventoryWarehouseId,
} from './inventoryWarehouseScope.js';
import {
  releaseStockInTx,
  reserveStockInTx,
  stockAvailableQty,
  stockReservedQty,
  type StockBalanceData,
} from './stockReservation.js';

const db = getDb();

const USERS = 'users';
const ROLES = 'roles';
const WAREHOUSES = 'warehouses';
const MATERIALS = 'materials';
const REQUESTS = 'spare_parts_replenishment_requests';
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';
const STOCK_LOCATION_BALANCES = 'stock_location_balances';
const WAREHOUSE_LOCATIONS = 'warehouse_locations';
const COUNTERS = 'inventory_counters';
const ACTIVITY = 'activity_logs';

const MAX_LINES = 40;
const SOURCE = 'spare_parts_replenishment';
const CENTRAL_ROLE = 'spare_parts_central';
const CENTER_ROLE = 'maintenance_center';

type Status =
  | 'submitted'
  | 'approved'
  | 'prepared'
  | 'responsible_approved'
  | 'received'
  | 'rejected'
  | 'cancelled';

type ActorContext = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  boundWarehouseId: string | null;
};

type DraftLineInput = { itemId?: string; quantity?: number };
type PreparedLineInput = { lineId?: string; itemId?: string; preparedQty?: number };
type ReceiveLineInput = { lineId?: string; itemId?: string; receivedQty?: number };

type ResolvedAllocation = {
  locationId: string;
  locationCode: string;
  rack?: string;
  shelf?: string;
  quantity: number;
};

type ResolvedLine = {
  lineId: string;
  itemType: 'material';
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  requestedQty: number;
  preparedQty?: number;
  receivedQty?: number;
  unitCostSnapshot: number;
  totalCostSnapshot: number;
  locationId?: string;
  locationCode?: string;
  allocations?: ResolvedAllocation[];
  availableQty?: number;
  shortageQty?: number;
  sourceJobIds?: string[];
  demandLinks?: Array<{ jobId: string; usageId: string; quantity: number }>;
  availabilityAtRequest?: 'central' | 'none';
};

type RequestDoc = {
  referenceNo: string;
  status: Status;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  lines: ResolvedLine[];
  note?: string;
  totalCostSnapshot?: number;
  sourceBranchId?: string;
  openBasket?: boolean;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  preparedAt?: string;
  preparedBy?: string;
  preparedByUserId?: string;
  responsibleApprovedAt?: string;
  responsibleApprovedBy?: string;
  responsibleApprovedByUserId?: string;
  receivedAt?: string;
  receivedBy?: string;
  receivedByUserId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByUserId?: string;
  /** True after approve reserved central stock via reservedQty. */
  stockReserved?: boolean;
  reservedLines?: Array<{ itemId: string; itemType: 'material'; reservedQty: number }>;
  tenantId: string;
};

const runTx = async <T>(
  fallback: string,
  updater: (tx: Transaction) => Promise<T>,
): Promise<T> => {
  try {
    return await db.runTransaction(updater);
  } catch (error: unknown) {
    throw toCallableUserSafeError(error, fallback);
  }
};

const releaseRequestReservations = async (
  tenantId: string,
  fromWarehouseId: string,
  reservedLines: Array<{ itemId: string; itemType: 'material'; reservedQty: number }> | undefined,
): Promise<void> => {
  const lines = reservedLines || [];
  if (lines.length === 0) return;
  await runTx('تعذر تحرير حجز المخزون.', async (tx) => {
    for (const line of lines) {
      const qty = toNumber(line.reservedQty);
      if (!(qty > 0)) continue;
      const ref = db.collection(STOCK_ITEMS).doc(
        balanceDocId(fromWarehouseId, line.itemType || 'material', line.itemId),
      );
      const snap = await tx.get(ref);
      releaseStockInTx(
        tx,
        ref,
        { tenantId, qty, label: 'رصيد المخزن المركزي' },
        snap.exists ? (snap.data() as StockBalanceData) : undefined,
      );
    }
  });
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const roundMoney = (value: number) =>
  Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

const toIsoNow = () => new Date().toISOString();

const balanceDocId = (warehouseId: string, itemType: string, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const locationBalanceDocId = (warehouseId: string, locationId: string, itemId: string) =>
  `${warehouseId}__${locationId}__material__${itemId}`;

const allocateFromLocationBalances = (
  balances: Array<{
    locationId: string;
    locationCode?: string;
    rack?: string;
    shelf?: string;
    quantity?: number;
    lastMovementAt?: string;
    updatedAt?: string;
  }>,
  requiredQty: number,
  preferredLocationId?: string,
): { allocations: ResolvedAllocation[]; availableQty: number; shortageQty: number } => {
  let remaining = requiredQty;
  const allocations: ResolvedAllocation[] = [];
  const sorted = balances
    .filter((row) => toNumber(row.quantity) > 0 && String(row.locationId || '').trim())
    .sort((a, b) => {
      if (preferredLocationId) {
        if (a.locationId === preferredLocationId && b.locationId !== preferredLocationId) return -1;
        if (b.locationId === preferredLocationId && a.locationId !== preferredLocationId) return 1;
      }
      return String(a.lastMovementAt || a.updatedAt || '').localeCompare(
        String(b.lastMovementAt || b.updatedAt || ''),
      );
    });
  const availableQty = sorted.reduce((sum, row) => sum + toNumber(row.quantity), 0);
  for (const row of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toNumber(row.quantity));
    allocations.push({
      locationId: String(row.locationId),
      locationCode: String(row.locationCode || row.locationId),
      ...(row.rack ? { rack: String(row.rack) } : {}),
      ...(row.shelf ? { shelf: String(row.shelf) } : {}),
      quantity: take,
    });
    remaining -= take;
  }
  return {
    allocations,
    availableQty,
    shortageQty: Math.max(0, requiredQty - availableQty),
  };
};

const normalizeLineAllocations = (line: {
  preparedQty?: number;
  requestedQty?: number;
  locationId?: string;
  locationCode?: string;
  allocations?: ResolvedAllocation[];
}): ResolvedAllocation[] => {
  if (Array.isArray(line.allocations) && line.allocations.length > 0) {
    return line.allocations
      .map((row) => ({
        locationId: String(row.locationId || '').trim(),
        locationCode: String(row.locationCode || row.locationId || '').trim(),
        ...(row.rack ? { rack: String(row.rack) } : {}),
        ...(row.shelf ? { shelf: String(row.shelf) } : {}),
        quantity: toNumber(row.quantity),
      }))
      .filter((row) => row.locationId && row.quantity > 0);
  }
  const locationId = String(line.locationId || '').trim();
  if (!locationId) return [];
  const qty = toNumber(line.preparedQty) > 0
    ? toNumber(line.preparedQty)
    : toNumber(line.requestedQty);
  if (!(qty > 0)) return [];
  return [{
    locationId,
    locationCode: String(line.locationCode || locationId).trim(),
    quantity: qty,
  }];
};

const scaleAllocations = (
  allocations: ResolvedAllocation[],
  targetQty: number,
): ResolvedAllocation[] => {
  let remaining = toNumber(targetQty);
  if (!(remaining > 0)) return [];
  const out: ResolvedAllocation[] = [];
  for (const row of allocations) {
    if (remaining <= 0) break;
    const take = Math.min(toNumber(row.quantity), remaining);
    if (!(take > 0)) continue;
    out.push({ ...row, quantity: take });
    remaining -= take;
  }
  return out;
};

const activeLocationsForWarehouse = async (tenantId: string, warehouseId: string) => {
  const snap = await db
    .collection(WAREHOUSE_LOCATIONS)
    .where('tenantId', '==', tenantId)
    .where('warehouseId', '==', warehouseId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as { code?: string; isActive?: boolean }) }))
    .filter((loc) => loc.isActive !== false);
};

const loadItemLocationBalances = async (params: {
  tenantId: string;
  warehouseId: string;
  itemId: string;
  locationById: Map<string, { id: string; code?: string }>;
}) => {
  const balSnap = await db
    .collection(STOCK_LOCATION_BALANCES)
    .where('tenantId', '==', params.tenantId)
    .where('warehouseId', '==', params.warehouseId)
    .where('itemType', '==', 'material')
    .where('itemId', '==', params.itemId)
    .get();
  return balSnap.docs
    .map((docSnap) => {
      const data = docSnap.data() as {
        locationId?: string;
        locationCode?: string;
        rack?: string;
        shelf?: string;
        quantity?: number;
        lastMovementAt?: string;
        updatedAt?: string;
      };
      return {
        locationId: String(data.locationId || ''),
        locationCode: String(data.locationCode || data.locationId || ''),
        rack: data.rack,
        shelf: data.shelf,
        quantity: toNumber(data.quantity),
        lastMovementAt: data.lastMovementAt,
        updatedAt: data.updatedAt,
      };
    })
    .filter((row) => params.locationById.has(row.locationId));
};

/** When central warehouse uses shelves, allocate FIFO pick plan for the given qty. */
const allocateLineForCentralWarehouse = async (params: {
  tenantId: string;
  warehouseId: string;
  itemId: string;
  itemName: string;
  requiredQty: number;
  preferredLocationId?: string;
  locationsRequired: boolean;
  locationById: Map<string, { id: string; code?: string }>;
}): Promise<{
  allocations: ResolvedAllocation[];
  availableQty?: number;
  shortageQty?: number;
  locationId?: string;
  locationCode?: string;
}> => {
  if (!params.locationsRequired) {
    return { allocations: [] };
  }
  const balances = await loadItemLocationBalances({
    tenantId: params.tenantId,
    warehouseId: params.warehouseId,
    itemId: params.itemId,
    locationById: params.locationById,
  });
  const preferred = String(params.preferredLocationId || '').trim() || undefined;
  const allocated = allocateFromLocationBalances(balances, params.requiredQty, preferred);
  if (allocated.allocations.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      `لا يوجد رصيد على الأرفف للصنف ${params.itemName}. راجع أرصدة الرفوف أولاً.`,
    );
  }
  if (allocated.shortageQty > 0.000001) {
    throw new HttpsError(
      'failed-precondition',
      `رصيد الأرفف غير كافٍ للصنف ${params.itemName}. المتاح ${allocated.availableQty} والمطلوب ${params.requiredQty}.`,
    );
  }
  const first = allocated.allocations[0];
  return {
    allocations: allocated.allocations,
    availableQty: allocated.availableQty,
    shortageQty: allocated.shortageQty,
    locationId: first?.locationId,
    locationCode: first?.locationCode,
  };
};

const materialPurchaseCostPerBaseUnit = (material: {
  purchaseCost?: number;
  conversionRate?: number;
}): number => {
  const cost = toNumber(material.purchaseCost);
  const rate = toNumber(material.conversionRate);
  if (rate > 0) return cost / rate;
  return cost;
};

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
    displayName: String(user.displayName || user.email || uid).trim() || uid,
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    boundWarehouseId: resolveBoundInventoryWarehouseId(user),
  };
};

const hasPerm = (actor: ActorContext, key: string, fallbacks: string[] = []): boolean => {
  if (actor.isSuperAdmin) return true;
  if (actor.permissions[key] === true) return true;
  return fallbacks.some((fb) => actor.permissions[fb] === true);
};

const assertPerm = (actor: ActorContext, key: string, fallbacks: string[] = []) => {
  if (!hasPerm(actor, key, fallbacks)) {
    throw new HttpsError('permission-denied', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.');
  }
};

const loadWarehouse = async (
  tenantId: string,
  warehouseId: string,
): Promise<{ id: string; name: string; role: string; isActive: boolean }> => {
  const snap = await db.collection(WAREHOUSES).doc(warehouseId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'المخزن غير موجود.');
  const data = snap.data() as {
    name?: string;
    warehouseRole?: string;
    isActive?: boolean;
    tenantId?: string;
  };
  if (String(data.tenantId || '').trim() !== tenantId) {
    throw new HttpsError('permission-denied', 'المخزن خارج شركتك.');
  }
  if (data.isActive === false) {
    throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
  }
  return {
    id: snap.id,
    name: String(data.name || snap.id).trim(),
    role: String(data.warehouseRole || 'general').trim(),
    isActive: data.isActive === true || data.isActive == null,
  };
};

/** Prefer explicit fromWarehouseId; otherwise pick the tenant's active spare_parts_central warehouse. */
const resolveCentralWarehouseId = async (
  tenantId: string,
  requestedFromWarehouseId: string,
): Promise<string> => {
  const requested = String(requestedFromWarehouseId || '').trim();
  if (requested) return requested;
  const snap = await db
    .collection(WAREHOUSES)
    .where('tenantId', '==', tenantId)
    .where('warehouseRole', '==', CENTRAL_ROLE)
    .limit(5)
    .get();
  const active = snap.docs.find((doc) => {
    const data = doc.data() as { isActive?: boolean };
    return data.isActive !== false;
  });
  if (!active) {
    throw new HttpsError(
      'failed-precondition',
      'لا يوجد مخزن قطع غيار مركزي نشط لهذه الشركة.',
    );
  }
  return active.id;
};

const validateDraftLines = (lines: DraftLineInput[]): Array<{ itemId: string; quantity: number }> => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new HttpsError('invalid-argument', 'أضف بند مكوّن واحد على الأقل.');
  }
  if (lines.length > MAX_LINES) {
    throw new HttpsError('invalid-argument', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
  }
  const seen = new Set<string>();
  const out: Array<{ itemId: string; quantity: number }> = [];
  for (const line of lines) {
    const itemId = String(line.itemId || '').trim();
    const quantity = toNumber(line.quantity);
    if (!itemId) throw new HttpsError('invalid-argument', 'حدد المكوّن لكل بند.');
    if (!(quantity > 0)) throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
    if (seen.has(itemId)) {
      throw new HttpsError('invalid-argument', 'لا يمكن تكرار نفس المكوّن في نفس الطلب.');
    }
    seen.add(itemId);
    out.push({ itemId, quantity });
  }
  return out;
};

const resolveLinesFromMaterials = async (
  tenantId: string,
  drafts: Array<{ itemId: string; quantity: number }>,
): Promise<ResolvedLine[]> => {
  const resolved: ResolvedLine[] = [];
  for (const draft of drafts) {
    const snap = await db.collection(MATERIALS).doc(draft.itemId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `المكوّن غير موجود: ${draft.itemId}`);
    }
    const material = snap.data() as {
      name?: string;
      code?: string;
      unit?: string;
      purchaseCost?: number;
      conversionRate?: number;
      isActive?: boolean;
      tenantId?: string;
      availableForSpareParts?: boolean | null;
    };
    if (String(material.tenantId || '').trim() !== tenantId) {
      throw new HttpsError('permission-denied', 'المكوّن خارج شركتك.');
    }
    if (material.isActive === false) {
      throw new HttpsError('failed-precondition', `المكوّن غير نشط: ${material.name || draft.itemId}`);
    }
    if (material.availableForSpareParts !== true) {
      throw new HttpsError(
        'failed-precondition',
        'هذه المادة غير مفعّلة لقطع الغيار. فعّلها من شاشة المواد التصنيعية أولاً.',
      );
    }
    const unitCost = roundMoney(materialPurchaseCostPerBaseUnit(material));
    resolved.push({
      lineId: draft.itemId,
      itemType: 'material',
      itemId: draft.itemId,
      itemName: String(material.name || draft.itemId).trim(),
      itemCode: String(material.code || '').trim(),
      unit: String(material.unit || 'piece').trim() || 'piece',
      requestedQty: draft.quantity,
      preparedQty: draft.quantity,
      unitCostSnapshot: unitCost,
      totalCostSnapshot: roundMoney(unitCost * draft.quantity),
    });
  }
  return resolved;
};

const nextReferenceNo = async (tenantId: string): Promise<string> => {
  const counterRef = db.collection(COUNTERS).doc(`${tenantId}__spare_parts_replenishment`);
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? toNumber(snap.data()?.value) : 0;
    const value = current + 1;
    tx.set(counterRef, { value, tenantId, updatedAt: toIsoNow() }, { merge: true });
    return value;
  });
  return `SPR-${String(next).padStart(5, '0')}`;
};

const loadRequest = async (
  requestId: string,
  tenantId: string,
): Promise<{ ref: DocumentReference; data: RequestDoc }> => {
  const ref = db.collection(REQUESTS).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
  const data = snap.data() as RequestDoc;
  if (String(data.tenantId || '').trim() !== tenantId) {
    throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
  }
  return { ref, data };
};

const writeActivity = async (
  actor: ActorContext,
  action: string,
  requestId: string,
  details: Record<string, unknown>,
) => {
  await db.collection(ACTIVITY).add({
    action,
    entityType: 'spare_parts_replenishment',
    entityId: requestId,
    details,
    createdBy: actor.displayName,
    createdByUserId: actor.uid,
    createdAt: toIsoNow(),
    tenantId: actor.tenantId,
  });
};

export const createSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.create', ['inventory.transactions.create']);

  const payload = (request.data || {}) as {
    fromWarehouseId?: string;
    toWarehouseId?: string;
    note?: string;
    lines?: DraftLineInput[];
  };
  const toWarehouseId = String(payload.toWarehouseId || '').trim();
  if (!toWarehouseId) {
    throw new HttpsError('invalid-argument', 'حدد مخزن المركز المستلم.');
  }
  const fromWarehouseId = await resolveCentralWarehouseId(
    actor.tenantId,
    String(payload.fromWarehouseId || ''),
  );
  if (fromWarehouseId === toWarehouseId) {
    throw new HttpsError('invalid-argument', 'مخزن المصدر والوجهة يجب أن يكونا مختلفين.');
  }

  assertActorWarehouseInvolved(actor.boundWarehouseId, [fromWarehouseId, toWarehouseId]);

  const [fromWh, toWh] = await Promise.all([
    loadWarehouse(actor.tenantId, fromWarehouseId),
    loadWarehouse(actor.tenantId, toWarehouseId),
  ]);
  if (fromWh.role !== CENTRAL_ROLE) {
    throw new HttpsError(
      'failed-precondition',
      'المخزن المصدر يجب أن يكون دوره «قطع غيار (مركزي)».',
    );
  }
  if (toWh.role !== CENTER_ROLE) {
    throw new HttpsError(
      'failed-precondition',
      'المخزن الوجهة يجب أن يكون دوره «مخزن مركز صيانة».',
    );
  }

  const drafts = validateDraftLines(payload.lines || []);
  const lines = await resolveLinesFromMaterials(actor.tenantId, drafts);
  const totalCostSnapshot = roundMoney(
    lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0),
  );
  const referenceNo = await nextReferenceNo(actor.tenantId);
  const now = toIsoNow();
  const doc: RequestDoc = stripUndefined({
    referenceNo,
    status: 'submitted',
    fromWarehouseId,
    fromWarehouseName: fromWh.name,
    toWarehouseId,
    toWarehouseName: toWh.name,
    lines,
    note: String(payload.note || '').trim() || undefined,
    totalCostSnapshot,
    createdBy: actor.displayName,
    createdByUserId: actor.uid,
    createdAt: now,
    tenantId: actor.tenantId,
  }) as RequestDoc;

  const ref = db.collection(REQUESTS).doc();
  await ref.set(doc);
  await writeActivity(actor, 'spare_parts_replenishment.create', ref.id, {
    referenceNo,
    fromWarehouseId,
    toWarehouseId,
    lineCount: lines.length,
  });
  return { id: ref.id, referenceNo, status: doc.status };
};

export const approveSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.approve', ['inventory.transfers.approve']);
  const requestId = String((request.data as { requestId?: string })?.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (data.status !== 'submitted') {
    throw new HttpsError('failed-precondition', 'لا يمكن اعتماد الطلب في حالته الحالية.');
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  const now = toIsoNow();
  const reservedLines: Array<{ itemId: string; itemType: 'material'; reservedQty: number }> = [];
  await runTx(
    'تعذر اعتماد طلب التموين. تحقق من الرصيد المتاح في المخزن المركزي.',
    async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const current = snap.data() as RequestDoc;
    if (current.status !== 'submitted') {
      throw new HttpsError('failed-precondition', 'لا يمكن اعتماد الطلب في حالته الحالية.');
    }
    if (String(current.tenantId || '').trim() !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
    }
    if (current.stockReserved) {
      throw new HttpsError('failed-precondition', 'تم حجز مخزون هذا الطلب مسبقاً.');
    }

    for (const line of current.lines || []) {
      const qty = toNumber(line.requestedQty);
      if (!(qty > 0)) continue;
      const balRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(current.fromWarehouseId, line.itemType, line.itemId),
      );
      const balSnap = await tx.get(balRef);
      const bal = balSnap.exists ? (balSnap.data() as StockBalanceData) : undefined;
      reserveStockInTx(
        tx,
        balRef,
        {
          tenantId: actor.tenantId,
          qty,
          warehouseId: current.fromWarehouseId,
          itemType: line.itemType,
          itemId: line.itemId,
          label: `الصنف ${line.itemName}`,
        },
        bal,
      );
      reservedLines.push({
        itemId: line.itemId,
        itemType: 'material',
        reservedQty: qty,
      });
    }

    tx.update(ref, {
      status: 'approved',
      approvedAt: now,
      approvedBy: actor.displayName,
      approvedByUserId: actor.uid,
      stockReserved: true,
      reservedLines,
    });
    },
  );
  await writeActivity(actor, 'spare_parts_replenishment.approve', requestId, {
    referenceNo: data.referenceNo,
  });
  return { id: requestId };
};

export const prepareSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.prepare', [
    'inventory.transfers.approve',
    'inventory.transactions.create',
  ]);
  const payload = (request.data || {}) as {
    requestId?: string;
    lines?: PreparedLineInput[];
  };
  const requestId = String(payload.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (data.status !== 'approved') {
    throw new HttpsError('failed-precondition', 'التجهيز متاح فقط بعد الاعتماد.');
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  const prepMap = new Map<string, number>();
  for (const row of payload.lines || []) {
    const key = String(row.lineId || row.itemId || '').trim();
    if (!key) continue;
    const qty = toNumber(row.preparedQty);
    if (qty < 0) {
      throw new HttpsError('invalid-argument', 'كمية التجهيز لا يمكن أن تكون سالبة.');
    }
    prepMap.set(key, qty);
  }

  const locations = await activeLocationsForWarehouse(actor.tenantId, data.fromWarehouseId);
  const locationsRequired = locations.length > 0;
  const locationById = new Map(locations.map((loc) => [loc.id, loc]));

  const lines: ResolvedLine[] = [];
  for (const line of data.lines || []) {
    const preparedQty = prepMap.has(line.lineId)
      ? (prepMap.get(line.lineId) as number)
      : toNumber(line.preparedQty) > 0
        ? toNumber(line.preparedQty)
        : toNumber(line.requestedQty);
    const {
      locationId: _oldLocId,
      locationCode: _oldLocCode,
      allocations: _oldAlloc,
      availableQty: _oldAvail,
      shortageQty: _oldShortage,
      ...baseLine
    } = line;

    if (!(preparedQty > 0)) {
      lines.push({
        ...baseLine,
        preparedQty: 0,
        totalCostSnapshot: 0,
        allocations: [],
      });
      continue;
    }

    const preferred = String(line.locationId || '').trim() || undefined;
    const allocated = await allocateLineForCentralWarehouse({
      tenantId: actor.tenantId,
      warehouseId: data.fromWarehouseId,
      itemId: line.itemId,
      itemName: line.itemName,
      requiredQty: preparedQty,
      preferredLocationId: preferred,
      locationsRequired,
      locationById,
    });
    const nextLine: ResolvedLine = {
      ...baseLine,
      preparedQty,
      totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * preparedQty),
      allocations: allocated.allocations,
    };
    if (allocated.allocations.length > 0) {
      nextLine.locationId = allocated.locationId;
      nextLine.locationCode = allocated.locationCode;
      nextLine.availableQty = allocated.availableQty;
      nextLine.shortageQty = allocated.shortageQty;
    }
    lines.push(nextLine);
  }

  if (!lines.some((line) => toNumber(line.preparedQty) > 0)) {
    throw new HttpsError(
      'failed-precondition',
      'يجب تجهيز بند واحد على الأقل بكمية أكبر من صفر.',
    );
  }

  const totalCostSnapshot = roundMoney(
    lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0),
  );
  const now = toIsoNow();
  await ref.update({
    status: 'prepared',
    lines,
    totalCostSnapshot,
    preparedAt: now,
    preparedBy: actor.displayName,
    preparedByUserId: actor.uid,
  });
  await writeActivity(actor, 'spare_parts_replenishment.prepare', requestId, {
    referenceNo: data.referenceNo,
  });
  return { id: requestId };
};

export const responsibleApproveSparePartsReplenishmentHandler = async (
  request: CallableRequest,
) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.responsibleApprove', [
    'inventory.transfers.approve',
  ]);
  const requestId = String((request.data as { requestId?: string })?.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (data.status !== 'prepared') {
    throw new HttpsError('failed-precondition', 'موافقة المسؤول متاحة بعد التجهيز فقط.');
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  // Backfill pick locations for legacy prepared requests that predate shelf allocation.
  const locations = await activeLocationsForWarehouse(actor.tenantId, data.fromWarehouseId);
  const locationsRequired = locations.length > 0;
  const locationById = new Map(locations.map((loc) => [loc.id, loc]));
  const lines: ResolvedLine[] = [];
  for (const line of data.lines || []) {
    const preparedQty = line.preparedQty != null
      ? toNumber(line.preparedQty)
      : toNumber(line.requestedQty);
    if (!(preparedQty > 0)) {
      lines.push({
        ...line,
        preparedQty: 0,
        allocations: [],
      });
      continue;
    }
    const existing = normalizeLineAllocations(line);
    if (existing.length > 0 || !locationsRequired) {
      lines.push({
        ...line,
        preparedQty,
        ...(existing.length > 0 ? { allocations: existing } : {}),
      });
      continue;
    }
    const allocated = await allocateLineForCentralWarehouse({
      tenantId: actor.tenantId,
      warehouseId: data.fromWarehouseId,
      itemId: line.itemId,
      itemName: line.itemName,
      requiredQty: preparedQty,
      preferredLocationId: String(line.locationId || '').trim() || undefined,
      locationsRequired,
      locationById,
    });
    lines.push({
      ...line,
      allocations: allocated.allocations,
      locationId: allocated.locationId,
      locationCode: allocated.locationCode,
      availableQty: allocated.availableQty,
      shortageQty: allocated.shortageQty,
    });
  }

  const now = toIsoNow();
  await ref.update({
    status: 'responsible_approved',
    lines,
    responsibleApprovedAt: now,
    responsibleApprovedBy: actor.displayName,
    responsibleApprovedByUserId: actor.uid,
  });
  await writeActivity(actor, 'spare_parts_replenishment.responsible_approve', requestId, {
    referenceNo: data.referenceNo,
  });
  return { id: requestId };
};

export const receiveSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.receive', [
    'inventory.transactions.create',
    'inventory.transfers.approve',
  ]);
  const payload = (request.data || {}) as {
    requestId?: string;
    lines?: ReceiveLineInput[];
  };
  const requestId = String(payload.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (data.status !== 'responsible_approved') {
    throw new HttpsError(
      'failed-precondition',
      'تأكيد الاستلام متاح بعد موافقة المسؤول فقط.',
    );
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  const recvMap = new Map<string, number>();
  for (const row of payload.lines || []) {
    const key = String(row.lineId || row.itemId || '').trim();
    if (!key) continue;
    const qty = toNumber(row.receivedQty);
    if (!(qty > 0)) {
      throw new HttpsError('invalid-argument', 'كمية الاستلام يجب أن تكون أكبر من صفر.');
    }
    recvMap.set(key, qty);
  }

  // Ensure shelf pick plan exists before deducting location balances (legacy docs).
  const centralLocations = await activeLocationsForWarehouse(actor.tenantId, data.fromWarehouseId);
  const centralLocationsRequired = centralLocations.length > 0;
  const centralLocationById = new Map(centralLocations.map((loc) => [loc.id, loc]));
  if (centralLocationsRequired) {
    let needsPersist = false;
    const backfilledLines: ResolvedLine[] = [];
    for (const line of data.lines || []) {
      const preparedQty = line.preparedQty != null
        ? toNumber(line.preparedQty)
        : toNumber(line.requestedQty);
      if (!(preparedQty > 0)) {
        backfilledLines.push({ ...line, preparedQty: 0, allocations: [] });
        continue;
      }
      const existing = normalizeLineAllocations(line);
      if (existing.length > 0) {
        backfilledLines.push({ ...line, allocations: existing });
        continue;
      }
      needsPersist = true;
      const allocated = await allocateLineForCentralWarehouse({
        tenantId: actor.tenantId,
        warehouseId: data.fromWarehouseId,
        itemId: line.itemId,
        itemName: line.itemName,
        requiredQty: preparedQty,
        preferredLocationId: String(line.locationId || '').trim() || undefined,
        locationsRequired: true,
        locationById: centralLocationById,
      });
      backfilledLines.push({
        ...line,
        allocations: allocated.allocations,
        locationId: allocated.locationId,
        locationCode: allocated.locationCode,
        availableQty: allocated.availableQty,
        shortageQty: allocated.shortageQty,
      });
    }
    if (needsPersist) {
      await ref.update({ lines: backfilledLines });
      data.lines = backfilledLines;
    }
  }

  const now = toIsoNow();
  await runTx('تعذر تأكيد استلام التموين.', async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const current = snap.data() as RequestDoc;
    if (current.status !== 'responsible_approved') {
      throw new HttpsError('failed-precondition', 'لا يمكن استلام الطلب في حالته الحالية.');
    }
    if (String(current.tenantId || '').trim() !== actor.tenantId) {
      throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
    }

    type PlannedLine = {
      line: ResolvedLine;
      prepared: number;
      receivedQty: number;
      allocations: ResolvedAllocation[];
      sourceBalRef: DocumentReference;
      targetBalRef: DocumentReference;
      locationRefs: Array<{
        allocation: ResolvedAllocation;
        locRef: DocumentReference;
      }>;
    };

    const planned: PlannedLine[] = [];
    const skippedLines: ResolvedLine[] = [];
    const balanceRefs: DocumentReference[] = [];
    for (const line of current.lines || []) {
      const prepared = line.preparedQty != null
        ? toNumber(line.preparedQty)
        : toNumber(line.requestedQty);
      if (!(prepared > 0)) {
        skippedLines.push({ ...line, preparedQty: 0, receivedQty: 0 });
        continue;
      }
      const receivedQty = recvMap.has(line.lineId)
        ? (recvMap.get(line.lineId) as number)
        : prepared;
      if (!(receivedQty > 0)) {
        throw new HttpsError('invalid-argument', `كمية استلام غير صالحة للصنف ${line.itemName}.`);
      }
      const allocations = scaleAllocations(normalizeLineAllocations(line), receivedQty);
      const sourceBalRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(current.fromWarehouseId, line.itemType, line.itemId),
      );
      const targetBalRef = db.collection(STOCK_ITEMS).doc(
        balanceDocId(current.toWarehouseId, line.itemType, line.itemId),
      );
      const locationRefs = allocations.map((allocation) => ({
        allocation,
        locRef: db.collection(STOCK_LOCATION_BALANCES).doc(
          locationBalanceDocId(current.fromWarehouseId, allocation.locationId, line.itemId),
        ),
      }));
      planned.push({
        line,
        prepared,
        receivedQty,
        allocations,
        sourceBalRef,
        targetBalRef,
        locationRefs,
      });
      balanceRefs.push(sourceBalRef, targetBalRef, ...locationRefs.map((r) => r.locRef));
    }

    if (planned.length === 0) {
      throw new HttpsError('failed-precondition', 'لا توجد بنود مجهّزة للاستلام.');
    }

    const balanceSnaps = balanceRefs.length > 0 ? await tx.getAll(...balanceRefs) : [];
    const balanceSnapByPath = new Map(balanceSnaps.map((s) => [s.ref.path, s]));

    const nextLines: ResolvedLine[] = [];
    for (const row of planned) {
      const sourceBalSnap = balanceSnapByPath.get(row.sourceBalRef.path);
      const targetBalSnap = balanceSnapByPath.get(row.targetBalRef.path);
      if (
        (sourceBalSnap?.exists
          && String(sourceBalSnap.data()?.tenantId || '') !== actor.tenantId)
        || (targetBalSnap?.exists
          && String(targetBalSnap.data()?.tenantId || '') !== actor.tenantId)
      ) {
        throw new HttpsError('permission-denied', 'رصيد المخزن خارج شركتك.');
      }
      const sourceBal = sourceBalSnap?.exists
        ? (sourceBalSnap.data() as StockBalanceData & {
          minStock?: number;
          itemName?: string;
          itemCode?: string;
          unit?: string;
        })
        : undefined;
      const sourceQty = toNumber(sourceBal?.quantity);
      const targetQty = targetBalSnap?.exists ? toNumber(targetBalSnap.data()?.quantity) : 0;
      if (sourceQty < row.receivedQty) {
        throw new HttpsError(
          'failed-precondition',
          `الرصيد غير كافٍ في مخزن قطع الغيار للصنف ${row.line.itemName}.`,
        );
      }

      const reservedForLine = (current.reservedLines || []).find(
        (r) => String(r.itemId) === String(row.line.itemId),
      );
      // Drop this request's entire hold on receive (covers short receipts too).
      const releaseReserveQty = Math.max(0, toNumber(reservedForLine?.reservedQty));
      const availableAfterOwnHold = stockAvailableQty(sourceBal) + releaseReserveQty;
      if (availableAfterOwnHold + 1e-9 < row.receivedQty) {
        throw new HttpsError(
          'failed-precondition',
          `الرصيد المتاح غير كافٍ في مخزن قطع الغيار للصنف ${row.line.itemName}.`,
        );
      }

      for (const locRow of row.locationRefs) {
        const locSnap = balanceSnapByPath.get(locRow.locRef.path);
        if (locSnap?.exists && String(locSnap.data()?.tenantId || '') !== actor.tenantId) {
          throw new HttpsError('permission-denied', 'رصيد الرف خارج شركتك.');
        }
        const locQty = locSnap?.exists ? toNumber(locSnap.data()?.quantity) : 0;
        if (locQty - toNumber(locRow.allocation.quantity) < -0.000001) {
          throw new HttpsError(
            'failed-precondition',
            `رصيد الرف غير كافٍ للصنف ${row.line.itemName}.`,
          );
        }
      }

      const outTxRef = db.collection(STOCK_TX).doc(`spr_${requestId}_${row.line.itemId}_out`);
      const inTxRef = db.collection(STOCK_TX).doc(`spr_${requestId}_${row.line.itemId}_in`);
      const referenceNo = `${current.referenceNo}-R`;
      const firstLoc = row.allocations[0];

      tx.set(outTxRef, {
        warehouseId: current.fromWarehouseId,
        toWarehouseId: current.toWarehouseId,
        itemType: row.line.itemType,
        itemId: row.line.itemId,
        itemName: row.line.itemName,
        itemCode: row.line.itemCode,
        unit: row.line.unit,
        movementType: 'TRANSFER',
        quantity: row.receivedQty,
        transferDirection: 'OUT',
        relatedTransactionId: inTxRef.id,
        referenceNo,
        note: `تموين قطع غيار ${current.referenceNo}`,
        unitCost: row.line.unitCostSnapshot,
        totalCost: roundMoney(row.line.unitCostSnapshot * row.receivedQty),
        sourceModule: SOURCE,
        sourceId: requestId,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
        ...(firstLoc
          ? { locationId: firstLoc.locationId, locationCode: firstLoc.locationCode }
          : {}),
      });
      tx.set(inTxRef, {
        warehouseId: current.toWarehouseId,
        toWarehouseId: current.fromWarehouseId,
        itemType: row.line.itemType,
        itemId: row.line.itemId,
        itemName: row.line.itemName,
        itemCode: row.line.itemCode,
        unit: row.line.unit,
        movementType: 'TRANSFER',
        quantity: row.receivedQty,
        transferDirection: 'IN',
        relatedTransactionId: outTxRef.id,
        referenceNo,
        note: `تموين قطع غيار ${current.referenceNo}`,
        unitCost: row.line.unitCostSnapshot,
        totalCost: roundMoney(row.line.unitCostSnapshot * row.receivedQty),
        sourceModule: SOURCE,
        sourceId: requestId,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
      });
      tx.set(row.sourceBalRef, {
        warehouseId: current.fromWarehouseId,
        itemType: row.line.itemType,
        itemId: row.line.itemId,
        itemName: row.line.itemName,
        itemCode: row.line.itemCode,
        unit: row.line.unit,
        minStock: toNumber(sourceBal?.minStock),
        quantity: sourceQty - row.receivedQty,
        reservedQty: Math.max(0, stockReservedQty(sourceBal) - releaseReserveQty),
        updatedAt: now,
        tenantId: actor.tenantId,
      }, { merge: true });
      tx.set(row.targetBalRef, {
        warehouseId: current.toWarehouseId,
        itemType: row.line.itemType,
        itemId: row.line.itemId,
        itemName: row.line.itemName,
        itemCode: row.line.itemCode,
        unit: row.line.unit,
        minStock: toNumber(targetBalSnap?.data()?.minStock),
        quantity: targetQty + row.receivedQty,
        updatedAt: now,
        tenantId: actor.tenantId,
      }, { merge: true });

      for (const locRow of row.locationRefs) {
        const locSnap = balanceSnapByPath.get(locRow.locRef.path);
        const locData = locSnap?.exists
          ? (locSnap.data() as {
            quantity?: number;
            locationCode?: string;
            rack?: string;
            shelf?: string;
            itemName?: string;
            itemCode?: string;
            unit?: string;
          })
          : undefined;
        const locQty = toNumber(locData?.quantity);
        tx.set(locRow.locRef, {
          warehouseId: current.fromWarehouseId,
          locationId: locRow.allocation.locationId,
          locationCode: String(
            locRow.allocation.locationCode || locData?.locationCode || locRow.allocation.locationId,
          ),
          ...(locRow.allocation.rack || locData?.rack
            ? { rack: locRow.allocation.rack || locData?.rack }
            : {}),
          ...(locRow.allocation.shelf || locData?.shelf
            ? { shelf: locRow.allocation.shelf || locData?.shelf }
            : {}),
          itemType: 'material',
          itemId: row.line.itemId,
          itemName: row.line.itemName || locData?.itemName || row.line.itemId,
          itemCode: row.line.itemCode || locData?.itemCode || '',
          unit: row.line.unit || locData?.unit || 'piece',
          quantity: locQty - toNumber(locRow.allocation.quantity),
          updatedAt: now,
          lastMovementAt: now,
          tenantId: actor.tenantId,
        }, { merge: true });
      }

      nextLines.push({
        ...row.line,
        preparedQty: row.prepared,
        receivedQty: row.receivedQty,
        totalCostSnapshot: roundMoney(toNumber(row.line.unitCostSnapshot) * row.receivedQty),
        ...(row.allocations.length > 0
          ? {
            allocations: row.allocations,
            locationId: row.allocations[0]?.locationId,
            locationCode: row.allocations[0]?.locationCode,
          }
          : {}),
      });
    }

    nextLines.push(...skippedLines);

    const totalCostSnapshot = roundMoney(
      nextLines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0),
    );
    tx.update(ref, {
      status: 'received',
      lines: nextLines,
      totalCostSnapshot,
      receivedAt: now,
      receivedBy: actor.displayName,
      receivedByUserId: actor.uid,
      stockReserved: false,
      reservedLines: [],
    });
  });

  await writeActivity(actor, 'spare_parts_replenishment.receive', requestId, {
    referenceNo: data.referenceNo,
  });

  // Sync received qty into repair branch spare-parts ledger (jobs consume from that ledger).
  try {
    await syncReceivedQtyToRepairBranchStock({
      tenantId: actor.tenantId,
      toWarehouseId: data.toWarehouseId,
      lines: ((await ref.get()).data()?.lines as ResolvedLine[] | undefined) || data.lines,
      actorName: actor.displayName,
      referenceNo: data.referenceNo,
      requestId,
    });
  } catch (syncErr) {
    console.error('spare_parts_replenishment.receive repair sync failed', {
      requestId,
      tenantId: actor.tenantId,
      message: syncErr instanceof Error ? syncErr.message : String(syncErr),
    });
  }

  // Mark job demand links ready and attempt auto-issue to repair jobs.
  let fulfillSummary = { marked: 0, issued: 0, failed: 0 };
  try {
    const { fulfillJobDemandsAfterReplenishmentReceive } = await import(
      './repairJobSparePartRequest.js'
    );
    const receivedLines = ((await ref.get()).data()?.lines as Array<{
      itemId?: string;
      demandLinks?: Array<{ jobId: string; usageId: string; quantity: number }>;
    }> | undefined) || data.lines;
    fulfillSummary = await fulfillJobDemandsAfterReplenishmentReceive({
      request,
      tenantId: actor.tenantId,
      requestId,
      lines: receivedLines || [],
    });
  } catch (fulfillErr) {
    console.error('spare_parts_replenishment.receive job fulfill failed', {
      requestId,
      tenantId: actor.tenantId,
      message: fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr),
    });
  }

  return { id: requestId, fulfillSummary };
};

async function syncReceivedQtyToRepairBranchStock(input: {
  tenantId: string;
  toWarehouseId: string;
  lines: ResolvedLine[];
  actorName: string;
  referenceNo: string;
  requestId: string;
}): Promise<void> {
  const warehouseId = String(input.toWarehouseId || '').trim();
  if (!warehouseId) return;

  const branchSnap = await db
    .collection('repair_branches')
    .where('tenantId', '==', input.tenantId)
    .where('warehouseId', '==', warehouseId)
    .limit(1)
    .get();
  if (branchSnap.empty) return;
  const branchDoc = branchSnap.docs[0];
  const branchId = branchDoc.id;
  const now = toIsoNow();

  for (const line of input.lines || []) {
    const receivedQty = toNumber(line.receivedQty);
    if (!(receivedQty > 0)) continue;
    const materialId = String(line.itemId || '').trim();
    if (!materialId) continue;

    const existingParts = await db
      .collection('repair_spare_parts')
      .where('tenantId', '==', input.tenantId)
      .where('branchId', '==', branchId)
      .where('materialId', '==', materialId)
      .limit(1)
      .get();

    let partId = existingParts.empty ? '' : existingParts.docs[0].id;
    if (!partId) {
      const materialSnap = await db.collection('materials').doc(materialId).get();
      if (materialSnap.exists && materialSnap.data()?.availableForSpareParts === false) {
        throw new HttpsError(
          'failed-precondition',
          'هذه المادة غير مفعّلة لقطع الغيار. فعّلها من شاشة المواد التصنيعية أولاً.',
        );
      }
      const partRef = db.collection('repair_spare_parts').doc();
      await partRef.set({
        tenantId: input.tenantId,
        branchId,
        name: String(line.itemName || materialId),
        code: String(line.itemCode || ''),
        category: 'تموين',
        unit: String(line.unit || 'قطعة'),
        minStock: 0,
        materialId,
        purchaseUnitCost: toNumber(line.unitCostSnapshot),
        createdAt: now,
      });
      partId = partRef.id;
    }

    const stockDocId = `${branchId}__${warehouseId}__${partId}`;
    const stockRef = db.collection('repair_spare_parts_stock').doc(stockDocId);
    await db.runTransaction(async (tx) => {
      const stockSnap = await tx.get(stockRef);
      const current = stockSnap.exists ? toNumber(stockSnap.data()?.quantity) : 0;
      tx.set(stockRef, {
        tenantId: input.tenantId,
        branchId,
        warehouseId,
        partId,
        quantity: current + receivedQty,
        updatedAt: now,
      }, { merge: true });
      const txRef = db.collection('repair_parts_transactions').doc();
      tx.set(txRef, {
        tenantId: input.tenantId,
        branchId,
        warehouseId,
        partId,
        partName: String(line.itemName || ''),
        type: 'IN',
        quantity: receivedQty,
        unitCost: toNumber(line.unitCostSnapshot),
        note: `تموين ${input.referenceNo}`,
        createdBy: input.actorName,
        createdAt: now,
        sourceModule: 'spare_parts_replenishment',
        sourceId: input.requestId,
      });
    });
  }
}

export const rejectSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.reject', [
    'sparePartsReplenishment.approve',
    'inventory.transfers.approve',
  ]);
  const payload = (request.data || {}) as { requestId?: string; reason?: string };
  const requestId = String(payload.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (data.status !== 'submitted' && data.status !== 'approved') {
    throw new HttpsError('failed-precondition', 'لا يمكن رفض الطلب في حالته الحالية.');
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  if (data.stockReserved) {
    await releaseRequestReservations(actor.tenantId, data.fromWarehouseId, data.reservedLines);
  }

  const now = toIsoNow();
  await ref.update(stripUndefined({
    status: 'rejected',
    rejectedAt: now,
    rejectedBy: actor.displayName,
    rejectedByUserId: actor.uid,
    rejectionReason: String(payload.reason || '').trim() || undefined,
    stockReserved: false,
    reservedLines: [],
  }));
  await writeActivity(actor, 'spare_parts_replenishment.reject', requestId, {
    referenceNo: data.referenceNo,
  });
  return { id: requestId };
};

export const cancelSparePartsReplenishmentHandler = async (request: CallableRequest) => {
  const uid = requireAuth(request);
  const actor = await loadActor(uid);
  assertPerm(actor, 'sparePartsReplenishment.cancel', [
    'sparePartsReplenishment.create',
    'inventory.transactions.create',
    'inventory.transfers.approve',
  ]);
  const requestId = String((request.data as { requestId?: string })?.requestId || '').trim();
  if (!requestId) throw new HttpsError('invalid-argument', 'requestId مطلوب.');

  const { ref, data } = await loadRequest(requestId, actor.tenantId);
  if (
    data.status !== 'submitted'
    && data.status !== 'approved'
    && data.status !== 'prepared'
    && data.status !== 'responsible_approved'
  ) {
    throw new HttpsError('failed-precondition', 'لا يمكن إلغاء الطلب في حالته الحالية.');
  }
  assertActorWarehouseInvolved(actor.boundWarehouseId, [data.fromWarehouseId, data.toWarehouseId]);

  if (data.stockReserved) {
    await releaseRequestReservations(actor.tenantId, data.fromWarehouseId, data.reservedLines);
  }

  const now = toIsoNow();
  await ref.update({
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: actor.displayName,
    cancelledByUserId: actor.uid,
    stockReserved: false,
    reservedLines: [],
  });
  await writeActivity(actor, 'spare_parts_replenishment.cancel', requestId, {
    referenceNo: data.referenceNo,
  });
  return { id: requestId };
};
