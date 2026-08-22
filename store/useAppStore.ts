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
  createProductionReportFastCallable,
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
  deriveProductionPlanAutoStatus,
  filterReportsForProductionPlan,
} from '../modules/production/utils/productionPlanReports';
import {
  deriveWorkOrderStatusFromProduced,
  filterUnlinkedReportsEligibleForWorkOrder,
  getWorkOrderEffectiveStartDate,
  lastProducingReportDateFromReports,
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
import { getBuiltInRoleKey } from '../modules/system/lib/visibleRoles';
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
import { resolveCostingPolicy } from '../utils/costingPolicy';
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
import { applyPackagingOnlyPermissionLocks } from '../utils/packagingOnlyPermissions';
import { applyBuiltinRolePermissionLocks } from '../utils/builtinRolePermissionLocks';
import { resolveBootstrapDataAccess } from '../lib/bootstrapDataAccess';
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
import {
  DELEGATED_WORK_ORDER_REQUIRED_MESSAGE,
  productionIssueRequiredMessage,
} from '../modules/production/lib/reportSaveFeedback';
import { resolveRequiresProductionIssueOnReport } from '../modules/production/lib/requiresProductionIssue';
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
  const costingPolicy = resolveCostingPolicy(st.systemSettings.costingPolicy);
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
  const rawMaterialSources = await buildReportMaterialCostSources(row);
  const materialSources = costingPolicy.fullManufacturingEnabled
    ? rawMaterialSources.filter((source) => {
        if (source.category === 'packaging') return costingPolicy.includePackaging;
        if (source.category !== 'material') return true;
        if (source.status === 'actual') return costingPolicy.includeActualMaterials;
        return costingPolicy.allowBomEstimateFallback;
      })
    : [];
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
    ...(costingPolicy.fullManufacturingEnabled && costingPolicy.includeDirectLabor ? [{
      sourceKey: `labor:${reportId}`,
      sourceType: 'labor_standard',
      sourceId: reportId,
      category: 'direct_labor',
      label: 'العمالة المباشرة',
      amount: Number(withDepreciation?.laborCostTotal ?? legacyPatch.laborCostSnapshot ?? 0),
      status: 'actual' as const,
    } satisfies ProductionCostSourceLine] : []),
    ...(costingPolicy.fullManufacturingEnabled && costingPolicy.includeIndirectCenters ? [{
      sourceKey: `overhead:${reportId}:${ym}`,
      sourceType: 'cost_center_absorption',
      sourceId: ym,
      category: 'factory_overhead',
      label: 'التكاليف الصناعية المحملة',
      amount: Math.max(
        0,
        conversionWithDepreciation
          - Number(withDepreciation?.laborCostTotal ?? legacyPatch.laborCostSnapshot ?? 0)
          - depreciationCost
          - (costingPolicy.includeSupervisor ? 0 : Number(legacyPatch.supervisorIndirectSnapshot || 0)),
      ),
      status: overheadIsActual ? 'actual' : 'estimated',
    } satisfies ProductionCostSourceLine] : []),
  ];
  if (costingPolicy.fullManufacturingEnabled && costingPolicy.includeDepreciation && depreciationCost > 0) {
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

/** Insert or replace a work order in the in-memory list without a full Firestore reload. */
function upsertLoadedWorkOrder(
  rows: WorkOrder[],
  workOrder: WorkOrder,
): WorkOrder[] {
  if (!workOrder.id) return rows;
  if (rows.some((row) => row.id === workOrder.id)) {
    return rows.map((row) => (row.id === workOrder.id ? { ...row, ...workOrder } : row));
  }
  return [workOrder, ...rows];
}

/** Insert or replace a production plan in the in-memory list without a full Firestore reload. */
function upsertLoadedProductionPlan(
  rows: ProductionPlan[],
  plan: ProductionPlan,
): ProductionPlan[] {
  if (!plan.id) return rows;
  if (rows.some((row) => row.id === plan.id)) {
    return rows.map((row) => (row.id === plan.id ? { ...row, ...plan } : row));
  }
  return [plan, ...rows];
}

/** Prefer cached reports already loaded for dashboards/lists when rebuilding planReports. */
function buildPlanReportsFromCachedReports(
  plans: ProductionPlan[],
  cachedReports: ProductionReport[],
  previousPlanReports: Record<string, ProductionReport[]>,
): Record<string, ProductionReport[]> {
  const next: Record<string, ProductionReport[]> = { ...previousPlanReports };
  for (const plan of plans) {
    if (!plan.id && !plan.productId) continue;
    const key = plan.id || `product_${plan.productId}`;
    if (cachedReports.length > 0) {
      next[key] = filterReportsForProductionPlan(plan, cachedReports);
    } else if (!next[key]) {
      next[key] = [];
    }
  }
  return next;
}

function isActiveWorkOrderStatus(status?: WorkOrder['status']): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'paused';
}

