/**
 * Global Zustand Store
 * Fetches from Firestore services, caches in state,
 * exposes loading / error states, and manages real-time subscriptions.
 *
 * Dynamic RBAC: roles & permissions are stored in Firestore.
 * Email/Password authentication with user profile & isActive check.
 * Automatic activity logging on all mutations.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  doc as firestoreDoc,
  runTransaction as runFirestoreTransaction,
  serverTimestamp as firestoreServerTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import {
  ProductionLine,
  Product,
  Employee,
  ProductionReport,
  ProductionPlan,
  LineStatus,
  LineProductConfig,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  LaborSettings,
  SystemSettings,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreEmployee,
  FirestoreRole,
  FirestoreUser,
  WorkOrder,
  AppNotification,
  WorkOrderScanEvent,
  WorkOrderLiveSummary,
  ReportComponentScrapItem,
  ProductionPlanFollowUp,
  PlanStatus,
  Asset,
  AssetDepreciation,
  AssetDepreciationRunResult,
} from '../types';

import {
  signInWithEmail,
  signOut,
  createUserWithEmail,
  registerWithEmail,
  resetPassword,
  auth,
  db as firestoreDb,
  isConfigured as isFirebaseConfigured,
  runAssetDepreciationCallable,
  syncBuiltInRolePermissionGrants,
} from '../services/firebase';
import { getCurrentTenantId, getCurrentTenantIdOrNull, setCurrentTenant } from '../lib/currentTenant';
import { resolveActivityPacks, type ActivityPackId } from '../lib/activityPacks';
import {
  clearCachedAppSession,
  readCachedAppSession,
  writeCachedAppSession,
} from '../lib/appSessionCache';
import { catalogProductService as productService } from '../modules/catalog/services/catalogProductService';
import { lineService } from '../modules/production/services/lineService';
import { employeeService } from '../modules/hr/employeeService';
import { qualitySettingsService } from '../modules/quality/services/qualitySettingsService';
import { reportService } from '../modules/production/services/reportService';
import { createProductionReport } from '../modules/production/usecases/createProductionReport';
import {
  createRole as createRoleUseCase,
  updateRole as updateRoleUseCase,
  deleteRole as deleteRoleUseCase,
} from '../modules/system/usecases/manageRole';
import { unwrapOrThrow } from '../shared/usecases';
import {
  excludePackagingLineReportsForWorkOrderProduction,
  isPackagingLineId,
  isPackagingThroughputReport,
  normalizePackagingLinesForSave,
} from '../modules/production/utils/packagingLine';
import {
  countsTowardProductManufacturingVolume,
  effectivePlanReportType,
  resolveReportType,
  workOrderMatchesReportType,
} from '../modules/production/utils/reportTypes';
import {
  filterReportsForProductionPlan,
} from '../modules/production/utils/productionPlanReports';
import {
  deriveWorkOrderStatusFromProduced,
  filterUnlinkedReportsEligibleForWorkOrder,
  getWorkOrderEffectiveStartDate,
  pickBestAutoLinkedWorkOrder,
  reportDateEligibleForWorkOrder,
  sumProducedFromWorkOrderReports,
} from '../modules/production/utils/workOrderReportLinking';
import { supplyCycleService } from '../modules/production/services/supplyCycleService';
import { lineStatusService } from '../modules/production/services/lineStatusService';
import { lineProductConfigService } from '../modules/production/services/lineProductConfigService';
import { routingPlanService } from '../modules/production/routing/services/routingPlanService';
import { productionPlanService } from '../modules/production/services/productionPlanService';
import { materialRequirementService } from '../modules/manufacturing/services/materialRequirementService';
import { productionPlanFollowUpService } from '../modules/production/services/productionPlanFollowUpService';
import { workOrderService } from '../modules/production/services/workOrderService';
import { notificationService } from '../services/notificationService';
import { costCenterService } from '../modules/costs/services/costCenterService';
import { createCostCenter as createCostCenterUseCase } from '../modules/costs/usecases/createCostCenter';
import { costCenterValueService } from '../modules/costs/services/costCenterValueService';
import { costAllocationService } from '../modules/costs/services/costAllocationService';
import { laborSettingsService } from '../modules/costs/services/laborSettingsService';
import { monthlyProductionCostService } from '../modules/costs/services/monthlyProductionCostService';
import { roleService } from '../modules/system/services/roleService';
import { userService } from '../services/userService';
import { tenantService } from '../services/tenantService';
import { activityLogService } from '../modules/system/services/activityLogService';
import { systemSettingsService } from '../modules/system/services/systemSettingsService';
import { scanEventService } from '../modules/production/services/scanEventService';
import { stockService } from '../modules/inventory/services/stockService';
import { transferApprovalService } from '../modules/inventory/services/transferApprovalService';
import { createTransferRequest } from '../modules/inventory/usecases/createTransferRequest';
import { rejectTransferRequest } from '../modules/inventory/usecases/approveTransferRequest';
import { productionInventoryService } from '../modules/inventory/services/productionInventoryService';
import { productionIssueService } from '../modules/inventory/services/productionIssueService';
import {
  removeWorkerDailyPerformanceForReport,
  syncWorkerDailyPerformanceFromReport,
} from '../modules/production/utils/syncWorkerDailyPerformanceFromReport';
import {
  clearInventoryRoutingCache,
  resolveInventoryRoutingV1Async,
} from '../modules/inventory/services/inventoryRoutingService';
import { resolveSystemSettings } from '../modules/system/lib/resolveSystemSettings';
import { warehouseService } from '../modules/inventory/services/warehouseService';
import { catalogRawMaterialService as rawMaterialService } from '../modules/catalog/services/catalogRawMaterialService';
import { materialService } from '../modules/manufacturing/services/materialService';
import { bomService } from '../modules/manufacturing/services/bomService';
import { calculateBomItemUnitCost } from '../modules/manufacturing/engines/materialCostEngine';
import {
  calculateFullProductionCost,
  type ProductionCostSourceLine,
} from '../modules/costs/lib/fullProductionCost';
import { loadReportsComponentLabelOptions } from '../modules/production/utils/injectionComponentOptions';
import type { StockItemBalance, Warehouse } from '../modules/inventory/types';
import {
  categoryService,
  isProductCategoryRow,
  type ProductCategory,
} from '../modules/catalog/services/categoryService';
import {
  buildProductCategorySaveFields,
  validateProductCategorySelection,
} from '../modules/catalog/lib/productCategoryPayload';
import { DUPLICATE_ENTITY_CODE } from '../modules/shared/services/entityCodeSequenceService';
import { assetService } from '../modules/costs/services/assetService';
import { assetDepreciationService } from '../modules/costs/services/assetDepreciationService';
import { assetDepreciationJobService } from '../modules/costs/services/assetDepreciationJobService';
import { checkPermission, isPackagingOnlyPermissions, normalizeRolePermissions, type Permission } from '../utils/permissions';
import { DEFAULT_PLAN_SETTINGS, DEFAULT_SYSTEM_SETTINGS, DEFAULT_THEME } from '../utils/dashboardConfig';
import {
  applyAppTheme,
  cacheTenantTheme,
  loadTenantTheme,
  mergeTenantThemeForApply,
  syncTenantThemeSnapshot,
} from '../core/ui-engine/theme/tenantTheme';
import {
  buildProducts,
  buildProductionLines,
  getTodayDateString,
  getOperationalDateString,
  getMonthDateRange,
} from '../utils/calculations';
import {
  buildRoutingTotalSecondsByProductId,
  buildRoutingVarianceBasisSecondsByProductId,
  buildRoutingTargetSecondsOnlyByProductId,
  buildProductRoutingTargetSecondsByProductId,
  mergeProductTargetsIntoRoutingVarianceBasis,
} from '../utils/routingStandardAssembly';
import { eventBus, SystemEvents } from '../shared/events';
import { actionTrackerService } from '../modules/system/audit';
import { useJobsStore } from '../components/background-jobs/useJobsStore';
import { REPORT_DUPLICATE_MESSAGE, INJECTION_REPORT_DUPLICATE_MESSAGE, getReportDuplicateMessage } from '../modules/production/utils/reportDuplicateError';
import {
  isInjectionShiftSelected,
  normalizeInjectionShift,
} from '../modules/production/utils/injectionReportShift';
import {
  resolveReportBehaviorSettings,
} from '../modules/production/lib/reportBehaviorSettings';
import { buildAggregateCostDeltas } from '../modules/production/lib/reportAggregateCostReconciliation';
import {
  PRODUCTION_REPORT_CREATE_PATHS,
  PRODUCTION_REPORT_OPERATION_KEYS,
  PRODUCTION_REPORT_RECONCILE_PATHS,
  PRODUCTION_REPORT_UPDATE_PATHS,
  PRODUCTION_PLAN_OPERATION_KEYS,
  PRODUCT_OPERATION_KEYS,
  WORK_ORDER_OPERATION_KEYS,
  assertOperationPathEnabled,
  isOperationPathEnabled,
  type ProductCreatePath,
  type ProductUpdatePath,
  type ProductionPlanCreatePath,
  type ProductionPlanUpdatePath,
  type ProductionReportCreatePath,
  type ProductionReportReconcilePath,
  type ProductionReportUpdatePath,
  type WorkOrderCreatePath,
  type WorkOrderUpdatePath,
} from '../modules/system/lib/operationPathSettings';
import {
  computeAchievementPercent,
  getProductAssemblyMode,
  hasLineSpecificWorkerTarget,
} from '../modules/production/selectors/workerTargetSelector';
import {
  buildProductionReportCostSnapshotPatch,
  buildSupervisorHourlyRatesMap,
  estimateReportCost,
  getProductionReportCostBreakdown,
  isProductionAllocationCostCenter,
} from '../utils/costCalculations';
import { zktecoSyncService } from '../modules/hr/attendance/services/zktecoSyncService';
import { attendanceProcessingService } from '../modules/hr/attendance/services/attendanceProcessingService';
import type {
  AttendanceImportResult,
  AttendanceLog,
  AttendanceProcessResult,
  AttendanceRecord,
  AttendanceSource,
  NormalizedAttendanceLogInput,
} from '../modules/hr/attendance/types';

function emptyPermissions(): Record<string, boolean> {
  // Missing permission keys already fail closed in checkPermission().
  // Grants are loaded from Firestore roles.permissions only.
  return {};
}

function isBlockedNotification(notification: AppNotification): boolean {
  const title = String(notification.title || '').trim();
  if (notification.type === 'daily_report_missing') return true;
  if (title.startsWith('متابعة تقارير المشرفين')) return true;
  return false;
}

function notificationCreatedAtMs(notification: AppNotification): number {
  const createdAt = notification.createdAt as any;
  if (!createdAt) return 0;
  if (typeof createdAt?.toDate === 'function') return createdAt.toDate().getTime();
  if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNotificationText(value: string | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function isSameNotificationPayload(a: AppNotification, b: AppNotification): boolean {
  if (a.type !== b.type) return false;
  if (normalizeNotificationText(a.title) !== normalizeNotificationText(b.title)) return false;
  if (normalizeNotificationText(a.message) !== normalizeNotificationText(b.message)) return false;
  if (normalizeNotificationText(a.referenceId) !== normalizeNotificationText(b.referenceId)) return false;
  if (normalizeNotificationText(a.recipientId) !== normalizeNotificationText(b.recipientId)) return false;
  return true;
}

function mergeWithRealtimeNotifications(
  incoming: AppNotification[],
  current: AppNotification[],
): AppNotification[] {
  const localRealtime = current.filter((n) => String(n.id || '').startsWith('fcm_'));
  const merged = [...incoming];
  const seen = new Set(merged.map((n) => String(n.id || '')));
  localRealtime.forEach((n) => {
    const id = String(n.id || '');
    if (!id || seen.has(id)) return;
    const localTs = notificationCreatedAtMs(n);
    const duplicatedOnServer = merged.some((serverItem) => {
      if (String(serverItem.id || '').startsWith('fcm_')) return false;
      if (!isSameNotificationPayload(n, serverItem)) return false;
      const serverTs = notificationCreatedAtMs(serverItem);
      if (!localTs || !serverTs) return true;
      // Treat same payload in a short window as a single notification.
      return Math.abs(serverTs - localTs) <= 2 * 60 * 1000;
    });
    if (duplicatedOnServer) return;
    merged.push(n);
    seen.add(id);
  });
  merged.sort((a, b) => notificationCreatedAtMs(b) - notificationCreatedAtMs(a));
  return merged.slice(0, 80);
}

let _cachedProductionWarehouseId: string | null = null;

async function resolveProductionWarehouseId(systemSettings: SystemSettings): Promise<string> {
  const fromSettings = systemSettings.planSettings?.defaultProductionWarehouseId?.trim() ?? '';
  if (fromSettings) return fromSettings;

  if (_cachedProductionWarehouseId) return _cachedProductionWarehouseId;

  try {
    const warehouses = await warehouseService.getAllWarehouses();
    const finishedWarehouse = warehouses.find((w) => {
      const name = (w.name || '').trim().toLowerCase();
      return name === 'تم الصنع' || name.includes('تم الصنع');
    });
    if (finishedWarehouse?.id) {
      _cachedProductionWarehouseId = finishedWarehouse.id;
      return finishedWarehouse.id;
    }
  } catch {
    // keep graceful fallback to empty when warehouse module is unavailable
  }

  return '';
}

const PACKAGING_STOCK_TRANSFER_NOTE_PREFIX = 'Packaging stock transfer from report';
const packagingStockTransferNote = (reportId: string) => `${PACKAGING_STOCK_TRANSFER_NOTE_PREFIX} ${reportId}`;

type PackagingStockTransferLine = {
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  minStock: number;
};

function buildPackagingStockTransferLines(
  report: Pick<ProductionReport, 'productId' | 'quantityProduced' | 'packagingLines'>,
  products: FirestoreProduct[],
): PackagingStockTransferLine[] {
  const qtyByProduct = new Map<string, number>();
  const sourceLines = Array.isArray(report.packagingLines) && report.packagingLines.length > 0
    ? report.packagingLines
    : [{ productId: report.productId, quantityPieces: report.quantityProduced }];

  sourceLines.forEach((line) => {
    const productId = String(line?.productId || '').trim();
    const quantity = Number(line?.quantityPieces || 0);
    if (!productId || quantity <= 0) return;
    qtyByProduct.set(productId, Number(qtyByProduct.get(productId) || 0) + quantity);
  });

  return Array.from(qtyByProduct.entries()).map(([productId, quantity]) => {
    const product = products.find((p) => String(p.id || '') === productId);
    return {
      itemId: productId,
      itemName: String(product?.name || productId),
      itemCode: String(product?.code || ''),
      quantity,
      minStock: Number((product as any)?.minStock || 0),
    };
  });
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function calculateIndustrialReportTotalCost(params: {
  workersCount: number;
  workHours: number;
  quantityProduced: number;
  lineId: string;
  reportDate?: string;
  employeeId: string;
  laborSettings: LaborSettings | null;
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  employees: FirestoreEmployee[];
}): number {
  const hourlyRate = Number(params.laborSettings?.hourlyRate ?? 0);
  const supervisorHourlyRate = Number(
    params.employees.find((employee) => employee.id === params.employeeId)?.hourlyRate ?? hourlyRate,
  );
  const estimate = estimateReportCost(
    Number(params.workersCount || 0),
    Number(params.workHours || 0),
    Number(params.quantityProduced || 0),
    hourlyRate,
    supervisorHourlyRate,
    params.lineId,
    params.reportDate,
    params.costCenters,
    params.costCenterValues,
    params.costAllocations,
  );
  return Number(estimate.totalCost || 0);
}

type ReportAggregateCostState = ProductionReport & {
  aggregateCostPostingState?: 'pending' | 'applied' | 'deleting';
  aggregateCostPostingUpdatedAt?: unknown;
  workOrderCostPostedTargetId?: string;
  productionPlanCostPostedTargetId?: string;
};

type ReportInventoryPostingState = {
  inventoryAppliedAt?: unknown;
  inventoryAppliedBy?: unknown;
  inventoryAppliedByUserId?: unknown;
  inventoryPostingState?: 'applying' | 'applied' | 'reversing' | 'reversed';
  inventoryPostingUpdatedAt?: unknown;
  inventoryReversedAt?: unknown;
  inventoryReversedBy?: unknown;
  inventoryReversedByUserId?: unknown;
};

const WORK_ORDERS_COLLECTION = 'work_orders';
const PRODUCTION_PLANS_COLLECTION = 'production_plans';
const PRODUCTION_REPORTS_COLLECTION = 'production_reports';

function finiteCost(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function reportAggregateCostBasis(report: ProductionReport): string {
  return JSON.stringify([
    String(report.workOrderId || '').trim(),
    String(report.productionPlanId || '').trim(),
    String(report.reportType || '').trim(),
    String(report.lineId || '').trim(),
    String(report.employeeId || '').trim(),
    String(report.date || '').trim(),
    Number(report.workersCount || 0),
    Number(report.workHours || 0),
    Number(report.quantityProduced || 0),
  ]);
}

function assertAggregateTenant(
  data: Record<string, unknown>,
  tenantId: string,
  entityLabel: string,
): void {
  if (String(data.tenantId || '').trim() !== tenantId) {
    throw new Error(`${entityLabel} غير تابع للشركة الحالية.`);
  }
}

async function ensureReportAggregateCostBaseline(
  reportId: string,
  baselineReport: ProductionReport,
  fallbackIndustrialCost: number,
  skipsAggregates: boolean,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const tenantId = getCurrentTenantId();
  const reportRef = firestoreDoc(firestoreDb, PRODUCTION_REPORTS_COLLECTION, reportId);
  await runFirestoreTransaction(firestoreDb, async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists()) throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
    const current = { id: reportSnap.id, ...reportSnap.data() } as ReportAggregateCostState;
    assertAggregateTenant(reportSnap.data(), tenantId, 'التقرير');
    if (current.aggregateCostPostingState === 'deleting') {
      throw new Error('بدأ حذف التقرير بالفعل ولا يمكن تعديله.');
    }
    if (reportAggregateCostBasis(current) !== reportAggregateCostBasis(baselineReport)) {
      throw new Error('تم تعديل التقرير من جلسة أخرى. أعد تحميل البيانات ثم حاول مجدداً.');
    }

    const workOrderTarget = skipsAggregates ? '' : String(baselineReport.workOrderId || '').trim();
    const planTarget = skipsAggregates ? '' : String(baselineReport.productionPlanId || '').trim();
    const needsWorkOrderBaseline = current.workOrderCostPostedTargetId === undefined;
    const needsPlanBaseline = current.productionPlanCostPostedTargetId === undefined;
    const targetRefs = [
      ...(needsWorkOrderBaseline && workOrderTarget
        ? [firestoreDoc(firestoreDb, WORK_ORDERS_COLLECTION, workOrderTarget)]
        : []),
      ...(needsPlanBaseline && planTarget
        ? [firestoreDoc(firestoreDb, PRODUCTION_PLANS_COLLECTION, planTarget)]
        : []),
    ];
    for (const targetRef of targetRefs) {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists()) throw new Error('تعذر العثور على سجل التجميع المرتبط بالتقرير.');
      assertAggregateTenant(targetSnap.data(), tenantId, 'سجل التجميع');
    }

    const patch: Record<string, unknown> = {};
    if (needsWorkOrderBaseline) {
      patch.workOrderCostPostedTargetId = workOrderTarget;
      patch.workOrderCostPostedSnapshot = workOrderTarget
        ? finiteCost(current.workOrderCostPostedSnapshot, fallbackIndustrialCost)
        : 0;
    }
    if (needsPlanBaseline) {
      patch.productionPlanCostPostedTargetId = planTarget;
      patch.productionPlanCostPostedSnapshot = planTarget
        ? finiteCost(current.productionPlanCostPostedSnapshot, fallbackIndustrialCost)
        : 0;
    }
    if (Object.keys(patch).length > 0) {
      tx.update(reportRef, {
        ...patch,
        aggregateCostPostingState: 'applied',
        aggregateCostPostingUpdatedAt: firestoreServerTimestamp(),
      });
    }
  });
}

async function reconcileReportAggregateCosts(params: {
  reportId: string;
  expectedReport: ProductionReport;
  industrialCost: number;
  skipsAggregates: boolean;
}): Promise<void> {
  if (!isFirebaseConfigured) return;
  const tenantId = getCurrentTenantId();
  const expectedBasis = reportAggregateCostBasis(params.expectedReport);
  const desiredCost = finiteCost(params.industrialCost);
  const reportRef = firestoreDoc(firestoreDb, PRODUCTION_REPORTS_COLLECTION, params.reportId);

  await runFirestoreTransaction(firestoreDb, async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists()) throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
    const report = { id: reportSnap.id, ...reportSnap.data() } as ReportAggregateCostState;
    assertAggregateTenant(reportSnap.data(), tenantId, 'التقرير');
    if (report.aggregateCostPostingState === 'deleting') {
      throw new Error('بدأ حذف التقرير بالفعل ولا يمكن ترحيل تكلفته.');
    }
    if (reportAggregateCostBasis(report) !== expectedBasis) {
      throw new Error('تغير التقرير أثناء ترحيل التكلفة. أعد تحميل البيانات ثم حاول مجدداً.');
    }

    const oldWorkOrderTarget = String(report.workOrderCostPostedTargetId || '').trim();
    const oldPlanTarget = String(report.productionPlanCostPostedTargetId || '').trim();
    const oldWorkOrderCost = oldWorkOrderTarget
      ? finiteCost(report.workOrderCostPostedSnapshot)
      : 0;
    const oldPlanCost = oldPlanTarget
      ? finiteCost(report.productionPlanCostPostedSnapshot)
      : 0;
    const nextWorkOrderTarget = params.skipsAggregates
      ? ''
      : String(report.workOrderId || '').trim();
    const nextPlanTarget = params.skipsAggregates
      ? ''
      : String(report.productionPlanId || '').trim();

    const workOrderDeltas = buildAggregateCostDeltas(
      { targetId: oldWorkOrderTarget, amount: oldWorkOrderCost },
      { targetId: nextWorkOrderTarget, amount: desiredCost },
    );
    const planDeltas = buildAggregateCostDeltas(
      { targetId: oldPlanTarget, amount: oldPlanCost },
      { targetId: nextPlanTarget, amount: desiredCost },
    );

    const workOrderTargets = new Map<string, { ref: DocumentReference; actualCost: number }>();
    for (const targetId of workOrderDeltas.keys()) {
      const targetRef = firestoreDoc(firestoreDb, WORK_ORDERS_COLLECTION, targetId);
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists()) throw new Error('أمر الشغل المرتبط غير موجود.');
      assertAggregateTenant(targetSnap.data(), tenantId, 'أمر الشغل');
      workOrderTargets.set(targetId, {
        ref: targetSnap.ref,
        actualCost: finiteCost(targetSnap.data().actualCost),
      });
    }
    const planTargets = new Map<string, { ref: DocumentReference; actualCost: number }>();
    for (const targetId of planDeltas.keys()) {
      const targetRef = firestoreDoc(firestoreDb, PRODUCTION_PLANS_COLLECTION, targetId);
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists()) throw new Error('خطة الإنتاج المرتبطة غير موجودة.');
      assertAggregateTenant(targetSnap.data(), tenantId, 'خطة الإنتاج');
      planTargets.set(targetId, {
        ref: targetSnap.ref,
        actualCost: finiteCost(targetSnap.data().actualCost),
      });
    }

    for (const [targetId, delta] of workOrderDeltas) {
      if (Math.abs(delta) <= 0.000001) continue;
      const target = workOrderTargets.get(targetId)!;
      tx.update(target.ref, { actualCost: target.actualCost + delta });
    }
    for (const [targetId, delta] of planDeltas) {
      if (Math.abs(delta) <= 0.000001) continue;
      const target = planTargets.get(targetId)!;
      tx.update(target.ref, { actualCost: target.actualCost + delta });
    }
    tx.update(reportRef, {
      workOrderCostPostedTargetId: nextWorkOrderTarget,
      workOrderCostPostedSnapshot: nextWorkOrderTarget ? desiredCost : 0,
      productionPlanCostPostedTargetId: nextPlanTarget,
      productionPlanCostPostedSnapshot: nextPlanTarget ? desiredCost : 0,
      aggregateCostPostingState: 'applied',
      aggregateCostPostingUpdatedAt: firestoreServerTimestamp(),
    });
  });
}

async function reverseReportAggregateCostsForDelete(params: {
  reportId: string;
  fallbackIndustrialCost: number;
  skipsAggregates: boolean;
}): Promise<void> {
  if (!isFirebaseConfigured) return;
  const tenantId = getCurrentTenantId();
  const reportRef = firestoreDoc(firestoreDb, PRODUCTION_REPORTS_COLLECTION, params.reportId);
  await runFirestoreTransaction(firestoreDb, async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists()) return;
    const report = { id: reportSnap.id, ...reportSnap.data() } as ReportAggregateCostState;
    assertAggregateTenant(reportSnap.data(), tenantId, 'التقرير');

    const workOrderTarget = report.workOrderCostPostedTargetId !== undefined
      ? String(report.workOrderCostPostedTargetId || '').trim()
      : params.skipsAggregates
        ? ''
        : String(report.workOrderId || '').trim();
    const planTarget = report.productionPlanCostPostedTargetId !== undefined
      ? String(report.productionPlanCostPostedTargetId || '').trim()
      : params.skipsAggregates
        ? ''
        : String(report.productionPlanId || '').trim();
    const workOrderCost = workOrderTarget
      ? finiteCost(report.workOrderCostPostedSnapshot, params.fallbackIndustrialCost)
      : 0;
    const planCost = planTarget
      ? finiteCost(report.productionPlanCostPostedSnapshot, params.fallbackIndustrialCost)
      : 0;
    const workOrderRef = workOrderTarget
      ? firestoreDoc(firestoreDb, WORK_ORDERS_COLLECTION, workOrderTarget)
      : null;
    const planRef = planTarget
      ? firestoreDoc(firestoreDb, PRODUCTION_PLANS_COLLECTION, planTarget)
      : null;
    const workOrderSnap = workOrderRef ? await tx.get(workOrderRef) : null;
    const planSnap = planRef ? await tx.get(planRef) : null;
    if (workOrderSnap) {
      if (!workOrderSnap.exists()) throw new Error('أمر الشغل المرتبط غير موجود.');
      assertAggregateTenant(workOrderSnap.data(), tenantId, 'أمر الشغل');
    }
    if (planSnap) {
      if (!planSnap.exists()) throw new Error('خطة الإنتاج المرتبطة غير موجودة.');
      assertAggregateTenant(planSnap.data(), tenantId, 'خطة الإنتاج');
    }

    if (workOrderSnap && workOrderCost !== 0) {
      tx.update(workOrderSnap.ref, {
        actualCost: finiteCost(workOrderSnap.data().actualCost) - workOrderCost,
      });
    }
    if (planSnap && planCost !== 0) {
      tx.update(planSnap.ref, {
        actualCost: finiteCost(planSnap.data().actualCost) - planCost,
      });
    }
    tx.update(reportRef, {
      workOrderCostPostedTargetId: '',
      workOrderCostPostedSnapshot: 0,
      productionPlanCostPostedTargetId: '',
      productionPlanCostPostedSnapshot: 0,
      aggregateCostPostingState: 'deleting',
      aggregateCostPostingUpdatedAt: firestoreServerTimestamp(),
    });
  });
}

function calendarMonthRangeFromYearMonth(yearMonth: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(yearMonth || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = `${yearMonth}-01`;
  const last = new Date(y, mo, 0).getDate();
  const end = `${yearMonth}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

type CostSnapshotStoreGet = () => {
  _rawEmployees: FirestoreEmployee[];
  _rawProducts: FirestoreProduct[];
  laborSettings: LaborSettings | null;
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  assets: Asset[];
  assetDepreciations: AssetDepreciation[];
  systemSettings: SystemSettings;
};

function buildEffectiveDepreciationRows(
  period: string,
  assets: Asset[],
  actualRows: AssetDepreciation[],
): { rows: AssetDepreciation[]; hasScheduledRows: boolean } {
  const actualByAssetId = new Map(
    actualRows
      .filter((row) => row.period === period)
      .map((row) => [String(row.assetId || ''), row]),
  );
  let hasScheduledRows = false;
  const rows: AssetDepreciation[] = [];
  for (const asset of assets) {
    const assetId = String(asset.id || '');
    if (!assetId || asset.status !== 'active' || !asset.centerId) continue;
    const actual = actualByAssetId.get(assetId);
    if (actual) {
      rows.push(actual);
      continue;
    }
    if (String(asset.purchaseDate || '').slice(0, 7) > period) continue;
    const scheduledAmount = Math.max(0, Number(asset.monthlyDepreciation || 0));
    if (scheduledAmount <= 0 || Number(asset.currentValue || 0) <= Number(asset.salvageValue || 0)) continue;
    hasScheduledRows = true;
    rows.push({
      id: `scheduled__${assetId}__${period}`,
      assetId,
      period,
      depreciationAmount: scheduledAmount,
      accumulatedDepreciation: Number(asset.accumulatedDepreciation || 0) + scheduledAmount,
      bookValue: Math.max(Number(asset.salvageValue || 0), Number(asset.currentValue || 0) - scheduledAmount),
    });
  }
  return { rows, hasScheduledRows };
}

async function buildReportMaterialCostSources(
  report: ProductionReport,
): Promise<ProductionCostSourceLine[]> {
  const bomOwnerType = report.reportType === 'component_injection' ? 'material' : 'product';
  const [bomBundle, materials, movements] = await Promise.all([
    bomService.getActiveBomWithLegacyFallback(bomOwnerType, String(report.productId || '')),
    materialService.getAll(),
    report.id
      ? stockService.getTransactionsBySource({ sourceModule: 'production_report', sourceId: report.id })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const materialByIdentity = new Map<string, (typeof materials)[number]>();
  materials.forEach((material) => {
    if (material.id) materialByIdentity.set(String(material.id), material);
    if (material.legacyRawMaterialId) materialByIdentity.set(String(material.legacyRawMaterialId), material);
    materialByIdentity.set(String(material.name || '').trim().toLowerCase(), material);
  });

  const canonicalMaterialIdentity = (value: unknown, fallbackName?: unknown): string => {
    const raw = String(value || '').trim();
    const byId = materialByIdentity.get(raw)
      || materialByIdentity.get(String(fallbackName || '').trim().toLowerCase());
    return String(byId?.id || byId?.legacyRawMaterialId || raw || fallbackName || '')
      .trim()
      .toLowerCase();
  };

  const actualItemIds = new Set<string>();
  const actualLines: ProductionCostSourceLine[] = movements
    .filter((movement) => movement.movementType === 'OUT' && Number(movement.totalCostSnapshot || 0) > 0)
    .map((movement, index) => {
      const itemId = String(movement.itemId || '');
      const material = materialByIdentity.get(itemId)
        || materialByIdentity.get(String(movement.itemName || '').trim().toLowerCase());
      actualItemIds.add(canonicalMaterialIdentity(itemId, movement.itemName));
      const category = material?.type === 'packaging' || movement.itemType === 'packaging'
        ? 'packaging'
        : 'material';
      return {
        sourceKey: `stock:${String(movement.id || index)}`,
        sourceType: 'stock_issue',
        sourceId: String(movement.id || ''),
        category,
        label: String(movement.itemName || material?.name || itemId),
        amount: Number(movement.totalCostSnapshot || 0),
        status: 'actual',
        quantity: Number(movement.quantity || 0),
        unitCost: Number(movement.unitCostSnapshot || 0),
      } satisfies ProductionCostSourceLine;
    });

  const estimatedLines: ProductionCostSourceLine[] = bomBundle.items
    .filter((item) => !actualItemIds.has(canonicalMaterialIdentity(item.itemId, item.itemName)))
    .map((item, index) => {
      const material = materialByIdentity.get(String(item.itemId || ''))
        || materialByIdentity.get(String(item.itemName || '').trim().toLowerCase())
        || null;
      const row = calculateBomItemUnitCost(material, item, Number(report.quantityProduced || 0));
      return {
        sourceKey: `bom:${String(bomBundle.bom?.id || 'missing')}:${String(item.id || item.itemId || index)}`,
        sourceType: bomBundle.isLegacy ? 'legacy_bom_estimate' : 'bom_estimate',
        sourceId: String(item.id || item.itemId || ''),
        category: material?.type === 'packaging' ? 'packaging' : 'material',
        label: String(item.itemName || material?.name || item.itemId),
        amount: Number(row.totalCost || 0),
        status: 'estimated',
        quantity: Number(item.qtyPerUnit || 0) * Number(report.quantityProduced || 0),
        unitCost: Number(item.qtyPerUnit || 0) > 0
          ? Number(row.totalCost || 0) / (Number(item.qtyPerUnit || 0) * Number(report.quantityProduced || 0) || 1)
          : 0,
        costCenterId: item.costCenterId,
      } satisfies ProductionCostSourceLine;
    });

  return [...actualLines, ...estimatedLines];
}

async function persistProductionReportCostSnapshot(
  reportId: string,
  get: CostSnapshotStoreGet,
): Promise<ProductionReport | null> {
  const row = await reportService.getById(reportId);
  if (!row?.date) return null;
  const ym = String(row.date).slice(0, 7);
  const range = calendarMonthRangeFromYearMonth(ym);
  if (!range) return null;
  const monthRows = await reportService.getByDateRange(range.start, range.end);
  const st = get();
  const supervisorHourlyRates = buildSupervisorHourlyRatesMap(st._rawEmployees);
  const productCategoryById = new Map<string, string>();
  st._rawProducts.forEach((p) => {
    if (p.id) productCategoryById.set(String(p.id), String(p.category || ''));
  });
  const legacyPatch = buildProductionReportCostSnapshotPatch(row, monthRows, {
    hourlyRate: Number(st.laborSettings?.hourlyRate ?? 0),
    costCenters: st.costCenters,
    costCenterValues: st.costCenterValues,
    costAllocations: st.costAllocations,
    supervisorHourlyRates,
    workingDaysByMonth: st.systemSettings.costMonthlyWorkingDays,
    productCategoryById,
  }) || {
    costSnapshotAt: new Date().toISOString(),
    unitCostSnapshot: 0,
    laborCostSnapshot: 0,
    lineIndirectShareSnapshot: 0,
    supervisorIndirectSnapshot: 0,
    indirectByCenterSnapshot: {},
  };

  const effectiveDepreciation = buildEffectiveDepreciationRows(
    ym,
    st.assets,
    st.assetDepreciations,
  );
  const withDepreciation = getProductionReportCostBreakdown(
    row,
    monthRows,
    Number(st.laborSettings?.hourlyRate ?? 0),
    st.costCenters,
    st.costCenterValues,
    st.costAllocations,
    supervisorHourlyRates,
    st.systemSettings.costMonthlyWorkingDays,
    productCategoryById,
    st.assets,
    effectiveDepreciation.rows,
  );
  const legacyConversionCost = Number(legacyPatch.unitCostSnapshot || 0)
    * Number(row.quantityProduced || 0);
  const conversionWithDepreciation = Number(withDepreciation?.totalCost ?? legacyConversionCost);
  const depreciationCost = Math.max(0, conversionWithDepreciation - legacyConversionCost);
  const materialSources = await buildReportMaterialCostSources(row);
  const applicableCenterIds = new Set(
    st.costCenters
      .filter(isProductionAllocationCostCenter)
      .map((center) => String(center.id || '')),
  );
  const applicableCenterValues = st.costCenterValues.filter(
    (value) => value.month === ym && applicableCenterIds.has(String(value.costCenterId || '')),
  );
  const overheadIsActual = applicableCenterValues.length > 0
    && applicableCenterValues.every((value) => ['actual', 'closed'].includes(String(value.costingStatus || '')));
  const sourceLines: ProductionCostSourceLine[] = [
    ...materialSources,
    {
      sourceKey: `labor:${reportId}`,
      sourceType: 'labor_standard',
      sourceId: reportId,
      category: 'direct_labor',
      label: 'العمالة المباشرة',
      amount: Number(withDepreciation?.laborCostTotal ?? legacyPatch.laborCostSnapshot ?? 0),
      status: 'estimated',
    },
    {
      sourceKey: `overhead:${reportId}:${ym}`,
      sourceType: 'cost_center_absorption',
      sourceId: ym,
      category: 'factory_overhead',
      label: 'التكاليف الصناعية المحملة',
      amount: Math.max(
        0,
        conversionWithDepreciation
          - Number(withDepreciation?.laborCostTotal ?? legacyPatch.laborCostSnapshot ?? 0)
          - depreciationCost,
      ),
      status: overheadIsActual ? 'actual' : 'estimated',
    },
  ];
  if (depreciationCost > 0) {
    sourceLines.push({
      sourceKey: `depreciation:${reportId}:${ym}`,
      sourceType: effectiveDepreciation.hasScheduledRows ? 'asset_schedule' : 'asset_depreciation',
      sourceId: ym,
      category: 'depreciation',
      label: 'إهلاك أصول المصنع',
      amount: depreciationCost,
      status: effectiveDepreciation.hasScheduledRows ? 'scheduled' : 'actual',
    });
  }
  const previousRevision = Math.max(0, Number(row.manufacturingCostRevision || 0));
  const fullCost = calculateFullProductionCost({
    reportId,
    quantityProduced: Number(row.quantityProduced || 0),
    lines: sourceLines,
    revision: previousRevision + 1,
  });
  const unchanged = row.manufacturingCostVersion === fullCost.version
    && Number(row.fullManufacturingCostSnapshot || 0) === fullCost.fullManufacturingCost
    && JSON.stringify(row.manufacturingCostSourcesSnapshot || []) === JSON.stringify(fullCost.sourceLines);
  const revision = unchanged ? Math.max(1, previousRevision) : fullCost.revision;
  const finalPatch: Partial<ProductionReport> = {
    ...legacyPatch,
    legacyConversionCostSnapshot: legacyConversionCost,
    manufacturingCostVersion: fullCost.version,
    manufacturingCostRevision: revision,
    manufacturingCostStatus: fullCost.status,
    manufacturingCostPostingState: 'calculated',
    manufacturingCostPostingError: '',
    manufacturingCostCalculatedAt: unchanged
      ? row.manufacturingCostCalculatedAt || new Date().toISOString()
      : new Date().toISOString(),
    materialCostSnapshot: fullCost.materialCost,
    packagingCostSnapshot: fullCost.packagingCost,
    directLaborCostSnapshot: fullCost.directLaborCost,
    factoryOverheadCostSnapshot: fullCost.factoryOverheadCost,
    depreciationCostSnapshot: fullCost.depreciationCost,
    fullManufacturingCostSnapshot: fullCost.fullManufacturingCost,
    fullManufacturingUnitCostSnapshot: fullCost.unitManufacturingCost,
    manufacturingCostSourceQualitySnapshot: fullCost.sourceQuality,
    manufacturingCostSourcesSnapshot: fullCost.sourceLines,
  };
  await reportService.update(reportId, finalPatch);
  return { ...row, ...finalPatch };
}

function replaceLoadedReportRow(
  rows: ProductionReport[],
  report: ProductionReport,
): ProductionReport[] {
  if (!report.id || !rows.some((row) => row.id === report.id)) return rows;
  return rows.map((row) => row.id === report.id ? report : row);
}

/** Insert or replace a report in an in-memory list without a full Firestore reload. */
function upsertLoadedReportRow(
  rows: ProductionReport[],
  report: ProductionReport,
): ProductionReport[] {
  if (!report.id) return rows;
  if (rows.some((row) => row.id === report.id)) {
    return rows.map((row) => (row.id === report.id ? { ...row, ...report } : row));
  }
  return [report, ...rows];
}

