import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { getDb } from './adminApp.js';
import { applyProductionReportInventoryInternal } from './productionReportInventory.js';

const db = getDb();
const REPORTS = 'production_reports';
const ATTENDANCE = 'production_attendance_records';
const WORK_ORDERS = 'work_orders';
const PLANS = 'production_plans';
const SETTINGS = 'system_settings';

type ReportData = Record<string, unknown> & {
  tenantId?: string;
  reportCode?: string;
  createdByUid?: string;
  date?: string;
  lineId?: string;
  productId?: string;
  employeeId?: string;
  workOrderId?: string;
  productionPlanId?: string;
  reportType?: string;
  quantityProduced?: number;
  workersCount?: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
  workHours?: number;
  lifecycleStatus?: string;
  shiftWorkers?: Array<Record<string, unknown>>;
  workerOutputs?: Array<Record<string, unknown>>;
  processingState?: string;
  processingAttempts?: number;
};

const clean = (value: unknown): string => String(value ?? '').trim();
const number = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const attendanceId = (reportId: string, subject: string): string => (
  `${reportId}_${encodeURIComponent(subject)}`
);

const buildAttendanceRows = (reportId: string, report: ReportData): Array<Record<string, unknown>> => {
  if (report.lifecycleStatus === 'open') return [];
  const common = {
    tenantId: clean(report.tenantId),
    reportId,
    reportCode: clean(report.reportCode) || undefined,
    date: clean(report.date),
    lineId: clean(report.lineId),
    productId: clean(report.productId),
    workHours: number(report.workHours),
  };
  const shiftRows = (report.shiftWorkers || []).flatMap((worker) => {
    const employeeId = clean(worker.employeeId);
    if (!employeeId) return [];
    return [{
      ...common,
      id: attendanceId(reportId, employeeId),
      employeeId,
      employeeCode: clean(worker.employeeCode) || undefined,
      employeeName: clean(worker.employeeName) || employeeId,
      laborRole: clean(worker.laborRole) || undefined,
      status: worker.isPresent === false ? 'absent' : 'present',
      source: 'shift_workers',
      quantityProduced: number(report.quantityProduced),
    }];
  });
  if (shiftRows.length > 0) return shiftRows;
  return (report.workerOutputs || []).flatMap((worker) => {
    const workerId = clean(worker.workerId);
    if (!workerId) return [];
    return [{
      ...common,
      id: attendanceId(reportId, workerId),
      workerId,
      workerName: clean(worker.workerName) || workerId,
      employeeName: clean(worker.workerName) || workerId,
      laborRole: 'production',
      status: worker.isPresent === false ? 'absent' : 'present',
      source: 'worker_outputs',
      quantityProduced: worker.isPresent === false ? 0 : number(worker.outputQty),
      notes: clean(worker.notes) || undefined,
    }];
  });
};

