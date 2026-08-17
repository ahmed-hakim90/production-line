export enum ProductionLineStatus {
  ACTIVE = "active",
  MAINTENANCE = "maintenance",
  IDLE = "idle",
  WARNING = "warning",
  INJECTION = "injection",
}

// â”€â”€â”€ UI Types (consumed by components â€” do NOT change) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ProductionLine {
  id: string;
  name: string;
  code: string;
  sortOrder?: number;
  employeeName: string;
  status: ProductionLineStatus;
  currentProduct: string;
  currentProductId: string;
  achievement: number;
  target: number;
  workersCount: number;
  efficiency: number;
  hoursUsed: number;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  /** FK to product_categories when set. */
  categoryId?: string | null;
  stockLevel: number;
  stockStatus: "available" | "low" | "out";
  openingStock: number;
  totalProduction: number;
  avgDailyProduction: number;
  wasteUnits: number;
  avgAssemblyTime: number;
  imageUrl?: string;
  assemblyMode?: ProductAssemblyMode;
  /**
   * When false, product is spare-parts / repair catalog only.
   * Missing/true = manufactured finished good used on production lines.
   */
  isManufactured?: boolean;
}

export type EmploymentType = "full_time" | "part_time" | "contract" | "daily";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد",
  daily: "يومي",
};

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  departmentId: string;
  jobPositionId: string;
  level: number;
  managerId?: string;
  employmentType: EmploymentType;
  baseSalary: number;
  hourlyRate: number;
  shiftId?: string;
  vehicleId?: string;
  hasSystemAccess: boolean;
  isActive: boolean;
  code?: string;
  acNo?: string;
  shiftType?: "shift1" | "shift2" | "shift3" | "flexible";
  workDays?: number[];
}

// â”€â”€â”€ Firestore Document Types (match collection schemas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FirestoreProduct {
  id?: string;
  name: string;
  model: string;
  category?: string;
  /** FK to product_categories (preferred). */
  categoryId?: string | null;
  /** Denormalized leaf category name for display. */
  categoryName?: string;
  code: string;
  /** Unique customer-facing barcode printed on the product box. */
  barcode?: string;
  openingBalance: number;
  /** Write-time lifetime aggregates maintained from production_reports. */
  totalProduction?: number;
  totalWaste?: number;
  productionStatsUpdatedAt?: unknown;
  /** Latest production month materialized by aggregateProductionReports. */
  productionStatsMonth?: string;
  monthlyProduction?: number;
  monthlyWaste?: number;
  monthlyProductionCost?: number;
  avgDailyProduction?: number;
  imageUrl?: string;
  storagePath?: string;
  imageCreatedAt?: any;
  chineseUnitCost?: number;
  innerBoxCost?: number;
  outerCartonCost?: number;
  unitsPerCarton?: number;
  sellingPrice?: number;
  autoDeductComponentScrapFromDecomposed?: boolean;
  /**
   * Optional seconds/unit for report expected-qty variance when there is no active routing plan,
   * or the plan has no positive step total. Overridden when an active plan supplies its own basis.
   */
  routingTargetUnitSeconds?: number;
  /** Default daily worker target (pieces) when no worker-specific target exists. */
  defaultWorkerTargetQty?: number;
  /** Individual products use per-worker output targets; team products are reported as collective output. */
  assemblyMode?: ProductAssemblyMode;
  /**
   * When false, product is spare-parts / repair catalog only (hidden from production pickers).
   * Missing/true = manufactured finished good used on production lines.
   */
  isManufactured?: boolean;
}

export interface ProductMaterial {
  id?: string;
  tenantId?: string;
  productId: string;
  materialId?: string;
  materialName: string;
  quantityUsed: number;
  unitCost: number;
}

export interface FirestoreProductionLine {
  id?: string;
  name: string;
  code?: string;
  sortOrder?: number;
  dailyWorkingHours: number;
  maxWorkers: number;
  status: ProductionLineStatus;
  /** When true, reports on this line represent packaging throughput only (not work-order manufacturing progress). */
  isPackagingLine?: boolean;
}

export interface FirestoreEmployee {
  id?: string;
  name: string;
  phone?: string;
  departmentId: string;
  jobPositionId: string;
  level: number;
  managerId?: string;
  employmentType: EmploymentType;
  baseSalary: number;
  hourlyRate: number;
  shiftId?: string;
  vehicleId?: string;
  hasSystemAccess: boolean;
  isActive: boolean;
  userId?: string;
  email?: string;
  code?: string;
  acNo?: string;
  shiftType?: "shift1" | "shift2" | "shift3" | "flexible";
  workDays?: number[];
  createdAt?: any;
}

// â”€â”€â”€ Activity Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ActivityAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_REPORT"
  | "UPDATE_REPORT"
  | "DELETE_REPORT"
  | "CREATE_LEAVE_REQUEST"
  | "APPROVE_LEAVE"
  | "REJECT_LEAVE"
  | "CREATE_LOAN_REQUEST"
  | "APPROVE_LOAN"
  | "REJECT_LOAN"
  | "PROCESS_INSTALLMENT"
  | "CREATE_USER"
  | "UPDATE_USER_ROLE"
  | "TOGGLE_USER_ACTIVE"
  | "APPROVE_USER"
  | "REJECT_USER"
  | "SALARY_CHANGE"
  | "QUALITY_CREATE_INSPECTION"
  | "QUALITY_UPDATE_INSPECTION"
  | "QUALITY_CREATE_DEFECT"
  | "QUALITY_CREATE_REWORK"
  | "QUALITY_UPDATE_REWORK"
  | "QUALITY_CREATE_CAPA"
  | "QUALITY_UPDATE_CAPA"
  | "QUALITY_CREATE_WORKER"
  | "QUALITY_UPDATE_WORKER"
  | "QUALITY_DELETE_WORKER"
  | "QUALITY_SET_POLICIES"
  | "QUALITY_UPDATE_REASON"
  | "QUALITY_DELETE_REASON"
  | "QUALITY_UPSERT_TEMPLATE"
  | "QUALITY_REMOVE_TEMPLATE"
  | "QUALITY_UPSERT_SAMPLING_PLAN"
  | "QUALITY_REMOVE_SAMPLING_PLAN"
  | "QUALITY_UPDATE_REWORK_POLICIES"
  | "QUALITY_UPDATE_PRINT_TEMPLATES"
  | "QUALITY_EXPORT_DOCUMENT"
  | "CUSTOMER_CREATE"
  | "CUSTOMER_UPDATE"
  | "CUSTOMER_IMPORT"
  | "ROUTING_SOFT_DELETE_PLAN";

export interface ActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  action: ActivityAction;
  description: string;
  metadata?: Record<string, any>;
  timestamp: any;
}

export interface LineProductConfig {
  id?: string;
  productId: string;
  lineId: string;
  standardAssemblyTime: number;
  /** Per-worker daily output target (pieces/worker/day) for this product on this line — not line total. */
  dailyWorkerTargetQty?: number;
}

/** One line in a multi-product packaging report. `quantityPieces` is canonical on save. */
export interface PackagingReportLine {
  productId: string;
  quantityPieces: number;
  /** When product has `unitsPerCarton`: full cartons (UI / round-trip). */
  quantityCartons?: number;
  /** When product has `unitsPerCarton`: pieces below one carton, 0 .. unitsPerCarton-1. */
  remainderPieces?: number;
}

/** Injection reports: morning (صباحي) or evening (مسائي) shift on the same line/day. */
export type ProductionReportShift = "morning" | "evening";
export type ProductionReportLifecycleStatus = "open" | "closed";
export type ProductAssemblyMode = "individual" | "team";

export interface ProductionShiftWorkerSnapshot {
  employeeId: string;
  employeeCode?: string;
  employeeName: string;
  laborRole: LineWorkerLaborRole;
  isPresent: boolean;
}