function isActiveWorkOrderStatus(status?: WorkOrder['status']): boolean {
  return status === 'pending' || status === 'in_progress';
}

type ProductionReportLinkInput = Pick<
  ProductionReport,
  'lineId' | 'productId' | 'employeeId' | 'date' | 'workOrderId' | 'productionPlanId' | 'reportType'
>;

async function resolveProductionReportExecutionLinks(
  input: ProductionReportLinkInput,
  cachedWorkOrders: WorkOrder[],
  options?: { preserveCompletedWorkOrder?: boolean },
): Promise<{
  activeWorkOrder: WorkOrder | null;
  activePlan: ProductionPlan | null;
  productionPlanLinkMode?: ProductionReport['productionPlanLinkMode'];
  hasMatchingPlanContext: boolean;
}> {
  const reportType = resolveReportType(input.reportType);
  let activeWorkOrder: WorkOrder | null = null;
  const requestedWorkOrderId = String(input.workOrderId || '').trim();

  if (requestedWorkOrderId) {
    const selected = await workOrderService.getById(requestedWorkOrderId);
    if (
      selected
      && (
        isActiveWorkOrderStatus(selected.status)
        || (options?.preserveCompletedWorkOrder === true && selected.status === 'completed')
      )
      && selected.lineId === input.lineId
      && selected.productId === input.productId
      && workOrderMatchesReportType(selected, reportType)
      && reportDateEligibleForWorkOrder(input.date, selected)
    ) {
      activeWorkOrder = selected;
    }
  }

  if (!activeWorkOrder) {
    const candidates = new Map<string, WorkOrder>();
    const addCandidate = (workOrder: WorkOrder | null | undefined) => {
      if (workOrder?.id) candidates.set(String(workOrder.id), workOrder);
    };

    try {
      (await workOrderService.getActiveByLineAndProduct(input.lineId, input.productId)).forEach(addCandidate);
    } catch {
      // Cached/all-work-order fallbacks keep report entry usable if a compound query index is unavailable.
    }

    cachedWorkOrders
      .filter((workOrder) => isActiveWorkOrderStatus(workOrder.status) && workOrder.productId === input.productId)
      .forEach(addCandidate);

    if (candidates.size === 0) {
      (await workOrderService.getAll()).forEach(addCandidate);
    }

    activeWorkOrder = pickBestAutoLinkedWorkOrder(Array.from(candidates.values()), {
      lineId: input.lineId,
      productId: input.productId,
      supervisorId: input.employeeId,
      reportType,
      reportDate: input.date,
      includeCompleted: options?.preserveCompletedWorkOrder === true,
    });
  }

  const explicitPlanId = String(input.productionPlanId || '').trim();
  const explicitPlan = explicitPlanId
    ? await productionPlanService.getById(explicitPlanId)
    : null;
  const workOrderPlanId = String(activeWorkOrder?.planId || '').trim();
  const workOrderPlan = workOrderPlanId && workOrderPlanId !== explicitPlanId
    ? await productionPlanService.getById(workOrderPlanId)
    : explicitPlanId && workOrderPlanId === explicitPlanId
      ? explicitPlan
      : null;
  const activePlans = await productionPlanService.getActiveByLineAndProduct(input.lineId, input.productId);
  const planReportType = effectivePlanReportType(reportType);
  const matchesReportContext = (plan: ProductionPlan | null): boolean => {
    if (!plan || plan.lineId !== input.lineId || plan.productId !== input.productId) return false;
    const planType = plan.planType === 'component_injection' ? 'component_injection' : 'finished_product';
    return planType === planReportType;
  };
  const acceptsReport = (plan: ProductionPlan | null): boolean => (
    matchesReportContext(plan) && plan?.acceptsProductionFromReports !== false
  );
  const matchingActivePlans = activePlans.filter((plan) => acceptsReport(plan));

  if (!explicitPlan && !workOrderPlan && matchingActivePlans.length > 1) {
    throw new Error(
      'يوجد أكثر من خطة نشطة لنفس الخط والمنتج. أنشئ التقرير من الخطة المطلوبة لضمان الربط الصحيح.',
    );
  }

  const activePlan = acceptsReport(explicitPlan)
    ? explicitPlan
    : acceptsReport(workOrderPlan)
      ? workOrderPlan
      : matchingActivePlans.length === 1
        ? matchingActivePlans[0]
        : null;

  return {
    activeWorkOrder,
    activePlan,
    productionPlanLinkMode: activePlan?.id
      ? (acceptsReport(explicitPlan) || acceptsReport(workOrderPlan) ? 'manual' : 'auto')
      : undefined,
    hasMatchingPlanContext:
      matchesReportContext(explicitPlan)
      || matchesReportContext(workOrderPlan)
      || activePlans.some(matchesReportContext),
  };
}

function deriveProductionPlanAutoPatch(
  plan: ProductionPlan,
  reports: ProductionReport[],
): Partial<ProductionPlan> | null {
  const plannedQty = Number(plan.plannedQuantity || 0);
  const planReports = filterReportsForProductionPlan(plan, reports);
  const producedQty = planReports.reduce((sum, report) => sum + Number(report.quantityProduced || 0), 0);
  const remainingQty = Math.max(0, plannedQty - producedQty);
  const achievementPercent = plannedQty > 0
    ? Math.round((producedQty / plannedQty) * 1000) / 10
    : 0;
  const hasReportProgress = planReports.some((report) => Number(report.quantityProduced || 0) > 0);
  const hasProgress = producedQty > 0 || hasReportProgress;

  let nextStatus = plan.status;
  if (plannedQty > 0 && producedQty >= plannedQty && plan.status !== 'completed') {
    nextStatus = 'completed';
  } else if (plan.status === 'completed' && (plannedQty <= 0 || producedQty < plannedQty)) {
    nextStatus = hasProgress ? 'in_progress' : 'planned';
  } else if (plan.status === 'planned' && hasProgress) {
    nextStatus = 'in_progress';
  } else if (plan.status === 'in_progress' && !hasProgress) {
    nextStatus = 'planned';
  }

  const firstReportDate = planReports
    .filter((report) => Number(report.quantityProduced || 0) > 0 && Boolean(report.date))
    .map((report) => report.date)
    .sort((a, b) => a.localeCompare(b))[0];

  const patch: Partial<ProductionPlan> = {};
  if (nextStatus !== plan.status) {
    patch.status = nextStatus;
  }
  if (Number(plan.producedQuantity ?? -1) !== producedQty) {
    patch.producedQuantity = producedQty;
  }
  if (Number(plan.remainingQuantity ?? -1) !== remainingQty) {
    patch.remainingQuantity = remainingQty;
  }
  if (Number(plan.achievementPercent ?? -1) !== achievementPercent) {
    patch.achievementPercent = achievementPercent;
  }
  if (hasProgress && firstReportDate) {
    const currentStart = String(plan.startDate || '');
    const currentPlannedStart = String(plan.plannedStartDate || '');
    if (
      !currentStart
      || currentStart > firstReportDate
      || (currentPlannedStart && currentPlannedStart > firstReportDate)
    ) {
      patch.startDate = firstReportDate;
      patch.plannedStartDate = firstReportDate;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function hasPermission(
  permissions: Record<string, boolean>,
  key: string,
): boolean {
  return checkPermission(permissions, key as Permission);
}

function collectHiddenProductIdsFromRawMaster(
  rawProducts: FirestoreProduct[],
  rawMaterials: Array<{ name?: string; code?: string }>,
): Set<string> {
  const rawNameSet = new Set<string>();
  const rawCodeSet = new Set<string>();

  for (const raw of rawMaterials) {
    const name = normalizeText(String(raw.name || ''));
    const code = String(raw.code || '').trim().toUpperCase();
    if (name) rawNameSet.add(name);
    if (code) rawCodeSet.add(code);
  }

  const hiddenIds = new Set<string>();
  for (const product of rawProducts) {
    if (!product.id) continue;
    const productName = normalizeText(String(product.name || ''));
    const productCode = String(product.code || '').trim().toUpperCase();
    if ((productName && rawNameSet.has(productName)) || (productCode && rawCodeSet.has(productCode))) {
      hiddenIds.add(product.id);
    }
  }
  return hiddenIds;
}

async function filterProductsByRawMaterialWarehouse(
  rawProducts: FirestoreProduct[],
  _rawMaterialWarehouseId?: string,
): Promise<FirestoreProduct[]> {
  try {
    const rawMaterials = await rawMaterialService.getAll();
    const hiddenByMaster = collectHiddenProductIdsFromRawMaster(rawProducts, rawMaterials);
    if (hiddenByMaster.size === 0) return rawProducts;
    return rawProducts.filter((product) => !product.id || !hiddenByMaster.has(product.id));
  } catch {
    return rawProducts;
  }
}

async function resolveProductionReportItemSnapshot(
  reportType: NonNullable<ProductionReport['reportType']>,
  productId: string,
  products: FirestoreProduct[],
  cachedComponentOptions: ReportsUiRawMaterialOption[] = [],
): Promise<Pick<ProductionReport, 'productNameSnapshot' | 'productCodeSnapshot'>> {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) return {};

  if (reportType !== 'component_injection') {
    const product = products.find((row) => row.id === normalizedProductId);
    return product
      ? {
        productNameSnapshot: String(product.name || '').trim(),
        productCodeSnapshot: String(product.code || '').trim(),
      }
      : {};
  }

  let component = cachedComponentOptions.find((row) => row.id === normalizedProductId);
  if (!component) {
    const componentOptions = await loadReportsComponentLabelOptions();
    component = componentOptions.find((row) => row.id === normalizedProductId);
  }
  return component
    ? {
      productNameSnapshot: String(component.name || '').trim(),
      productCodeSnapshot: String(component.code || '').trim(),
    }
    : {};
}

async function syncProductAvgDailyProduction(productId: string): Promise<void> {
  if (!productId) return;

  const reports = await reportService.getByProduct(productId);
  const productiveReports = reports.filter(
    (report) =>
      countsTowardProductManufacturingVolume(report)
      && Number(report.quantityProduced || 0) > 0
      && Boolean(report.date),
  );
  const uniqueDays = new Set(productiveReports.map((report) => report.date)).size;
  const totalProduced = productiveReports.reduce(
    (sum, report) => sum + Number(report.quantityProduced || 0),
    0
  );
  const avgDailyProduction = uniqueDays > 0
    ? Number((totalProduced / uniqueDays).toFixed(2))
    : 0;

  await productService.update(productId, { avgDailyProduction });
}

function isDuplicateEntityCodeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === DUPLICATE_ENTITY_CODE || (error as { code?: string }).code === DUPLICATE_ENTITY_CODE)
  );
}

async function normalizeProductCategoryOnSave(
  data: Partial<FirestoreProduct>,
): Promise<Partial<FirestoreProduct>> {
  const categories = (await categoryService.getAll()).filter(isProductCategoryRow);
  if (data.categoryId?.trim()) {
    await validateProductCategorySelection(data.categoryId, categories);
    return { ...data, ...buildProductCategorySaveFields(data.categoryId, categories) };
  }
  const name = String(data.model || data.categoryName || data.category || '').trim();
  if (!name) return data;
  try {
    const exists = categories.some((c) => String(c.name || '').trim() === name);
    if (!exists) {
      await categoryService.createCategory({
        name,
        isActive: true,
        parentId: null,
      });
    }
    const refreshed = (await categoryService.getAll()).filter(isProductCategoryRow);
    const match = refreshed.find((c) => String(c.name || '').trim() === name);
    if (match?.id) {
      return { ...data, ...buildProductCategorySaveFields(match.id, refreshed) };
    }
  } catch {
    /* keep save resilient */
  }
  return data;
}

export type ReportsUiRawMaterialOption = {
  id: string;
  name: string;
  code: string;
  categoryName?: string;
};

export type ReportsUiReferenceSnapshot = {
  stockBalances: StockItemBalance[];
  warehouses: Warehouse[];
  rawMaterialOptions: ReportsUiRawMaterialOption[];
  categoryOptions: string[];
  fetchedAt: number;
};

export type CreateComponentWasteReportInput = {
  employeeId: string;
  lineId: string;
  productId: string;
  date: string;
  components: ReportComponentScrapItem[];
  notes?: string;
};

type ProductionReportsRangeCacheEntry = { rows: ProductionReport[]; fetchedAt: number };

// ─── State Shape ────────────────────────────────────────────────────────────

interface AppState {
  // UI-ready data (consumed by components)
  productionLines: ProductionLine[];
  products: Product[];
  employees: Employee[];

  // Raw Firestore data (used for rebuilding UI data)
  _rawProducts: FirestoreProduct[];
  _productCategories: ProductCategory[];
  _rawLines: FirestoreProductionLine[];
  _rawEmployees: FirestoreEmployee[];

