import { FieldValue } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import {
  buildProductionReportFastUniqueKey,
  validateProductionReportAssignment,
} from './productionReportFastCore.js';

const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const EMPLOYEES = 'employees';
const REPORTS = 'production_reports';
const UNIQUES = 'production_report_uniques';
const WORK_ORDERS = 'work_orders';

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  isSuperAdmin: boolean;
  permissions: Record<string, boolean>;
};

type ReportInput = Record<string, unknown> & {
  employeeId?: string;
  productId?: string;
  lineId?: string;
  date?: string;
  quantityProduced?: number;
  workersCount?: number;
  workHours?: number;
  workOrderId?: string;
  reportType?: string;
  shift?: string;
};

const clean = (value: unknown): string => String(value ?? '').trim();
const normalizeReportType = (value: unknown): string => {
  const type = clean(value) || 'finished_product';
  return ['finished_product', 'component_injection', 'packaging', 'component_waste'].includes(type)
    ? type
    : 'finished_product';
};
const normalizeShift = (value: unknown): string => {
  const shift = clean(value).toLowerCase();
  return shift === 'evening' || shift === 'night' || shift === 'shift2' ? 'evening' : 'morning';
};
const skipsUnique = (reportType: string): boolean => reportType === 'packaging' || reportType === 'component_waste';

const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, stripUndefinedDeep(item)] as const)
      .filter(([, item]) => item !== undefined),
  );
};

const loadActor = async (uid: string): Promise<Actor> => {
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as {
    tenantId?: string;
    displayName?: string;
    email?: string;
    isActive?: boolean;
    isSuperAdmin?: boolean;
    roleId?: string;
  };
  if (user.isActive !== true && user.isSuperAdmin !== true) {
    throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  }
  const tenantId = clean(user.tenantId);
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = clean(user.roleId);
  if (roleId) {
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    const role = roleSnap.data() as { tenantId?: string; permissions?: Record<string, boolean> } | undefined;
    if (!roleSnap.exists || clean(role?.tenantId) !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح لهذه الشركة.');
    }
    permissions = role?.permissions || {};
  }
  return {
    uid,
    tenantId,
    displayName: clean(user.displayName || user.email || uid),
    isSuperAdmin: user.isSuperAdmin === true,
    permissions,
  };
};

const can = (actor: Actor, permission: string): boolean => (
  actor.isSuperAdmin || actor.permissions[permission] === true
);

const requireInput = (request: CallableRequest): ReportInput => {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const root = request.data;
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new HttpsError('invalid-argument', 'بيانات التقرير غير صالحة.');
  }
  const report = (root as { report?: unknown }).report;
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new HttpsError('invalid-argument', 'بيانات التقرير مطلوبة.');
  }
  return report as ReportInput;
};

