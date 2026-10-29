import { FieldValue } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import {
  countOpenScanSessions,
  evaluateWorkOrderClose,
  policyStateFromSettings,
  type WorkOrderCloseDenial,
  type WorkOrderCloseMode,
} from './workOrderCloseCore.js';

const USERS = 'users';
const ROLES = 'roles';
const WORK_ORDERS = 'work_orders';
const SETTINGS = 'quality_settings';
const PALLETS = 'quality_pallets';
const SCAN_EVENTS = 'scan_events';

const clean = (value: unknown): string => String(value ?? '').trim();

const DENIAL_MESSAGE: Record<WorkOrderCloseDenial, string> = {
  permission: 'ليس لديك صلاحية إغلاق أمر الشغل.',
  tenant: 'أمر الشغل غير موجود داخل الشركة.',
  cancelled: 'لا يمكن إغلاق أمر شغل ملغي.',
  hours: 'لا يمكن إغلاق أمر الشغل بدون تسجيل ساعات العمل الفعلية.',
  sessions: 'لا يمكن إغلاق أمر الشغل لوجود جلسات قيد التشغيل بدون تسجيل خروج.',
  quantity: 'لم تبلغ كمية أمر الشغل الحد المطلوب للإغلاق.',
  'policy-unreadable': 'تعذر التحقق من سياسة الجودة. تم إيقاف الإغلاق.',
  'quality-not-released': 'لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة.',
};

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  isSuperAdmin: boolean;
  permissions: Record<string, boolean>;
};

type CloseInput = {
  workOrderId: string;
  mode: WorkOrderCloseMode;
  actualWorkHours?: number;
  actualProducedFromScans?: number;
  actualWorkersCount?: number;
  scanSummary?: Record<string, unknown>;
  scanSessionClosedAt?: string;
  notes?: string;
};

const loadActor = async (uid: string): Promise<Actor> => {
  const db = getDb();
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', DENIAL_MESSAGE.permission);
  const user = userSnap.data() as {
    tenantId?: string;
    displayName?: string;
    email?: string;
    isActive?: boolean;
    isSuperAdmin?: boolean;
    roleId?: string;
  };
  const isSuperAdmin = user.isSuperAdmin === true;
  if (user.isActive !== true && !isSuperAdmin) {
    throw new HttpsError('permission-denied', DENIAL_MESSAGE.permission);
  }
  const tenantId = clean(user.tenantId);
  if (!tenantId && !isSuperAdmin) {
    throw new HttpsError('permission-denied', DENIAL_MESSAGE.tenant);
  }
  let permissions: Record<string, boolean> = {};
  const roleId = clean(user.roleId);
  if (roleId) {
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    const role = roleSnap.data() as { tenantId?: string; permissions?: Record<string, boolean> } | undefined;
    const roleTenant = clean(role?.tenantId);
    if (!roleSnap.exists || (roleTenant && roleTenant !== tenantId && !isSuperAdmin)) {
      throw new HttpsError('permission-denied', DENIAL_MESSAGE.permission);
    }
    if (!roleTenant || roleTenant === tenantId) permissions = role?.permissions || {};
  }
  return {
    uid,
    tenantId,
    displayName: clean(user.displayName || user.email || uid),
    isSuperAdmin,
    permissions,
  };
};

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

const plainSummary = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
  const summary: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) continue;
    if (typeof item === 'string') summary[key] = item.slice(0, 200);
    else if (typeof item === 'number' && Number.isFinite(item)) summary[key] = item;
    else if (typeof item === 'boolean') summary[key] = item;
  }
  return summary;
};

const parseInput = (data: unknown): CloseInput => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'بيانات الإغلاق غير صالحة.');
  }
  const body = data as Record<string, unknown>;
  const workOrderId = clean(body.workOrderId);
  if (!workOrderId || workOrderId.length > 200) {
    throw new HttpsError('invalid-argument', 'معرّف أمر الشغل غير صالح.');
  }
  const mode = body.mode === 'quantity_reached' ? 'quantity_reached' : body.mode === 'operator' || body.mode === undefined
    ? 'operator'
    : null;
  if (!mode) throw new HttpsError('invalid-argument', 'نوع الإغلاق غير صالح.');
  const notes = body.notes === undefined ? undefined : clean(body.notes).slice(0, 4000);
  const scanSessionClosedAt = body.scanSessionClosedAt === undefined
    ? undefined
    : clean(body.scanSessionClosedAt).slice(0, 40);
  return {
    workOrderId,
    mode,
    actualWorkHours: finiteNumber(body.actualWorkHours),
    actualProducedFromScans: finiteNumber(body.actualProducedFromScans),
    actualWorkersCount: finiteNumber(body.actualWorkersCount),
    scanSummary: plainSummary(body.scanSummary),
    scanSessionClosedAt,
    notes,
  };
};

const timestampMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const closeWorkOrderHandler = async (
  request: CallableRequest,
): Promise<{ ok: true; workOrderId: string; alreadyClosed: boolean }> => {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const input = parseInput(request.data);
  const actor = await loadActor(uid);
  const db = getDb();
  const workOrderRef = db.collection(WORK_ORDERS).doc(input.workOrderId);

  const result = await db.runTransaction(async (transaction) => {
    const workOrderSnap = await transaction.get(workOrderRef);
    if (!workOrderSnap.exists) throw new HttpsError('not-found', DENIAL_MESSAGE.tenant);
    const workOrder = workOrderSnap.data() as Record<string, unknown>;
    const workOrderTenantId = clean(workOrder.tenantId);
    const settingsSnap = await transaction.get(db.collection(SETTINGS).doc(workOrderTenantId));
    const settings = settingsSnap.data() as { closeRequiresQualityApproval?: unknown } | undefined;
    const policyState = policyStateFromSettings(
      settingsSnap.exists,
      settings?.closeRequiresQualityApproval,
    );

    let pallets: Array<{ inspectionStatus?: string; palletDecision?: string }> = [];
    let palletReadFailed = false;
    if (policyState === 'on') {
      try {
        const palletSnap = await transaction.get(
          db.collection(PALLETS)
            .where('tenantId', '==', workOrderTenantId)
            .where('workOrderId', '==', input.workOrderId),
        );
        pallets = palletSnap.docs.map((item) => item.data() as { inspectionStatus?: string; palletDecision?: string });
      } catch {
        palletReadFailed = true;
      }
    }

    let openSessions = 0;
    if (input.mode === 'operator') {
      try {
        const scanSnap = await transaction.get(
          db.collection(SCAN_EVENTS)
            .where('tenantId', '==', workOrderTenantId)
            .where('workOrderId', '==', input.workOrderId),
        );
        openSessions = countOpenScanSessions(scanSnap.docs.map((item) => {
          const row = item.data() as { sessionId?: string; action?: string; timestamp?: unknown };
          return { sessionId: row.sessionId, action: row.action, timestampMs: timestampMs(row.timestamp) };
        }));
      } catch {
        throw new HttpsError('failed-precondition', DENIAL_MESSAGE['policy-unreadable']);
      }
    }

    const hours = input.actualWorkHours ?? Number(workOrder.actualWorkHours || 0);
    const decision = evaluateWorkOrderClose({
      actorTenantId: actor.tenantId,
      actorIsSuperAdmin: actor.isSuperAdmin,
      hasClosePermission: actor.permissions['workOrders.edit'] === true,
      workOrderTenantId,
      workOrderStatus: clean(workOrder.status),
      mode: input.mode,
      policyState,
      legacyQualityStatus: clean(workOrder.qualityStatus) || undefined,
      pallets,
      palletReadFailed,
      actualWorkHours: hours,
      openSessions,
      producedQuantity: Number(workOrder.producedQuantity || 0),
      targetQuantity: Number(workOrder.quantity || 0),
    });
    if (!decision.ok) throw new HttpsError('failed-precondition', DENIAL_MESSAGE[decision.reason]);
    if (decision.alreadyClosed) return { alreadyClosed: true };

    const completedAt = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: 'completed',
      completedAt: clean(workOrder.completedAt) || completedAt,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.displayName,
      'statusHistory.completed': FieldValue.serverTimestamp(),
    };
    if (input.mode === 'operator') {
      patch.actualWorkHours = hours;
      if (input.actualProducedFromScans !== undefined) patch.actualProducedFromScans = input.actualProducedFromScans;
      if (input.actualWorkersCount !== undefined) patch.actualWorkersCount = input.actualWorkersCount;
      if (input.scanSummary) patch.scanSummary = input.scanSummary;
      if (input.scanSessionClosedAt) patch.scanSessionClosedAt = input.scanSessionClosedAt;
      if (input.notes !== undefined) patch.notes = input.notes;
    }
    transaction.update(workOrderRef, patch);
    return { alreadyClosed: false };
  });

  return { ok: true, workOrderId: input.workOrderId, alreadyClosed: result.alreadyClosed };
};