  // Current logged-in employee record (resolved after login)
  currentEmployee: FirestoreEmployee | null;
  productionReports: ProductionReport[];
  todayReports: ProductionReport[];
  monthlyReports: ProductionReport[];
  lineStatuses: LineStatus[];
  lineProductConfigs: LineProductConfig[];
  /** productId → active routing plan totalTimeSeconds (drives standard assembly minutes on lines). */
  routingTotalTimeSecondsByProduct: Record<string, number>;
  /** productId → seconds/unit for expected-qty variance in reports (plan basis, merged with product target when no plan basis). */
  routingVarianceBasisSecondsByProduct: Record<string, number>;
  /** productId → plan routingTargetUnitSeconds when set (sparse; for labels/UI). */
  routingTargetUnitSecondsByProduct: Record<string, number>;
  /** productId → product.routingTargetUnitSeconds when set (sparse). */
  routingProductTargetUnitSecondsByProduct: Record<string, number>;
  productionPlans: ProductionPlan[];
  productionPlanFollowUps: ProductionPlanFollowUp[];
  planReports: Record<string, ProductionReport[]>;
  attendanceLogs: AttendanceLog[];
  attendanceRecords: AttendanceRecord[];

  // Work Orders & Notifications
  workOrders: WorkOrder[];
  notifications: AppNotification[];
  scanEventsToday: WorkOrderScanEvent[];
  workOrderScanEvents: WorkOrderScanEvent[];
  liveProduction: Record<string, WorkOrderLiveSummary>;

  // Cost management
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  laborSettings: LaborSettings | null;
  assets: Asset[];
  assetDepreciations: AssetDepreciation[];

  // System settings (dashboard config, alert thresholds, KPI thresholds)
  systemSettings: SystemSettings;

  // Loading & error
  loading: boolean;
  productsLoading: boolean;
  linesLoading: boolean;
  reportsLoading: boolean;
  error: string | null;
  authError: string | null;

  // Auth
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  uid: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  userProfile: FirestoreUser | null;
  /** من مستند tenants/{id}.name — بيانات الشركة */
  tenantCompanyName: string;
  /** Effective activity packs for this tenant (always resolved; never empty). */
  tenantActivityPacks: ActivityPackId[];

  // Dynamic RBAC
  roles: FirestoreRole[];
  userRoleId: string;
  userRoleName: string;
  userRoleColor: string;
  userPermissions: Record<string, boolean>;

  // ── Actions ──

  // Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  /** Sync hydrate from local session cache (warm resume). Returns true when applied. */
  hydrateFromCachedSession: (uid: string) => boolean;
  initializeApp: () => Promise<void>;
  checkApprovalStatus: () => Promise<boolean>;

  // Admin user management
  createUser: (email: string, password: string, displayName: string, roleId: string) => Promise<string | null>;
  resetUserPassword: (email: string) => Promise<void>;

  // Role switching (updates user doc + permissions)
  switchRole: (roleId: string) => Promise<void>;

  // Roles management (admin CRUD)
  fetchRoles: () => Promise<void>;
  /** Manual only: create missing default roles + additive grants. Never auto on login. */
  seedDefaultRolesCatalog: () => Promise<{ rolesCreatedOrPatched: boolean; serverGrantedKeys: number }>;
  createRole: (data: Omit<FirestoreRole, 'id'>) => Promise<string | null>;
  updateRole: (id: string, data: Partial<Omit<FirestoreRole, 'id'>>) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;

  // Fetch (one-time) — optional TTL cache so route remounts do not refetch cold
  fetchProducts: (options?: { force?: boolean; maxAgeMs?: number; silent?: boolean }) => Promise<void>;
  fetchLines: (options?: { force?: boolean; maxAgeMs?: number; silent?: boolean }) => Promise<void>;
  fetchEmployees: (options?: { force?: boolean; maxAgeMs?: number; silent?: boolean }) => Promise<void>;
  fetchAttendanceLogs: (startDate: string, endDate: string) => Promise<void>;
  fetchAttendanceRecords: (startDate: string, endDate: string) => Promise<void>;
  importAttendanceFingerprintCsv: (input: {
    file: File;
    importLabel?: string;
    officialHolidays?: string[];
    onProgress?: (done: number, total: number) => void;
  }) => Promise<AttendanceImportResult>;
  syncAttendanceFromDevices: (input?: {
    mode?: 'manual_upload' | 'watch_folder' | 'scheduled' | 'gateway_push';
    file?: File;
    source?: AttendanceSource;
    logs?: NormalizedAttendanceLogInput[];
  }) => Promise<AttendanceImportResult>;
  processDailyAttendance: (date: string) => Promise<AttendanceProcessResult>;
  recalculateAttendanceForDate: (date: string) => Promise<AttendanceProcessResult>;
  updateAttendanceRecordTimes: (
    recordId: string,
    payload: { checkIn: string | null; checkOut: string | null }
  ) => Promise<void>;
  getSinglePunchRecordsByEmployee: (
    employeeId: string,
    startDate: string,
    endDate: string
  ) => Promise<AttendanceRecord[]>;
  deleteAttendanceRecordsByIds: (
    recordIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ deleted: number }>;
  deleteAttendanceRecordsByBatch: (
    batchId: string,
    options?: { startDate?: string; endDate?: string }
  ) => Promise<{ deleted: number }>;
  fetchReports: (startDate?: string, endDate?: string) => Promise<void>;
  fetchLineStatuses: () => Promise<void>;
  fetchLineProductConfigs: () => Promise<void>;
  fetchRoutingPlanTotals: () => Promise<void>;
  fetchProductionPlans: (options?: { force?: boolean; maxAgeMs?: number; silent?: boolean }) => Promise<void>;
  fetchProductionPlanFollowUps: (planId?: string) => Promise<void>;

  // Mutations — Products
  createProduct: (
    data: Omit<FirestoreProduct, 'id'>,
    context: { path: ProductCreatePath },
  ) => Promise<string>;
  updateProduct: (
    id: string,
    data: Partial<FirestoreProduct>,
    context: { path: ProductUpdatePath },
  ) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Mutations — Lines
  createLine: (data: Omit<FirestoreProductionLine, 'id'>) => Promise<string | null>;
  updateLine: (id: string, data: Partial<FirestoreProductionLine>) => Promise<void>;
  deleteLine: (id: string) => Promise<void>;