type ProductionReportLinkInput = Pick<
  ProductionReport,
  'lineId' | 'productId' | 'employeeId' | 'date' | 'workOrderId' | 'productionPlanId' | 'reportType'
>;

async function resolveProductionReportExecutionLinks(
  input: ProductionReportLinkInput,
  _cachedWorkOrders: WorkOrder[],
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
      && selected.productId === input.productId
      && workOrderMatchesReportType(selected, reportType)
      && reportDateEligibleForWorkOrder(input.date, selected)
    ) {
      activeWorkOrder = selected;
    }
  }

  // Do not silently attach a work order when the operator left it empty.
  // Auto-attach made optional-WO saves fail on صرف إنتاج / supervisor mismatch.

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
  const activePlans = await productionPlanService.getActiveByProduct(input.productId);
  const planReportType = effectivePlanReportType(reportType);
  const matchesReportContext = (plan: ProductionPlan | null): boolean => {
    if (!plan || plan.productId !== input.productId) return false;
    const planType = plan.planType === 'component_injection' ? 'component_injection' : 'finished_product';
    return planType === planReportType;
  };
  const acceptsReport = (plan: ProductionPlan | null): boolean => (
    matchesReportContext(plan) && plan?.acceptsProductionFromReports !== false
  );
  const matchingActivePlans = activePlans.filter((plan) => acceptsReport(plan));

  if (!explicitPlan && !workOrderPlan && matchingActivePlans.length > 1) {
    throw new Error(
      'يوجد أكثر من خطة نشطة لنفس المنتج. أنشئ التقرير من الخطة المطلوبة لضمان الربط الصحيح.',
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
  todayDate: string = getTodayDateString(),
): Partial<ProductionPlan> | null {
  const plannedQty = Number(plan.plannedQuantity || 0);
  const planReports = filterReportsForProductionPlan(plan, reports);
  const producedQty = planReports.reduce((sum, report) => sum + Number(report.quantityProduced || 0), 0);
  const remainingQty = Math.max(0, plannedQty - producedQty);
  const achievementPercent = plannedQty > 0
    ? Math.round((producedQty / plannedQty) * 1000) / 10
    : 0;
  const producingDates = planReports
    .filter((report) => Number(report.quantityProduced || 0) > 0 && Boolean(report.date))
    .map((report) => String(report.date).slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
  const firstReportDate = producingDates[0];
  const lastReportDate = producingDates[producingDates.length - 1] || null;
  const hasProgress = producedQty > 0 || Boolean(firstReportDate);

  const nextStatus = deriveProductionPlanAutoStatus(
    plan,
    producedQty,
    lastReportDate,
    todayDate,
  );

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
  queueReportCreate: (
    data: Omit<ProductionReport, 'id' | 'createdAt'>,
    context: { path: ProductionReportCreatePath },
  ) => { optimisticId: string; completion: Promise<string | null> };
  retryQueuedReportCreate: (optimisticId: string) => Promise<string | null>;
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
    context: (
      | { path: ProductionReportReconcilePath }
      | { internal: true }
    ) & { mode?: 'full' | 'linkedOnly' },
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