export interface ProductionReport {
  id?: string;
  reportCode?: string;
  /** Client-only optimistic queue state; never persisted to Firestore. */
  clientSaveState?: "saving" | "failed";
  clientSaveError?: string;
  clientCreatePath?: string;
  clientCreatePayload?: Record<string, unknown>;
  /** Auth user who entered the report; may differ from employeeId for delegated hall reporting. */
  createdByUid?: string;
  createdByNameSnapshot?: string;
  entryMode?: "direct" | "hall_supervisor_delegate";
  /** V2 background processing marker; absent means a legacy/client-processed report. */
  processingVersion?: 2;
  processingState?: "pending" | "processing" | "completed" | "failed";
  processingStage?: string;
  processingError?: string;
  processingAttempts?: number;
  processingUpdatedAt?: any;
  employeeId: string;
  productId: string;
  /** Immutable catalog label captured when the report is saved. */
  productNameSnapshot?: string;
  /** Immutable catalog code captured when the report is saved. */
  productCodeSnapshot?: string;
  /** Entry path used for the original report mutation; informational audit snapshot. */
  operationPathSnapshot?: string;
  /** Most recent mutation entry path; informational audit snapshot. */
  lastOperationPathSnapshot?: string;
  /** Industrial cost amount already posted to the linked work order aggregate. */
  workOrderCostPostedSnapshot?: number;
  /** Industrial cost amount already posted to the linked production plan aggregate. */
  productionPlanCostPostedSnapshot?: number;
  lineId: string;
  date: string;
  /** Required for component_injection reports; legacy rows without shift are treated as morning. */
  shift?: ProductionReportShift;
  quantityProduced: number;
  workersCount: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
  /** Attendance snapshot for labor details; workersCount only includes present workers. */
  presentAssignments?: number;
  absentAssignments?: number;
  workHours: number;
  supervisorHourlyRateApplied?: number;
  supervisorIndirectCost?: number;
  /** ISO timestamp when cost snapshots below were computed */
  costSnapshotAt?: string;
  unitCostSnapshot?: number;
  laborCostSnapshot?: number;
  /** Sum of line_percentage indirect only (excludes by_qty centers) */
  lineIndirectShareSnapshot?: number;
  supervisorIndirectSnapshot?: number;
  /** Per cost-center indirect share (line_percentage + by_qty); excludes supervisor */
  indirectByCenterSnapshot?: Record<string, number>;
  /** Compatibility snapshot: the pre-full-cost engine's labor + industrial overhead. */
  legacyConversionCostSnapshot?: number;
  /** Full manufacturing costing V1. Kept separate from unitCostSnapshot during migration. */
  manufacturingCostVersion?: string;
  manufacturingCostRevision?: number;
  manufacturingCostStatus?: "provisional" | "actual";
  manufacturingCostPostingState?: "pending" | "calculated" | "failed";
  manufacturingCostPostingError?: string;
  manufacturingCostCalculatedAt?: string;
  materialCostSnapshot?: number;
  packagingCostSnapshot?: number;
  directLaborCostSnapshot?: number;
  factoryOverheadCostSnapshot?: number;
  depreciationCostSnapshot?: number;
  fullManufacturingCostSnapshot?: number;
  fullManufacturingUnitCostSnapshot?: number;
  manufacturingCostSourceQualitySnapshot?: {
    actualLines: number;
    estimatedLines: number;
    scheduledLines: number;
    missingAmountLines: number;
  };
  manufacturingCostSourcesSnapshot?: Array<{
    sourceKey: string;
    sourceType: string;
    sourceId?: string;
    category: "material" | "packaging" | "direct_labor" | "factory_overhead" | "depreciation";
    label: string;
    amount: number;
    status: "actual" | "estimated" | "scheduled";
    quantity?: number;
    unitCost?: number;
    costCenterId?: string;
  }>;
  notes?: string;
  workOrderId?: string;
  /** اختياري: ربط التقرير بدورة توريد (باتش) لاحتساب الهالك والتتبع */
  supplyCycleId?: string;
  reportType?:
    | "finished_product"
    | "component_injection"
    | "packaging"
    | "component_waste";
  /** Employee-dashboard shift lifecycle; missing means legacy completed report. */
  lifecycleStatus?: ProductionReportLifecycleStatus;
  shiftStartedAt?: string;
  shiftClosedAt?: string;
  shiftStartedByUid?: string;
  shiftClosedByUid?: string;
  shiftStartContext?: "plan" | "general";
  /** Snapshot captured at shift start from the line worker attendance step. */
  shiftWorkers?: ProductionShiftWorkerSnapshot[];
  productionPlanId?: string;
  productionPlanLinkMode?: "manual" | "auto";
  assemblyModeSnapshot?: ProductAssemblyMode;
  workerTargetsApplied?: boolean;
  workerTargetSource?: "line_product" | "plan_daily" | "none";
  laborAssignmentSource?: "line_worker_assignments" | "manual" | "none";
  /** When set for packaging reports, quantities come from lines; productId/quantityProduced are derived for legacy fields. */
  packagingLines?: PackagingReportLine[];
  componentScrapItems?: ReportComponentScrapItem[];
  /** Per-worker output lines; optional for backward compatibility. */
  workerOutputs?: ProductionReportWorkerOutput[];
  createdAt?: any;
}

export interface ProductionReportWorkerOutput {
  workerId: string;
  workerName: string;
  productId: string;
  productName: string;
  lineId: string;
  lineName: string;
  dailyTargetQty: number;
  outputQty: number;
  achievementPercent: number;
  /** Temporary row-level attendance flag; missing means present for older reports. */
  isPresent?: boolean;
  notes?: string;
}

export type ProductionAttendanceStatus = "present" | "absent";
export type ProductionAttendanceSource = "shift_workers" | "worker_outputs";