  // Mutations — Employees
  createEmployee: (data: Omit<FirestoreEmployee, 'id'>) => Promise<string | null>;
  updateEmployee: (id: string, data: Partial<FirestoreEmployee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;

  // Mutations — Reports
  createReport: (
    data: Omit<ProductionReport, 'id' | 'createdAt'>,
    context: { path: ProductionReportCreatePath },
  ) => Promise<string | null>;
  createComponentWasteReport: (data: CreateComponentWasteReportInput) => Promise<string | null>;
  updateReport: (
    id: string,
    data: Partial<ProductionReport>,
    context: { path: ProductionReportUpdatePath },
  ) => Promise<void>;
  deleteReport: (id: string, context: { path: 'reports_page' | 'bulk_delete' }) => Promise<void>;
  reapplyReportInventory: (id: string) => Promise<void>;
  syncMissingProductionEntryTransfers: (
    startDate: string,
    endDate: string
  ) => Promise<{ processed: number; created: number; skipped: number; failed: number }>;
  backfillUnlinkedReportsWorkOrders: (
    startDate: string,
    endDate: string,
    options?: {
      onStart?: (totalCandidates: number) => void;
      onProgress?: (snapshot: {
        processed: number;
        total: number;
        linked: number;
        skipped: number;
        failed: number;
      }) => void;
    }
  ) => Promise<{ processed: number; linked: number; skipped: number; failed: number }>;
  /** Link eligible reports from WO start date onward, then set producedQuantity from linked report sum (idempotent). */
  reconcileWorkOrderFromReports: (
    workOrderId: string,
    context: { path: ProductionReportReconcilePath } | { internal: true },
  ) => Promise<{
    linked: number;
    reportCount: number;
    producedQuantity: number;
  }>;
  /** Recompute produced/status for one plan from its linked reports (includes completed → reopen). */
  reconcileProductionPlanFromReports: (planId: string) => Promise<{
    producedQuantity: number;
    status: PlanStatus;
    patched: boolean;
  } | null>;
  unlinkReportsWorkOrdersInRange: (
    startDate: string,
    endDate: string,
    options?: {
      onStart?: (totalCandidates: number) => void;
      onProgress?: (snapshot: {
        processed: number;
        total: number;
        unlinked: number;
        skipped: number;
        failed: number;
      }) => void;
    }
  ) => Promise<{ processed: number; unlinked: number; skipped: number; failed: number }>;

  // Mutations — Line Status & Config
  updateLineStatus: (id: string, data: Partial<LineStatus>) => Promise<void>;
  createLineStatus: (data: Omit<LineStatus, 'id' | 'updatedAt'>) => Promise<string | null>;
  createLineProductConfig: (data: Omit<LineProductConfig, 'id'>) => Promise<string | null>;
  updateLineProductConfig: (id: string, data: Partial<LineProductConfig>) => Promise<void>;
  deleteLineProductConfig: (id: string) => Promise<void>;

  // Mutations — Production Plans
  createProductionPlan: (
    data: Omit<ProductionPlan, 'id' | 'createdAt'>,
    context: { path: ProductionPlanCreatePath },
  ) => Promise<string | null>;
  updateProductionPlan: (
    id: string,
    data: Partial<ProductionPlan>,
    context: { path: ProductionPlanUpdatePath },
  ) => Promise<void>;
  autoGeneratePlanMaterialRequirements: (plan: ProductionPlan) => Promise<void>;
  deleteProductionPlan: (id: string) => Promise<void>;
  createProductionPlanFollowUp: (data: Omit<ProductionPlanFollowUp, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;
  updateProductionPlanFollowUp: (id: string, data: Partial<ProductionPlanFollowUp>) => Promise<void>;

  // Mutations — Work Orders
  fetchWorkOrders: (options?: { force?: boolean; maxAgeMs?: number; silent?: boolean }) => Promise<void>;
  createWorkOrder: (
    data: Omit<WorkOrder, 'id' | 'createdAt'>,
    context: { path: WorkOrderCreatePath },
  ) => Promise<string | null>;
  updateWorkOrder: (
    id: string,
    data: Partial<WorkOrder>,
    context: { path: WorkOrderUpdatePath },
  ) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;

  // Notifications
  addRealtimeNotification: (input: {
    title: string;
    body: string;
    type?: string;
    referenceId?: string;
    url?: string;
    data?: Record<string, string>;
  }) => void;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  subscribeToNotifications: () => () => void;

  // System Settings
  fetchSystemSettings: () => Promise<void>;
  updateSystemSettings: (data: Partial<SystemSettings>) => Promise<void>;

  // Mutations — Cost Management
  fetchCostData: () => Promise<void>;
  createCostCenter: (data: Omit<CostCenter, 'id' | 'createdAt'>) => Promise<string | null>;
  updateCostCenter: (id: string, data: Partial<CostCenter>) => Promise<void>;
  deleteCostCenter: (id: string) => Promise<void>;
  saveCostCenterValue: (data: Omit<CostCenterValue, 'id'>, existingId?: string) => Promise<void>;
  saveCostAllocation: (data: Omit<CostAllocation, 'id'>, existingId?: string) => Promise<void>;
  updateLaborSettings: (data: Omit<LaborSettings, 'id'>) => Promise<void>;
  fetchAssets: () => Promise<void>;
  createAsset: (data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;
  updateAsset: (id: string, data: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  fetchDepreciationReport: (period: string) => Promise<void>;
  fetchAssetDepreciations: (assetId: string) => Promise<void>;
  fetchDepreciationYear: (year: string) => Promise<void>;
  runDepreciationJob: (period?: string) => Promise<AssetDepreciationRunResult>;

  // Real-time subscriptions (return unsubscribe fn)
  subscribeToDashboard: () => () => void;
  subscribeToLineStatuses: () => () => void;
  subscribeToWorkOrders: () => () => void;
  subscribeToScanEventsToday: () => () => void;
  subscribeToWorkOrderScans: (workOrderId: string) => () => void;
  toggleBarcodeScan: (payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
    timingConfig?: {
      breakStartTime?: string;
      breakEndTime?: string;
      pauseWindows?: { startAt: any; endAt?: any; reason: 'manual' }[];
    };
  }) => Promise<{ action: 'IN' | 'OUT'; cycleSeconds?: number }>;

  // Internal helpers
  _loadAppData: () => Promise<void>;
  _rebuildProducts: () => void;
  _rebuildLines: () => void;
  _applyRole: (role: FirestoreRole) => void;
  _logActivity: (action: Parameters<typeof activityLogService.log>[2], description: string, metadata?: Record<string, any>) => void;

  // Legacy setters (backward compat)
  setProductionLines: (lines: ProductionLine[]) => void;
  setProducts: (products: Product[]) => void;
  setEmployees: (employees: Employee[]) => void;
  setLoading: (loading: boolean) => void;

  /** Cached production reports by date range (shared across dashboards / reports). */
  productionReportsRangeCache: Record<string, ProductionReportsRangeCacheEntry>;
  ensureProductionReportsForRange: (
    startDate: string,
    endDate: string,
    options?: { maxAgeMs?: number; force?: boolean },
  ) => Promise<ProductionReport[]>;
  upsertProductionReportsRangeCache: (
    startDate: string,
    endDate: string,
    rows: ProductionReport[],
  ) => void;

  reportsUiReferenceCache: ReportsUiReferenceSnapshot | null;
  reportsUiReferenceLoading: boolean;
  ensureReportsUiReferenceData: (options?: { maxAgeMs?: number; force?: boolean }) => Promise<void>;
  /** Clears shared Reports-page reference cache (stock/warehouses/raw materials) so next load refetches. */
  invalidateReportsUiReferenceCache: () => void;
}

export function getProductionReportsRangeCacheKey(startDate: string, endDate: string): string {
  return `${String(startDate || '').trim()}|${String(endDate || '').trim()}`;
}

function parseProductionReportsRangeCacheKey(key: string): { start: string; end: string } {
  const i = key.indexOf('|');
  if (i < 0) return { start: '', end: '' };
  return { start: key.slice(0, i), end: key.slice(i + 1) };
}

function dateInIsoRangeInclusive(date: string, rangeStart: string, rangeEnd: string): boolean {
  const d = String(date || '').trim();
  const a = String(rangeStart || '').trim();
  const b = String(rangeEnd || '').trim();
  if (!d || !a || !b) return false;
  return d >= a && d <= b;
}

function pruneProductionReportsRangeCache(
  cache: Record<string, ProductionReportsRangeCacheEntry>,
  affectedDates: string[],
): Record<string, ProductionReportsRangeCacheEntry> {
  const dates = Array.from(new Set(affectedDates.map((x) => String(x || '').trim()).filter(Boolean)));
  if (dates.length === 0) return cache;
  const next: Record<string, ProductionReportsRangeCacheEntry> = { ...cache };
  for (const key of Object.keys(next)) {
    const { start, end } = parseProductionReportsRangeCacheKey(key);
    if (dates.some((dt) => dateInIsoRangeInclusive(dt, start, end))) {
      delete next[key];
    }
  }
  return next;
}

const DEFAULT_REPORTS_RANGE_STALE_MS = 5 * 60 * 1000;
const DEFAULT_REPORTS_UI_REF_STALE_MS = 10 * 60 * 1000;
const DEFAULT_CATALOG_STALE_MS = 5 * 60 * 1000;
const DEFAULT_OPS_STALE_MS = 2 * 60 * 1000;

let _productionReportsRangeInFlight = new Map<string, Promise<ProductionReport[]>>();
let _reportsUiReferenceInFlight: Promise<void> | null = null;

type StoreFetchCacheOptions = { force?: boolean; maxAgeMs?: number; silent?: boolean };

let _productsFetchedAt = 0;
let _linesFetchedAt = 0;
let _employeesFetchedAt = 0;
let _plansFetchedAt = 0;
let _workOrdersFetchedAt = 0;
let _productsInFlight: Promise<void> | null = null;
let _linesInFlight: Promise<void> | null = null;
let _employeesInFlight: Promise<void> | null = null;
let _plansInFlight: Promise<void> | null = null;
let _workOrdersInFlight: Promise<void> | null = null;

function resetStoreFetchCaches() {
  _productsFetchedAt = 0;
  _linesFetchedAt = 0;
  _employeesFetchedAt = 0;
  _plansFetchedAt = 0;
  _workOrdersFetchedAt = 0;
  _productsInFlight = null;
  _linesInFlight = null;
  _employeesInFlight = null;
  _plansInFlight = null;
  _workOrdersInFlight = null;
}

function invalidateProductionReportsRangeCacheForDates(
  dates: string[],
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
) {
  const prev = get().productionReportsRangeCache;
  const next = pruneProductionReportsRangeCache(prev, dates);
  for (const key of Object.keys(prev)) {
    if (!(key in next)) _productionReportsRangeInFlight.delete(key);
  }
  set({ productionReportsRangeCache: next });
}

function getReportOperationalDateString(systemSettings: Pick<SystemSettings, 'planSettings'> | null | undefined): string {
  return getOperationalDateString(resolveReportBehaviorSettings(systemSettings).operationalDayStartHour);
}

// Flag to prevent onAuthStateChanged from running initializeApp during admin user creation
let _creatingUser = false;

function reapplyThemeFromAppStore(get: () => AppState, options?: { syncTenantDoc?: boolean }) {
  const theme = get().systemSettings?.theme ?? DEFAULT_THEME;
  const tenantId = get().userProfile?.tenantId;
  if (options?.syncTenantDoc) {
    void syncTenantThemeSnapshot(tenantId, theme);
  }
  void loadTenantTheme(tenantId).then((tt) => {
    const m = mergeTenantThemeForApply(tt, theme);
    applyAppTheme(m, theme);
    cacheTenantTheme(m);
  });
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  productionLines: [],
  products: [],
  employees: [],

  _rawProducts: [],
  _productCategories: [],
  _rawLines: [],
  _rawEmployees: [],
  currentEmployee: null,
  productionReports: [],
  todayReports: [],
  monthlyReports: [],
  lineStatuses: [],
  lineProductConfigs: [],
  routingTotalTimeSecondsByProduct: {},
  routingVarianceBasisSecondsByProduct: {},
  routingTargetUnitSecondsByProduct: {},
  routingProductTargetUnitSecondsByProduct: {},
  productionPlans: [],
  productionPlanFollowUps: [],
  planReports: {},
  attendanceLogs: [],
  attendanceRecords: [],

  workOrders: [],
  notifications: [],
  scanEventsToday: [],
  workOrderScanEvents: [],
  liveProduction: {},

  costCenters: [],
  costCenterValues: [],
  costAllocations: [],
  laborSettings: null,
  assets: [],
  assetDepreciations: [],

  systemSettings: DEFAULT_SYSTEM_SETTINGS,

  loading: false,
  productsLoading: false,
  linesLoading: false,
  reportsLoading: false,
  productionReportsRangeCache: {},
  reportsUiReferenceCache: null,
  reportsUiReferenceLoading: false,
  error: null,
  authError: null,
  isAuthenticated: false,
  isPendingApproval: false,
  uid: null,
  userEmail: null,
  userDisplayName: null,
  userProfile: null,
  tenantCompanyName: '',
  tenantActivityPacks: ['manufacturing', 'repair'],

  // Dynamic RBAC defaults (empty until login)
  roles: [],
  userRoleId: '',
  userRoleName: '',
  userRoleColor: '',
  userPermissions: emptyPermissions(),

  // ── Internal: apply a role to the store ─────────────────────────────────────

  _applyRole: (role: FirestoreRole) => {
    // Grants come from Firestore roles.permissions only (DB source of truth).
    // Default catalog seed/heal runs only via Roles Management button (or company Setup).
    set({
      userRoleId: role.id!,
      userRoleName: role.name,
      userRoleColor: role.color,
      userPermissions: normalizeRolePermissions(role.permissions),
    });
  },

  // ── Internal: log activity (fire-and-forget) ──────────────────────────────

  _logActivity: (action, description, metadata) => {
    const { uid, userEmail } = get();
    if (uid && userEmail) {
      activityLogService.log(uid, userEmail, action, description, metadata);
    }
  },

  // ── Register: Create a new user account (no role selection) ─────────────────

  register: async (email: string, password: string, displayName: string) => {
    set({ loading: true, authError: null, error: null });
    try {
      const cred = await registerWithEmail(email, password);
      const uid = cred.user.uid;
      // Registration is not an authorized role-migration path. Pending users
      // receive the deterministic least-privilege role id provisioned by admins.
      const defaultRoleId = roleService.defaultRoleId('inventory_viewer');

      await userService.set(uid, {
        email,
        displayName,
        roleId: defaultRoleId,
        tenantId: getCurrentTenantId(),
        isActive: false,
        createdBy: 'self-register',
      });

      set({
        isAuthenticated: true,
        isPendingApproval: true,
        uid,
        userEmail: email,
        userDisplayName: displayName,
        userProfile: {
          id: uid,
          email,
          displayName,
          roleId: defaultRoleId,
          tenantId: getCurrentTenantId(),
          isActive: false,
        },
        loading: false,
      });
    } catch (error: any) {
      let msg = 'فشل إنشاء الحساب';
      if (error?.code === 'auth/email-already-in-use') {
        msg = 'البريد الإلكتروني مستخدم بالفعل. جرب تسجيل الدخول بدلاً من ذلك.';
      } else if (error?.code === 'auth/weak-password') {
        msg = 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
      }
      console.error('register error:', error);
      set({ authError: msg, loading: false, isAuthenticated: false });
    }
  },

  // ── Auth: Login ─────────────────────────────────────────────────────────────

  login: async (email: string, password: string) => {
    set({ loading: true, authError: null, error: null });
    try {
      const cred = await signInWithEmail(email, password);
    
      // Single bootstrap source of truth: onAuthChange -> initializeApp
      // Keep loading=true until initializeApp completes.
    } catch (error: any) {
      let msg = 'فشل تسجيل الدخول';
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      } else if (error?.code === 'auth/too-many-requests') {
        msg = 'تم تجاوز عدد المحاولات. حاول لاحقاً.';
      }
      set({ authError: msg, loading: false, isAuthenticated: false });
    }
  },

  // ── Auth: Logout ──────────────────────────────────────────────────────────

  logout: async () => {
    const tenantId = getCurrentTenantIdOrNull();
    const { uid, userEmail } = get();
    clearCachedAppSession(uid);
    if (uid && userEmail && tenantId) {
      void activityLogService.log(uid, userEmail, 'LOGOUT', 'تسجيل خروج').catch(() => {});
    }
    await signOut();
    setCurrentTenant(null);
    useJobsStore.getState().resetUiState();
    _productionReportsRangeInFlight.clear();
    _reportsUiReferenceInFlight = null;
    resetStoreFetchCaches();
    try {
      const { invalidatePageDataCache } = await import('../modules/shared/lib/pageDataCache');
      invalidatePageDataCache();
    } catch {
      /* ignore */
    }
    set({
      isAuthenticated: false,
      isPendingApproval: false,
      uid: null,
      userEmail: null,
      userDisplayName: null,
      userProfile: null,
      tenantCompanyName: '',
      tenantActivityPacks: ['manufacturing', 'repair'],
      userRoleId: '',
      userRoleName: '',
      userRoleColor: '',
      userPermissions: emptyPermissions(),
      productionLines: [],
      products: [],
      employees: [],
      _rawProducts: [],
      _rawLines: [],
      _rawEmployees: [],
      currentEmployee: null,
      productionReports: [],
      todayReports: [],
      monthlyReports: [],
      productionReportsRangeCache: {},
      reportsUiReferenceCache: null,
      reportsUiReferenceLoading: false,
      lineStatuses: [],
      lineProductConfigs: [],
      routingTotalTimeSecondsByProduct: {},
      routingVarianceBasisSecondsByProduct: {},
      routingTargetUnitSecondsByProduct: {},
      routingProductTargetUnitSecondsByProduct: {},
      productionPlans: [],
      productionPlanFollowUps: [],
      planReports: {},
      attendanceLogs: [],
      attendanceRecords: [],
      workOrders: [],
      notifications: [],
      scanEventsToday: [],
      workOrderScanEvents: [],
      liveProduction: {},
      costCenters: [],
      costCenterValues: [],
      costAllocations: [],
      laborSettings: null,
      assets: [],
      assetDepreciations: [],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      roles: [],
      error: null,
      authError: null,
    });
  },

  // ── Admin: Create User ───────────────────────────────────────────────────

  createUser: async (email, password, displayName, roleId) => {
    const { uid: newUid } = await createUserWithEmail(email, password, {
      displayName,
      roleId,
      createdBy: get().uid ?? '',
      tenantId: getCurrentTenantId(),
    });

    get()._logActivity('CREATE_USER', `إنشاء مستخدم: ${displayName} (${email})`, { newUid, roleId });

    return newUid;
  },

  // ── Admin: Reset Password ────────────────────────────────────────────────

  resetUserPassword: async (email: string) => {
    try {
      await resetPassword(email);
    } catch (error) {
      set({ error: 'فشل إرسال رابط إعادة تعيين كلمة المرور' });
    }
  },

  // ── Warm resume: apply local session before server validate ─────────────

  hydrateFromCachedSession: (uid: string) => {
    const cachedSession = readCachedAppSession(uid);
    if (!cachedSession?.userProfile?.isActive) return false;
    setCurrentTenant(cachedSession.userProfile.tenantId);
    set({
      isAuthenticated: true,
      isPendingApproval: false,
      uid,
      userEmail: cachedSession.userEmail,
      userDisplayName: cachedSession.userDisplayName,
      userProfile: cachedSession.userProfile,
      tenantCompanyName: cachedSession.tenantCompanyName ?? '',
      tenantActivityPacks: resolveActivityPacks(cachedSession.tenantActivityPacks),
      error: null,
      authError: null,
    });
    get()._applyRole(cachedSession.role);
    return true;
  },

  // ── App Bootstrap (called after login) ─────────────────────────────────

  initializeApp: async () => {
    // Skip during admin user creation to avoid race condition
    if (_creatingUser) return;

    if (!auth) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      set({ loading: false, isAuthenticated: false });
      return;
    }

    set({ loading: true, error: null, authError: null });
    try {
      const uid = currentUser.uid;
      get().hydrateFromCachedSession(uid);

      const userDoc = await userService.get(uid);
      if (!userDoc) {
        clearCachedAppSession(uid);
        await signOut();
        setCurrentTenant(null);
        set({
          loading: false,
          isAuthenticated: false,
          authError: 'لم يتم العثور على حساب المستخدم.',
        });
        return;
      }

      setCurrentTenant(userDoc.tenantId);

      if (!userDoc.isActive) {
        clearCachedAppSession(uid);
        set({
          isAuthenticated: true,
          isPendingApproval: true,
          uid,
          userEmail: userDoc.email,
          userDisplayName: userDoc.displayName,
          userProfile: userDoc,
          loading: false,
        });
        return;
      }

      // Role templates / grants run only from Roles Management button (or company Setup).
      // Do not auto-migrate or re-grant on every admin login.
      const roles = await roleService.getAll();
      const role = roles.find((r) => r.id === userDoc.roleId);

      set({ roles });
      if (!role) throw new Error('دور المستخدم غير موجود. تواصل مع مدير النظام.');

      set({
        isAuthenticated: true,
        isPendingApproval: false,
        uid,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
        userProfile: userDoc,
      });

      get()._applyRole(role);
      writeCachedAppSession({
        uid,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
        userProfile: userDoc,
        role,
        tenantCompanyName: get().tenantCompanyName,
        tenantActivityPacks: get().tenantActivityPacks,
      });
      await get()._loadAppData();
      writeCachedAppSession({
        uid,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
        userProfile: userDoc,
        role,
        tenantCompanyName: get().tenantCompanyName,
        tenantActivityPacks: get().tenantActivityPacks,
      });
      set({ loading: false });
    } catch (error) {
      console.error('initializeApp error:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // ── Check Approval Status (called from PendingApproval page) ────────────

  checkApprovalStatus: async () => {
    const { uid } = get();
    if (!uid) return false;
    try {
      const userDoc = await userService.get(uid);
      if (!userDoc) return false;
      if (!userDoc.isActive) return false;

      setCurrentTenant(userDoc.tenantId);

      const roles = get().roles.length > 0 ? get().roles : await roleService.getAll();
      if (roles.length > 0 && get().roles.length === 0) set({ roles });
      const role = roles.find((r) => r.id === userDoc.roleId);
      if (!role) return false;

      set({
        isPendingApproval: false,
        userProfile: userDoc,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
      });

      get()._applyRole(role);
      await get()._loadAppData();
      return true;
    } catch {
      return false;
    }
  },

  // ── Internal: Load all app data (after auth) ────────────────────────────

  _loadAppData: async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const tenantId = get().userProfile?.tenantId;
    const [
      rawProducts,
      allCategories,
      rawLines,
      rawEmployees,
      configs,
      productionPlans,
      productionPlanFollowUps,
      workOrders,
      costCenters,
      costCenterValues,
      costAllocations,
      laborSettings,
      assets,
      assetDepreciations,
      systemSettingsRaw,
      tenantDoc,
    ] = await Promise.all([
      productService.getAll(),
      categoryService.getAll(),
      lineService.getAll(),
      employeeService.getAll(),
      lineProductConfigService.getAll(),
      productionPlanService.getAll(),
      productionPlanFollowUpService.getAll(),
      workOrderService.getAll(),
      costCenterService.getAll(),
      costCenterValueService.getAll(),
      costAllocationService.getAll(),
      laborSettingsService.get(),
      assetService.getAll(),
      assetDepreciationService.getByPeriod(currentMonth),
      systemSettingsService.get(),
      tenantId ? tenantService.getById(tenantId) : Promise.resolve(null),
    ]);

    const today = getReportOperationalDateString(get().systemSettings);
    const [todayReports, lineStatuses] = await Promise.all([
      reportService.getByDateRange(today, today),
      lineStatusService.getAll(),
    ]);
    const rangeCacheNow = Date.now();
    const rkToday = getProductionReportsRangeCacheKey(today, today);

    /** Filled after idle — keeps first paint after login lighter. */
    const planReports: Record<string, ProductionReport[]> = {};

    const mergedSettings = resolveSystemSettings(systemSettingsRaw);
    const filteredRawProducts = await filterProductsByRawMaterialWarehouse(
      rawProducts,
      mergedSettings.planSettings?.rawMaterialWarehouseId,
    );

    let routingTotalTimeSecondsByProduct: Record<string, number> = {};
    let routingVarianceBasisSecondsByProduct: Record<string, number> = {};
    let routingTargetUnitSecondsByProduct: Record<string, number> = {};
    let routingProductTargetUnitSecondsByProduct: Record<string, number> =
      buildProductRoutingTargetSecondsByProductId(filteredRawProducts);
    try {
      const activeRoutingPlans = await routingPlanService.getActivePlans();
      routingTotalTimeSecondsByProduct = buildRoutingTotalSecondsByProductId(activeRoutingPlans);
      const varianceFromPlans = buildRoutingVarianceBasisSecondsByProductId(activeRoutingPlans);
      routingTargetUnitSecondsByProduct =
        buildRoutingTargetSecondsOnlyByProductId(activeRoutingPlans);
      routingProductTargetUnitSecondsByProduct =
        buildProductRoutingTargetSecondsByProductId(filteredRawProducts);
      routingVarianceBasisSecondsByProduct = mergeProductTargetsIntoRoutingVarianceBasis(
        varianceFromPlans,
        routingProductTargetUnitSecondsByProduct,
      );
    } catch (routingErr) {
      console.warn('routingPlanService.getActivePlans failed', routingErr);
      routingVarianceBasisSecondsByProduct = mergeProductTargetsIntoRoutingVarianceBasis(
        {},
        routingProductTargetUnitSecondsByProduct,
      );
    }

    // Resolve current employee record for the logged-in user
    const uid = get().uid;
    const currentEmployee = uid
      ? rawEmployees.find((e) => e.userId === uid) ?? null
      : null;

    set({
      _rawProducts: filteredRawProducts,
      _productCategories: allCategories.filter(isProductCategoryRow),
      _rawLines: rawLines,
      _rawEmployees: rawEmployees,
      currentEmployee,
      lineProductConfigs: configs,
      routingTotalTimeSecondsByProduct,
      routingVarianceBasisSecondsByProduct,
      routingTargetUnitSecondsByProduct,
      routingProductTargetUnitSecondsByProduct,
      todayReports,
      monthlyReports: [],
      productionReports: [],
      productionReportsRangeCache: {
        ...get().productionReportsRangeCache,
        [rkToday]: { rows: todayReports, fetchedAt: rangeCacheNow },
      },
      lineStatuses,
      productionPlans,
      productionPlanFollowUps,
      planReports,
      workOrders,
      costCenters,
      costCenterValues,
      costAllocations,
      laborSettings,
      assets,
      assetDepreciations,
      systemSettings: mergedSettings,
      tenantCompanyName: tenantDoc?.name?.trim() ?? '',
      tenantActivityPacks: resolveActivityPacks(tenantDoc?.activityPacks),
    });

    reapplyThemeFromAppStore(get);

    const allReports = todayReports;
    const productCategories = allCategories.filter(isProductCategoryRow);
    const products = buildProducts(
      filteredRawProducts,
      allReports,
      configs,
      routingTotalTimeSecondsByProduct,
      productCategories,
    );
    const productionLines = buildProductionLines(
      rawLines, rawProducts, rawEmployees, todayReports, lineStatuses, configs,
      productionPlans, planReports, workOrders
    );
    const employees: Employee[] = rawEmployees.map((e) => ({
      id: e.id!,
      name: e.name,
      departmentId: e.departmentId ?? '',
      jobPositionId: e.jobPositionId ?? '',
      level: e.level ?? 1,
      managerId: e.managerId,
      employmentType: e.employmentType ?? 'full_time',
      baseSalary: e.baseSalary ?? 0,
      hourlyRate: e.hourlyRate ?? 0,
      shiftId: e.shiftId,
      vehicleId: e.vehicleId,
      hasSystemAccess: e.hasSystemAccess ?? false,
      isActive: e.isActive !== false,
      code: e.code,
    }));

    set({ products, productionLines, employees });
    {
      const bootTs = Date.now();
      _productsFetchedAt = bootTs;
      _linesFetchedAt = bootTs;
      _employeesFetchedAt = bootTs;
      _plansFetchedAt = bootTs;
      _workOrdersFetchedAt = bootTs;
    }

    const scheduleDeferredBootstrap = () => {
      const idle =
        typeof requestIdleCallback !== 'undefined'
          ? (cb: IdleRequestCallback) => requestIdleCallback(cb, { timeout: 4500 })
          : (cb: IdleRequestCallback) =>
              window.setTimeout(
                () => cb({ didTimeout: true, timeRemaining: () => 0 } as IdleDeadline),
                50,
              );

      idle(() => {
        void (async () => {
          try {
            const { start: ms, end: me } = getMonthDateRange();
            const monthly = await reportService.getByDateRange(ms, me);
            const rkMonth = getProductionReportsRangeCacheKey(ms, me);
            set((st) => ({
              monthlyReports: monthly,
              productionReportsRangeCache: {
                ...st.productionReportsRangeCache,
                [rkMonth]: { rows: monthly, fetchedAt: Date.now() },
              },
            }));
            get()._rebuildProducts();
            get()._rebuildLines();
          } catch (err) {
            console.warn('_loadAppData: deferred monthly reports failed', err);
          }

          try {
            const plans = get().productionPlans;
            const activePlans = plans.filter(
              (p) => p.status === 'in_progress' || p.status === 'planned',
            );
            const nextPlanReports: Record<string, ProductionReport[]> = {};
            const planAutoPatches: Array<{ id: string; patch: Partial<ProductionPlan> }> = [];
            const planReportResults = await Promise.allSettled(
              activePlans.map(async (plan) => {
                const key = plan.id || `${plan.lineId}_${plan.productId}`;
                const reports = await reportService.getByLineAndProduct(
                  plan.lineId,
                  plan.productId,
                  plan.startDate,
                );
                return { plan, key, reports };
              }),
            );
            planReportResults.forEach((result) => {
              if (result.status !== 'fulfilled') return;
              const { plan, key, reports } = result.value;
              const planReports = filterReportsForProductionPlan(plan, reports);
              nextPlanReports[key] = planReports;
              if (!plan.id) return;
              const patch = deriveProductionPlanAutoPatch(plan, reports);
              if (!patch) return;
              planAutoPatches.push({ id: plan.id, patch });
              Object.assign(plan, patch);
            });
            if (planAutoPatches.length > 0) {
              await Promise.allSettled(
                planAutoPatches.map(({ id, patch }) => productionPlanService.update(id, patch)),
              );
            }
            set({ planReports: nextPlanReports, productionPlans: [...plans] });
            get()._rebuildLines();
          } catch (err) {
            console.warn('_loadAppData: deferred plan reports failed', err);
          }
        })();
      });
    };
    scheduleDeferredBootstrap();
  },

  // ── Role Switching ─────────────────────────────────────────────────────────

  switchRole: async (roleId: string) => {
    const { uid, roles } = get();
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;

    get()._applyRole(role);

    if (uid) {
      try {
        await userService.updateRoleId(uid, roleId);
        get()._logActivity('UPDATE_USER_ROLE', `تبديل الدور إلى: ${role.name}`, { roleId });
      } catch (error) {
        console.error('switchRole: failed to persist roleId', error);
      }
    }
  },

  // ── Roles Management ───────────────────────────────────────────────────────

  fetchRoles: async () => {
    try {
      const roles = await roleService.getAll();
      set({ roles });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  seedDefaultRolesCatalog: async () => {
    const roles = await roleService.migrateDefaultRoles();
    set({ roles });
    let serverGrantedKeys = 0;
    try {
      const syncResult = await syncBuiltInRolePermissionGrants();
      serverGrantedKeys = Number(syncResult?.grantedKeys || 0);
      if (serverGrantedKeys > 0) {
        const refreshed = await roleService.getAll();
        set({ roles: refreshed });
      }
    } catch (syncError) {
      console.warn('syncBuiltInRolePermissionGrants (manual) failed:', syncError);
    }
    return { rolesCreatedOrPatched: true, serverGrantedKeys };
  },

  createRole: async (data) => {
    try {
      const created = unwrapOrThrow(await createRoleUseCase(
        {
          ...data,
          permissions: normalizeRolePermissions(data.permissions),
        },
        {
          userId: get().uid ?? undefined,
          userName: get().userDisplayName ?? get().userEmail ?? undefined,
        },
      ));
      await get().fetchRoles();
      return created.roleId;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateRole: async (id, data) => {
    try {
      const payload = data.permissions
        ? { ...data, permissions: normalizeRolePermissions(data.permissions) }
        : data;
      unwrapOrThrow(await updateRoleUseCase(id, payload, {
        userId: get().uid ?? undefined,
        userName: get().userDisplayName ?? get().userEmail ?? undefined,
      }));
      await get().fetchRoles();

      if (id === get().userRoleId) {
        const fresh = await roleService.getById(id);
        if (fresh) get()._applyRole(fresh);
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteRole: async (id) => {
    try {
      unwrapOrThrow(await deleteRoleUseCase(id, {
        userId: get().uid ?? undefined,
        userName: get().userDisplayName ?? get().userEmail ?? undefined,
      }));
      await get().fetchRoles();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      throw error;
    }
  },

  // ── Fetch Actions ─────────────────────────────────────────────────────────

  fetchProducts: async (options: StoreFetchCacheOptions = {}) => {
    const force = options.force === true;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_CATALOG_STALE_MS;
    const hasData = get()._rawProducts.length > 0;
    if (!force && hasData && Date.now() - _productsFetchedAt < maxAgeMs) return;
    if (_productsInFlight) {
      await _productsInFlight;
      return;
    }
    const silent = options.silent ?? hasData;
    if (!silent) set({ productsLoading: true, error: null });
    const run = (async () => {
      try {
        const [rawProducts, allCategories] = await Promise.all([
          productService.getAll(),
          categoryService.getAll(),
        ]);
        const productCategories = allCategories.filter(isProductCategoryRow);
        const rawMaterialWarehouseId = get().systemSettings.planSettings?.rawMaterialWarehouseId;
        const filteredRawProducts = await filterProductsByRawMaterialWarehouse(rawProducts, rawMaterialWarehouseId);
        set({ _rawProducts: filteredRawProducts, _productCategories: productCategories });
        get()._rebuildProducts();
        await get().fetchRoutingPlanTotals();
        _productsFetchedAt = Date.now();
        set({ productsLoading: false });
      } catch (error) {
        set({ error: (error as Error).message, productsLoading: false });
      } finally {
        _productsInFlight = null;
      }
    })();
    _productsInFlight = run;
    await run;
  },

  fetchLines: async (options: StoreFetchCacheOptions = {}) => {
    const force = options.force === true;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_CATALOG_STALE_MS;
    const hasData = get()._rawLines.length > 0;
    if (!force && hasData && Date.now() - _linesFetchedAt < maxAgeMs) return;
    if (_linesInFlight) {
      await _linesInFlight;
      return;
    }
    const silent = options.silent ?? hasData;
    if (!silent) set({ linesLoading: true, error: null });
    const run = (async () => {
      try {
        const rawLines = await lineService.getAll();
        set({ _rawLines: rawLines });
        get()._rebuildLines();
        _linesFetchedAt = Date.now();
        set({ linesLoading: false });
      } catch (error) {
        set({ error: (error as Error).message, linesLoading: false });
      } finally {
        _linesInFlight = null;
      }
    })();
    _linesInFlight = run;
    await run;
  },

  fetchEmployees: async (options: StoreFetchCacheOptions = {}) => {
    const force = options.force === true;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_CATALOG_STALE_MS;
    const hasData = get()._rawEmployees.length > 0;
    if (!force && hasData && Date.now() - _employeesFetchedAt < maxAgeMs) return;
    if (_employeesInFlight) {
      await _employeesInFlight;
      return;
    }
    const run = (async () => {
      try {
        const rawEmployees = await employeeService.getAll();
        set({ _rawEmployees: rawEmployees });
        const employees: Employee[] = rawEmployees.map((e) => ({
          id: e.id!,
          name: e.name,
          departmentId: e.departmentId ?? '',
          jobPositionId: e.jobPositionId ?? '',
          level: e.level ?? 1,
          managerId: e.managerId,
          employmentType: e.employmentType ?? 'full_time',
          baseSalary: e.baseSalary ?? 0,
          hourlyRate: e.hourlyRate ?? 0,
          shiftId: e.shiftId,
          vehicleId: e.vehicleId,
          hasSystemAccess: e.hasSystemAccess ?? false,
          isActive: e.isActive !== false,
          code: e.code,
        }));
        set({ employees });
        _employeesFetchedAt = Date.now();
      } catch (error) {
        set({ error: (error as Error).message });
      } finally {
        _employeesInFlight = null;
      }
    })();
    _employeesInFlight = run;
    await run;
  },

  fetchAttendanceLogs: async (startDate, endDate) => {
    try {
      const rows = await zktecoSyncService.getLogsByDateRange(startDate, endDate);
      set({ attendanceLogs: rows as AttendanceLog[] });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchAttendanceRecords: async (startDate, endDate) => {
    try {
      const rows = await attendanceProcessingService.getRecordsByDateRange(startDate, endDate);
      set({ attendanceRecords: rows });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  importAttendanceFingerprintCsv: async ({ file, importLabel, officialHolidays, onProgress }) => {
    const startedBy = get().userDisplayName || get().userEmail || 'System';
    const jobStore = useJobsStore.getState();
    const jobId = jobStore.addJob({
      fileName: file.name || 'Fingerprint CSV',
      jobType: 'Attendance Fingerprint Import',
      totalRows: 1,
      startedBy,
    });
    jobStore.startJob(jobId, 'Parsing fingerprint CSV');
    set({ error: null });

    try {
      const result = await zktecoSyncService.importFingerprintCsvFile(file, {
        importLabel,
        officialHolidays,
        onProgress: (done, total) => {
          jobStore.setJobProgress(jobId, {
            processedRows: done,
            totalRows: Math.max(total, 1),
            status: 'processing',
            statusText: `Processing fingerprint rows ${done}/${total}`,
          });
          onProgress?.(done, total);
        },
      });

      jobStore.completeJob(jobId, {
        addedRows: result.importedRows,
        failedRows: result.failedRows,
        statusText: `Imported ${result.importedRows}, skipped ${result.failedRows}`,
      });

      return result;
    } catch (error) {
      const message = (error as Error).message || 'Fingerprint attendance import failed';
      set({ error: message });
      jobStore.failJob(jobId, message, 'Attendance fingerprint import failed');
      throw error;
    }
  },

  syncAttendanceFromDevices: async (input) => {
    const mode = input?.mode || 'manual_upload';
    const watchEnabled = get().systemSettings.attendanceIntegration?.watchFolderEnabled === true;
    if ((mode === 'scheduled' || mode === 'watch_folder') && !watchEnabled && !input?.file && !input?.logs?.length) {
      return {
        batchId: '',
        totalRows: 0,
        importedRows: 0,
        dedupedRows: 0,
        failedRows: 0,
        errors: [],
      };
    }
    const startedBy = get().userDisplayName || get().userEmail || 'System';
    const jobStore = useJobsStore.getState();
    const estimatedRows = input?.logs?.length || 1;
    const fileName =
      input?.file?.name ||
      (mode === 'watch_folder'
        ? 'Attendance Watch Folder'
        : mode === 'scheduled'
          ? 'Attendance Scheduled Sync'
          : 'Attendance Manual Sync');
    const jobId = jobStore.addJob({
      fileName,
      jobType: 'Attendance Device Sync',
      totalRows: estimatedRows,
      startedBy,
    });
    jobStore.startJob(jobId, 'Preparing attendance import');
    set({ error: null });
    try {
      let result: AttendanceImportResult;
      if (input?.file) {
        jobStore.setJobProgress(jobId, {
          processedRows: 0,
          status: 'uploading',
          statusText: 'Parsing Excel/CSV file',
          totalRows: 1,
        });
        const lowerName = (input.file.name || '').toLowerCase();
        const isCsvLike = lowerName.endsWith('.csv') || lowerName.endsWith('.txt');
        const fileText = isCsvLike ? await input.file.text() : '';
        const isFingerprintCsv = isCsvLike && /^AC-No,\s*Name,\s*Department,\s*Date,\s*Time/im.test(fileText);
        if (isFingerprintCsv) {
          result = await zktecoSyncService.importFingerprintCsvText(fileText, {
            importLabel: `fingerprint-${new Date().toISOString().slice(0, 7)}`,
            onProgress: (done, total) => {
              jobStore.setJobProgress(jobId, {
                processedRows: done,
                status: 'processing',
                statusText: `Processing fingerprint rows ${done}/${total}`,
                totalRows: Math.max(total, 1),
              });
            },
          });
        } else {
          result = await zktecoSyncService.importFile(input.file, input.source || 'zkteco_excel');
        }
      } else if (input?.logs && input.logs.length > 0) {
        jobStore.setJobProgress(jobId, {
          processedRows: 0,
          status: 'processing',
          statusText: 'Importing gateway logs',
          totalRows: input.logs.length,
        });
        const imported = await zktecoSyncService.importNormalizedLogs(input.logs);
        result = {
          batchId: imported.batchId,
          totalRows: input.logs.length,
          importedRows: imported.importedRows,
          dedupedRows: imported.dedupedRows,
          failedRows: 0,
          errors: [],
        };
      } else {
        result = {
          batchId: '',
          totalRows: 0,
          importedRows: 0,
          dedupedRows: 0,
          failedRows: 0,
          errors: [],
        };
      }

      if (!result.recordsReady) {
        const processedDates = result.processedDates && result.processedDates.length > 0
          ? result.processedDates
          : [getTodayDateString()];
        for (let i = 0; i < processedDates.length; i += 1) {
          const date = processedDates[i];
          jobStore.setJobProgress(jobId, {
            processedRows: i + 1,
            totalRows: processedDates.length,
            status: 'processing',
            statusText: `Processing attendance date ${date}`,
          });
          await attendanceProcessingService.processDate(date);
        }
      }

      jobStore.completeJob(jobId, {
        addedRows: result.importedRows,
        failedRows: result.failedRows + result.dedupedRows,
        statusText: `Imported ${result.importedRows}, deduped ${result.dedupedRows}`,
      });
      return result;
    } catch (error) {
      const message = (error as Error).message || 'Attendance sync failed';
      set({ error: message });
      jobStore.failJob(jobId, message, 'Attendance sync failed');
      throw error;
    }
  },

  processDailyAttendance: async (date) => {
    const startedBy = get().userDisplayName || get().userEmail || 'System';
    const jobStore = useJobsStore.getState();
    const jobId = jobStore.addJob({
      fileName: date,
      jobType: 'Attendance Daily Process',
      totalRows: 1,
      startedBy,
    });
    jobStore.startJob(jobId, `Processing attendance for ${date}`);
    set({ error: null });
    try {
      const result = await attendanceProcessingService.processDate(date);
      jobStore.completeJob(jobId, {
        addedRows: result.recordsUpserted,
        failedRows: 0,
        statusText: `Upserted ${result.recordsUpserted} records`,
      });
      return result;
    } catch (error) {
      const message = (error as Error).message || 'Attendance process failed';
      set({ error: message });
      jobStore.failJob(jobId, message, 'Attendance process failed');
      throw error;
    }
  },

  recalculateAttendanceForDate: async (date) => {
    const startedBy = get().userDisplayName || get().userEmail || 'System';
    const jobStore = useJobsStore.getState();
    const jobId = jobStore.addJob({
      fileName: date,
      jobType: 'Attendance Recalculate',
      totalRows: 1,
      startedBy,
    });
    jobStore.startJob(jobId, `Recalculating ${date}`);
    set({ error: null });
    try {
      const result = await attendanceProcessingService.recalculateDate(date);
      jobStore.completeJob(jobId, {
        addedRows: result.recordsUpserted,
        failedRows: 0,
        statusText: `Recalculated ${result.recordsUpserted} records`,
      });
      return result;
    } catch (error) {
      const message = (error as Error).message || 'Attendance recalculation failed';
      set({ error: message });
      jobStore.failJob(jobId, message, 'Attendance recalculation failed');
      throw error;
    }
  },

  updateAttendanceRecordTimes: async (recordId, payload) => {
    set({ error: null });
    try {
      await attendanceProcessingService.updateRecordTimes(recordId, payload);
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  getSinglePunchRecordsByEmployee: async (employeeId, startDate, endDate) => {
    set({ error: null });
    try {
      return await attendanceProcessingService.getSinglePunchRecordsByEmployee(employeeId, startDate, endDate);
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteAttendanceRecordsByIds: async (recordIds, onProgress) => {
    set({ error: null });
    try {
      const result = await attendanceProcessingService.deleteRecordsByIds(recordIds, onProgress);
      if (result.deleted > 0) {
        set((state) => ({
          attendanceRecords: state.attendanceRecords.filter((record) => !recordIds.includes(record.id)),
        }));
      }
      return result;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteAttendanceRecordsByBatch: async (batchId, options) => {
    set({ error: null });
    try {
      return await attendanceProcessingService.deleteRecordsByImportBatch(batchId, options);
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  fetchReports: async (startDate?: string, endDate?: string) => {
    set({ reportsLoading: true, error: null });
    try {
      const today = getReportOperationalDateString(get().systemSettings);
      const from = startDate || today;
      const to = endDate || today;
      const reports: ProductionReport[] = [];
      let cursor: any = null;
      const maxPages = 200;
      for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
        const page = await reportService.listByDateRangePaged({
          startDate: from,
          endDate: to,
          limit: 500,
          cursor,
        });
        reports.push(...page.items);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      const cacheKey = getProductionReportsRangeCacheKey(from, to);
      set((state) => ({
        productionReports: reports,
        reportsLoading: false,
        productionReportsRangeCache: {
          ...state.productionReportsRangeCache,
          [cacheKey]: { rows: reports, fetchedAt: Date.now() },
        },
      }));
    } catch (error) {
      set({ error: (error as Error).message, reportsLoading: false });
    }
  },

  ensureProductionReportsForRange: async (startDate, endDate, options = {}) => {
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_REPORTS_RANGE_STALE_MS;
    const force = options.force ?? false;
    const key = getProductionReportsRangeCacheKey(startDate, endDate);
    const cached = get().productionReportsRangeCache[key];
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAt < maxAgeMs) {
      return cached.rows;
    }
    let pending = _productionReportsRangeInFlight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const raw = await reportService.getByDateRange(startDate, endDate);
          const rows = Array.isArray(raw) ? raw : [];
          set((state) => ({
            productionReportsRangeCache: {
              ...state.productionReportsRangeCache,
              [key]: { rows, fetchedAt: Date.now() },
            },
          }));
          return rows;
        } finally {
          _productionReportsRangeInFlight.delete(key);
        }
      })();
      _productionReportsRangeInFlight.set(key, pending);
    }
    return pending;
  },

  upsertProductionReportsRangeCache: (startDate, endDate, rows) => {
    const key = getProductionReportsRangeCacheKey(startDate, endDate);
    set((state) => ({
      productionReportsRangeCache: {
        ...state.productionReportsRangeCache,
        [key]: { rows, fetchedAt: Date.now() },
      },
    }));
  },

  ensureReportsUiReferenceData: async (options = {}) => {
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_REPORTS_UI_REF_STALE_MS;
    const force = options.force ?? false;
    const cached = get().reportsUiReferenceCache;
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAt < maxAgeMs) {
      return;
    }
    if (_reportsUiReferenceInFlight) {
      await _reportsUiReferenceInFlight;
      return;
    }
    const needSpinner = !cached;
    if (needSpinner) set({ reportsUiReferenceLoading: true });
    const run = (async () => {
      try {
        const [balancesResult, warehousesResult, categoriesResult, componentOptionsResult] = await Promise.allSettled([
          stockService.getBalances(),
          warehouseService.getAllWarehouses(),
          categoryService.getByType('product'),
          loadReportsComponentLabelOptions(),
        ]);
        const catRows = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
        const names = catRows
          .filter((row) => row.isActive !== false)
          .map((row) => String(row.name || '').trim())
          .filter(Boolean);
        const previous = get().reportsUiReferenceCache;
        set({
          reportsUiReferenceCache: {
            stockBalances: balancesResult.status === 'fulfilled'
              ? balancesResult.value || []
              : previous?.stockBalances || [],
            warehouses: warehousesResult.status === 'fulfilled'
              ? warehousesResult.value || []
              : previous?.warehouses || [],
            rawMaterialOptions: componentOptionsResult.status === 'fulfilled'
              ? componentOptionsResult.value
              : previous?.rawMaterialOptions || [],
            categoryOptions: categoriesResult.status === 'fulfilled'
              ? Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ar'))
              : previous?.categoryOptions || [],
            fetchedAt: Date.now(),
          },
          reportsUiReferenceLoading: false,
        });
      } catch {
        set({ reportsUiReferenceLoading: false });
      } finally {
        _reportsUiReferenceInFlight = null;
      }
    })();
    _reportsUiReferenceInFlight = run;
    await run;
  },

  invalidateReportsUiReferenceCache: () => {
    _reportsUiReferenceInFlight = null;
    set({ reportsUiReferenceCache: null });
  },

  fetchLineStatuses: async () => {
    try {
      const lineStatuses = await lineStatusService.getAll();
      set({ lineStatuses });
      get()._rebuildLines();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchLineProductConfigs: async () => {
    try {
      const configs = await lineProductConfigService.getAll();
      set({ lineProductConfigs: configs });
      get()._rebuildProducts();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchRoutingPlanTotals: async () => {
    try {
      const plans = await routingPlanService.getActivePlans();
      const routingTotalTimeSecondsByProduct = buildRoutingTotalSecondsByProductId(plans);
      const varianceFromPlans = buildRoutingVarianceBasisSecondsByProductId(plans);
      const routingTargetUnitSecondsByProduct = buildRoutingTargetSecondsOnlyByProductId(plans);
      const productTargets = buildProductRoutingTargetSecondsByProductId(get()._rawProducts);
      const routingVarianceBasisSecondsByProduct = mergeProductTargetsIntoRoutingVarianceBasis(
        varianceFromPlans,
        productTargets,
      );
      set({
        routingTotalTimeSecondsByProduct,
        routingVarianceBasisSecondsByProduct,
        routingTargetUnitSecondsByProduct,
        routingProductTargetUnitSecondsByProduct: productTargets,
      });
      get()._rebuildProducts();
    } catch (error) {
      console.error('fetchRoutingPlanTotals', error);
    }
  },

  fetchProductionPlans: async (options: StoreFetchCacheOptions = {}) => {
    const force = options.force === true;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_OPS_STALE_MS;
    const hasData = get().productionPlans.length > 0;
    if (!force && hasData && Date.now() - _plansFetchedAt < maxAgeMs) return;
    if (_plansInFlight) {
      await _plansInFlight;
      return;
    }
    const run = (async () => {
      try {
        const productionPlans = await productionPlanService.getAll();
        const productionPlanFollowUps = await productionPlanFollowUpService.getAll();
        // Include completed plans so deleting/reducing linked reports can reopen them.
        const reconcilablePlans = productionPlans.filter(
          (p) => p.status === 'in_progress' || p.status === 'planned' || p.status === 'completed',
        );
        const planReports: Record<string, ProductionReport[]> = {};
        const planAutoPatches: Array<{ id: string; patch: Partial<ProductionPlan> }> = [];
        await Promise.all(
          reconcilablePlans.map(async (plan) => {
            const key = plan.id || `${plan.lineId}_${plan.productId}`;
            const reports = await reportService.getByLineAndProduct(
              plan.lineId, plan.productId, plan.startDate
            );
            planReports[key] = filterReportsForProductionPlan(plan, reports);
            if (!plan.id) return;
            const patch = deriveProductionPlanAutoPatch(plan, reports);
            if (!patch) return;
            planAutoPatches.push({ id: plan.id, patch });
            Object.assign(plan, patch);
          })
        );
        if (planAutoPatches.length > 0) {
          await Promise.allSettled(
            planAutoPatches.map(({ id, patch }) => productionPlanService.update(id, patch)),
          );
        }
        set({ productionPlans, productionPlanFollowUps, planReports });
        get()._rebuildLines();
        _plansFetchedAt = Date.now();
      } catch (error) {
        set({ error: (error as Error).message });
      } finally {
        _plansInFlight = null;
      }
    })();
    _plansInFlight = run;
    await run;
  },

  fetchProductionPlanFollowUps: async (planId) => {
    try {
      const productionPlanFollowUps = planId
        ? await productionPlanFollowUpService.getByPlan(planId)
        : await productionPlanFollowUpService.getAll();
      set({ productionPlanFollowUps });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Production Plan Mutations ────────────────────────────────────────────

  createProductionPlan: async (data, context) => {
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_PLAN_OPERATION_KEYS.create,
        context.path,
      );
      const planType = data.planType === 'component_injection' ? 'component_injection' : 'finished_product';
      const permissions = get().userPermissions;
      if (planType === 'finished_product' && !hasPermission(permissions, 'plans.create')) {
        const msg = 'غير مصرح بإنشاء خطة إنتاج.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (planType === 'component_injection' && !hasPermission(permissions, 'plans.componentInjection.manage')) {
        const msg = 'غير مصرح بإنشاء خطة إنتاج لمكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      const id = await productionPlanService.create({
        ...data,
        planType,
      });
      if (id) {
        await get().fetchProductionPlans({ force: true });
        const saved = await productionPlanService.getById(id);
        if (saved) {
          void get().autoGeneratePlanMaterialRequirements(saved);
        }
        const supervisorId = String(data.supervisorId || saved?.supervisorId || '').trim();
        if (supervisorId) {
          const { _rawProducts } = get();
          const product = _rawProducts.find((p) => p.id === (data.productId || saved?.productId));
          const qty = Number(data.plannedQuantity ?? saved?.plannedQuantity ?? 0);
          await notificationService.create({
            recipientId: supervisorId,
            type: 'production_plan_assigned',
            title: 'خطة إنتاج جديدة',
            message: `خطة إنتاج — ${product?.name ?? ''} — ${Number.isFinite(qty) ? qty : 0} وحدة`,
            referenceId: id,
            isRead: false,
          }).catch((notifyError) => {
            console.warn('production plan notify failed:', notifyError);
          });
        }
      }
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateProductionPlan: async (id, data, context) => {
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_PLAN_OPERATION_KEYS.update,
        context.path,
      );
      const existingPlan = get().productionPlans.find((plan) => plan.id === id)
        ?? await productionPlanService.getById(id);
      const planType = data.planType ?? existingPlan?.planType ?? 'finished_product';
      const permissions = get().userPermissions;
      const canEdit = planType === 'component_injection'
        ? hasPermission(permissions, 'plans.componentInjection.manage')
        : hasPermission(permissions, 'plans.edit');
      if (!canEdit) {
        throw new Error('غير مصرح بتعديل خطة الإنتاج.');
      }
      await productionPlanService.update(id, data);
      await get().fetchProductionPlans({ force: true });
      const saved = await productionPlanService.getById(id);
      if (saved) {
        void get().autoGeneratePlanMaterialRequirements(saved);
      }
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  autoGeneratePlanMaterialRequirements: async (plan) => {
    try {
      const settings = get().systemSettings;
      if (!settings?.planSettings?.autoGenerateMaterialRequirements) return;
      if (!hasPermission(get().userPermissions, 'planning.materialRequirements.generate')) return;
      if (!plan.id || !plan.productId) return;
      const uid = get().uid || get().currentEmployee?.id || 'system';
      const useRemaining = settings.planSettings.materialRequirementsUseRemainingQty !== false;
      await materialRequirementService.generateForPlans([plan], uid, { useRemainingQty: useRemaining });
    } catch (error) {
      console.warn('autoGeneratePlanMaterialRequirements:', error);
    }
  },

  deleteProductionPlan: async (id) => {
    try {
      await productionPlanService.delete(id);
      await get().fetchProductionPlans({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createProductionPlanFollowUp: async (data) => {
    try {
      const id = await productionPlanFollowUpService.create(data);
      if (id) await get().fetchProductionPlanFollowUps();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateProductionPlanFollowUp: async (id, data) => {
    try {
      await productionPlanFollowUpService.update(id, data);
      await get().fetchProductionPlanFollowUps();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Work Orders ──────────────────────────────────────────────────────────

  fetchWorkOrders: async (options: StoreFetchCacheOptions = {}) => {
    const force = options.force === true;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_OPS_STALE_MS;
    const hasData = get().workOrders.length > 0;
    if (!force && hasData && Date.now() - _workOrdersFetchedAt < maxAgeMs) return;
    if (_workOrdersInFlight) {
      await _workOrdersInFlight;
      return;
    }
    const run = (async () => {
      try {
        const workOrders = await workOrderService.getAll();
        set({ workOrders });
        _workOrdersFetchedAt = Date.now();
      } catch (error) {
        set({ error: (error as Error).message });
      } finally {
        _workOrdersInFlight = null;
      }
    })();
    _workOrdersInFlight = run;
    await run;
  },

  createWorkOrder: async (data, context) => {
    const { uid, userDisplayName, userEmail } = get();
    const actor = {
      userId: uid ?? undefined,
      userName: userDisplayName ?? userEmail ?? undefined,
    };
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'work_order.create',
      action: 'create',
      entityType: 'work_order',
      actor,
      metadata: {
        workOrderNumber: data.workOrderNumber,
        lineId: data.lineId,
        productId: data.productId,
        quantity: data.quantity,
        status: data.status,
      },
      description: 'Create work order',
    });
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        WORK_ORDER_OPERATION_KEYS.create,
        context.path,
      );
      let inferredType: WorkOrder['workOrderType'] = data.workOrderType;
      if (!inferredType && data.planId) {
        const linkedPlan = await productionPlanService.getById(data.planId);
        inferredType = linkedPlan?.planType;
      }
      const workOrderType = inferredType === 'component_injection' ? 'component_injection' : 'finished_product';
      const permissions = get().userPermissions;
      if (workOrderType === 'finished_product' && !hasPermission(permissions, 'workOrders.create')) {
        const msg = 'غير مصرح بإنشاء أمر شغل.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (workOrderType === 'component_injection' && !hasPermission(permissions, 'workOrders.componentInjection.manage')) {
        const msg = 'غير مصرح بإنشاء أمر شغل لمكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      const id = await workOrderService.create({
        ...data,
        workOrderType,
      });
      trackedOperation.entityId = id ?? trackedOperation.entityId;
      trackedOperation.batchId = id ?? trackedOperation.batchId;
      if (id) {
        await get().fetchWorkOrders({ force: true });
        const { _rawProducts } = get();
        const product = _rawProducts.find((p) => p.id === data.productId);
        if (data.supervisorId) {
          await notificationService.create({
            recipientId: data.supervisorId,
            type: 'work_order_assigned',
            title: 'أمر شغل جديد',
            message: `أمر شغل ${data.workOrderNumber} — ${product?.name ?? ''} — ${data.quantity} وحدة`,
            referenceId: id,
            isRead: false,
          });
        }

        const { uid, userDisplayName, userEmail } = get();
        eventBus.emit(SystemEvents.WORK_ORDER_CREATED, {
          module: 'production',
          entityType: 'work_order',
          entityId: id,
          action: 'create',
          description: 'Work order created',
          batchId: id,
          actor: {
            userId: uid ?? undefined,
            userName: userDisplayName ?? userEmail ?? undefined,
          },
          metadata: {
            workOrderNumber: data.workOrderNumber,
            lineId: data.lineId,
            productId: data.productId,
            quantity: data.quantity,
            status: data.status,
          },
        });

        try {
          await get().reconcileWorkOrderFromReports(id, { internal: true });
        } catch (reconcileError) {
          console.warn('reconcileWorkOrderFromReports after create failed:', reconcileError);
        }
      }
      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          workOrderId: id ?? null,
          status: id ? 'created' : 'empty_id',
        },
      });
      return id;
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          workOrderNumber: data.workOrderNumber,
          lineId: data.lineId,
        },
      });
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateWorkOrder: async (id, data, context) => {
    const { uid, userDisplayName, userEmail } = get();
    const operation =
      data.status === 'completed'
        ? 'work_order.close'
        : data.status === 'in_progress'
          ? 'work_order.start'
          : 'work_order.update';
    const action =
      data.status === 'completed'
        ? 'close'
        : data.status === 'in_progress'
          ? 'start'
          : 'update';
    const actor = {
      userId: uid ?? undefined,
      userName: userDisplayName ?? userEmail ?? undefined,
    };
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation,
      action,
      entityType: 'work_order',
      entityId: id,
      batchId: id,
      actor,
      metadata: {
        status: data.status ?? null,
        supervisorId: data.supervisorId ?? null,
      },
      description: `Update work order (${operation})`,
    });
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        WORK_ORDER_OPERATION_KEYS.update,
        context.path,
      );
      let existing = get().workOrders.find((w) => w.id === id);
      if (data.status === 'completed' && !existing) {
        const fetched = await workOrderService.getById(id);
        if (fetched) existing = fetched;
      }
      if (data.status === 'completed' && !existing) {
        const msg = 'تعذر تحميل أمر الشغل للتحقق قبل الإغلاق.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (data.status === 'completed' && existing) {
        const latest = await scanEventService.buildWorkOrderSummary(id);
        if (latest.openSessions.length > 0) {
          const msg = `لا يمكن إغلاق أمر الشغل لوجود ${latest.openSessions.length} قطعة قيد التشغيل بدون تسجيل خروج.`;
          set({ error: msg });
          throw new Error(msg);
        }

        const closingWorkHours = Number(data.actualWorkHours ?? existing.actualWorkHours ?? 0);
        if (!Number.isFinite(closingWorkHours) || closingWorkHours <= 0) {
          const msg = 'لا يمكن إغلاق أمر الشغل بدون تسجيل ساعات العمل الفعلية.';
          set({ error: msg });
          throw new Error(msg);
        }
        const policies = await qualitySettingsService.getPolicies();
        if (
          policies.closeRequiresQualityApproval &&
          existing.qualityStatus !== 'approved' &&
          existing.qualityStatus !== 'not_required'
        ) {
          const msg = 'لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة (Policy: closeRequiresQualityApproval).';
          set({
            error: msg,
          });
          throw new Error(msg);
        }
      }
      await workOrderService.update(id, data);
      await get().fetchWorkOrders({ force: true });
      const updatedWorkOrder = get().workOrders.find((w) => w.id === id) ?? (existing ? { ...existing, ...data } : null);

      if (existing && data.status && data.status !== existing.status) {
        if (data.status === 'in_progress') {
          eventBus.emit(SystemEvents.PRODUCTION_STARTED, {
            module: 'production',
            entityType: 'work_order',
            entityId: id,
            action: 'start',
            description: 'Production started for work order',
            batchId: id,
            actor,
            metadata: {
              workOrderNumber: existing.workOrderNumber,
              previousStatus: existing.status,
              nextStatus: data.status,
            },
          });
        }
        if (data.status === 'completed') {
          eventBus.emit(SystemEvents.PRODUCTION_CLOSED, {
            module: 'production',
            entityType: 'work_order',
            entityId: id,
            action: 'close',
            description: 'Production closed for work order',
            batchId: id,
            actor,
            metadata: {
              workOrderNumber: existing.workOrderNumber,
              previousStatus: existing.status,
              nextStatus: data.status,
            },
          });
        }
      }

      if (data.status === 'completed' && updatedWorkOrder) {
        const existingReports = await reportService.getByWorkOrderId(id);
        const reportsForAutoClose = excludePackagingLineReportsForWorkOrderProduction(
          existingReports,
          get()._rawLines,
        );
        if (
          reportsForAutoClose.length === 0
          && isOperationPathEnabled(
            get().systemSettings,
            PRODUCTION_REPORT_OPERATION_KEYS.create,
            PRODUCTION_REPORT_CREATE_PATHS.workOrderCompletion,
          )
        ) {
          const toLocalDateString = (value: any): string => {
            if (!value) return getReportOperationalDateString(get().systemSettings);
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
            const dt = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
            if (Number.isNaN(dt.getTime())) return getReportOperationalDateString(get().systemSettings);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const day = String(dt.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };

          if (!updatedWorkOrder.supervisorId) {
            throw new Error('تعذر إنشاء تقرير الإغلاق: المشرف غير محدد في أمر الشغل.');
          }

          const woCloseReportType =
            updatedWorkOrder.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';
          const woCloseProducedQty = Number(
            updatedWorkOrder.actualProducedFromScans ??
            updatedWorkOrder.producedQuantity ??
            0,
          );
          const woCloseReportPayload: Omit<ProductionReport, 'id' | 'createdAt'> = {
            employeeId: updatedWorkOrder.supervisorId,
            productId: updatedWorkOrder.productId,
            lineId: updatedWorkOrder.lineId,
            reportType: woCloseReportType,
            date: toLocalDateString(updatedWorkOrder.completedAt ?? data.completedAt),
            quantityProduced: woCloseProducedQty,
            workersCount: Number(
              updatedWorkOrder.actualWorkersCount ??
              updatedWorkOrder.maxWorkers ??
              0,
            ),
            workersProductionCount: 0,
            workersPackagingCount: 0,
            workersQualityCount: 0,
            workersMaintenanceCount: 0,
            workersExternalCount: 0,
            workHours: Number(updatedWorkOrder.actualWorkHours ?? data.actualWorkHours ?? 0),
            notes: updatedWorkOrder.notes ?? '',
            workOrderId: id,
            productionPlanId: updatedWorkOrder.planId || undefined,
          };

          const closeReportId = await get().createReport(woCloseReportPayload, {
            path: PRODUCTION_REPORT_CREATE_PATHS.workOrderCompletion,
          });
          if (!closeReportId) {
            throw new Error(get().error || 'تعذر إنشاء تقرير إغلاق أمر الشغل.');
          }
        }
      }

      const notificationRecipientId = data.supervisorId ?? updatedWorkOrder?.supervisorId ?? existing?.supervisorId;
      if (notificationRecipientId && data.status !== existing?.status) {
        const { _rawProducts } = get();
        const productId = updatedWorkOrder?.productId ?? existing?.productId;
        const product = _rawProducts.find((p) => p.id === productId);
        const statusLabels: Record<string, string> = { in_progress: 'بدأ التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' };
        const statusLabel = statusLabels[data.status || ''];
        if (statusLabel) {
          await notificationService.create({
            recipientId: notificationRecipientId,
            type: data.status === 'completed' ? 'work_order_completed' : 'work_order_updated',
            title: `تحديث أمر شغل — ${statusLabel}`,
            message: `أمر شغل ${existing.workOrderNumber} — ${product?.name ?? ''} — ${statusLabel}`,
            referenceId: id,
            isRead: false,
          });
        }
      }
      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          status: data.status ?? null,
          previousStatus: existing?.status ?? null,
        },
      });
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          status: data.status ?? null,
        },
      });
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteWorkOrder: async (id) => {
    try {
      await workOrderService.delete(id);
      await get().fetchWorkOrders({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // ── Notifications ────────────────────────────────────────────────────────

  addRealtimeNotification: (input) => {
    const next: AppNotification = {
      id: `fcm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      recipientId: get().currentEmployee?.id || 'system',
      type: (input.type as AppNotification['type']) || 'manual_broadcast',
      title: String(input.title || 'إشعار جديد'),
      message: String(input.body || ''),
      referenceId: String(input.referenceId || input.url || ''),
      isRead: false,
      createdAt: new Date(),
    };
    set((state) => ({ notifications: mergeWithRealtimeNotifications([next], state.notifications) }));
  },

  fetchNotifications: async () => {
    try {
      const empId = get().currentEmployee?.id;
      if (!empId) return;
      const notifications = (await notificationService.getByRecipient(empId)).filter((n) => !isBlockedNotification(n));
      const scopedNotifications = notifications.filter((n) => {
        if (!n.type.startsWith('work_order')) return true;
        const linkedWO = get().workOrders.find((w) => w.id === n.referenceId);
        if (!linkedWO) return n.recipientId === empId;
        return linkedWO.supervisorId === empId;
      });
      set((state) => ({ notifications: mergeWithRealtimeNotifications(scopedNotifications, state.notifications) }));
    } catch (error) {
      console.error('fetchNotifications error:', error);
    }
  },

  markNotificationRead: async (id) => {
    try {
      if (!String(id || '').startsWith('fcm_')) {
        await notificationService.markAsRead(id);
      }
      set({ notifications: get().notifications.map((n) => n.id === id ? { ...n, isRead: true } : n) });
    } catch (error) {
      console.error('markNotificationRead error:', error);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      const empId = get().currentEmployee?.id;
      if (!empId) return;
      await notificationService.markAllAsRead(empId);
      set({ notifications: get().notifications.map((n) => ({ ...n, isRead: true })) });
    } catch (error) {
      console.error('markAllNotificationsRead error:', error);
    }
  },

  subscribeToNotifications: () => {
    const empId = get().currentEmployee?.id;
    if (!empId) return () => {};
    return notificationService.subscribeToRecipient(empId, (notifications) => {
      const visibleNotifications = notifications.filter((n) => !isBlockedNotification(n));
      const scopedNotifications = visibleNotifications.filter((n) => {
        if (!n.type.startsWith('work_order')) return true;
        const linkedWO = get().workOrders.find((w) => w.id === n.referenceId);
        if (!linkedWO) return n.recipientId === empId;
        return linkedWO.supervisorId === empId;
      });
      set((state) => ({ notifications: mergeWithRealtimeNotifications(scopedNotifications, state.notifications) }));
    });
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  createProduct: async (data, context) => {
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCT_OPERATION_KEYS.create,
        context.path,
      );
      if (!hasPermission(get().userPermissions, 'products.create')) {
        throw new Error('غير مصرح بإنشاء منتج.');
      }
      const normalized = await normalizeProductCategoryOnSave(data);
      const id = await productService.create(normalized as Omit<FirestoreProduct, 'id'>);
      if (!id) throw new Error('تعذر حفظ المنتج. حاول مرة أخرى.');
      await get().fetchProducts({ force: true });
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ المنتج. حاول مرة أخرى.';
      set({ error: message });
      throw error instanceof Error ? error : new Error(message);
    }
  },

  updateProduct: async (id, data, context) => {
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCT_OPERATION_KEYS.update,
        context.path,
      );
      if (!hasPermission(get().userPermissions, 'products.edit')) {
        throw new Error('غير مصرح بتعديل المنتج.');
      }
      const normalized = await normalizeProductCategoryOnSave(data);
      await productService.update(id, normalized);
      await get().fetchProducts({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteProduct: async (id) => {
    try {
      await productService.delete(id);
      await get().fetchProducts({ force: true });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.includes('مرتبط بتقارير إنتاج')
        ? rawMessage
        : 'تعذر حذف المنتج. حاول مرة أخرى.';
      set({ error: message });
      throw new Error(message);
    }
  },

  // ── Lines ──

  createLine: async (data) => {
    try {
      const id = await lineService.create(data);
      if (id) await get().fetchLines({ force: true });
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateLine: async (id, data) => {
    try {
      await lineService.update(id, data);
      await get().fetchLines({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteLine: async (id) => {
    try {
      await lineService.delete(id);
      await get().fetchLines({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Employees ──

  createEmployee: async (data) => {
    try {
      const id = await employeeService.create(data);
      if (id) await get().fetchEmployees({ force: true });
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateEmployee: async (id, data) => {
    try {
      await employeeService.update(id, data);
      await get().fetchEmployees({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteEmployee: async (id) => {
    try {
      const employees = get()._rawEmployees;
      const emp = employees.find((e) => e.id === id);
      if (emp?.userId) {
        try { await userService.delete(emp.userId); } catch { /* best effort */ }
      }
      await employeeService.delete(id);
      await get().fetchEmployees({ force: true });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Reports (with automatic activity logging) ──

  createComponentWasteReport: async (data) => {
    let trackedOperation: ReturnType<typeof actionTrackerService.startOperation> | null = null;
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_REPORT_OPERATION_KEYS.create,
        PRODUCTION_REPORT_CREATE_PATHS.componentWaste,
      );
      const permissions = get().userPermissions;
      if (!hasPermission(permissions, 'reports.componentWaste.create')) {
        const msg = 'غير مصرح بإنشاء تقرير هالك مكونات.';
        set({ error: msg });
        return null;
      }

      const employeeId = String(data.employeeId || '').trim();
      const lineId = String(data.lineId || '').trim();
      const productId = String(data.productId || '').trim();
      const date = String(data.date || '').trim();
      const inputComponents = Array.isArray(data.components) ? data.components : [];

      if (!employeeId || !lineId || !productId || !date) {
        const msg = 'أكمل بيانات الموظف والخط والمنتج والتاريخ.';
        set({ error: msg });
        return null;
      }

      const normalizedInputs = inputComponents
        .map((item) => ({
          materialId: String(item?.materialId || '').trim(),
          materialName: String(item?.materialName || '').trim(),
          quantity: Number(item?.quantity || 0),
        }))
        .filter((item) => item.materialId && item.quantity > 0);

      if (normalizedInputs.length === 0) {
        const msg = 'أضف مكوناً واحداً على الأقل بكمية هالك أكبر من صفر.';
        set({ error: msg });
        return null;
      }

      const uniqueIds = new Set(normalizedInputs.map((item) => item.materialId));
      if (uniqueIds.size !== normalizedInputs.length) {
        const msg = 'لا يمكن تكرار نفس المكون أكثر من مرة في التقرير.';
        set({ error: msg });
        return null;
      }

      const { systemSettings, uid, userDisplayName, userEmail } = get();
      const routing = await resolveInventoryRoutingV1Async(systemSettings);
      if (!routing.decomposedWarehouseId || !routing.wasteWarehouseId) {
        const msg = 'حدد مخزن المفكك ومخزن الهالك من إعدادات توجيه المخزون أولاً.';
        set({ error: msg });
        return null;
      }

      const [rawMaterials, materials] = await Promise.all([
        rawMaterialService.getAll(),
        materialService.getAll(),
      ]);
      const rawById = new Map(rawMaterials.filter((row) => row.id).map((row) => [String(row.id), row]));
      const materialById = new Map(
        materials.filter((row) => row.id && row.isActive !== false).map((row) => [String(row.id), row]),
      );
      const componentScrapItems: ReportComponentScrapItem[] = [];
      for (const item of normalizedInputs) {
        const material = materialById.get(item.materialId);
        const raw = rawById.get(item.materialId);
        if (!material?.id && !raw?.id) {
          const msg = `المكون «${item.materialName || item.materialId}» غير موجود في المكونات أو المواد الخام.`;
          set({ error: msg });
          return null;
        }
        componentScrapItems.push({
          materialId: material?.id || raw!.id!,
          materialName: item.materialName || material?.name || raw!.name,
          quantity: item.quantity,
        });
      }

      const totalScrapQty = componentScrapItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      const reportItemSnapshot = await resolveProductionReportItemSnapshot(
        'component_waste',
        productId,
        get()._rawProducts,
      );
      const reportData: Omit<ProductionReport, 'id' | 'createdAt'> = {
        employeeId,
        productId,
        ...reportItemSnapshot,
        lineId,
        date,
        quantityProduced: 0,
        workersCount: 0,
        workersProductionCount: 0,
        workersPackagingCount: 0,
        workersQualityCount: 0,
        workersMaintenanceCount: 0,
        workersExternalCount: 0,
        workHours: 0,
        notes: String(data.notes || '').trim(),
        workOrderId: '',
        reportType: 'component_waste',
        packagingLines: [],
        componentScrapItems,
      };

      trackedOperation = actionTrackerService.startOperation({
        module: 'production',
        operation: 'component_waste_report.create',
        action: 'create',
        entityType: 'production_report',
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          lineId,
          productId,
          materialIds: componentScrapItems.map((item) => item.materialId),
          quantity: totalScrapQty,
          componentsCount: componentScrapItems.length,
          reportType: 'component_waste',
        },
        description: 'Create component waste report',
      });

      let id: string;
      try {
        id = unwrapOrThrow(await createProductionReport(reportData, {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        })).reportId;
      } catch (createError) {
        const createErr = createError instanceof Error ? createError : new Error(String(createError));
        if (trackedOperation) {
          actionTrackerService.failOperation(trackedOperation, {
            error: createErr,
            errorCode: 'REPORT_CREATE_FAILED',
          });
        }
        set({ error: createErr.message || 'تعذر حفظ تقرير الهالك' });
        return null;
      }
      if (!id) {
        if (trackedOperation) {
          actionTrackerService.failOperation(trackedOperation, {
            error: new Error('تعذر حفظ تقرير الهالك'),
            errorCode: 'COMPONENT_WASTE_REPORT_CREATE_EMPTY_ID',
          });
        }
        set({ error: 'تعذر حفظ تقرير الهالك' });
        return null;
      }

      trackedOperation.entityId = id;
      trackedOperation.batchId = id;

      let postSaveWarning: string | null = null;
      try {
        await productionInventoryService.applyProductionReportInventory({
          reportId: id,
          report: { ...reportData, id },
          systemSettings,
          actor: {
            name: userDisplayName || userEmail || 'System',
            userId: uid || undefined,
          },
          products: get()._rawProducts,
          componentScrapItems: reportData.componentScrapItems,
        });
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ تقرير الهالك ولكن تعذر تنفيذ حركات المخزون الآلية';
      }

      try {
        const today = getReportOperationalDateString(get().systemSettings);
        const { start: monthStart, end: monthEnd } = getMonthDateRange();
        const [todayReports, monthlyReports] = await Promise.all([
          reportService.getByDateRange(today, today),
          reportService.getByDateRange(monthStart, monthEnd),
        ]);
        invalidateProductionReportsRangeCacheForDates([date], get, set);
        const rangeCacheNow = Date.now();
        const rkToday = getProductionReportsRangeCacheKey(today, today);
        const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
        set((state) => ({
          todayReports,
          monthlyReports,
          productionReports: monthlyReports,
          productionReportsRangeCache: {
            ...state.productionReportsRangeCache,
            [rkToday]: { rows: todayReports, fetchedAt: rangeCacheNow },
            [rkMonth]: { rows: monthlyReports, fetchedAt: rangeCacheNow },
          },
        }));
        get()._rebuildProducts();
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ تقرير الهالك ولكن تعذر تحديث البيانات المعروضة';
      }

      try {
        eventBus.emit(SystemEvents.USER_ACTION, {
          module: 'production',
          entityType: 'production_report',
          entityId: id,
          action: 'create',
          description: 'Component waste report created',
          actor: {
            userId: uid ?? undefined,
            userName: userDisplayName ?? userEmail ?? undefined,
          },
          metadata: {
            lineId,
            productId,
            materialIds: componentScrapItems.map((item) => item.materialId),
            quantity: totalScrapQty,
            componentsCount: componentScrapItems.length,
            reportType: 'component_waste',
          },
        });
      } catch {
        // Keep save flow resilient even if telemetry fails.
      }

      if (postSaveWarning) {
        console.warn('createComponentWasteReport post-save warning:', postSaveWarning);
      }
      set({ error: postSaveWarning });
      if (trackedOperation) {
        actionTrackerService.succeedOperation(trackedOperation, {
          metadata: {
            reportId: id,
            warning: postSaveWarning ?? null,
          },
        });
      }

      get().invalidateReportsUiReferenceCache();
      return id;
    } catch (error) {
      if (trackedOperation) {
        actionTrackerService.failOperation(trackedOperation, {
          error,
          metadata: {
            lineId: data.lineId,
            productId: data.productId,
            materialIds: (data.components || []).map((item) => item?.materialId).filter(Boolean),
          },
        });
      }
      set({ error: (error as Error)?.message || 'تعذر حفظ تقرير الهالك' });
      return null;
    }
  },

  createReport: async (data, context) => {
    let trackedOperation: ReturnType<typeof actionTrackerService.startOperation> | null = null;
    let cachedRawMaterials: Awaited<ReturnType<typeof rawMaterialService.getAll>> | null = null;
    const getRawMaterialsOnce = async () => {
      if (cachedRawMaterials) return cachedRawMaterials;
      cachedRawMaterials = await rawMaterialService.getAll();
      return cachedRawMaterials;
    };
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_REPORT_OPERATION_KEYS.create,
        context.path,
      );
      const reportType = resolveReportType(data.reportType);
      const permissions = get().userPermissions;
      const isWorkOrderCompletionPath =
        context.path === PRODUCTION_REPORT_CREATE_PATHS.workOrderCompletion;
      const canCreateFromWorkOrderCompletion =
        isWorkOrderCompletionPath && hasPermission(permissions, 'workOrders.edit');
      const canCreateFinishedReports = hasPermission(permissions, 'reports.create');
      const canCreatePackagingReports =
        hasPermission(permissions, 'reports.create')
        || hasPermission(permissions, 'reports.packaging.create');
      const forcePackagingOnly = isPackagingOnlyPermissions(permissions);
      const forceInjectionOnly =
        hasPermission(permissions, 'reports.componentInjection.only') && !canCreateFinishedReports;
      const canManageComponentInjection =
        hasPermission(permissions, 'reports.componentInjection.manage') || forceInjectionOnly;
      if (forcePackagingOnly && reportType !== 'packaging') {
        const msg = 'هذا المستخدم مخصص لتقارير التغليف فقط.';
        set({ error: msg });
        return null;
      }
      if (
        reportType === 'finished_product'
        && (forceInjectionOnly || (!canCreateFinishedReports && !canCreateFromWorkOrderCompletion))
      ) {
        const msg = 'غير مصرح بإنشاء تقرير إنتاج.';
        set({ error: msg });
        return null;
      }
      if (
        reportType === 'component_injection'
        && !canManageComponentInjection
        && !canCreateFromWorkOrderCompletion
      ) {
        const msg = 'غير مصرح بإنشاء تقرير مكونات الحقن.';
        set({ error: msg });
        return null;
      }
      if (reportType === 'packaging' && !canCreatePackagingReports) {
        const msg = 'غير مصرح بإنشاء تقرير تغليف.';
        set({ error: msg });
        return null;
      }
      const {
        systemSettings,
        laborSettings,
        costCenters,
        costCenterValues,
        costAllocations,
        _rawEmployees,
        _rawProducts,
        lineProductConfigs,
      } = get();
      const reportBehavior = resolveReportBehaviorSettings(systemSettings);
      if (
        reportType === 'packaging'
        && reportBehavior.restrictPackagingReportsToPackagingLines
        && !isPackagingLineId(data.lineId, get()._rawLines)
      ) {
        const msg = 'تقرير التغليف يجب أن يُسجَّل على خط مُعلَّم كخط تغليف.';
        set({ error: msg });
        return null;
      }
      const planSettings = systemSettings.planSettings ?? { allowReportWithoutPlan: true, allowOverProduction: true, allowMultipleActivePlans: true };
      const componentScrapItems = reportType === 'packaging'
        ? []
        : (Array.isArray((data as any).componentScrapItems) ? (data as any).componentScrapItems : [])
          .map((item: ReportComponentScrapItem) => ({
            materialId: String(item?.materialId || '').trim(),
            materialName: String(item?.materialName || '').trim(),
            quantity: Number(item?.quantity || 0),
          }))
          .filter((item: { materialId: string; quantity: number }) => item.materialId && item.quantity > 0);

      const getUnitsPerCarton = (productId: string) => {
        const n = Math.floor(Number(get()._rawProducts.find((p) => p.id === productId)?.unitsPerCarton ?? 0));
        return n > 0 ? n : undefined;
      };
      const {
        productNameSnapshot: _untrustedProductNameSnapshot,
        productCodeSnapshot: _untrustedProductCodeSnapshot,
        operationPathSnapshot: _untrustedOperationPathSnapshot,
        lastOperationPathSnapshot: _untrustedLastOperationPathSnapshot,
        workOrderCostPostedSnapshot: _untrustedWorkOrderCostSnapshot,
        productionPlanCostPostedSnapshot: _untrustedPlanCostSnapshot,
        workOrderCostPostedTargetId: _untrustedWorkOrderCostTarget,
        productionPlanCostPostedTargetId: _untrustedPlanCostTarget,
        aggregateCostPostingState: _untrustedAggregateCostState,
        aggregateCostPostingUpdatedAt: _untrustedAggregateCostUpdatedAt,
        inventoryAppliedAt: _untrustedInventoryAppliedAt,
        inventoryAppliedBy: _untrustedInventoryAppliedBy,
        inventoryAppliedByUserId: _untrustedInventoryAppliedByUserId,
        inventoryPostingState: _untrustedInventoryPostingState,
        inventoryPostingUpdatedAt: _untrustedInventoryPostingUpdatedAt,
        inventoryReversedAt: _untrustedInventoryReversedAt,
        inventoryReversedBy: _untrustedInventoryReversedBy,
        inventoryReversedByUserId: _untrustedInventoryReversedByUserId,
        ...trustedReportInput
      } = data as typeof data & Partial<ReportAggregateCostState> & ReportInventoryPostingState;
      const savePayload = normalizePackagingLinesForSave(
        { ...trustedReportInput, componentScrapItems } as Omit<ProductionReport, 'id' | 'createdAt'>,
        getUnitsPerCarton,
      );
      if (reportType === 'component_injection') {
        if (reportBehavior.requireInjectionShift && !isInjectionShiftSelected((data as ProductionReport).shift)) {
          const msg = 'يجب اختيار الوردية (صباحي أو مسائي) قبل حفظ تقرير الحقن.';
          set({ error: msg });
          return null;
        }
        if (isInjectionShiftSelected((data as ProductionReport).shift)) {
          savePayload.shift = (data as ProductionReport).shift;
        } else {
          delete savePayload.shift;
        }
      } else {
        delete savePayload.shift;
      }

      if (reportBehavior.requirePositiveQuantityOnReports && Number(savePayload.quantityProduced || 0) <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون كمية منتجة.';
        set({ error: msg });
        return null;
      }
      if (reportBehavior.requireWorkHoursOnReports && Number(savePayload.workHours || 0) <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون ساعات عمل.';
        set({ error: msg });
        return null;
      }
      const detailedWorkersTotal = Number(savePayload.workersProductionCount || 0)
        + Number(savePayload.workersPackagingCount || 0)
        + Number(savePayload.workersQualityCount || 0)
        + Number(savePayload.workersMaintenanceCount || 0)
        + Number(savePayload.workersExternalCount || 0);
      const packagingLaborOptional =
        reportBehavior.allowPackagingLaborOptional
        && (
          (reportType === 'finished_product' && isPackagingLineId(savePayload.lineId, get()._rawLines))
          || reportType === 'packaging'
        );
      if (
        reportBehavior.requireLaborForFinishedReports
        &&
        reportType === 'finished_product'
        && !packagingLaborOptional
        && Number(savePayload.workersCount || 0) <= 0
        && detailedWorkersTotal <= 0
      ) {
        const msg = 'لا يمكن حفظ تقرير بدون عمالة.';
        set({ error: msg });
        return null;
      }

      if (reportBehavior.preventDuplicateReports && reportType !== 'packaging') {
        const duplicateCandidate = {
          date: savePayload.date,
          lineId: savePayload.lineId,
          employeeId: savePayload.employeeId,
          productId: savePayload.productId,
          reportType,
          shift: reportType === 'component_injection' && isInjectionShiftSelected((data as ProductionReport).shift)
            ? (data as ProductionReport).shift
            : undefined,
        };
        const hasDuplicate = await reportService.hasConflictingUniqueKey(duplicateCandidate);
        if (hasDuplicate) {
          set({
            error: reportType === 'component_injection'
              ? INJECTION_REPORT_DUPLICATE_MESSAGE
              : REPORT_DUPLICATE_MESSAGE,
          });
          return null;
        }
      }

      const {
        activeWorkOrder: activeWO,
        activePlan,
        productionPlanLinkMode,
        hasMatchingPlanContext,
      } = await resolveProductionReportExecutionLinks(
        { ...savePayload, reportType },
        get().workOrders,
        { preserveCompletedWorkOrder: isWorkOrderCompletionPath },
      );
      const shouldPostToPlan =
        Boolean(activePlan?.id) &&
        reportType !== 'packaging';

      if (!activePlan && !activeWO && !hasMatchingPlanContext && !planSettings.allowReportWithoutPlan) {
        set({ error: 'لا يمكن إنشاء تقرير بدون خطة إنتاج نشطة لهذا الخط والمنتج' });
        return null;
      }

      if (reportType === 'finished_product' && Number(savePayload.quantityProduced || 0) > 0) {
        const inventoryRouting = await resolveInventoryRoutingV1Async(systemSettings);
        if (inventoryRouting.requireIssuedProductionIssueOnReport) {
          const hasIssuedProductionComponents = await productionIssueService.hasIssuedForProduction({
            workOrderId: activeWO?.id || savePayload.workOrderId || undefined,
            productionPlanId: activePlan?.id || undefined,
          });
          if (!hasIssuedProductionComponents) {
            const msg =
              'لا يمكن حفظ تقرير الإنتاج قبل اعتماد وإصدار إذن صرف إنتاج لأمر الشغل أو الخطة. أنشئ الصرف من صفحة «صرف إنتاج» ثم أعد المحاولة.';
            set({ error: msg });
            return null;
          }
        }
      }

      if (shouldPostToPlan && !planSettings.allowOverProduction && activePlan) {
        if ((activePlan.producedQuantity ?? 0) >= activePlan.plannedQuantity) {
          set({ error: 'تم الوصول للكمية المخططة — الإنتاج الزائد غير مسموح' });
          return null;
        }
      }

      const reportProduct = _rawProducts.find((p) => p.id === savePayload.productId) ?? null;
      const assemblyModeSnapshot = getProductAssemblyMode(reportProduct);
      // Team + plan: achievement is at team/plan level — do not write per-worker shares on save.
      const individualWorkerTargetsEnabled = reportType === 'finished_product'
        && assemblyModeSnapshot === 'individual'
        && hasLineSpecificWorkerTarget(lineProductConfigs, savePayload.lineId, savePayload.productId);
      const workerTargetsApplied = individualWorkerTargetsEnabled;
      const scopedWorkerOutputs = (savePayload.workerOutputs || []).filter((row) => (
        row.productId === savePayload.productId && row.lineId === savePayload.lineId
      ));
      const workerOutputs = individualWorkerTargetsEnabled
        ? scopedWorkerOutputs.map((row) => {
          const isPresent = row.isPresent ?? true;
          const outputQty = isPresent ? Number(row.outputQty || 0) : 0;
          return {
            ...row,
            isPresent,
            outputQty,
            achievementPercent: computeAchievementPercent(outputQty, row.dailyTargetQty),
          };
        })
        : [];
      const workerTargetSource = individualWorkerTargetsEnabled
        ? 'line_product'
        : 'none';
      const requireWorkerOutputMatch =
        systemSettings.productionWorkerSettings?.performance?.productionWorkerOutputMustMatchReportQty === true;
      if (
        requireWorkerOutputMatch
        && reportType === 'finished_product'
        && individualWorkerTargetsEnabled
        && scopedWorkerOutputs.length > 0
      ) {
        const workerOutputTotal = scopedWorkerOutputs.reduce((sum, row) => (
          sum + (row.isPresent === false ? 0 : Number(row.outputQty || 0))
        ), 0);
        if (workerOutputTotal !== Number(savePayload.quantityProduced || 0)) {
          const msg = 'مجموع إنتاج العمال يجب أن يطابق كمية التقرير';
          set({ error: msg });
          return null;
        }
      }

      const reportItemSnapshot = await resolveProductionReportItemSnapshot(
        reportType,
        savePayload.productId,
        _rawProducts,
        get().reportsUiReferenceCache?.rawMaterialOptions,
      );
      let reportData: Omit<ProductionReport, 'id' | 'createdAt'> = {
        ...savePayload,
        ...reportItemSnapshot,
        reportType,
        operationPathSnapshot: context.path,
        lastOperationPathSnapshot: context.path,
        componentScrapItems,
        workOrderId: activeWO?.id || '',
        productionPlanId: activePlan?.id || undefined,
        productionPlanLinkMode,
        ...({
          aggregateCostPostingState: 'pending',
          workOrderCostPostedTargetId: '',
          workOrderCostPostedSnapshot: 0,
          productionPlanCostPostedTargetId: '',
          productionPlanCostPostedSnapshot: 0,
        } satisfies Partial<ReportAggregateCostState>),
        assemblyModeSnapshot,
        workerTargetsApplied,
        workerTargetSource,
        laborAssignmentSource: Number(savePayload.workersCount || 0) > 0 || detailedWorkersTotal > 0
          ? 'line_worker_assignments'
          : 'none',
        manufacturingCostPostingState: 'pending',
        manufacturingCostPostingError: '',
        workerOutputs,
      };
      const rawCycleId =
        typeof (savePayload as ProductionReport & { supplyCycleId?: string }).supplyCycleId === 'string'
          ? (savePayload as ProductionReport & { supplyCycleId?: string }).supplyCycleId!.trim()
          : '';
      if (!rawCycleId && reportBehavior.autoLinkSupplyCycleOnReportSave) {
        try {
          const linkedCycleId = await supplyCycleService.findAutoLinkForReport({
            productId: String(savePayload.productId || '').trim(),
            date: String(savePayload.date || '').trim(),
            reportType: effectivePlanReportType(reportType),
          });
          if (linkedCycleId) {
            reportData = { ...reportData, supplyCycleId: linkedCycleId };
          }
        } catch {
          /* ignore auto-link failures */
        }
      }

      const packagingStockTransferEnabled =
        reportBehavior.autoApplyInventoryOnReportSave &&
        reportType === 'packaging' &&
        Boolean(systemSettings.planSettings?.enablePackagingStockTransfer);
      if (packagingStockTransferEnabled) {
        const packagingSourceWarehouseId = String(systemSettings.planSettings?.packagingSourceWarehouseId || '').trim();
        const packagingTargetWarehouseId = String(systemSettings.planSettings?.packagingTargetWarehouseId || '').trim();
        if (!packagingSourceWarehouseId || !packagingTargetWarehouseId) {
          const msg = 'يجب تحديد مخزن التغليف المصدر والوجهة من الإعدادات قبل حفظ تقرير التغليف.';
          set({ error: msg });
          return null;
        }
        if (packagingSourceWarehouseId === packagingTargetWarehouseId) {
          const msg = 'مخزن التغليف المصدر يجب أن يكون مختلفاً عن مخزن الوجهة.';
          set({ error: msg });
          return null;
        }
        if (buildPackagingStockTransferLines(reportData, get()._rawProducts).length === 0) {
          const msg = 'لا توجد أصناف صالحة لإنشاء حركة مخزون من تقرير التغليف.';
          set({ error: msg });
          return null;
        }
      }

      const { uid, userDisplayName, userEmail } = get();
      trackedOperation = actionTrackerService.startOperation({
        module: 'production',
        operation: 'production_report.create',
        action: 'create',
        entityType: 'production_report',
        entityId: reportData.workOrderId || undefined,
        batchId: reportData.workOrderId || undefined,
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          lineId: savePayload.lineId,
          productId: savePayload.productId,
          quantityProduced: savePayload.quantityProduced,
          reportType,
          operationPath: context.path,
          workOrderId: activeWO?.id ?? savePayload.workOrderId ?? '',
          productionPlanId: activePlan?.id ?? '',
        },
        description: 'Create production report',
      });

      let id: string;
      try {
        id = unwrapOrThrow(await createProductionReport(reportData, {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        })).reportId;
      } catch (createError) {
        const createErr = createError instanceof Error ? createError : new Error(String(createError));
        if (trackedOperation) {
          actionTrackerService.failOperation(trackedOperation, {
            error: createErr,
            errorCode: 'REPORT_CREATE_FAILED',
          });
        }
        set({ error: createErr.message || 'تعذر حفظ التقرير' });
        return null;
      }
      if (!id) {
        if (trackedOperation) {
          actionTrackerService.failOperation(trackedOperation, {
            error: new Error('تعذر حفظ التقرير'),
            errorCode: 'REPORT_CREATE_EMPTY_ID',
          });
        }
        set({ error: 'تعذر حفظ التقرير' });
        return null;
      }
      trackedOperation.entityId = id;
      trackedOperation.batchId = reportData.workOrderId || id;

      let postSaveWarning: string | null = null;
      const reportIndustrialCost = calculateIndustrialReportTotalCost({
        workersCount: Number(savePayload.workersCount || 0),
        workHours: Number(savePayload.workHours || 0),
        quantityProduced: Number(savePayload.quantityProduced || 0),
        lineId: savePayload.lineId,
        reportDate: savePayload.date,
        employeeId: savePayload.employeeId,
        laborSettings,
        costCenters,
        costCenterValues,
        costAllocations,
        employees: _rawEmployees,
      });

      try {
        const productIdsToSync = new Set<string>();
        productIdsToSync.add(savePayload.productId);
        (savePayload.packagingLines || []).forEach((l) => {
          if (l.productId) productIdsToSync.add(l.productId);
        });
        await Promise.all(Array.from(productIdsToSync).map((pid) => syncProductAvgDailyProduction(pid)));
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تحديث متوسط الإنتاج اليومي';
      }

      if (reportBehavior.autoApplyInventoryOnReportSave) {
        try {
          await productionInventoryService.applyProductionReportInventory({
            reportId: id,
            report: reportData,
            systemSettings,
            actor: {
              name: get().userDisplayName || get().userEmail || 'System',
              userId: get().uid || undefined,
            },
            products: get()._rawProducts,
            componentScrapItems,
          });
        } catch (error) {
          postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تنفيذ حركات المخزون الآلية';
          set({ error: postSaveWarning });
        }
      }

      const skipWoProgress = isPackagingThroughputReport(
        { lineId: reportData.lineId, reportType },
        get()._rawLines,
      );
      try {
        await reconcileReportAggregateCosts({
          reportId: id,
          expectedReport: { ...reportData, id },
          industrialCost: reportIndustrialCost,
          skipsAggregates: skipWoProgress,
        });
        if (activeWO?.id && !skipWoProgress) {
          await get().reconcileWorkOrderFromReports(activeWO.id, { internal: true });
        }
        if (activePlan?.id && shouldPostToPlan && !skipWoProgress) {
          await get().reconcileProductionPlanFromReports(activePlan.id);
        }
      } catch (error) {
        postSaveWarning = (error as Error)?.message
          || 'تم حفظ التقرير ولكن تعذر ترحيل تكلفته إلى أمر الشغل أو الخطة.';
      }

      try {
        const today = getReportOperationalDateString(get().systemSettings);
        const { start: monthStart, end: monthEnd } = getMonthDateRange();
        const createdRow: ProductionReport = { ...reportData, id };
        const inToday = String(reportData.date || '') === today;
        const inMonth =
          String(reportData.date || '') >= monthStart && String(reportData.date || '') <= monthEnd;
        invalidateProductionReportsRangeCacheForDates([reportData.date], get, set);
        const rangeCacheNow = Date.now();
        const rkToday = getProductionReportsRangeCacheKey(today, today);
        const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
        set((state) => {
          const nextToday = inToday
            ? upsertLoadedReportRow(state.todayReports, createdRow)
            : state.todayReports;
          const nextMonth = inMonth
            ? upsertLoadedReportRow(state.monthlyReports, createdRow)
            : state.monthlyReports;
          const nextProduction = inMonth
            ? upsertLoadedReportRow(state.productionReports, createdRow)
            : state.productionReports;
          return {
            todayReports: nextToday,
            monthlyReports: nextMonth,
            productionReports: nextProduction,
            productionReportsRangeCache: {
              ...state.productionReportsRangeCache,
              ...(inToday
                ? { [rkToday]: { rows: nextToday, fetchedAt: rangeCacheNow } }
                : {}),
              ...(inMonth
                ? { [rkMonth]: { rows: nextMonth, fetchedAt: rangeCacheNow } }
                : {}),
            },
          };
        });
        get()._rebuildProducts();
        get()._rebuildLines();
        try {
          const costedReport = await persistProductionReportCostSnapshot(id, get);
          if (costedReport) {
            set((state) => ({
              todayReports: replaceLoadedReportRow(state.todayReports, costedReport),
              monthlyReports: replaceLoadedReportRow(state.monthlyReports, costedReport),
              productionReports: replaceLoadedReportRow(state.productionReports, costedReport),
              productionReportsRangeCache: Object.fromEntries(
                Object.entries(state.productionReportsRangeCache).map(([key, value]) => [
                  key,
                  { ...value, rows: replaceLoadedReportRow(value.rows, costedReport) },
                ]),
              ),
            }));
          }
        } catch (snapErr) {
          console.warn('persistProductionReportCostSnapshot (create):', snapErr);
          const costErrorMessage = (snapErr as Error)?.message || 'تعذر حساب تكلفة التصنيع الكاملة.';
          postSaveWarning = `تم حفظ التقرير ولكن ${costErrorMessage}`;
          await reportService.update(id, {
            manufacturingCostPostingState: 'failed',
            manufacturingCostPostingError: costErrorMessage,
          }).catch(() => undefined);
        }
        try {
          void syncWorkerDailyPerformanceFromReport(id, { ...reportData, id });
        } catch (syncErr) {
          console.warn('syncWorkerDailyPerformanceFromReport (create):', syncErr);
        }
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تحديث البيانات المعروضة';
      }

      try {
        const { uid, userDisplayName, userEmail } = get();
        eventBus.emit(SystemEvents.USER_ACTION, {
          module: 'production',
          entityType: 'production_report',
          entityId: id,
          action: 'create',
          description: 'Production report created',
          actor: {
            userId: uid ?? undefined,
            userName: userDisplayName ?? userEmail ?? undefined,
          },
          metadata: {
            lineId: data.lineId,
            productId: data.productId,
            quantityProduced: data.quantityProduced,
            reportType,
            operationPath: context.path,
            workOrderId: activeWO?.id ?? '',
            productionPlanId: activePlan?.id ?? '',
          },
        });
      } catch {
        // keep save flow resilient even if telemetry fails
      }

      if (postSaveWarning) {
        console.warn('createReport post-save warning:', postSaveWarning);
        set({ error: postSaveWarning });
        try {
          const { toast } = await import('../components/Toast');
          toast.warning(
            `${postSaveWarning} — يمكنك إعادة ترحيل المخزون من شاشة التقرير إن لزم.`,
          );
        } catch {
          // toast is best-effort
        }
      } else {
        set({ error: null });
      }
      if (trackedOperation) {
        actionTrackerService.succeedOperation(trackedOperation, {
          metadata: {
            reportId: id,
            warning: postSaveWarning ?? null,
          },
        });
      }

      get().invalidateReportsUiReferenceCache();
      return id;
    } catch (error) {
      if (trackedOperation) {
        actionTrackerService.failOperation(trackedOperation, {
          error,
          metadata: {
            lineId: data.lineId,
            productId: data.productId,
          },
        });
      }
      set({ error: getReportDuplicateMessage(error, 'تعذر حفظ التقرير') });
      return null;
    }
  },

  updateReport: async (id, data, context) => {
    const { uid, userDisplayName, userEmail } = get();
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'production_report.update',
      action: 'update',
      entityType: 'production_report',
      entityId: id,
      actor: {
        userId: uid ?? undefined,
        userName: userDisplayName ?? userEmail ?? undefined,
      },
      metadata: {
        reportId: id,
        operationPath: context.path,
      },
      description: 'Update production report',
    });
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_REPORT_OPERATION_KEYS.update,
        context.path,
      );
      const existingReport = await reportService.getById(id);
      if (!existingReport) {
        throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
      }
      const nextReportType = resolveReportType(data.reportType ?? existingReport?.reportType);
      const permissions = get().userPermissions;
      const canEditFinishedReports = hasPermission(permissions, 'reports.edit');
      const canEditPackagingReports =
        hasPermission(permissions, 'reports.edit')
        || hasPermission(permissions, 'reports.packaging.create');
      const forcePackagingOnly = isPackagingOnlyPermissions(permissions);
      const forceInjectionOnly =
        hasPermission(permissions, 'reports.componentInjection.only') && !canEditFinishedReports;
      const canManageComponentInjection =
        hasPermission(permissions, 'reports.componentInjection.manage') || forceInjectionOnly;
      const lines = get()._rawLines;
      const nextLineId = String(data.lineId ?? existingReport?.lineId ?? '').trim();
      const reportBehavior = resolveReportBehaviorSettings(get().systemSettings);

      if (forcePackagingOnly && nextReportType !== 'packaging') {
        const msg = 'غير مصرح بتعديل نوع التقرير إلى غير التغليف.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (
        nextReportType === 'packaging'
        && reportBehavior.restrictPackagingReportsToPackagingLines
        && !isPackagingLineId(nextLineId, lines)
      ) {
        const msg = 'تقرير التغليف يجب أن يُسجَّل على خط مُعلَّم كخط تغليف.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (nextReportType === 'packaging' && !canEditPackagingReports) {
        const msg = 'غير مصرح بتعديل تقارير التغليف.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (nextReportType === 'finished_product' && (forceInjectionOnly || !canEditFinishedReports)) {
        const msg = 'غير مصرح بتعديل تقارير الإنتاج.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (nextReportType === 'component_injection' && !canManageComponentInjection) {
        const msg = 'غير مصرح بتعديل تقرير مكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      const {
        productNameSnapshot: _untrustedProductNameSnapshot,
        productCodeSnapshot: _untrustedProductCodeSnapshot,
        operationPathSnapshot: _untrustedOperationPathSnapshot,
        lastOperationPathSnapshot: _untrustedLastOperationPathSnapshot,
        workOrderCostPostedSnapshot: _untrustedWorkOrderCostSnapshot,
        productionPlanCostPostedSnapshot: _untrustedPlanCostSnapshot,
        workOrderCostPostedTargetId: _untrustedWorkOrderCostTarget,
        productionPlanCostPostedTargetId: _untrustedPlanCostTarget,
        aggregateCostPostingState: _untrustedAggregateCostState,
        aggregateCostPostingUpdatedAt: _untrustedAggregateCostUpdatedAt,
        inventoryAppliedAt: _untrustedInventoryAppliedAt,
        inventoryAppliedBy: _untrustedInventoryAppliedBy,
        inventoryAppliedByUserId: _untrustedInventoryAppliedByUserId,
        inventoryPostingState: _untrustedInventoryPostingState,
        inventoryPostingUpdatedAt: _untrustedInventoryPostingUpdatedAt,
        inventoryReversedAt: _untrustedInventoryReversedAt,
        inventoryReversedBy: _untrustedInventoryReversedBy,
        inventoryReversedByUserId: _untrustedInventoryReversedByUserId,
        ...trustedUpdateInput
      } = data as typeof data & Partial<ReportAggregateCostState> & ReportInventoryPostingState;
      let updatePayload: Partial<ProductionReport> = {
        ...trustedUpdateInput,
        lastOperationPathSnapshot: context.path,
      };
      if (nextReportType === 'component_injection') {
        const rawShift = data.shift !== undefined ? data.shift : existingReport?.shift;
        if (reportBehavior.requireInjectionShift && !isInjectionShiftSelected(rawShift)) {
          const msg = 'يجب اختيار الوردية (صباحي أو مسائي) قبل حفظ تقرير الحقن.';
          set({ error: msg });
          throw new Error(msg);
        }
        if (isInjectionShiftSelected(rawShift)) {
          updatePayload.shift = rawShift;
        } else {
          delete updatePayload.shift;
        }
      } else {
        delete updatePayload.shift;
      }
      const mergedReport = { ...(existingReport ?? {}), ...updatePayload } as ProductionReport;
      if (reportBehavior.requirePositiveQuantityOnReports && Number(mergedReport.quantityProduced || 0) <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون كمية منتجة.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (reportBehavior.requireWorkHoursOnReports && Number(mergedReport.workHours || 0) <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون ساعات عمل.';
        set({ error: msg });
        throw new Error(msg);
      }
      const detailedWorkersTotal = Number(mergedReport.workersProductionCount || 0)
        + Number(mergedReport.workersPackagingCount || 0)
        + Number(mergedReport.workersQualityCount || 0)
        + Number(mergedReport.workersMaintenanceCount || 0)
        + Number(mergedReport.workersExternalCount || 0);
      const packagingLaborOptional =
        reportBehavior.allowPackagingLaborOptional
        && (
          (nextReportType === 'finished_product' && isPackagingLineId(nextLineId, lines))
          || nextReportType === 'packaging'
        );
      if (
        reportBehavior.requireLaborForFinishedReports
        && nextReportType === 'finished_product'
        && !packagingLaborOptional
        && Number(mergedReport.workersCount || 0) <= 0
        && detailedWorkersTotal <= 0
      ) {
        const msg = 'لا يمكن حفظ تقرير بدون عمالة.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (nextReportType === 'packaging') {
        updatePayload.componentScrapItems = [];
        const { id: _rid, createdAt: _rca, ...existingBody } = (existingReport || {}) as ProductionReport;
        const mergedForNorm = {
          ...existingBody,
          ...updatePayload,
          reportType: nextReportType,
          componentScrapItems: [],
        } as Omit<ProductionReport, 'id' | 'createdAt'>;
        const getUnitsPerCarton = (productId: string) => {
          const n = Math.floor(Number(get()._rawProducts.find((p) => p.id === productId)?.unitsPerCarton ?? 0));
          return n > 0 ? n : undefined;
        };
        const normalized = normalizePackagingLinesForSave(mergedForNorm, getUnitsPerCarton);
        updatePayload = {
          ...updatePayload,
          ...normalized,
          reportType: nextReportType,
          componentScrapItems: [],
        };
      }
      const snapshotProductId = String(updatePayload.productId ?? existingReport?.productId ?? '').trim();
      const reportItemSnapshot = await resolveProductionReportItemSnapshot(
        nextReportType,
        snapshotProductId,
        get()._rawProducts,
        get().reportsUiReferenceCache?.rawMaterialOptions,
      );
      updatePayload = { ...updatePayload, ...reportItemSnapshot };
      const preliminaryMergedReport = {
        ...(existingReport ?? {}),
        ...updatePayload,
        reportType: nextReportType,
      } as ProductionReport;
      const shouldResolveExecutionLinks =
        context.path === PRODUCTION_REPORT_UPDATE_PATHS.shiftClose
        || ['lineId', 'productId', 'date', 'employeeId', 'workOrderId', 'productionPlanId', 'reportType']
          .some((field) => Object.prototype.hasOwnProperty.call(trustedUpdateInput, field));
      if (shouldResolveExecutionLinks) {
        const resolvedLinks = await resolveProductionReportExecutionLinks(
          preliminaryMergedReport,
          get().workOrders,
          { preserveCompletedWorkOrder: true },
        );
        updatePayload = {
          ...updatePayload,
          workOrderId: resolvedLinks.activeWorkOrder?.id || '',
          productionPlanId: resolvedLinks.activePlan?.id || undefined,
          productionPlanLinkMode: resolvedLinks.productionPlanLinkMode,
        };
        const planSettings = get().systemSettings.planSettings ?? DEFAULT_PLAN_SETTINGS;
        if (
          !resolvedLinks.activePlan
          && !resolvedLinks.activeWorkOrder
          && !resolvedLinks.hasMatchingPlanContext
          && planSettings.allowReportWithoutPlan === false
        ) {
          throw new Error('لا يمكن حفظ التقرير بدون خطة إنتاج نشطة أو أمر شغل مناسب.');
        }
      }
      const finalMergedReport = { ...(existingReport ?? {}), ...updatePayload } as ProductionReport;
      if (reportBehavior.preventDuplicateReports && nextReportType !== 'packaging') {
        const hasDuplicate = await reportService.hasConflictingUniqueKey(
          {
            date: finalMergedReport.date,
            lineId: finalMergedReport.lineId,
            employeeId: finalMergedReport.employeeId,
            productId: finalMergedReport.productId,
            reportType: nextReportType,
            shift: nextReportType === 'component_injection' && isInjectionShiftSelected(finalMergedReport.shift)
              ? finalMergedReport.shift
              : undefined,
          },
          id,
        );
        if (hasDuplicate) {
          const msg = nextReportType === 'component_injection'
            ? INJECTION_REPORT_DUPLICATE_MESSAGE
            : REPORT_DUPLICATE_MESSAGE;
          set({ error: msg });
          throw new Error(msg);
        }
      }
      const requireWorkerOutputMatch =
        get().systemSettings.productionWorkerSettings?.performance?.productionWorkerOutputMustMatchReportQty === true;
      const reportProduct = get()._rawProducts.find((p) => p.id === finalMergedReport.productId) ?? null;
      const individualWorkerTargetsEnabled = nextReportType === 'finished_product'
        && getProductAssemblyMode(reportProduct) === 'individual'
        && hasLineSpecificWorkerTarget(get().lineProductConfigs, finalMergedReport.lineId, finalMergedReport.productId);
      const scopedWorkerOutputs = (finalMergedReport.workerOutputs || []).filter((row) => (
        row.productId === finalMergedReport.productId && row.lineId === finalMergedReport.lineId
      ));
      if (
        requireWorkerOutputMatch
        && individualWorkerTargetsEnabled
        && scopedWorkerOutputs.length > 0
      ) {
        const workerOutputTotal = scopedWorkerOutputs.reduce((sum, row) => (
          sum + (row.isPresent === false ? 0 : Number(row.outputQty || 0))
        ), 0);
        if (workerOutputTotal !== Number(finalMergedReport.quantityProduced || 0)) {
          const msg = 'مجموع إنتاج العمال يجب أن يطابق كمية التقرير';
          set({ error: msg });
          throw new Error(msg);
        }
      }
      const inventoryAffectingFields: Array<keyof ProductionReport> = [
        'productId',
        'lineId',
        'reportType',
        'quantityProduced',
        'componentScrapItems',
        'packagingLines',
      ];
      const changesAppliedInventory = inventoryAffectingFields.some((field) => (
        Object.prototype.hasOwnProperty.call(updatePayload, field)
        && JSON.stringify(existingReport[field] ?? null) !== JSON.stringify(finalMergedReport[field] ?? null)
      ));
      if (
        changesAppliedInventory
        && (
          Boolean((existingReport as ProductionReport & ReportInventoryPostingState).inventoryAppliedAt)
          || ['applying', 'applied', 'reversing'].includes(String(
            (existingReport as ProductionReport & ReportInventoryPostingState).inventoryPostingState || '',
          ))
        )
      ) {
        throw new Error(
          'لا يمكن تغيير الصنف أو الخط أو نوع/كمية التقرير بعد ترحيل المخزون. اعكس أثر المخزون أولاً ثم أعد المحاولة.',
        );
      }
      if (
        context.path === PRODUCTION_REPORT_UPDATE_PATHS.shiftClose
        && nextReportType === 'finished_product'
        && Number(finalMergedReport.quantityProduced || 0) > 0
      ) {
        const routing = await resolveInventoryRoutingV1Async(get().systemSettings);
        if (routing.requireIssuedProductionIssueOnReport) {
          const hasIssuedProductionComponents = await productionIssueService.hasIssuedForProduction({
            workOrderId: finalMergedReport.workOrderId || undefined,
            productionPlanId: finalMergedReport.productionPlanId || undefined,
          });
          if (!hasIssuedProductionComponents) {
            throw new Error(
              'لا يمكن إنهاء الوردية قبل اعتماد وإصدار إذن صرف إنتاج لأمر الشغل أو الخطة.',
            );
          }
        }
      }
      const calculateReportIndustrialCost = (report: ProductionReport) =>
        calculateIndustrialReportTotalCost({
          workersCount: Number(report.workersCount || 0),
          workHours: Number(report.workHours || 0),
          quantityProduced: Number(report.quantityProduced || 0),
          lineId: report.lineId,
          reportDate: report.date,
          employeeId: report.employeeId,
          laborSettings: get().laborSettings,
          costCenters: get().costCenters,
          costCenterValues: get().costCenterValues,
          costAllocations: get().costAllocations,
          employees: get()._rawEmployees,
        });
      const previousIndustrialCost = calculateReportIndustrialCost(existingReport);
      const previousSkipsAggregates = isPackagingThroughputReport(
        existingReport,
        get()._rawLines,
      );
      await ensureReportAggregateCostBaseline(
        id,
        existingReport,
        previousIndustrialCost,
        previousSkipsAggregates,
      );
      await reportService.update(id, updatePayload);
      const savedReport = await reportService.getById(id);
      if (!savedReport) {
        throw new Error('تم تحديث التقرير ولكن تعذر إعادة تحميله لإكمال المزامنة.');
      }
      const savedIndustrialCost = calculateReportIndustrialCost(savedReport);
      if (
        context.path === PRODUCTION_REPORT_UPDATE_PATHS.shiftClose
        && reportBehavior.autoApplyInventoryOnReportSave
        && Number(savedReport.quantityProduced || 0) > 0
      ) {
        try {
          await productionInventoryService.applyProductionReportInventory({
            reportId: id,
            report: savedReport,
            systemSettings: get().systemSettings,
            actor: {
              name: get().userDisplayName || get().userEmail || 'System',
              userId: get().uid || undefined,
            },
            products: get()._rawProducts,
            componentScrapItems: savedReport.componentScrapItems || [],
          });
        } catch (error) {
          throw new Error(
            (error as Error)?.message
            || 'تم حفظ التقرير ولكن تعذر تنفيذ حركات المخزون المرتبطة به.',
          );
        }
      }
      {
        const nextSkipsAggregates = isPackagingThroughputReport(savedReport, get()._rawLines);
        await reconcileReportAggregateCosts({
          reportId: id,
          expectedReport: savedReport,
          industrialCost: savedIndustrialCost,
          skipsAggregates: nextSkipsAggregates,
        });
        const affectedWorkOrderIds = new Set(
          [existingReport.workOrderId, savedReport.workOrderId]
            .map((workOrderId) => String(workOrderId || '').trim())
            .filter(Boolean),
        );
        for (const workOrderId of affectedWorkOrderIds) {
          await get().reconcileWorkOrderFromReports(workOrderId, { internal: true });
        }
      }
      const affectedProductIds = new Set<string>();
      if (existingReport?.productId) affectedProductIds.add(existingReport.productId);
      if (updatePayload.productId) affectedProductIds.add(updatePayload.productId);
      (updatePayload.packagingLines || []).forEach((l) => {
        if (l.productId) affectedProductIds.add(l.productId);
      });
      await Promise.all(
        Array.from(affectedProductIds).map((productId) =>
          syncProductAvgDailyProduction(productId)
        )
      );
      const today = getReportOperationalDateString(get().systemSettings);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const savedRow: ProductionReport = { ...savedReport, id };
      const inToday = String(savedRow.date || '') === today;
      const inMonth =
        String(savedRow.date || '') >= monthStart && String(savedRow.date || '') <= monthEnd;
      const touchedDates = [existingReport?.date, data.date].filter(
        (d): d is string => Boolean(d && String(d).trim()),
      );
      invalidateProductionReportsRangeCacheForDates(touchedDates, get, set);
      const rangeCacheNow = Date.now();
      const rkToday = getProductionReportsRangeCacheKey(today, today);
      const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
      set((state) => {
        const withoutOld = (rows: ProductionReport[]) =>
          rows.filter((row) => row.id !== id);
        const nextToday = inToday
          ? upsertLoadedReportRow(withoutOld(state.todayReports), savedRow)
          : withoutOld(state.todayReports);
        const nextMonth = inMonth
          ? upsertLoadedReportRow(withoutOld(state.monthlyReports), savedRow)
          : withoutOld(state.monthlyReports);
        const nextProduction = inMonth
          ? upsertLoadedReportRow(withoutOld(state.productionReports), savedRow)
          : withoutOld(state.productionReports);
        return {
          todayReports: nextToday,
          monthlyReports: nextMonth,
          productionReports: nextProduction,
          productionReportsRangeCache: {
            ...state.productionReportsRangeCache,
            ...(inToday ? { [rkToday]: { rows: nextToday, fetchedAt: rangeCacheNow } } : {}),
            ...(inMonth ? { [rkMonth]: { rows: nextMonth, fetchedAt: rangeCacheNow } } : {}),
          },
        };
      });
      get()._rebuildProducts();
      get()._rebuildLines();
      try {
        const costedReport = await persistProductionReportCostSnapshot(id, get);
        if (costedReport) {
          set((state) => ({
            todayReports: replaceLoadedReportRow(state.todayReports, costedReport),
            monthlyReports: replaceLoadedReportRow(state.monthlyReports, costedReport),
            productionReports: replaceLoadedReportRow(state.productionReports, costedReport),
            productionReportsRangeCache: Object.fromEntries(
              Object.entries(state.productionReportsRangeCache).map(([key, value]) => [
                key,
                { ...value, rows: replaceLoadedReportRow(value.rows, costedReport) },
              ]),
            ),
          }));
        }
      } catch (snapErr) {
        console.warn('persistProductionReportCostSnapshot (update):', snapErr);
        const costErrorMessage = (snapErr as Error)?.message || 'تعذر إعادة حساب تكلفة التصنيع الكاملة.';
        set({ error: costErrorMessage });
        await reportService.update(id, {
          manufacturingCostPostingState: 'failed',
          manufacturingCostPostingError: costErrorMessage,
        }).catch(() => undefined);
      }
      try {
        await syncWorkerDailyPerformanceFromReport(id, savedReport);
      } catch (syncErr) {
        console.warn('syncWorkerDailyPerformanceFromReport (update):', syncErr);
      }
      {
        const affectedPlanIds = new Set(
          [existingReport?.productionPlanId, savedReport.productionPlanId]
            .map((planId) => String(planId || '').trim())
            .filter(Boolean),
        );
        for (const planId of affectedPlanIds) {
          await get().reconcileProductionPlanFromReports(planId);
        }
        if (affectedPlanIds.size === 0) {
          await get().fetchProductionPlans({ force: true });
        }
      }

      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'production',
        entityType: 'production_report',
        entityId: id,
        action: 'update',
        description: 'Production report updated',
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          changes: data,
        },
      });

      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          reportId: id,
          changedFields: Object.keys(data || {}),
        },
      });
      get().invalidateReportsUiReferenceCache();
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          reportId: id,
        },
      });
      const message = (error as Error)?.message || 'تعذر تعديل التقرير.';
      set({ error: message });
      throw error instanceof Error ? error : new Error(message);
    }
  },

  deleteReport: async (id, context) => {
    const { uid, userDisplayName, userEmail } = get();
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'production_report.delete',
      action: 'delete',
      entityType: 'production_report',
      entityId: id,
      actor: {
        userId: uid ?? undefined,
        userName: userDisplayName ?? userEmail ?? undefined,
      },
      metadata: {
        reportId: id,
        operationPath: context.path,
      },
      description: 'Delete production report',
    });
    try {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_REPORT_OPERATION_KEYS.delete,
        context.path,
      );
      const reportToDelete = await reportService.getById(id);
      if (!reportToDelete) {
        throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
      }
      const actorName = get().userDisplayName || get().userEmail || 'System';
      const linkedEntryRequests = await transferApprovalService.getBySourceReportId(id);
      for (const request of linkedEntryRequests) {
        if (!request.id) continue;
        if (request.status === 'approved') {
          throw new Error('لا يمكن حذف التقرير بعد اعتماد دخول مخزن تم الصنع. قم بإلغاء الحركة أولاً من شاشة اعتماد التحويلات.');
        }
        if (request.status === 'pending') {
          unwrapOrThrow(await rejectTransferRequest({
            requestId: request.id,
            rejectedBy: actorName,
            rejectedByUserId: uid ?? undefined,
            reason: 'تم إلغاء طلب دخول تم الصنع تلقائياً بسبب حذف التقرير المصدر.',
          }, { internal: true }));
        }
      }

      try {
        await productionInventoryService.reverseProductionReportInventory(id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        throw new Error(
          message ||
          'لا يمكن حذف التقرير لأن حركات المخزون المرتبطة لا يمكن عكسها حالياً.',
        );
      }

      const skipsAggregates = isPackagingThroughputReport(reportToDelete, get()._rawLines);
      const fallbackIndustrialCost = calculateIndustrialReportTotalCost({
        workersCount: Number(reportToDelete.workersCount || 0),
        workHours: Number(reportToDelete.workHours || 0),
        quantityProduced: Number(reportToDelete.quantityProduced || 0),
        lineId: reportToDelete.lineId,
        reportDate: reportToDelete.date,
        employeeId: reportToDelete.employeeId,
        laborSettings: get().laborSettings,
        costCenters: get().costCenters,
        costCenterValues: get().costCenterValues,
        costAllocations: get().costAllocations,
        employees: get()._rawEmployees,
      });
      const linkedWorkOrderId = skipsAggregates
        ? ''
        : String(reportToDelete.workOrderId || '').trim();
      await reverseReportAggregateCostsForDelete({
        reportId: id,
        fallbackIndustrialCost,
        skipsAggregates,
      });

      try {
        await removeWorkerDailyPerformanceForReport(id);
      } catch (syncErr) {
        console.warn('removeWorkerDailyPerformanceForReport (delete):', syncErr);
      }

      await reportService.delete(id);
      if (linkedWorkOrderId) {
        await get().reconcileWorkOrderFromReports(linkedWorkOrderId, { internal: true });
      }
      const linkedPlanId = String(reportToDelete.productionPlanId || '').trim();
      if (linkedPlanId) {
        await get().reconcileProductionPlanFromReports(linkedPlanId);
      }
      const productIdsToResync = new Set<string>();
      if (reportToDelete.productId) productIdsToResync.add(String(reportToDelete.productId));
      (reportToDelete.packagingLines || []).forEach((l) => {
        if (l.productId) productIdsToResync.add(String(l.productId));
      });
      await Promise.all(
        Array.from(productIdsToResync).map((pid) => syncProductAvgDailyProduction(pid)),
      );
      const today = getReportOperationalDateString(get().systemSettings);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      invalidateProductionReportsRangeCacheForDates(
        [reportToDelete.date].filter((d) => Boolean(d && String(d).trim())),
        get,
        set,
      );
      const rangeCacheNow = Date.now();
      const rkToday = getProductionReportsRangeCacheKey(today, today);
      const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
      set((state) => {
        const removeRow = (rows: ProductionReport[]) => rows.filter((row) => row.id !== id);
        const nextToday = removeRow(state.todayReports);
        const nextMonth = removeRow(state.monthlyReports);
        const nextProduction = removeRow(state.productionReports);
        return {
          todayReports: nextToday,
          monthlyReports: nextMonth,
          productionReports: nextProduction,
          productionReportsRangeCache: {
            ...state.productionReportsRangeCache,
            [rkToday]: { rows: nextToday, fetchedAt: rangeCacheNow },
            [rkMonth]: { rows: nextMonth, fetchedAt: rangeCacheNow },
          },
        };
      });
      get()._rebuildProducts();
      get()._rebuildLines();
      if (!linkedPlanId) {
        await get().fetchProductionPlans({ force: true });
      }

      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'production',
        entityType: 'production_report',
        entityId: id,
        action: 'delete',
        description: 'Production report deleted',
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          reportId: id,
        },
      });

      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          reportId: id,
          productId: reportToDelete.productId,
        },
      });
      get().invalidateReportsUiReferenceCache();
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          reportId: id,
        },
      });
      const message = (error as Error)?.message || 'تعذر حذف التقرير.';
      set({ error: message });
      throw error;
    }
  },

  reapplyReportInventory: async (id) => {
    set({ error: null });
    try {
      const reportId = String(id || '').trim();
      if (!reportId) {
        throw new Error('معرف التقرير غير متوفر.');
      }
      if (!hasPermission(get().userPermissions, 'inventory.transactions.create')) {
        throw new Error('غير مصرح لك بإنشاء حركات مخزون.');
      }

      const report = await reportService.getById(reportId);
      if (!report) {
        throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
      }

      if (resolveReportType(report.reportType) !== 'finished_product') {
        const [productionTx, packagingTx, linkedRequests] = await Promise.all([
          stockService.getTransactionsBySource({ sourceModule: 'production_report', sourceId: reportId }),
          stockService.getTransactionsBySource({ sourceModule: 'packaging', sourceId: reportId }),
          transferApprovalService.getBySourceReportId(reportId),
        ]);
        const activeRequests = linkedRequests.filter((request) => (
          request.status !== 'rejected' && request.status !== 'cancelled'
        ));
        if (productionTx.length > 0 || packagingTx.length > 0 || activeRequests.length > 0) {
          throw new Error('لا يمكن إعادة ترحيل المخزون لهذا التقرير لأن له حركات أو طلبات اعتماد مخزنية مرتبطة بالفعل.');
        }
      }

      await productionInventoryService.applyProductionReportInventory({
        reportId,
        report,
        systemSettings: get().systemSettings,
        actor: {
          name: get().userDisplayName || get().userEmail || 'System',
          userId: get().uid || undefined,
        },
        products: get()._rawProducts,
        componentScrapItems: report.componentScrapItems || [],
      });

      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'inventory',
        entityType: 'production_report',
        entityId: reportId,
        action: 'update',
        description: 'Production report inventory reapplied',
        actor: {
          userId: get().uid ?? undefined,
          userName: get().userDisplayName ?? get().userEmail ?? undefined,
        },
        metadata: {
          reportId,
          reportCode: report.reportCode || '',
        },
      });
    } catch (error) {
      const message = (error as Error)?.message || 'تعذر إعادة ترحيل مخزون التقرير.';
      set({ error: message });
      throw error;
    }
  },

  syncMissingProductionEntryTransfers: async (startDate, endDate) => {
    set({ error: null });
    assertOperationPathEnabled(
      get().systemSettings,
      PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
      PRODUCTION_REPORT_RECONCILE_PATHS.reportsPage,
    );
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل المزامنة.');
      }

      const systemSettings = get().systemSettings;
      const routing = await resolveInventoryRoutingV1Async(systemSettings);
      if (!routing.requireApprovalForProductionEntry) {
        return { processed: 0, created: 0, skipped: 0, failed: 0 };
      }
      if (!routing.productionWipWarehouseId) {
        throw new Error('لم يتم تحديد مخزن إنتاج تحت التشغيل في إعدادات توجيه المخزون.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const actorName = get().userDisplayName || get().userEmail || 'System';
      const actorUserId = get().uid || undefined;
      const productById = new Map(get()._rawProducts.map((p) => [String(p.id || ''), p]));

      for (const report of reports) {
        if (!report.id) continue;
        if (Number(report.quantityProduced || 0) <= 0) continue;
        if (isPackagingThroughputReport(report, get()._rawLines)) {
          skipped += 1;
          continue;
        }
        processed += 1;

        try {
          const existing = await transferApprovalService.getBySourceReportId(report.id);
          const hasLinkedProductionEntry = existing.some(
            (row) => (row.requestType || 'transfer') === 'production_entry',
          );
          if (hasLinkedProductionEntry) {
            skipped += 1;
            continue;
          }

          const product = productById.get(String(report.productId || ''));
          if (!product?.id) {
            failed += 1;
            continue;
          }

          unwrapOrThrow(await createTransferRequest({
            requestType: 'production_entry',
            fromWarehouseId: '__production_report__',
            fromWarehouseName: 'تقارير الإنتاج',
            toWarehouseId: routing.productionWipWarehouseId,
            note: `Backfill production entry from report ${report.id}`,
            sourceReportId: report.id,
            lines: [{
              itemType: 'finished_good',
              itemId: report.productId,
              itemName: product.name,
              itemCode: product.code,
              quantity: Number(report.quantityProduced || 0),
              minStock: (product as any).minStock ?? 0,
            }],
            createdBy: actorName,
            createdByUserId: actorUserId,
          }, { internal: true }));
          created += 1;
        } catch {
          failed += 1;
        }
      }

      return { processed, created, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  backfillUnlinkedReportsWorkOrders: async (startDate, endDate, options) => {
    set({ error: null });
    assertOperationPathEnabled(
      get().systemSettings,
      PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
      PRODUCTION_REPORT_RECONCILE_PATHS.reportsPage,
    );
    let processed = 0;
    let linked = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل ربط التقارير القديمة.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const candidates = reports.filter((report) => !String(report.workOrderId || '').trim());
      options?.onStart?.(candidates.length);
      if (candidates.length === 0) {
        options?.onProgress?.({ processed: 0, total: 0, linked: 0, skipped: 0, failed: 0 });
        return { processed: 0, linked: 0, skipped: 0, failed: 0 };
      }

      const workOrders = await workOrderService.getAll();
      const touchedWorkOrderIds = new Set<string>();

      for (const report of candidates) {
        if (!report.id) continue;
        processed += 1;
        try {
          const target = pickBestAutoLinkedWorkOrder(workOrders, {
            lineId: report.lineId,
            productId: report.productId,
            supervisorId: report.employeeId,
            reportType: resolveReportType(report.reportType),
            reportDate: report.date,
            includeCompleted: true,
          });
          if (!target?.id) {
            skipped += 1;
            continue;
          }

          const planId = String(target.planId || '').trim();
          const patch: Partial<ProductionReport> = { workOrderId: target.id };
          if (planId && !String(report.productionPlanId || '').trim()) {
            patch.productionPlanId = planId;
            patch.productionPlanLinkMode = 'auto';
          }
          await reportService.update(report.id, patch);
          touchedWorkOrderIds.add(String(target.id));
          linked += 1;
        } catch {
          failed += 1;
        }
        options?.onProgress?.({
          processed,
          total: candidates.length,
          linked,
          skipped,
          failed,
        });
      }

      for (const workOrderId of touchedWorkOrderIds) {
        try {
          await get().reconcileWorkOrderFromReports(workOrderId, { internal: true });
        } catch {
          // reconcile failures are surfaced via store error; keep linking progress
        }
      }

      const touchedDates = candidates
        .map((r) => String(r.date || '').trim())
        .filter(Boolean);
      invalidateProductionReportsRangeCacheForDates(touchedDates, get, set);
      const today = getReportOperationalDateString(get().systemSettings);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, latestWorkOrders] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        workOrderService.getAll(),
      ]);
      const rangeCacheNow = Date.now();
      const rkToday = getProductionReportsRangeCacheKey(today, today);
      const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
      set((state) => ({
        todayReports,
        monthlyReports,
        productionReports: monthlyReports,
        workOrders: latestWorkOrders,
        productionReportsRangeCache: {
          ...state.productionReportsRangeCache,
          [rkToday]: { rows: todayReports, fetchedAt: rangeCacheNow },
          [rkMonth]: { rows: monthlyReports, fetchedAt: rangeCacheNow },
        },
      }));
      get()._rebuildProducts();
      get()._rebuildLines();

      return { processed, linked, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  reconcileProductionPlanFromReports: async (planId) => {
    const id = String(planId || '').trim();
    if (!id) return null;
    try {
      const plan = await productionPlanService.getById(id);
      if (!plan?.id) {
        throw new Error('خطة الإنتاج غير موجودة.');
      }
      const reports = await reportService.getByLineAndProduct(
        plan.lineId,
        plan.productId,
        plan.startDate || plan.plannedStartDate || undefined,
      );
      const patch = deriveProductionPlanAutoPatch(plan, reports);
      if (patch) {
        await productionPlanService.update(id, patch);
      }
      await get().fetchProductionPlans({ force: true, silent: true });
      const refreshed = get().productionPlans.find((row) => row.id === id) || { ...plan, ...patch };
      const planReports = filterReportsForProductionPlan(refreshed, reports);
      const producedQuantity = planReports.reduce(
        (sum, report) => sum + Number(report.quantityProduced || 0),
        0,
      );
      return {
        producedQuantity,
        status: refreshed.status,
        patched: Boolean(patch),
      };
    } catch (error) {
      console.warn('reconcileProductionPlanFromReports failed:', error);
      throw error;
    }
  },

  reconcileWorkOrderFromReports: async (workOrderId, context) => {
    set({ error: null });
    if ('path' in context) {
      assertOperationPathEnabled(
        get().systemSettings,
        PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
        context.path,
      );
    }
    const id = String(workOrderId || '').trim();
    if (!id) {
      throw new Error('معرّف أمر الشغل غير صالح.');
    }

    try {
      const wo = await workOrderService.getById(id);
      if (!wo?.id) {
        throw new Error('أمر الشغل غير موجود.');
      }

      const startDate = getWorkOrderEffectiveStartDate(wo) || getReportOperationalDateString(get().systemSettings);
      const endDate = String(wo.targetDate || '').trim() || getReportOperationalDateString(get().systemSettings);
      const rangeStart = startDate <= endDate ? startDate : endDate;
      const rangeEnd = startDate <= endDate ? endDate : startDate;

      const rangeReports = await reportService.getByDateRange(rangeStart, rangeEnd);
      const toLink = filterUnlinkedReportsEligibleForWorkOrder(wo, rangeReports);
      const planId = String(wo.planId || '').trim();
      let linked = 0;

      for (const report of toLink) {
        if (!report.id) continue;
        const patch: Partial<ProductionReport> = { workOrderId: id };
        if (planId && !String(report.productionPlanId || '').trim()) {
          patch.productionPlanId = planId;
          patch.productionPlanLinkMode = 'auto';
        }
        await reportService.update(report.id, patch);
        linked += 1;
      }

      const linkedReports = await reportService.getByWorkOrderId(id);
      if (planId) {
        for (const report of linkedReports) {
          if (!report.id) continue;
          if (String(report.productionPlanId || '').trim()) continue;
          await reportService.update(report.id, {
            productionPlanId: planId,
            productionPlanLinkMode: report.productionPlanLinkMode || 'auto',
          });
        }
      }

      const refreshedLinked = planId ? await reportService.getByWorkOrderId(id) : linkedReports;
      const producedQuantity = sumProducedFromWorkOrderReports(id, refreshedLinked);
      const targetQty = Number(wo.quantity || 0);
      const nextStatus = deriveWorkOrderStatusFromProduced(producedQuantity, targetQty, wo.status);
      const statusPatch: Partial<WorkOrder> = {
        producedQuantity,
        status: nextStatus,
      };
      if (nextStatus === 'completed') {
        statusPatch.completedAt = wo.completedAt || new Date().toISOString();
      } else if (wo.status === 'completed') {
        statusPatch.completedAt = null;
      }
      await workOrderService.update(id, statusPatch);

      await get().fetchWorkOrders({ force: true });
      if (planId) {
        try {
          await get().reconcileProductionPlanFromReports(planId);
        } catch (planErr) {
          console.warn('reconcileProductionPlanFromReports after WO reconcile failed:', planErr);
          await get().fetchProductionPlans({ force: true, silent: true });
        }
      } else {
        await get().fetchProductionPlans({ force: true, silent: true });
      }

      const touchedDates = refreshedLinked
        .map((r) => String(r.date || '').trim())
        .filter(Boolean);
      invalidateProductionReportsRangeCacheForDates(touchedDates, get, set);

      return {
        linked,
        reportCount: refreshedLinked.length,
        producedQuantity,
      };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  unlinkReportsWorkOrdersInRange: async (startDate, endDate, options) => {
    set({ error: null });
    assertOperationPathEnabled(
      get().systemSettings,
      PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
      PRODUCTION_REPORT_RECONCILE_PATHS.reportsPage,
    );
    let processed = 0;
    let unlinked = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل فك الربط.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const candidates = reports.filter((report) => String(report.workOrderId || '').trim());
      options?.onStart?.(candidates.length);
      if (candidates.length === 0) {
        options?.onProgress?.({ processed: 0, total: 0, unlinked: 0, skipped: 0, failed: 0 });
        return { processed: 0, unlinked: 0, skipped: 0, failed: 0 };
      }

      const laborRate = Number(get().laborSettings?.hourlyRate ?? 0);

      for (const report of candidates) {
        if (!report.id) continue;
        processed += 1;
        try {
          const reportWorkOrderId = String(report.workOrderId || '').trim();
          if (!reportWorkOrderId) {
            skipped += 1;
            options?.onProgress?.({
              processed,
              total: candidates.length,
              unlinked,
              skipped,
              failed,
            });
            continue;
          }

          const linkedWorkOrder = await workOrderService.getById(reportWorkOrderId);
          if (linkedWorkOrder?.id) {
            const removedProduced = Math.max(0, Number(report.quantityProduced) || 0);
            const removedLaborCost = Math.max(
              0,
              laborRate * Number(report.workHours || 0) * Number(report.workersCount || 0),
            );

            const nextProduced = Math.max(
              0,
              Number(linkedWorkOrder.producedQuantity || 0) - removedProduced,
            );
            const nextActualCost = Math.max(
              0,
              Number(linkedWorkOrder.actualCost || 0) - removedLaborCost,
            );
            const nextStatus: WorkOrder['status'] =
              nextProduced <= 0
                ? 'pending'
                : nextProduced >= Number(linkedWorkOrder.quantity || 0)
                  ? 'completed'
                  : 'in_progress';

            await workOrderService.update(linkedWorkOrder.id, {
              producedQuantity: nextProduced,
              actualCost: nextActualCost,
              status: nextStatus,
              completedAt:
                nextStatus === 'completed'
                  ? (linkedWorkOrder.completedAt ?? new Date().toISOString())
                  : null,
            });
          }

          await reportService.update(report.id, { workOrderId: '' });
          unlinked += 1;
        } catch {
          failed += 1;
        }

        options?.onProgress?.({
          processed,
          total: candidates.length,
          unlinked,
          skipped,
          failed,
        });
      }

      const touchedDates = candidates
        .map((r) => String(r.date || '').trim())
        .filter(Boolean);
      invalidateProductionReportsRangeCacheForDates(touchedDates, get, set);
      const today = getReportOperationalDateString(get().systemSettings);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, latestWorkOrders] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        workOrderService.getAll(),
      ]);
      const rangeCacheNow = Date.now();
      const rkToday = getProductionReportsRangeCacheKey(today, today);
      const rkMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
      set((state) => ({
        todayReports,
        monthlyReports,
        productionReports: monthlyReports,
        workOrders: latestWorkOrders,
        productionReportsRangeCache: {
          ...state.productionReportsRangeCache,
          [rkToday]: { rows: todayReports, fetchedAt: rangeCacheNow },
          [rkMonth]: { rows: monthlyReports, fetchedAt: rangeCacheNow },
        },
      }));
      get()._rebuildProducts();
      get()._rebuildLines();

      return { processed, unlinked, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  updateLineStatus: async (id, data) => {
    try {
      await lineStatusService.update(id, data);
      await get().fetchLineStatuses();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createLineStatus: async (data) => {
    try {
      const id = await lineStatusService.create(data);
      if (id) await get().fetchLineStatuses();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  createLineProductConfig: async (data) => {
    try {
      const id = await lineProductConfigService.create(data);
      if (id) await get().fetchLineProductConfigs();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateLineProductConfig: async (id, data) => {
    try {
      await lineProductConfigService.update(id, data);
      await get().fetchLineProductConfigs();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteLineProductConfig: async (id) => {
    try {
      await lineProductConfigService.delete(id);
      await get().fetchLineProductConfigs();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Cost Management ────────────────────────────────────────────────────────

  fetchCostData: async () => {
    try {
      const [costCenters, costCenterValues, costAllocations, laborSettings] =
        await Promise.all([
          costCenterService.getAll(),
          costCenterValueService.getAll(),
          costAllocationService.getAll(),
          laborSettingsService.get(),
        ]);
      set({ costCenters, costCenterValues, costAllocations, laborSettings });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createCostCenter: async (data) => {
    try {
      const { costCenterId } = unwrapOrThrow(await createCostCenterUseCase(data, {
        userId: get().uid ?? undefined,
        userName: get().userDisplayName ?? get().userEmail ?? undefined,
      }));
      await get().fetchCostData();
      return costCenterId;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateCostCenter: async (id, data) => {
    try {
      await costCenterService.update(id, data);
      await get().fetchCostData();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteCostCenter: async (id) => {
    try {
      await costCenterService.delete(id);
      await get().fetchCostData();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  saveCostCenterValue: async (data, existingId) => {
    try {
      const targetMonth = String(data.month || '').trim();
      if (targetMonth && await monthlyProductionCostService.isMonthClosed(targetMonth)) {
        throw new Error('الفترة مُغلقة، لا يمكن تعديل قيم مراكز التكلفة لهذا الشهر.');
      }
      if (existingId) {
        await costCenterValueService.update(existingId, data);
      } else {
        await costCenterValueService.create(data);
      }
      const costCenterValues = await costCenterValueService.getAll();
      set({ costCenterValues });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  saveCostAllocation: async (data, existingId) => {
    try {
      const targetMonth = String(data.month || '').trim();
      if (targetMonth && await monthlyProductionCostService.isMonthClosed(targetMonth)) {
        throw new Error('الفترة مُغلقة، لا يمكن تعديل توزيعات مراكز التكلفة لهذا الشهر.');
      }
      if (existingId) {
        await costAllocationService.update(existingId, data);
      } else {
        await costAllocationService.create(data);
      }
      const costAllocations = await costAllocationService.getAll();
      set({ costAllocations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateLaborSettings: async (data) => {
    try {
      await laborSettingsService.set(data);
      const laborSettings = await laborSettingsService.get();
      set({ laborSettings });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchAssets: async () => {
    try {
      const assets = await assetService.getAll();
      set({ assets });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createAsset: async (data) => {
    try {
      const id = await assetService.create(data);
      if (id) {
        await get().fetchAssets();
      }
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateAsset: async (id, data) => {
    try {
      await assetService.update(id, data);
      await get().fetchAssets();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteAsset: async (id) => {
    try {
      await assetService.delete(id);
      await get().fetchAssets();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchDepreciationReport: async (period) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByPeriod(period);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchAssetDepreciations: async (assetId) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByAsset(assetId);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchDepreciationYear: async (year) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByYear(year);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  runDepreciationJob: async (period) => {
    try {
      let result: AssetDepreciationRunResult;
      try {
        result = await runAssetDepreciationCallable({ period });
      } catch {
        // Fallback for local/dev when callable function is not deployed.
        result = await assetDepreciationJobService.runForPeriod(period);
      }
      await Promise.all([
        get().fetchAssets(),
        get().fetchDepreciationReport(result.period),
      ]);
      return result;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // ── System Settings ──────────────────────────────────────────────────────

  fetchSystemSettings: async () => {
    try {
      const data = await systemSettingsService.get();
      if (data) {
        const merged = resolveSystemSettings(data);
        set({ systemSettings: merged });
        reapplyThemeFromAppStore(get);
        await get().fetchProducts({ force: true });
      }
    } catch (error) {
      console.error('fetchSystemSettings error:', error);
    }
  },

  updateSystemSettings: async (data: Partial<SystemSettings>) => {
    try {
      const patch = { ...data };
      if (
        patch.operationPaths
        && JSON.stringify(patch.operationPaths) === JSON.stringify(get().systemSettings.operationPaths)
      ) {
        delete patch.operationPaths;
      }
      const saved = await systemSettingsService.patch(patch);
      const merged = resolveSystemSettings(saved);
      set({ systemSettings: merged });
      clearInventoryRoutingCache();
      reapplyThemeFromAppStore(get, { syncTenantDoc: true });

      // Post-save refresh is best-effort and should not flip a successful settings write into a failure.
      try {
        await get().fetchProducts({ force: true });
      } catch (refreshError) {
        console.warn('updateSystemSettings post-save refresh failed:', refreshError);
      }
    } catch (error) {
      const message = (error as Error).message;
      set({ error: message });
      throw error;
    }
  },

  // ── Real-time Subscriptions ───────────────────────────────────────────────

  subscribeToDashboard: () => {
    const today = getReportOperationalDateString(get().systemSettings);
    return reportService.subscribeToday(today, (reports) => {
      set({ todayReports: reports });
      get()._rebuildProducts();
      get()._rebuildLines();
    });
  },

  subscribeToLineStatuses: () => {
    return lineStatusService.subscribeAll((statuses) => {
      set({ lineStatuses: statuses });
      get()._rebuildLines();
    });
  },

  subscribeToWorkOrders: () => {
    return workOrderService.subscribeAll((orders) => {
      const validWorkOrderIds = new Set(
        orders
          .map((order) => order.id)
          .filter((id): id is string => !!id),
      );

      set((state) => {
        const liveProduction = Object.fromEntries(
          Object.entries(state.liveProduction).filter(([workOrderId]) =>
            validWorkOrderIds.has(workOrderId),
          ),
        );
        const scanEventsToday = state.scanEventsToday.filter((event) =>
          validWorkOrderIds.has(event.workOrderId),
        );

        return {
          workOrders: orders,
          liveProduction,
          scanEventsToday,
        };
      });
      get()._rebuildLines();
    });
  },

  subscribeToScanEventsToday: () => {
    const today = getReportOperationalDateString(get().systemSettings);
    return scanEventService.subscribeLiveToday(today, (events) => {
      const validWorkOrderIds = new Set(
        get().workOrders
          .map((order) => order.id)
          .filter((id): id is string => !!id),
      );
      const normalizedEvents = validWorkOrderIds.size > 0
        ? events.filter((evt) => validWorkOrderIds.has(evt.workOrderId))
        : events;

      const byWorkOrder = new Map<string, WorkOrderScanEvent[]>();
      for (const evt of normalizedEvents) {
        const arr = byWorkOrder.get(evt.workOrderId) ?? [];
        arr.push(evt);
        byWorkOrder.set(evt.workOrderId, arr);
      }

      const liveProduction: Record<string, WorkOrderLiveSummary> = {};
      byWorkOrder.forEach((workOrderEvents, workOrderId) => {
        const sessions = scanEventService.sessionsFromEvents(workOrderEvents);
        liveProduction[workOrderId] = scanEventService.summaryFromSessions(sessions);
      });

      set({ scanEventsToday: normalizedEvents, liveProduction });
    });
  },

  subscribeToWorkOrderScans: (workOrderId: string) => {
    if (!workOrderId) return () => {};
    return scanEventService.subscribeByWorkOrder(workOrderId, (events) => {
      const sessions = scanEventService.sessionsFromEvents(events);
      const summary = scanEventService.summaryFromSessions(sessions);
      set((state) => ({
        workOrderScanEvents: events,
        liveProduction: {
          ...state.liveProduction,
          [workOrderId]: summary,
        },
      }));
    });
  },

  toggleBarcodeScan: async (payload) => {
    const result = await scanEventService.toggleScan(payload);
    // Persist live scan summary on the work order itself so dashboards
    // can render produced quantity without opening scanner page first.
    try {
      const latest = await scanEventService.buildWorkOrderSummary(payload.workOrderId);
      await workOrderService.update(payload.workOrderId, {
        actualProducedFromScans: latest.summary.completedUnits || 0,
        actualWorkersCount: latest.summary.activeWorkers || 0,
        scanSummary: latest.summary,
      });
    } catch (summaryError) {
      console.error('toggleBarcodeScan summary sync failed:', summaryError);
    }
    return {
      action: result.action,
      cycleSeconds: result.cycleSeconds,
    };
  },

  // ── Internal Rebuilders ───────────────────────────────────────────────────

  _rebuildProducts: () => {
    const {
      _rawProducts,
      todayReports,
      productionReports,
      lineProductConfigs,
      routingTotalTimeSecondsByProduct,
    } = get();
    const allReports =
      productionReports.length > 0 ? productionReports : todayReports;
    const products = buildProducts(
      _rawProducts,
      allReports,
      lineProductConfigs,
      routingTotalTimeSecondsByProduct,
      get()._productCategories,
    );
    set({ products });
  },

  _rebuildLines: () => {
    const {
      _rawLines,
      _rawProducts,
      _rawEmployees,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports,
      workOrders,
    } = get();
    const productionLines = buildProductionLines(
      _rawLines,
      _rawProducts,
      _rawEmployees,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports,
      workOrders
    );
    set({ productionLines });
  },

  // ── Legacy Setters (kept for backward compat) ─────────────────────────────

  setProductionLines: (productionLines) => set({ productionLines }),
  setProducts: (products) => set({ products }),
  setEmployees: (employees) => set({ employees }),
  setLoading: (loading) => set({ loading }),
}));

// ─── Shallow Selector Helper (avoid unnecessary re-renders) ─────────────────

export const useShallowStore = <T>(selector: (state: AppState) => T): T =>
  useAppStore(useShallow(selector));