const materializeAttendance = async (reportId: string, report: ReportData): Promise<void> => {
  const rows = buildAttendanceRows(reportId, report);
  const existing = await db.collection(ATTENDANCE)
    .where('tenantId', '==', clean(report.tenantId))
    .where('reportId', '==', reportId)
    .get();
  const batch = db.batch();
  existing.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  rows.forEach((row) => {
    const id = clean(row.id);
    const { id: _id, ...payload } = row;
    batch.set(db.collection(ATTENDANCE).doc(id), {
      ...payload,
      recordedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  if (!existing.empty || rows.length > 0) await batch.commit();
};

const countsTowardProgress = (report: ReportData): boolean => {
  const type = clean(report.reportType) || 'finished_product';
  return type !== 'packaging' && type !== 'component_waste';
};

const reconcileWorkOrder = async (report: ReportData): Promise<void> => {
  const workOrderId = clean(report.workOrderId);
  if (!workOrderId || !countsTowardProgress(report)) return;
  const ref = db.collection(WORK_ORDERS).doc(workOrderId);
  const workOrderSnap = await ref.get();
  const workOrder = workOrderSnap.data() as { tenantId?: string; quantity?: number; status?: string; completedAt?: unknown } | undefined;
  if (!workOrderSnap.exists || clean(workOrder?.tenantId) !== clean(report.tenantId)) {
    throw new Error('أمر الشغل المرتبط غير موجود داخل الشركة.');
  }
  const reports = await db.collection(REPORTS)
    .where('tenantId', '==', clean(report.tenantId))
    .where('workOrderId', '==', workOrderId)
    .get();
  const produced = reports.docs.reduce((sum, snapshot) => {
    const row = snapshot.data() as ReportData;
    return countsTowardProgress(row) ? sum + number(row.quantityProduced) : sum;
  }, 0);
  const target = number(workOrder?.quantity);
  const status = target > 0 && produced >= target ? 'completed' : produced > 0 ? 'in_progress' : 'pending';
  await ref.set({
    producedQuantity: produced,
    status,
    completedAt: status === 'completed' ? (workOrder?.completedAt || new Date().toISOString()) : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
};

const reconcilePlan = async (report: ReportData): Promise<void> => {
  const planId = clean(report.productionPlanId);
  if (!planId || !countsTowardProgress(report)) return;
  const ref = db.collection(PLANS).doc(planId);
  const planSnap = await ref.get();
  const plan = planSnap.data() as { tenantId?: string; plannedQuantity?: number; status?: string } | undefined;
  if (!planSnap.exists || clean(plan?.tenantId) !== clean(report.tenantId)) {
    throw new Error('خطة الإنتاج المرتبطة غير موجودة داخل الشركة.');
  }
  const reports = await db.collection(REPORTS)
    .where('tenantId', '==', clean(report.tenantId))
    .where('productionPlanId', '==', planId)
    .get();
  const produced = reports.docs.reduce((sum, snapshot) => {
    const row = snapshot.data() as ReportData;
    return countsTowardProgress(row) ? sum + number(row.quantityProduced) : sum;
  }, 0);
  const planned = number(plan?.plannedQuantity);
  const status = planned > 0 && produced >= planned ? 'completed' : produced > 0 ? 'in_progress' : plan?.status || 'planned';
  await ref.set({ producedQuantity: produced, status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
};

const shouldApplyInventory = async (tenantId: string): Promise<boolean> => {
  const settingsSnap = await db.collection(SETTINGS).doc(tenantId).get();
  const settings = settingsSnap.data() as { planSettings?: { reportBehavior?: { autoApplyInventoryOnReportSave?: boolean } } } | undefined;
  return settings?.planSettings?.reportBehavior?.autoApplyInventoryOnReportSave !== false;
};

const calculateAndPostLegacyCost = async (reportId: string, report: ReportData): Promise<void> => {
  const tenantId = clean(report.tenantId);
  const month = clean(report.date).slice(0, 7);
  const [laborSnap, supervisorSnap, centersSnap, valuesSnap, allocationsSnap] = await Promise.all([
    db.collection('labor_settings').doc(tenantId).get(),
    db.collection('employees').doc(clean(report.employeeId)).get(),
    db.collection('cost_centers').where('tenantId', '==', tenantId).get(),
    db.collection('cost_center_values').where('tenantId', '==', tenantId).get(),
    db.collection('cost_allocations').where('tenantId', '==', tenantId).get(),
  ]);
  const labor = laborSnap.data() as { hourlyRate?: number } | undefined;
  const supervisor = supervisorSnap.data() as { tenantId?: string; hourlyRate?: number } | undefined;
  const hourlyRate = number(labor?.hourlyRate);
  const supervisorRate = clean(supervisor?.tenantId) === tenantId
    ? number(supervisor?.hourlyRate || hourlyRate)
    : hourlyRate;
  const detailedWorkers = number(report.workersProductionCount)
    + number(report.workersPackagingCount)
    + number(report.workersQualityCount)
    + number(report.workersMaintenanceCount)
    + number(report.workersExternalCount);
  const workers = detailedWorkers > 0 ? detailedWorkers : number(report.workersCount);
  const hours = number(report.workHours);
  const laborCost = workers * hours * hourlyRate;
  const supervisorIndirect = supervisorRate * hours;

  const centerById = new Map(centersSnap.docs.map((snapshot) => [snapshot.id, snapshot.data() as Record<string, unknown>]));
  const allocationByCenter = new Map(
    allocationsSnap.docs
      .map((snapshot) => snapshot.data() as { costCenterId?: string; month?: string; allocations?: Array<{ lineId?: string; percentage?: number }> })
      .filter((row) => clean(row.month) === month)
      .map((row) => [clean(row.costCenterId), row]),
  );
  let lineIndirect = 0;
  const indirectByCenter: Record<string, number> = {};
  for (const valueSnapshot of valuesSnap.docs) {
    const value = valueSnapshot.data() as { costCenterId?: string; month?: string; amount?: number; actualAmount?: number; provisionalAmount?: number; workingDays?: number };
    if (clean(value.month) !== month) continue;
    const centerId = clean(value.costCenterId);
    const center = centerById.get(centerId);
    if (
      !center
      || center.isActive === false
      || clean(center.type) !== 'indirect'
      || center.productionCostingEnabled === false
      || (clean(center.postingMode) && clean(center.postingMode) !== 'driver_allocation')
      || clean(center.allocationBasis || 'line_percentage') !== 'line_percentage'
    ) continue;
    const allocation = allocationByCenter.get(centerId);
    const lineAllocation = allocation?.allocations?.find((row) => clean(row.lineId) === clean(report.lineId));
    const percentage = number(lineAllocation?.percentage);
    if (!(percentage > 0)) continue;
    const amount = number(value.actualAmount || value.provisionalAmount || value.amount);
    const workingDays = Math.max(1, Math.round(number(value.workingDays) || 26));
    const dailyShare = (amount * percentage / 100) / workingDays;
    if (!(dailyShare > 0)) continue;
    indirectByCenter[centerId] = dailyShare;
    lineIndirect += dailyShare;
  }
  const totalCost = laborCost + supervisorIndirect + lineIndirect;
  const quantity = number(report.quantityProduced);
  const reportRef = db.collection(REPORTS).doc(reportId);
  await db.runTransaction(async (transaction) => {
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists) throw new Error('التقرير غير موجود أثناء ترحيل التكلفة.');
    const current = reportSnap.data() as {
      tenantId?: string;
      workOrderCostPostedSnapshot?: number;
      productionPlanCostPostedSnapshot?: number;
    };
    if (clean(current.tenantId) !== tenantId) throw new Error('التقرير خارج الشركة أثناء ترحيل التكلفة.');
    const workOrderId = countsTowardProgress(report) ? clean(report.workOrderId) : '';
    const planId = countsTowardProgress(report) ? clean(report.productionPlanId) : '';
    const workOrderRef = workOrderId ? db.collection(WORK_ORDERS).doc(workOrderId) : null;
    const planRef = planId ? db.collection(PLANS).doc(planId) : null;
    const workOrderSnap = workOrderRef ? await transaction.get(workOrderRef) : null;
    const planSnap = planRef ? await transaction.get(planRef) : null;
    if (workOrderSnap && (!workOrderSnap.exists || clean(workOrderSnap.data()?.tenantId) !== tenantId)) {
      throw new Error('أمر الشغل غير صالح لترحيل التكلفة.');
    }
    if (planSnap && (!planSnap.exists || clean(planSnap.data()?.tenantId) !== tenantId)) {
      throw new Error('خطة الإنتاج غير صالحة لترحيل التكلفة.');
    }
    if (workOrderSnap && workOrderRef) {
      const delta = totalCost - number(current.workOrderCostPostedSnapshot);
      transaction.set(workOrderRef, { actualCost: number(workOrderSnap.data()?.actualCost) + delta }, { merge: true });
    }
    if (planSnap && planRef) {
      const delta = totalCost - number(current.productionPlanCostPostedSnapshot);
      transaction.set(planRef, { actualCost: number(planSnap.data()?.actualCost) + delta }, { merge: true });
    }
    transaction.set(reportRef, {
      laborCostSnapshot: laborCost,
      lineIndirectShareSnapshot: lineIndirect,
      supervisorHourlyRateApplied: supervisorRate,
      supervisorIndirectCost: supervisorIndirect,
      supervisorIndirectSnapshot: supervisorIndirect,
      indirectByCenterSnapshot: indirectByCenter,
      legacyConversionCostSnapshot: totalCost,
      unitCostSnapshot: quantity > 0 ? totalCost / quantity : 0,
      costSnapshotAt: new Date().toISOString(),
      workOrderCostPostedTargetId: workOrderId,
      workOrderCostPostedSnapshot: workOrderId ? totalCost : 0,
      productionPlanCostPostedTargetId: planId,
      productionPlanCostPostedSnapshot: planId ? totalCost : 0,
      aggregateCostPostingState: 'applied',
      aggregateCostPostingUpdatedAt: FieldValue.serverTimestamp(),
      manufacturingCostPostingState: 'calculated',
      manufacturingCostPostingError: '',
      manufacturingCostCalculatedAt: new Date().toISOString(),
    }, { merge: true });
  });
};

const claim = async (reportId: string): Promise<ReportData | null> => {
  const ref = db.collection(REPORTS).doc(reportId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const report = snapshot.data() as ReportData;
    if (report.processingState !== 'pending') return null;
    transaction.set(ref, {
      processingState: 'processing',
      processingStage: 'attendance',
      processingError: '',
      processingAttempts: number(report.processingAttempts) + 1,
      processingUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return report;
  });
};

export async function processProductionReportBackground(reportId: string): Promise<void> {
  const report = await claim(reportId);
  if (!report) return;
  const ref = db.collection(REPORTS).doc(reportId);
  try {
    await materializeAttendance(reportId, report);
    await ref.set({ processingStage: 'inventory', processingUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (await shouldApplyInventory(clean(report.tenantId))) {
      const creatorUid = clean(report.createdByUid);
      if (!creatorUid) throw new Error('لا يوجد منشئ مسجل لتنفيذ ترحيل المخزون.');
      await applyProductionReportInventoryInternal(creatorUid, reportId);
    }
    await ref.set({ processingStage: 'costs', processingUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await calculateAndPostLegacyCost(reportId, report);
    await ref.set({ processingStage: 'progress', processingUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await reconcileWorkOrder(report);
    await reconcilePlan(report);
    await ref.set({
      processingState: 'completed',
      processingStage: 'completed',
      processingError: '',
      processingUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    await ref.set({
      processingState: 'failed',
      processingStage: 'failed',
      processingError: error instanceof Error ? error.message : String(error),
      processingUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}

export const shouldProcessProductionReportUpdate = (
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): boolean => (
  clean((before.data() as ReportData | undefined)?.processingState) !== 'pending'
  && clean((after.data() as ReportData | undefined)?.processingState) === 'pending'
);