export interface ProductionAttendanceRecord {
  id?: string;
  tenantId?: string;
  reportId: string;
  reportCode?: string;
  date: string;
  lineId: string;
  productId: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  workerId?: string;
  workerName?: string;
  laborRole?: LineWorkerLaborRole;
  status: ProductionAttendanceStatus;
  source: ProductionAttendanceSource;
  quantityProduced?: number;
  workHours?: number;
  notes?: string;
  recordedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export type ProductionWorkerType = "production";

export interface ProductionWorkerStarRating {
  behavior: number;
  ethics: number;
  work: number;
  notes?: string;
  ratedBySupervisorId?: string;
  ratedBySupervisorName?: string;
  updatedAt?: unknown;
}

export type ProductionWorkerRatingReviewStatus =
  "pending" | "approved" | "rejected";

export interface ProductionWorkerManagementReview {
  status: ProductionWorkerRatingReviewStatus;
  reviewedById?: string;
  reviewedByName?: string;
  behavioralRating?: number;
  ethicalRating?: number;
  practicalRating?: number;
  notes?: string;
  reviewedAt?: unknown;
}

export interface ProductionWorkerRatingRecord {
  id?: string;
  tenantId?: string;
  workerId: string;
  workerName?: string;
  workerCode?: string;
  employeeId?: string;
  laborRole?: LineWorkerLaborRole;
  supervisorId: string;
  supervisorName?: string;
  date: string;
  period?: string;
  behavioralRating: number;
  ethicalRating: number;
  practicalRating: number;
  notes?: string;
  managementReview?: ProductionWorkerManagementReview;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductionWorker {
  id?: string;
  tenantId?: string;
  employeeId?: string;
  name: string;
  code: string;
  isActive: boolean;
  workerType: ProductionWorkerType;
  defaultLineId?: string;
  lineIds: string[];
  supervisorRatings?: Record<string, ProductionWorkerStarRating>;
  ratingRecords?: Record<string, ProductionWorkerRatingRecord>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductionLineWorkerAssignment {
  id?: string;
  tenantId?: string;
  lineId: string;
  workerId: string;
  laborRole?: LineWorkerLaborRole;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductionWorkerTarget {
  id?: string;
  tenantId?: string;
  workerId: string;
  productId: string;
  lineId?: string;
  dailyTargetQty: number;
  unit: "piece";
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type WorkerDailyAchievementStatus =
  | "achieved"
  | "below_target"
  | "over_target"
  | "absent"
  | "no_output"
  | "no_target"
  | "leave";

export interface WorkerDailyAchievement {
  workerId: string;
  date: string;
  lineId?: string;
  productId?: string;
  targetQty: number;
  outputQty: number;
  achievementPercent: number;
  status: WorkerDailyAchievementStatus;
  isPresent?: boolean;
  presentAssignments?: number;
  absentAssignments?: number;
}

export interface WorkerMonthlyAchievement {
  workerId: string;
  month: string;
  workingDays: number;
  /** Days in the period where the worker had a daily target (targetQty > 0). */
  targetDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  noOutputDays: number;
  achievedDays: number;
  belowTargetDays: number;
  overTargetDays: number;
  monthlyTarget: number;
  monthlyOutput: number;
  monthlyAchievement: number;
  attendanceRate: number;
  performanceScore: number;
  bonusEstimate: number;
  presentAssignments?: number;
  absentAssignments?: number;
}

/** Snapshot of a worker's daily target/output saved when a production report is stored. */
export interface WorkerDailyPerformanceLog {
  id?: string;
  tenantId?: string;
  reportId: string;
  reportCode?: string;
  workerId: string;
  workerName: string;
  workerCode?: string;
  employeeId?: string;
  date: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  targetQty: number;
  targetSource?:
    | "worker_product_line"
    | "worker_product"
    | "line_product"
    | "product_default"
    | "missing";
  outputQty: number;
  achievementPercent: number;
  isPresent?: boolean;
  status: WorkerDailyAchievementStatus;
  updatedAt?: unknown;
}

export interface WorkerPerformanceSummary extends WorkerMonthlyAchievement {
  id?: string;
  tenantId?: string;
  workerName?: string;
  workerCode?: string;
  employeeId?: string;
  updatedAt?: unknown;
}

export type ProductionBonusMethod =
  | "per_extra_unit"
  | "per_achievement_percent"
  | "fixed_tier"
  | "target_plus_extra";
export type ProductionBonusExtraMethod =
  "none" | "per_extra_unit" | "per_extra_achievement_percent";

export interface ProductionBonusSettings {
  enabled: boolean;
  method: ProductionBonusMethod;
  minimumAchievementPercent: number;
  /** Fixed amount paid once the worker reaches the minimum achievement threshold (typically 100%). */
  targetBonusAmount?: number;
  /** Used by target_plus_extra for amounts above the threshold. */
  extraBonusMethod?: ProductionBonusExtraMethod;
  bonusPerExtraUnit: number;
  bonusPerAchievementPercent: number;
  maxBonus: number;
}

export interface SupervisorBonusTier {
  fromPercent: number;
  toPercent?: number;
  payoutMultiplier: number;
}

export interface SupervisorBonusSettings {
  enabled: boolean;
  baseBonusAmount: number;
  supervisorMultiplier: number;
  workerContributionCapPercent: number;
  minimumAchievementPercent: number;
  maxBonus: number;
  tiers: SupervisorBonusTier[];
}

export interface ProductionWorkerPerformanceSettings {
  productionWorkerOutputEnabled: boolean;
  excludeWeeklyOff: boolean;
  excludeApprovedLeave: boolean;
  countAbsentAsZero: boolean;
  countNoReportAsZero: boolean;
  productionWorkerOutputMustMatchReportQty: boolean;
  achievementWarningThreshold: number;
}

export interface ProductionWorkerSettings {
  performance: ProductionWorkerPerformanceSettings;
  bonus: ProductionBonusSettings;
  supervisorBonus: SupervisorBonusSettings;
}

export interface ReportComponentScrapItem {
  materialId: string;
  materialName: string;
  quantity: number;
}

/** دورة توريد / باتش — خام أو تام */
export type SupplyCycleKind = "raw_material" | "finished_good";
export type SupplyCycleStatus = "draft" | "open" | "closed";

export interface SupplyCycle {
  id?: string;
  tenantId?: string;
  /** كود مسلسل تلقائي SC-YYYY-NNNN (Supply Cycle) */
  batchCode: string;
  kind: SupplyCycleKind;
  itemId: string;
  /** تسمية اختيارية (مثلاً رقم أوردر خارجي) */
  externalLabel?: string;
  periodStart: string;
  periodEnd: string;
  openingQty: number;
  receivedQty: number;
  consumedQty: number;
  status: SupplyCycleStatus;
  closedAt?: any;
  closedByUid?: string;
  /** لقطات عند الإقفال */
  closedWasteTotal?: number;
  closedRemaining?: number;
  createdAt?: any;
  createdByUid?: string;
  updatedAt?: any;
  updatedByUid?: string;
}

export type SupplyCycleWasteLineSource = "manual" | "production_report";

export interface SupplyCycleWasteLine {
  id?: string;
  tenantId?: string;
  cycleId: string;
  source: SupplyCycleWasteLineSource;
  reportId?: string;
  quantity: number;
  note?: string;
  createdAt?: any;
  createdByUid?: string;
}

export interface LineStatus {
  id?: string;
  lineId: string;
  currentProductId: string;
  targetTodayQty: number;
  isInjectionLine?: boolean;
  updatedAt?: any;
}

export type LineWorkerLaborRole =
  "production" | "packaging" | "quality" | "maintenance" | "external";

export interface LineWorkerAssignment {
  id?: string;
  permanentAssignmentId?: string;
  permanentWorkerId?: string;
  lineId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  laborRole?: LineWorkerLaborRole;
  /** Temporary daily attendance flag; missing means present for existing assignments. */
  isPresent?: boolean;
  assignedAt?: any;
  assignedBy?: string;
}

export type SupervisorLineAssignmentReason =
  "assign" | "reassign" | "remove" | "migrate";

export interface SupervisorLineAssignment {
  id?: string;
  tenantId?: string;
  lineId: string;
  supervisorId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  lineName?: string;
  supervisorName?: string;
  changedBy?: string;
  changedAt?: any;
  reason?: SupervisorLineAssignmentReason;
}

export type PlanPriority = "low" | "medium" | "high" | "urgent";
export type PlanStatus =
  "planned" | "in_progress" | "completed" | "paused" | "cancelled";
export type SmartStatus =
  "working" | "not_working" | "stopped" | "completed" | "cancelled";

export interface ProductionPlan {
  id?: string;
  productId: string;
  /** Optional legacy field — plans are product-scoped, not line-scoped. */
  lineId?: string;
  plannedQuantity: number;
  producedQuantity: number;
  startDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  estimatedDurationDays: number;
  avgDailyTarget: number;
  priority: PlanPriority;
  estimatedCost: number;
  actualCost: number;
  planType?: "finished_product" | "component_injection";
  /** Optional legacy field — not set from plan create/edit UI. */
  supervisorId?: string;
  shift?: ProductionReportShift;
  workOrderId?: string;
  remainingQuantity?: number;
  achievementPercent?: number;
  /** Missing means legacy/default behavior: the plan accepts direct unlinked report production. */
  acceptsProductionFromReports?: boolean;
  /**
   * When true, finished-product reports for this plan need an issued production issue.
   * When false, reports may save without an issue even if the company setting requires it.
   * When missing, inherit `planSettings.inventoryRouting.requireIssuedProductionIssueOnReport`.
   */
  requiresProductionIssue?: boolean;
  achievementExcluded?: boolean;
  achievementExclusionReason?: string;
  stopReason?: string;
  stoppedAt?: string;
  status: PlanStatus;
  createdBy: string;
  createdAt?: any;
}

export type ProductionPlanFollowUpStatus =
  "open" | "in_progress" | "resolved" | "cancelled";

export interface ProductionPlanFollowUp {
  id?: string;
  planId: string;
  productId: string;
  lineId: string;
  componentId: string;
  componentName: string;
  shortageQty: number;
  note?: string;
  status: ProductionPlanFollowUpStatus;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

// â”€â”€â”€ Work Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type WorkOrderStatus =
  "pending" | "in_progress" | "paused" | "completed" | "cancelled";
export type WorkOrderPauseReason = "manual";

export interface WorkOrderPauseWindow {
  startAt: any;
  endAt?: any;
  reason: WorkOrderPauseReason;
}

export interface WorkOrder {
  id?: string;
  workOrderNumber: string;
  planId?: string;
  productId: string;
  lineId: string;
  supervisorId: string;
  quantity: number;
  producedQuantity: number;
  maxWorkers: number;
  workHours?: number;
  startDate?: string;
  targetDate: string;
  estimatedDurationDays?: number;
  estimatedCost: number;
  actualCost: number;
  workOrderType?: "finished_product" | "component_injection";
  /**
   * When true, finished-product reports for this work order need an issued production issue.
   * When false, reports may save without an issue even if the company/plan setting requires it.
   * When missing, inherit the linked plan flag, then the company routing setting.
   */
  requiresProductionIssue?: boolean;
  status: WorkOrderStatus;
  notes?: string;
  breakStartTime?: string; // HH:mm
  breakEndTime?: string; // HH:mm
  workdayEndTime?: string; // HH:mm
  scanPauseWindows?: WorkOrderPauseWindow[];
  actualWorkersCount?: number;
  actualProducedFromScans?: number;
  actualWorkHours?: number;
  scanSummary?: WorkOrderLiveSummary;
  scanSessionClosedAt?: any;
  qualityStatus?: QualityStatus;
  qualitySummary?: WorkOrderQualitySummary;
  qualityReportCode?: string;
  qualityApprovedBy?: string;
  qualityApprovedAt?: any;
  createdBy: string;
  createdAt?: any;
  completedAt?: any;
}

export type WorkOrderScanAction = "IN" | "OUT";
export type WorkOrderScanSessionStatus = "open" | "closed";

export interface WorkOrderScanEvent {
  id?: string;
  workOrderId: string;
  lineId: string;
  productId: string;
  serialBarcode: string;
  employeeId?: string;
  action: WorkOrderScanAction;
  timestamp: any;
  scanDate: string; // YYYY-MM-DD (for realtime/day filters)
  sessionId: string;
  cycleSeconds?: number;
}

export interface WorkOrderScanSession {
  sessionId: string;
  serialBarcode: string;
  workOrderId: string;
  lineId: string;
  productId: string;
  employeeId?: string;
  inAt: any;
  outAt?: any;
  cycleSeconds?: number;
  status: WorkOrderScanSessionStatus;
}

export type QualityInspectionType = "final" | "ipqc";
export type QualityInspectionStatus =
  "pending" | "passed" | "failed" | "rework" | "approved" | "rejected";

export interface QualityInspection {
  id?: string;
  workOrderId: string;
  lineId: string;
  productId: string;
  sessionId?: string;
  serialBarcode?: string;
  type: QualityInspectionType;
  status: QualityInspectionStatus;
  inspectedBy: string;
  inspectedAt: any;
  approvedBy?: string;
  approvedAt?: any;
  notes?: string;
  attachments?: FileAttachmentMeta[];
}

export type QualityDefectSeverity = "low" | "medium" | "high" | "critical";

export interface QualityDefect {
  id?: string;
  workOrderId: string;
  inspectionId: string;
  lineId: string;
  productId: string;
  sessionId?: string;
  serialBarcode?: string;
  reasonCode: string;
  reasonLabel: string;
  severity: QualityDefectSeverity;
  quantity: number;
  status: "open" | "reworked" | "scrap" | "closed";
  createdBy: string;
  createdAt: any;
  notes?: string;
  attachments?: FileAttachmentMeta[];
}

export interface FileAttachmentMeta {
  imageUrl: string;
  storagePath: string;
  createdAt: string;
}

export interface QualityReasonCatalogItem {
  id?: string;
  code: string;
  labelAr: string;
  category: string;
  severityDefault: QualityDefectSeverity;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface QualityWorkerAssignment {
  id?: string;
  employeeId: string;
  qualityRole: "inspector" | "senior" | "lead" | "manager";
  activeLines?: string[];
  activeProducts?: string[];
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface QualityReworkOrder {
  id?: string;
  workOrderId: string;
  defectId: string;
  sessionId?: string;
  serialBarcode?: string;
  status: "open" | "in_progress" | "done" | "scrap";
  assignedTo?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface QualityCAPA {
  id?: string;
  workOrderId?: string;
  defectId?: string;
  reasonCode: string;
  title: string;
  actionPlan: string;
  ownerId: string;
  dueDate?: string;
  status: "open" | "in_progress" | "done" | "closed";
  createdAt?: any;
  updatedAt?: any;
}

export interface QualityInspectionTemplate {
  id: string;
  name: string;
  productId?: string;
  lineId?: string;
  checklist: string[];
  criticalChecks: string[];
  isActive: boolean;
}

export interface QualitySamplingPlan {
  id: string;
  productId?: string;
  lineId?: string;
  frequencyMinutes: number;
  sampleSize: number;
  isActive: boolean;
}

export interface QualityReworkPolicySettings {
  autoCreateReworkOnFail: boolean;
  allowDirectScrap: boolean;
  requireCapaForCritical: boolean;
}

export interface QualityPrintTemplateSettings {
  headerText: string;
  footerText: string;
  showSignatureInspector: boolean;
  showSignatureSupervisor: boolean;
  showSignatureQualityManager: boolean;
}

export interface QualityPolicySettings {
  closeRequiresQualityApproval: boolean;
}

export interface QualitySettingsDocument {
  closeRequiresQualityApproval: boolean;
  inspectionTemplates: QualityInspectionTemplate[];
  samplingPlans: QualitySamplingPlan[];
  reworkPolicies: QualityReworkPolicySettings;
  printTemplates: QualityPrintTemplateSettings;
}

export interface WorkOrderLiveSummary {
  completedUnits: number;
  inProgressUnits: number;
  activeWorkers: number;
  avgCycleSeconds: number;
  lastScanAt?: any;
}

export type QualityStatus =
  "pending" | "approved" | "rejected" | "not_required";

export interface WorkOrderQualitySummary {
  inspectedUnits: number;
  passedUnits: number;
  failedUnits: number;
  reworkUnits: number;
  defectRate: number;
  firstPassYield: number;
  lastInspectionAt?: any;
  topDefectReason?: string;
}

// â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type NotificationType =
  | "production_report"
  | "work_order_assigned"
  | "work_order_updated"
  | "work_order_completed"
  | "production_plan_assigned"
  | "quality_report_created"
  | "quality_report_updated"
  | "report_compliance_daily"
  | "manual_broadcast"
  | "daily_report_missing"
  | "inventory_transfer_pending";

export interface AppNotification {
  id?: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceId: string;
  isRead: boolean;
  createdAt?: any;
}

export type PresenceState = "online" | "idle" | "offline";

export interface UserPresence {
  id?: string; // userId
  userId: string;
  tenantId?: string;
  employeeId?: string;
  userEmail?: string;
  displayName?: string;
  roleId?: string;
  currentRoute?: string;
  currentModule?: string;
  lastAction?: string;
  lastActionAt?: any;
  lastHeartbeatAt?: any;
  state?: PresenceState;
  updatedAt?: any;
}

// â”€â”€â”€ Cost Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CostCenter {
  id?: string;
  tenantId?: string;
  code?: string;
  name: string;
  type: "indirect" | "direct";
  /** General-ledger classification; production allocation fields remain optional consumers. */
  accountingCategory?:
    | "production"
    | "repair"
    | "warehouse"
    | "branch"
    | "administration"
    | "sales"
    | "other";
  parentId?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  allowPosting?: boolean;
  /** Explicit opt-in/out for the production costing engine. Missing means legacy-compatible. */
  productionCostingEnabled?: boolean;
  /** How this center reaches a cost object; collect_only never reaches production automatically. */
  postingMode?: "direct_assignment" | "driver_allocation" | "collect_only";
  /** Prevents a repair/admin/shared center from entering production unless explicitly configured. */
  costObjectScope?: "production" | "repair" | "shared" | "none";
  allocationDriver?:
    | "machine_hours"
    | "labor_hours"
    | "good_units"
    | "floor_area"
    | "fixed_percentage"
    | "kwh";
  allocationBasis?: "line_percentage" | "by_qty";
  productScope?: "all" | "selected" | "category";
  productIds?: string[];
  productCategories?: string[];
  valueSource?: "manual" | "salaries" | "combined";
  employeeScope?: "selected" | "department";
  employeeIds?: string[];
  employeeDepartmentIds?: string[];
  manualAdjustment?: number;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface CostCenterValue {
  id?: string;
  costCenterId: string;
  month: string;
  amount: number;
  /** Amount used by live costing before the period's source invoice/payroll is final. */
  provisionalAmount?: number;
  /** Approved source amount used by month close. */
  actualAmount?: number;
  costingStatus?: "provisional" | "actual" | "closed";
  revision?: number;
  sourceReference?: string;
  manualAmount?: number;
  salariesAmount?: number;
  valueSource?: "manual" | "salaries" | "combined";
  employeeScopeSnapshot?: "selected" | "department";
  employeeIdsSnapshot?: string[];
  employeeDepartmentIdsSnapshot?: string[];
  productScopeSnapshot?: "all" | "selected" | "category";
  productIdsSnapshot?: string[];
  productCategoriesSnapshot?: string[];
  allocationBasisSnapshot?: "line_percentage" | "by_qty";
  workingDays?: number;
}

export interface CostAllocation {
  id?: string;
  costCenterId: string;
  month: string;
  allocations: { lineId: string; percentage: number }[];
  productScope?: "all" | "selected" | "category";
  productIds?: string[];
  productCategories?: string[];
  allocationBasis?: "line_percentage" | "by_qty";
}

export interface LaborSettings {
  id?: string;
  hourlyRate: number;
  cnyToEgpRate?: number;
}

// â”€â”€â”€ Assets & Depreciation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AssetDepreciationMethod = "straight_line" | "declining_balance";
export type AssetStatus = "active" | "inactive" | "disposed";

export interface Asset {
  id?: string;
  name: string;
  code: string;
  category: string;
  centerId: string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: AssetDepreciationMethod;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  currentValue: number;
  status: AssetStatus;
  notes?: string;
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
}

export interface AssetDepreciation {
  id?: string;
  assetId: string;
  period: string; // YYYY-MM
  depreciationAmount: number;
  accumulatedDepreciation: number;
  bookValue: number;
  createdAt?: any;
}

export interface AssetDepreciationRunResult {
  period: string;
  processedAssets: number;
  createdEntries: number;
  skippedEntries: number;
}

// â”€â”€â”€ Monthly Production Cost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MonthlyProductionCost {
  id?: string;
  productId: string;
  month: string; // "YYYY-MM"
  totalProducedQty: number;
  directCost?: number;
  indirectCost?: number;
  indirectCenterSnapshots?: Array<{
    costCenterId: string;
    centerName: string;
    valueSource: "manual" | "salaries" | "combined";
    allocationBasis: "line_percentage" | "by_qty";
    productScope: "all" | "selected" | "category";
    productIds: string[];
    productCategories: string[];
    employeeScope: "selected" | "department";
    employeeIds: string[];
    employeeDepartmentIds: string[];
    manualAmount: number;
    salariesAmount: number;
    resolvedAmount: number;
  }>;
  totalProductionCost: number;
  averageUnitCost: number; // totalProductionCost / totalProducedQty
  /** Full-cost migration fields; legacy totals above remain conversion cost. */
  materialCost?: number;
  packagingCost?: number;
  fullManufacturingCost?: number;
  fullManufacturingAverageUnitCost?: number;
  fullCostedQty?: number;
  fullCostCoveragePct?: number;
  fullCostStatus?: "missing" | "partial" | "provisional" | "actual";
  costingStatus?: "provisional" | "actual" | "closed";
  revision?: number;
  costingPolicySnapshot?: CostingPolicySettings;
  isClosed: boolean;
  calculatedAt?: any;
}

export interface CostingPolicySettings {
  legacyConversionEnabled: boolean;
  fullManufacturingEnabled: boolean;
  primaryCostView: "legacy_conversion" | "full_manufacturing";
  includeDirectLabor: boolean;
  includeSupervisor: boolean;
  includeIndirectCenters: boolean;
  includeDepreciation: boolean;
  includeActualMaterials: boolean;
  includePackaging: boolean;
  allowBomEstimateFallback: boolean;
  allowLinePercentageAllocation: boolean;
  allowQuantityAllocation: boolean;
  dailyAllocationDriver: "work_hours" | "quantity";
  fallbackToQuantity: boolean;
  prorateOpenPeriod: boolean;
  allowProvisionalValues: boolean;
  requireActualBeforeClose: boolean;
  requireFullAllocationBeforeClose: boolean;
  freezeClosedSnapshots: boolean;
}

// â”€â”€â”€ System Settings (system_settings/{tenantId}) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface WidgetConfig {
  id: string;
  visible: boolean;
}

export type CustomWidgetType = "kpi" | "text" | "quick_link";

export interface CustomWidgetConfig {
  id: string;
  dashboardKey: string;
  type: CustomWidgetType;
  label: string;
  icon: string;
  visible: boolean;
  order: number;
  permission?: string;
  description?: string;
  value?: string;
  unit?: string;
  target?: string;
}

export interface AlertSettings {
  wasteThreshold: number;
  costVarianceThreshold: number;
  efficiencyThreshold: number;
  planDelayDays: number;
  overProductionThreshold: number;
}

export interface KPIThreshold {
  good: number;
  warning: number;
}

export type PaperSize = "a4" | "a5" | "thermal";
export type PaperOrientation = "portrait" | "landscape";
export type PrintThemePreset =
  "erpnext" | "classic" | "high_contrast" | "minimal";

/** Allowlisted Arabic-capable print fonts (loaded in index.html). */
export type PrintFontFamily =
  | "Cairo"
  | "Tajawal"
  | "Noto Sans Arabic"
  | "IBM Plex Sans Arabic"
  | "Tahoma"
  | "Arial";

/** Document kinds with per-template field visibility + custom lines (print v1). */
export type PrintDocumentTypeId =
  | "productionReport"
  | "repairSalesInvoice"
  | "stockTransfer"
  | "stockReceipt"
  | "stockIssue"
  | "itemCard"
  | "accountingReport"
  | "qualityReport"
  | "payslip"
  | "suppliesReceipt"
  | "repairPayment"
  | "repairSpareIssue"
  | "repairSparePartsCount"
  | "warehouseStockCount"
  | "repairTreasuryMonthly"
  | "routingExecution"
  | "productionWorkerReport"
  | "missingComponentsReport"
  | "supervisorPerformance"
  | "productBomCountCard"
  | "repairJobReceipt"
  | "repairJobCard"
  | "repairDeliveryReceipt"
  | "catalogProductDetail"
  | "workOrder"
  | "productionIssue"
  | "departmentConsumableIssue"
  | "sparePartsReplenishment"
  | "itemBarcodeLabel"
  | "locationBarcodeLabel";

export type PrintCustomLine = {
  id: string;
  text: string;
  enabled: boolean;
};

/** Per-document overrides on top of shared print chrome (logo / paper / theme). */
export type PrintDocumentOverride = {
  /** Empty / omitted → use global headerText */
  headerText?: string;
  /** Empty / omitted → use global footerText */
  footerText?: string;
  /** Up to 5 freeform lines rendered on the print surface */
  customLines?: PrintCustomLine[];
  /** Field keys from printDocumentRegistry → visible */
  fields?: Record<string, boolean>;
};

export interface PrintTemplateSettings {
  logoUrl: string;
  headerText: string;
  footerText: string;
  primaryColor: string;
  printThemePreset?: PrintThemePreset;
  textColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
  tableHeaderBgColor?: string;
  tableHeaderTextColor?: string;
  tableRowAltBgColor?: string;
  accentSuccessColor?: string;
  accentWarningColor?: string;
  accentDangerColor?: string;
  paperSize: PaperSize;
  orientation: PaperOrientation;
  copies: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  printBackground: boolean;
  decimalPlaces: number;
  /** Print body font family (shared across document types). */
  printFontFamily?: PrintFontFamily;
  /** Base body size in pt (8–14). Thermal templates scale down slightly. */
  printFontSizePt?: number;
  /** @deprecated Prefer documents.productionReport.fields.waste — kept for migrate + sync */
  showWaste: boolean;
  /** @deprecated Prefer documents.productionReport.fields.employee */
  showEmployee: boolean;
  /** @deprecated Prefer documents.productionReport.fields.qrCode */
  showQRCode: boolean;
  /** @deprecated Prefer documents.productionReport.fields.costs */
  showCosts: boolean;
  /** @deprecated Prefer documents.productionReport.fields.workOrder */
  showWorkOrder: boolean;
  /** @deprecated Prefer documents.productionReport.fields.sellingPrice */
  showSellingPrice: boolean;
  /** Per-document visibility + custom copy (print control framework v1) */
  documents?: Partial<Record<PrintDocumentTypeId, PrintDocumentOverride>>;
}

/** Nested inventory warehouse routing (canonical after migrateInventoryRoutingV1). */
export interface InventoryRoutingSettings {
  rawMaterialWarehouseId?: string;
  decomposedWarehouseId?: string;
  /** BOM components issued for production (صالة الإنتاج). */
  productionFloorWarehouseId?: string;
  /** Finished goods awaiting packaging supervisor receipt (تحت التسليم). */
  productionWipWarehouseId?: string;
  /** Accepted finished goods awaiting packaging (بانتظار التغليف). */
  finishedStagingWarehouseId?: string;
  finalProductWarehouseId?: string;
  packagingSourceWarehouseId?: string;
  packagingTargetWarehouseId?: string;
  wasteWarehouseId?: string;
  autoTransferProductionToFinished?: boolean;
  autoTransferFinishedToFinal?: boolean;
  requireApprovalForProductionEntry?: boolean;
  requireApprovalForAutoTransfers?: boolean;
  /** Require packaging supervisor to confirm actual received qty before staging. */
  requirePackagingHandoverReceipt?: boolean;
  /**
   * When true, saving a production report deducts BOM components directly
   * (without a production issue order). Prefer off + صرف إنتاج.
   */
  autoConsumeBomOnProductionReport?: boolean;
  /**
   * When true (default), finished-product report creation/posting requires an
   * issued/approved production issue for the work order / plan.
   * Does not auto-consume BOM — use صرف إنتاج separately.
   */
  requireIssuedProductionIssueOnReport?: boolean;
}

export interface PlanSettings {
  allowMultipleActivePlans: boolean;
  allowReportWithoutPlan: boolean;
  allowOverProduction: boolean;
  autoClosePlan: boolean;
  /** @deprecated Use planSettings.inventoryRouting — kept for fallback reads */
  defaultProductionWarehouseId?: string;
  /** @deprecated Use planSettings.inventoryRouting */
  rawMaterialWarehouseId?: string;
  /** @deprecated Use planSettings.inventoryRouting.decomposedWarehouseId */
  decomposedSourceWarehouseId?: string;
  /** @deprecated Use planSettings.inventoryRouting.finishedStagingWarehouseId */
  finishedReceiveWarehouseId?: string;
  /** @deprecated Use planSettings.inventoryRouting.wasteWarehouseId */
  wasteReceiveWarehouseId?: string;
  /** @deprecated Use planSettings.inventoryRouting.finalProductWarehouseId */
  finalProductWarehouseId?: string;
  /** Canonical warehouse routing configuration */
  inventoryRouting?: InventoryRoutingSettings;
  /** Central report creation/editing behavior switches. */
  reportBehavior?: ReportBehaviorSettings;
  /** ISO timestamp when inventoryRouting V1 migration completed */
  inventoryRoutingMigratedAt?: string;
  enablePackagingStockTransfer?: boolean;
  packagingSourceWarehouseId?: string;
  packagingTargetWarehouseId?: string;
  transferApprovalPermission?: string;
  transferDisplayUnit?: "piece" | "carton";
  hrApproverUserIds?: string[];
  /** First configured approver for production-created leave/loan/penalty requests. */
  productionRequestFirstApproverEmployeeId?: string;
  /** Optional final configured approver for production-created leave/loan/penalty requests. */
  productionRequestFinalApproverEmployeeId?: string;
  /** View-only employee observers for production-created leave/loan/penalty requests. */
  productionRequestObserverEmployeeIds?: string[];
  /** Linked user ids for production request observers, used by Firestore rules. */
  productionRequestObserverUserIds?: string[];
  allowNegativeDecomposedStock?: boolean;
  allowNegativeFinishedTransferStock?: boolean;
  requireFinishedStockApprovalForReports?: boolean;
  maxWasteThreshold: number;
  efficiencyCalculationMode: "standard" | "weighted";
  averageProductionMode: "daily" | "weekly" | "monthly";
  injectionRawMaterialCategoryKeywords: string;
  /** بادئة كود دورة التوريد (مثال SC) — الصيغة PREFIX-YYYY-NNNN */
  supplyCycleBatchCodePrefix?: string;
  /** ISO timestamp when manufacturing materials/BOM migration completed for this tenant */
  manufacturingMigratedAt?: string;
  /** ISO timestamp when product categoryId backfill (v1) completed for this tenant */
  categoryMigrationV1At?: string;
  /** When true, material requirements for plans use planned − produced qty */
  materialRequirementsUseRemainingQty?: boolean;
  /** Auto-run material requirement explosion after plan create/update */
  autoGenerateMaterialRequirements?: boolean;
  /** Role IDs that receive operational notifications (transfers, missing reports, etc.) */
  opsNotifyRoleIds?: string[];
  /** Pending transfer age (days) before SLA warning in Ops Inbox */
  transferSlaWarningDays?: number;
  /** Manual stock movement qty threshold for exception board */
  inventoryExceptionManualThreshold?: number;
  /**
   * سياسة اعتماد صرف مستهلكات الأقسام (إعداد عام للشركة):
   * - direct: مسودة → صرف فوري
   * - required: مسودة → تقديم → اعتماد → صرف
   */
  departmentConsumableIssueApprovalMode?: "direct" | "required";
  /**
   * سياسة اعتماد صرف قطع غيار مراكز الصيانة:
   * - direct: مسودة → صرف فوري
   * - required: مسودة → تقديم → اعتماد → صرف
   */
  repairSpareIssueApprovalMode?: "direct" | "required";
  /**
   * يوم بداية شهر التشغيل (1–28). مثال: 26 يعني الفترة من ٢٦ إلى ٢٦ الشهر التالي (نهاية حصرية).
   * يُستخدم لحساب الهدف اليومي = كمية الخطة ÷ أيام الشغل في الفترة.
   */
  operationalMonthStartDay?: number;
  /**
   * عند التفعيل وبدون تارجت يومي يدوي: الهدف اليومي = كمية الخطة ÷ أيام الشغل في فترة التشغيل.
   */
  useOperationalPeriodDailyTarget?: boolean;

  /** بادئة وأطوال الأكواد التلقائية للمنتجات / المواد الخام / التصنيفات */
  productCodePrefix?: string;
  productCodePadding?: number;
  rawMaterialCodePrefix?: string;
  rawMaterialCodePadding?: number;
  categoryCodePrefix?: string;
  categoryCodePadding?: number;
}

export interface ReportBehaviorSettings {
  operationalDayStartHour?: number;
  preventDuplicateReports?: boolean;
  requireWorkHoursOnReports?: boolean;
  requirePositiveQuantityOnReports?: boolean;
  requireLaborForFinishedReports?: boolean;
  requireInjectionShift?: boolean;
  restrictPackagingReportsToPackagingLines?: boolean;
  allowPackagingLaborOptional?: boolean;
  autoLinkSupplyCycleOnReportSave?: boolean;
  autoApplyInventoryOnReportSave?: boolean;
  /**
   * When true, Quick Action requires selecting an active work order directed
   * to the report supervisor before save.
   */
  requireWorkOrderOnQuickAction?: boolean;
  /** @deprecated Report progress is always reconciled with matching plans/work orders. */
  autoPostReportToPlanAndWorkOrder?: boolean;
}

export const DEFAULT_PRODUCTION_WORKER_PERFORMANCE_SETTINGS: ProductionWorkerPerformanceSettings =
  {
    productionWorkerOutputEnabled: false,
    excludeWeeklyOff: true,
    excludeApprovedLeave: true,
    countAbsentAsZero: true,
    countNoReportAsZero: true,
    productionWorkerOutputMustMatchReportQty: false,
    achievementWarningThreshold: 80,
  };

export const DEFAULT_PRODUCTION_BONUS_SETTINGS: ProductionBonusSettings = {
  enabled: false,
  method: "target_plus_extra",
  minimumAchievementPercent: 100,
  targetBonusAmount: 0,
  extraBonusMethod: "per_extra_unit",
  bonusPerExtraUnit: 0,
  bonusPerAchievementPercent: 0,
  maxBonus: 0,
};

export const DEFAULT_SUPERVISOR_BONUS_SETTINGS: SupervisorBonusSettings = {
  enabled: false,
  baseBonusAmount: 0,
  supervisorMultiplier: 1.5,
  workerContributionCapPercent: 120,
  minimumAchievementPercent: 70,
  maxBonus: 0,
  tiers: [
    { fromPercent: 70, toPercent: 84.99, payoutMultiplier: 0.75 },
    { fromPercent: 85, toPercent: 94.99, payoutMultiplier: 1 },
    { fromPercent: 95, toPercent: 109.99, payoutMultiplier: 1.2 },
    { fromPercent: 110, payoutMultiplier: 1.5 },
  ],
};

export const DEFAULT_PRODUCTION_WORKER_SETTINGS: ProductionWorkerSettings = {
  performance: DEFAULT_PRODUCTION_WORKER_PERFORMANCE_SETTINGS,
  bonus: DEFAULT_PRODUCTION_BONUS_SETTINGS,
  supervisorBonus: DEFAULT_SUPERVISOR_BONUS_SETTINGS,
};

// â”€â”€â”€ General Settings (Branding, Theme, Dashboard Display, Alert Toggles) â”€â”€â”€â”€

export interface BrandingSettings {
  factoryName: string;
  logoUrl: string;
  currency: string;
  timezone: string;
}

export type ThemeMode = "light" | "dark" | "auto";
export type UIDensity = "comfortable" | "compact";

export type SidebarIconStyle = "colorful" | "primary" | "muted";

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  backgroundColor: string;
  cssVars?: Record<string, string>;
  darkMode: ThemeMode;
  baseFontFamily: string;
  baseFontSize: number;
  borderRadius: number;
  density: UIDensity;
  sidebarIconStyle: SidebarIconStyle;
  textColor?: string;
  mutedTextColor?: string;
  /** ط¹ط±ط¶ ط£ظ‚طµظ‰ ظ„ط­ط§ظˆظٹط© ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ط±ط¦ظٹط³ظٹ (ظ‚ظٹظ…ط© CSSطŒ ظ…ط«ظ„ 1536px ط£ظˆ 100%). */
  contentMaxWidth?: string;
  /**
   * طھط®طµظٹطµ ط¹ط±ط¶ ط§ظ„ظ…ط­طھظˆظ‰ ط­ط³ط¨ ط¨ط§ط¯ط¦ط© ط§ظ„ظ…ط³ط§ط± (ظ…ظپطھط§ط­ = ط¨ط¯ط§ظٹط© ط§ظ„ظ…ط³ط§ط±طŒ ظ‚ظٹظ…ط© = max-width CSS).
   * ظ…ط«ط§ظ„: { "/inventory": "1200px" }
   */
  pageLayoutOverrides?: Record<string, string>;
}

export interface DashboardDisplaySettings {
  showCostWidgets: boolean;
  showAlertsWidget: boolean;
  widgetsPerRow: number;
  enableDragReorder: boolean;
}

export interface AlertToggleSettings {
  enablePlanDelayAlert: boolean;
  enableCapacityAlert: boolean;
  enableCostVarianceAlert: boolean;
}

export type QuickActionColor =
  "primary" | "emerald" | "amber" | "rose" | "violet" | "slate";
export type QuickActionType = "navigate" | "export_excel";
export type ExportImportButtonVariant = "primary" | "secondary" | "outline";

export interface QuickActionItem {
  id: string;
  label: string;
  icon: string;
  color: QuickActionColor;
  actionType: QuickActionType;
  target?: string;
  permission?: string;
  order: number;
}

export interface ExportImportPageControl {
  exportEnabled: boolean;
  importEnabled: boolean;
  exportVariant: ExportImportButtonVariant;
  importVariant: ExportImportButtonVariant;
}

export interface ExportImportSettings {
  pages: Record<string, ExportImportPageControl>;
}

export interface OperationPathControl {
  /** Master switch for the business operation. Missing keeps backward-compatible enabled behavior. */
  enabled?: boolean;
  /** Independent switches for known UI/application entry paths. Missing paths remain enabled. */
  paths?: Record<string, boolean>;
}

export interface OperationPathSettings {
  operations?: Record<string, OperationPathControl>;
}

export interface AttendanceIntegrationSettings {
  watchFolderPath: string;
  watchFolderEnabled: boolean;
  importFilePattern: string;
  watchFactoryId?: string;
  shiftStartTime: string;
  singlePunchDefaultSplitTime?: string;
  workingMinutesPerDay: number;
  lateGraceMinutes: number;
  overtimeThresholdMinutes: number;
}

/** ط¥ط¹ط¯ط§ط¯ط§طھ ط§ط®طھظٹط§ط±ظٹط© ظ„ط¹ط²ظ„ طµظ„ط§ط­ظٹط§طھ ط§ظ„طµظٹط§ظ†ط© ط­ط³ط¨ ط§ظ„ظپط±ط¹ (طھظڈظ‚ط±ط£ ظ…ظ† system_settings ط¹ظ†ط¯ ط§ظ„طھظˆظپط±). */
export interface RepairAccessSettings {
  /** ظ…ط¯ظٹط± ظپط±ط¹ ظˆط§ط­ط¯ ظ…ظ‚ط§ط¨ظ„ ظ…ط¯ظٹط± ط¹ظ„ظ‰ ظƒظ„ ظ…ط±ط§ظƒط² ط§ظ„طµظٹط§ظ†ط© */
  managerScope?: "branch" | "centers";
}

/** Semantic role binding a status id to an action-driven workflow step. */
export type RepairStatusRole =
  | 'intake'
  | 'in_diagnosis'
  | 'diagnosis'
  | 'estimate_review'
  | 'awaiting_customer'
  | 'awaiting_parts'
  | 'in_repair'
  | 'ready_delivery'
  | 'delivered'
  | 'cancelled'
  | 'unrepairable'
  | 'none';

export interface RepairWorkflowSettings {
  /** حالات ديناميكية قابلة للإدارة من إعدادات الصيانة */
  statuses?: Array<{
    id: string;
    label: string;
    color?: string;
    order?: number;
    isTerminal?: boolean;
    isEnabled?: boolean;
    /** الدور في المسار الأكشن-درايفن (تشخيص / تقدير / موافقة …) */
    role?: RepairStatusRole;
  }>;
  /** الحالة الافتراضية عند إنشاء طلب جديد */
  initialStatusId?: string;
  /** حالات تعتبر مفتوحة في التقارير والإحصائيات */
  openStatusIds?: string[];
  /** Optional: which status ids set assignedAt; if omitted, client uses built-in defaults */
  assignmentTriggerStatusIds?: string[];
}

export interface RepairDefaultsSettings {
  /** الضمان الافتراضي عند إنشاء الطلب */
  defaultWarranty?: "none" | "3months" | "6months";
  /** الحد الأدنى الافتراضي لمخزون قطع الغيار */
  defaultMinStock?: number;
  /** SLA افتراضي بالساعات */
  defaultSlaHours?: number;
}

/** إكسسوارات قابلة للاختيار عند استلام الجهاز */
export interface RepairAccessoryCatalogItem {
  id: string;
  label: string;
  enabled?: boolean;
  /**
   * فئات المنتجات التي يظهر معها هذا الإكسسوار.
   * قائمة فارغة/غير موجودة = يظهر لكل الفئات (توافق خلفي).
   */
  categoryIds?: string[];
}

/** خدمات إصلاح بأسعار ثابتة يضبطها أدمن الصيانة */
export interface RepairServiceCatalogItem {
  id: string;
  name: string;
  price: number;
  /** Internal standard cost used for warranty analytics; never exposed to technicians. */
  internalCost?: number;
  enabled?: boolean;
}

export interface RepairTreasuryAutoCloseSettings {
  enabled?: boolean;
  mode?: "scheduled_midnight";
  timezone?: string;
  blockOperationsIfPrevDayOpen?: boolean;
}

export interface RepairTreasurySettings {
  autoClose?: RepairTreasuryAutoCloseSettings;
}

/** سياسات التحصيل والتسليم من شاشة الطلب */
export interface RepairPaymentsUiSettings {
  /** إظهار زر «تحصيل جزئي / مبلغ مخصص» على شاشة الطلب. الافتراضي: مفعّل */
  allowPartialCollection?: boolean;
}

export interface RepairUnrepairableReason {
  id: string;
  label: string;
  enabled?: boolean;
}

export interface RepairSettings {
  access?: RepairAccessSettings;
  workflow?: RepairWorkflowSettings;
  defaults?: RepairDefaultsSettings;
  treasury?: RepairTreasurySettings;
  payments?: RepairPaymentsUiSettings;
  /** قائمة الإكسسوارات للاختيار عند الاستلام */
  accessoriesCatalog?: RepairAccessoryCatalogItem[];
  /** أنواع خدمات الإصلاح وأسعارها (أدمن الصيانة فقط) */
  serviceCatalog?: RepairServiceCatalogItem[];
  /** أسباب قياسية لقرار عدم قابلية الإصلاح، لاستخدامها في التشغيل والتحليل. */
  unrepairableReasons?: RepairUnrepairableReason[];
}

export interface SystemSettings {
  /**
   * Logical path after tenant prefix for the default home screen.
   * Empty/undefined keeps legacy HomeDashboardRouter behavior.
   */
  defaultHomeLogicalPath?: string;
  dashboardWidgets: Record<string, WidgetConfig[]>;
  customDashboardWidgets?: CustomWidgetConfig[];
  alertSettings: AlertSettings;
  kpiThresholds: Record<string, KPIThreshold>;
  printTemplate: PrintTemplateSettings;
  planSettings: PlanSettings;
  costMonthlyWorkingDays?: Record<string, number>;
  costingPolicy: CostingPolicySettings;
  branding?: BrandingSettings;
  theme?: ThemeSettings;
  dashboardDisplay?: DashboardDisplaySettings;
  alertToggles?: AlertToggleSettings;
  quickActions?: QuickActionItem[];
  exportImport?: ExportImportSettings;
  /** Tenant-scoped controls for business operations that have multiple entry paths. */
  operationPaths?: OperationPathSettings;
  attendanceIntegration?: AttendanceIntegrationSettings;
  productionWorkerSettings?: ProductionWorkerSettings;
  /** ط£ظ‚ظ„ ط¥طµط¯ط§ط± ط¹ظ…ظٹظ„ ظ…ط³ظ…ظˆط­ (طµظٹط؛ط© x.y.z) ط¹ظ†ط¯ طھظپط¹ظٹظ„ forceClientUpdate */
  minimumClientVersion?: string;
  /** ط¹ظ†ط¯ true ظ…ط¹ minimumClientVersion ط£ظ‚ظ„ ظ…ظ† ط¥طµط¯ط§ط± ط§ظ„ط¨ظ†ط§ط،طŒ ظٹظڈظ…ظ†ط¹ ط§ط³طھط®ط¯ط§ظ… ط§ظ„طھط·ط¨ظٹظ‚ ط­طھظ‰ ط§ظ„طھط­ط¯ظٹط« */
  forceClientUpdate?: boolean;
  /** ط±ط³ط§ظ„ط© طھط¸ظ‡ط± ط¹ظ„ظ‰ ط´ط§ط´ط© ط§ظ„طھط­ط¯ظٹط« ط§ظ„ط¥ط¬ط¨ط§ط±ظٹ */
  clientUpdateMessageAr?: string;
  clientUpdateMessageEn?: string;
  /** ط¹ط²ظ„ ط¨ظٹط§ظ†ط§طھ ط§ظ„طµظٹط§ظ†ط©: ظ†ط·ط§ظ‚ ط§ظ„ظ…ط¯ظٹط± ظˆط؛ظٹط±ظ‡ (ط§ط®طھظٹط§ط±ظٹ) */
  repairAccess?: RepairAccessSettings;
  /** ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طµظٹط§ظ†ط© ط§ظ„ظ…ط¬ظ…ط¹ط© (ظˆطµظˆظ„ + ط³ظٹط± ط¹ظ…ظ„ + ط§ظپطھط±ط§ط¶ظٹط§طھ) */
  repairSettings?: RepairSettings;
}

// â”€â”€â”€ Multi-tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Product packs enabled for a tenant — see `lib/activityPacks.ts`. */
export type TenantActivityPackId = "manufacturing" | "repair";

export interface FirestoreTenant {
  id?: string;
  slug: string;
  name: string;
  phone?: string;
  address?: string;
  theme?: ThemeSettings;
  /**
   * Enabled activity packs (module-apps).
   * Missing / empty → treated as manufacturing + repair (non-breaking default).
   */
  activityPacks?: TenantActivityPackId[];
  status: "pending" | "active" | "suspended";
  createdAt?: any;
  approvedAt?: any;
  approvedBy?: string;
}

export interface TenantSlugDoc {
  tenantId: string;
}

export interface PendingTenant {
  id?: string;
  slug: string;
  name: string;
  phone?: string;
  address?: string;
  adminEmail: string;
  adminDisplayName: string;
  requestedAt?: any;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  adminUid?: string;
}

// â”€â”€â”€ Dynamic Roles & Permissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** @deprecated use FirestoreRole + dynamic permissions instead */
export type UserRole =
  "admin" | "factory_manager" | "hall_supervisor" | "supervisor";

/** Stable key for defaults and Cloud Functions (e.g. admin, factory_manager) */
export type FirestoreRoleKey =
  | "admin"
  | "factory_manager"
  | "hall_supervisor"
  | "supervisor"
  | "hr_manager"
  | "accountant"
  | "materials_warehouse"
  | "spare_parts_central_warehouse"
  | "maintenance_center_warehouse"
  | "inventory_viewer"
  | "repair_reception"
  | "repair_technician";

export interface FirestoreRole {
  id?: string;
  name: string;
  color: string;
  permissions: Record<string, boolean>;
  tenantId?: string;
  roleKey?: FirestoreRoleKey;
}

export interface FirestoreUser {
  id?: string;
  email: string;
  displayName: string;
  code?: string;
  roleId: string;
  role?: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  isActive: boolean;
  /**
   * When set, inventory module pages are limited to this warehouse
   * (balances, movements, transfers, approvals involving this warehouse).
   * For maintenance_center warehouses, Firestore also treats this bind as
   * access to the linked repair branch (spare parts / jobs scope).
   */
  inventoryWarehouseId?: string | null;
  /** Primary repair / service-center branch for this user (ADR-004). */
  repairBranchId?: string;
  /** Optional multi-branch repair scope. */
  repairBranchIds?: string[];
  notifications?: {
    productionReports?: boolean;
    workOrderAlerts?: boolean;
    stockAlerts?: boolean;
  };
  uiPreferences?: {
    /** UI language preference stored per user. */
    language?: "ar" | "en";
    [key: string]: unknown;
  };
  createdAt?: any;
  createdBy?: string;
}