const assertBaseFields = (report: ReportInput): void => {
  for (const field of ['employeeId', 'productId', 'lineId', 'date'] as const) {
    if (!clean(report[field])) throw new HttpsError('invalid-argument', `الحقل ${field} مطلوب.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(report.date))) {
    throw new HttpsError('invalid-argument', 'تاريخ التقرير غير صالح.');
  }
  for (const field of ['quantityProduced', 'workersCount', 'workHours'] as const) {
    const number = Number(report[field]);
    if (!Number.isFinite(number) || number < 0) {
      throw new HttpsError('invalid-argument', `الحقل ${field} غير صالح.`);
    }
  }
};

const protectedFields = [
  'tenantId', 'id', 'createdAt', 'updatedAt', 'reportCode',
  'createdByUid', 'createdByNameSnapshot', 'entryMode',
  'processingVersion', 'processingState', 'processingStage', 'processingError',
  'processingAttempts', 'processingUpdatedAt',
  'inventoryAppliedAt', 'inventoryAppliedBy', 'inventoryAppliedByUserId',
  'inventoryPostingState', 'inventoryPostingUpdatedAt',
  'inventoryReversedAt', 'inventoryReversedBy', 'inventoryReversedByUserId',
] as const;

export async function createProductionReportFastHandler(request: CallableRequest) {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const actor = await loadActor(uid);
  const input = requireInput(request);
  const reportType = normalizeReportType(input.reportType);
  assertBaseFields(input);

  const allowed = reportType === 'component_injection'
    ? can(actor, 'reports.componentInjection.manage') || can(actor, 'reports.componentInjection.only')
    : reportType === 'packaging'
      ? can(actor, 'reports.create') || can(actor, 'reports.packaging.create')
      : reportType === 'component_waste'
        ? can(actor, 'reports.componentWaste.create') || can(actor, 'reports.edit')
        : can(actor, 'reports.create');
  if (!allowed) throw new HttpsError('permission-denied', 'غير مصرح بإنشاء هذا النوع من التقارير.');
  if (reportType === 'component_injection' && !clean(input.shift)) {
    throw new HttpsError('failed-precondition', 'الوردية مطلوبة لتقرير الحقن.');
  }

  const [actorEmployeeSnap, targetEmployeeSnap] = await Promise.all([
    db.collection(EMPLOYEES)
      .where('tenantId', '==', actor.tenantId)
      .where('userId', '==', actor.uid)
      .limit(1)
      .get(),
    db.collection(EMPLOYEES).doc(clean(input.employeeId)).get(),
  ]);
  const actorEmployee = actorEmployeeSnap.docs[0]?.data() as { level?: number } | undefined;
  const actorEmployeeId = actorEmployeeSnap.docs[0]?.id || '';
  const targetEmployee = targetEmployeeSnap.data() as { tenantId?: string; isActive?: boolean } | undefined;
  const workOrderId = clean(input.workOrderId);
  const delegated = Boolean(
    can(actor, 'reports.createForAnySupervisor')
    && actorEmployeeId
    && actorEmployeeId !== clean(input.employeeId),
  );
  const workOrderSnap = workOrderId
    ? await db.collection(WORK_ORDERS).doc(workOrderId).get()
    : null;
  const workOrder = workOrderSnap?.data() as {
    tenantId?: string;
    supervisorId?: string;
    lineId?: string;
    productId?: string;
    status?: string;
  } | undefined;
  const assignmentError = validateProductionReportAssignment({
    actorTenantId: actor.tenantId,
    actorEmployeeId,
    actorEmployeeLevel: Number(actorEmployee?.level || 0),
    canCreateForAnySupervisor: can(actor, 'reports.createForAnySupervisor'),
    targetEmployeeId: clean(input.employeeId),
    targetEmployeeExists: targetEmployeeSnap.exists,
    targetEmployeeTenantId: clean(targetEmployee?.tenantId),
    targetEmployeeActive: targetEmployee?.isActive !== false,
    reportLineId: clean(input.lineId),
    reportProductId: clean(input.productId),
    workOrderId,
    workOrder: workOrderSnap?.exists ? {
      tenantId: clean(workOrder?.tenantId),
      supervisorId: clean(workOrder?.supervisorId),
      lineId: clean(workOrder?.lineId),
      productId: clean(workOrder?.productId),
      status: clean(workOrder?.status),
    } : null,
  });
  if (assignmentError) throw new HttpsError(assignmentError.code, assignmentError.message);

  const payload = { ...input };
  Object.keys(payload).forEach((field) => {
    if (
      (protectedFields as readonly string[]).includes(field)
      || /cost/i.test(field)
      || field.startsWith('inventory')
    ) delete payload[field];
  });
  payload.reportType = reportType;
  payload.employeeId = clean(input.employeeId);
  payload.productId = clean(input.productId);
  payload.lineId = clean(input.lineId);
  payload.date = clean(input.date);
  payload.workOrderId = workOrderId;
  if (reportType === 'component_injection') payload.shift = normalizeShift(input.shift);
  else delete payload.shift;

  const reportRef = db.collection(REPORTS).doc();
  const reportCode = `PR-${new Date().getUTCFullYear()}-${reportRef.id.slice(0, 8).toUpperCase()}`;
  const uniqueKey = buildProductionReportFastUniqueKey(payload);
  const uniqueKeysToCheck = [uniqueKey];
  if (reportType === 'component_injection' && normalizeShift(payload.shift) === 'morning') {
    const legacy = buildProductionReportFastUniqueKey(payload, false);
    if (legacy !== uniqueKey) uniqueKeysToCheck.push(legacy);
  }

  await db.runTransaction(async (transaction) => {
    if (!skipsUnique(reportType)) {
      for (const key of uniqueKeysToCheck) {
        const snap = await transaction.get(db.collection(UNIQUES).doc(key));
        if (snap.exists) throw new HttpsError('already-exists', 'يوجد تقرير مسجل بالفعل لنفس أمر الشغل.');
      }
    }
    transaction.set(reportRef, stripUndefinedDeep({
      ...payload,
      tenantId: actor.tenantId,
      reportCode,
      createdByUid: actor.uid,
      createdByNameSnapshot: actor.displayName,
      entryMode: delegated ? 'hall_supervisor_delegate' : 'direct',
      processingVersion: 2,
      processingState: 'pending',
      processingStage: 'created',
      processingError: '',
      processingAttempts: 0,
      processingUpdatedAt: FieldValue.serverTimestamp(),
      aggregateCostPostingState: 'pending',
      workOrderCostPostedTargetId: '',
      workOrderCostPostedSnapshot: 0,
      productionPlanCostPostedTargetId: '',
      productionPlanCostPostedSnapshot: 0,
      manufacturingCostPostingState: 'pending',
      manufacturingCostPostingError: '',
      createdAt: FieldValue.serverTimestamp(),
    }) as FirebaseFirestore.DocumentData);
    if (!skipsUnique(reportType)) {
      transaction.set(db.collection(UNIQUES).doc(uniqueKey), {
        tenantId: actor.tenantId,
        reportId: reportRef.id,
        date: payload.date,
        lineId: payload.lineId,
        employeeId: payload.employeeId,
        productId: payload.productId,
        reportType,
        workOrderId,
        ...(reportType === 'component_injection' ? { shift: normalizeShift(payload.shift) } : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true as const, reportId: reportRef.id, reportCode };
}

export async function retryProductionReportProcessingHandler(request: CallableRequest) {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const actor = await loadActor(uid);
  const reportId = clean((request.data as { reportId?: unknown } | undefined)?.reportId);
  if (!reportId || reportId.includes('/')) throw new HttpsError('invalid-argument', 'معرّف التقرير غير صالح.');
  const ref = db.collection(REPORTS).doc(reportId);
  const snap = await ref.get();
  const report = snap.data() as { tenantId?: string; createdByUid?: string } | undefined;
  if (!snap.exists || clean(report?.tenantId) !== actor.tenantId) {
    throw new HttpsError('not-found', 'التقرير غير موجود.');
  }
  if (clean(report?.createdByUid) !== actor.uid && !can(actor, 'reports.edit')) {
    throw new HttpsError('permission-denied', 'غير مصرح بإعادة محاولة هذا التقرير.');
  }
  await ref.set({
    processingState: 'pending',
    processingStage: 'retry_requested',
    processingError: '',
    processingUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true as const, reportId };
}
