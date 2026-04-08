
export enum ProductionLineStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  IDLE = 'idle',
  WARNING = 'warning',
  INJECTION = 'injection',
}

// â”€â”€â”€ UI Types (consumed by components â€” do NOT change) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ProductionLine {
  id: string;
  name: string;
  code: string;
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
  stockLevel: number;
  stockStatus: 'available' | 'low' | 'out';
  openingStock: number;
  totalProduction: number;
  avgDailyProduction: number;
  wasteUnits: number;
  avgAssemblyTime: number;
  imageUrl?: string;
}

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'daily';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'ط¯ظˆط§ظ… ظƒط§ظ…ظ„',
  part_time: 'ط¯ظˆط§ظ… ط¬ط²ط¦ظٹ',
  contract: 'ط¹ظ‚ط¯',
  daily: 'ظٹظˆظ…ظٹ',
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
  shiftType?: 'shift1' | 'shift2' | 'shift3' | 'flexible';
  workDays?: number[];
}

// â”€â”€â”€ Firestore Document Types (match collection schemas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FirestoreProduct {
  id?: string;
  name: string;
  model: string;
  code: string;
  openingBalance: number;
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
  dailyWorkingHours: number;
  maxWorkers: number;
  status: ProductionLineStatus;
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
  shiftType?: 'shift1' | 'shift2' | 'shift3' | 'flexible';
  workDays?: number[];
  createdAt?: any;
}

// â”€â”€â”€ Activity Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_REPORT'
  | 'UPDATE_REPORT'
  | 'DELETE_REPORT'
  | 'CREATE_LEAVE_REQUEST'
  | 'APPROVE_LEAVE'
  | 'REJECT_LEAVE'
  | 'CREATE_LOAN_REQUEST'
  | 'APPROVE_LOAN'
  | 'REJECT_LOAN'
  | 'PROCESS_INSTALLMENT'
  | 'CREATE_USER'
  | 'UPDATE_USER_ROLE'
  | 'TOGGLE_USER_ACTIVE'
  | 'APPROVE_USER'
  | 'REJECT_USER'
  | 'SALARY_CHANGE'
  | 'QUALITY_CREATE_INSPECTION'
  | 'QUALITY_UPDATE_INSPECTION'
  | 'QUALITY_CREATE_DEFECT'
  | 'QUALITY_CREATE_REWORK'
  | 'QUALITY_UPDATE_REWORK'
  | 'QUALITY_CREATE_CAPA'
  | 'QUALITY_UPDATE_CAPA'
  | 'QUALITY_CREATE_WORKER'
  | 'QUALITY_UPDATE_WORKER'
  | 'QUALITY_DELETE_WORKER'
  | 'QUALITY_SET_POLICIES'
  | 'QUALITY_UPDATE_REASON'
  | 'QUALITY_DELETE_REASON'
  | 'QUALITY_UPSERT_TEMPLATE'
  | 'QUALITY_REMOVE_TEMPLATE'
  | 'QUALITY_UPSERT_SAMPLING_PLAN'
  | 'QUALITY_REMOVE_SAMPLING_PLAN'
  | 'QUALITY_UPDATE_REWORK_POLICIES'
  | 'QUALITY_UPDATE_PRINT_TEMPLATES'
  | 'QUALITY_EXPORT_DOCUMENT'
  | 'ROUTING_SOFT_DELETE_PLAN';

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
}

export interface ProductionReport {
  id?: string;
  reportCode?: string;
  employeeId: string;
  productId: string;
  lineId: string;
  date: string;
  quantityProduced: number;
  workersCount: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
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
  notes?: string;
  workOrderId?: string;
  /** اختياري: ربط التقرير بدورة توريد (باتش) لاحتساب الهالك والتتبع */
  supplyCycleId?: string;
  reportType?: 'finished_product' | 'component_injection';
  componentScrapItems?: ReportComponentScrapItem[];
  createdAt?: any;
}

export interface ReportComponentScrapItem {
  materialId: string;
  materialName: string;
  quantity: number;
}

/** دورة توريد / باتش — خام أو تام */
export type SupplyCycleKind = 'raw_material' | 'finished_good';
export type SupplyCycleStatus = 'draft' | 'open' | 'closed';

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

export type SupplyCycleWasteLineSource = 'manual' | 'production_report';

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

export interface LineWorkerAssignment {
  id?: string;
  lineId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  assignedAt?: any;
  assignedBy?: string;
}

export type SupervisorLineAssignmentReason = 'assign' | 'reassign' | 'remove' | 'migrate';

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

export type PlanPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PlanStatus = 'planned' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
export type SmartStatus = 'on_track' | 'at_risk' | 'delayed' | 'critical' | 'completed';

export interface ProductionPlan {
  id?: string;
  productId: string;
  lineId: string;
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
  planType?: 'finished_product' | 'component_injection';
  status: PlanStatus;
  createdBy: string;
  createdAt?: any;
}

export type ProductionPlanFollowUpStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

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

export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type WorkOrderPauseReason = 'manual';

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
  targetDate: string;
  estimatedCost: number;
  actualCost: number;
  workOrderType?: 'finished_product' | 'component_injection';
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

export type WorkOrderScanAction = 'IN' | 'OUT';
export type WorkOrderScanSessionStatus = 'open' | 'closed';

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

export type QualityInspectionType = 'final' | 'ipqc';
export type QualityInspectionStatus =
  | 'pending'
  | 'passed'
  | 'failed'
  | 'rework'
  | 'approved'
  | 'rejected';

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

export type QualityDefectSeverity = 'low' | 'medium' | 'high' | 'critical';

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
  status: 'open' | 'reworked' | 'scrap' | 'closed';
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
  qualityRole: 'inspector' | 'senior' | 'lead' | 'manager';
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
  status: 'open' | 'in_progress' | 'done' | 'scrap';
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
  status: 'open' | 'in_progress' | 'done' | 'closed';
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

export type QualityStatus = 'pending' | 'approved' | 'rejected' | 'not_required';

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
  | 'production_report'
  | 'work_order_assigned'
  | 'work_order_updated'
  | 'work_order_completed'
  | 'quality_report_created'
  | 'quality_report_updated'
  | 'report_compliance_daily'
  | 'manual_broadcast'
  | 'daily_report_missing';

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

export type PresenceState = 'online' | 'idle' | 'offline';

export interface UserPresence {
  id?: string; // userId
  userId: string;
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
  name: string;
  type: 'indirect' | 'direct';
  allocationBasis?: 'line_percentage' | 'by_qty';
  productScope?: 'all' | 'selected' | 'category';
  productIds?: string[];
  productCategories?: string[];
  valueSource?: 'manual' | 'salaries' | 'combined';
  employeeScope?: 'selected' | 'department';
  employeeIds?: string[];
  employeeDepartmentIds?: string[];
  manualAdjustment?: number;
  isActive: boolean;
  createdAt?: any;
}

export interface CostCenterValue {
  id?: string;
  costCenterId: string;
  month: string;
  amount: number;
  manualAmount?: number;
  salariesAmount?: number;
  valueSource?: 'manual' | 'salaries' | 'combined';
  employeeScopeSnapshot?: 'selected' | 'department';
  employeeIdsSnapshot?: string[];
  employeeDepartmentIdsSnapshot?: string[];
  productScopeSnapshot?: 'all' | 'selected' | 'category';
  productIdsSnapshot?: string[];
  productCategoriesSnapshot?: string[];
  allocationBasisSnapshot?: 'line_percentage' | 'by_qty';
  workingDays?: number;
}

export interface CostAllocation {
  id?: string;
  costCenterId: string;
  month: string;
  allocations: { lineId: string; percentage: number }[];
  productScope?: 'all' | 'selected' | 'category';
  productIds?: string[];
  productCategories?: string[];
  allocationBasis?: 'line_percentage' | 'by_qty';
}

export interface LaborSettings {
  id?: string;
  hourlyRate: number;
  cnyToEgpRate?: number;
}

// â”€â”€â”€ Assets & Depreciation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AssetDepreciationMethod = 'straight_line' | 'declining_balance';
export type AssetStatus = 'active' | 'inactive' | 'disposed';

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
  month: string;            // "YYYY-MM"
  totalProducedQty: number;
  directCost?: number;
  indirectCost?: number;
  indirectCenterSnapshots?: Array<{
    costCenterId: string;
    centerName: string;
    valueSource: 'manual' | 'salaries' | 'combined';
    allocationBasis: 'line_percentage' | 'by_qty';
    productScope: 'all' | 'selected' | 'category';
    productIds: string[];
    productCategories: string[];
    employeeScope: 'selected' | 'department';
    employeeIds: string[];
    employeeDepartmentIds: string[];
    manualAmount: number;
    salariesAmount: number;
    resolvedAmount: number;
  }>;
  totalProductionCost: number;
  averageUnitCost: number;  // totalProductionCost / totalProducedQty
  isClosed: boolean;
  calculatedAt?: any;
}

// â”€â”€â”€ Online dispatch (BOSTA barcodes: admin â†’ warehouse â†’ post) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type OnlineDispatchStatus = 'pending' | 'at_warehouse' | 'handed_to_post';

export interface OnlineDispatchShipment {
  id?: string;
  tenantId: string;
  barcode: string;
  status: OnlineDispatchStatus;
  createdAt?: unknown;
  handedToWarehouseAt?: unknown;
  handedToWarehouseByUid?: string;
  handedToPostAt?: unknown;
  handedToPostByUid?: string;
  notes?: string;
}

// â”€â”€â”€ System Settings (system_settings/{tenantId}) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface WidgetConfig {
  id: string;
  visible: boolean;
}

export type CustomWidgetType = 'kpi' | 'text' | 'quick_link';

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

export type PaperSize = 'a4' | 'a5' | 'thermal';
export type PaperOrientation = 'portrait' | 'landscape';
export type PrintThemePreset = 'erpnext' | 'classic' | 'high_contrast' | 'minimal';

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
  showWaste: boolean;
  showEmployee: boolean;
  showQRCode: boolean;
  showCosts: boolean;
  showWorkOrder: boolean;
  showSellingPrice: boolean;
}

export interface PlanSettings {
  allowMultipleActivePlans: boolean;
  allowReportWithoutPlan: boolean;
  allowOverProduction: boolean;
  autoClosePlan: boolean;
  defaultProductionWarehouseId?: string;
  rawMaterialWarehouseId?: string;
  decomposedSourceWarehouseId?: string;
  finishedReceiveWarehouseId?: string;
  wasteReceiveWarehouseId?: string;
  finalProductWarehouseId?: string;
  transferApprovalPermission?: string;
  transferDisplayUnit?: 'piece' | 'carton';
  hrApproverUserIds?: string[];
  allowNegativeDecomposedStock?: boolean;
  allowNegativeFinishedTransferStock?: boolean;
  requireFinishedStockApprovalForReports?: boolean;
  maxWasteThreshold: number;
  efficiencyCalculationMode: 'standard' | 'weighted';
  averageProductionMode: 'daily' | 'weekly' | 'monthly';
  injectionRawMaterialCategoryKeywords: string;
  /** بادئة كود دورة التوريد (مثال SC) — الصيغة PREFIX-YYYY-NNNN */
  supplyCycleBatchCodePrefix?: string;
}

// â”€â”€â”€ General Settings (Branding, Theme, Dashboard Display, Alert Toggles) â”€â”€â”€â”€

export interface BrandingSettings {
  factoryName: string;
  logoUrl: string;
  currency: string;
  timezone: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';
export type UIDensity = 'comfortable' | 'compact';

export type SidebarIconStyle = 'colorful' | 'primary' | 'muted';

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

export type QuickActionColor = 'primary' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
export type QuickActionType = 'navigate' | 'export_excel';
export type ExportImportButtonVariant = 'primary' | 'secondary' | 'outline';

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
  managerScope?: 'branch' | 'centers';
}

export interface RepairWorkflowSettings {
  /** ط­ط§ظ„ط§طھ ط¯ظٹظ†ط§ظ…ظٹظƒظٹط© ظ‚ط§ط¨ظ„ط© ظ„ظ„ط¥ط¯ط§ط±ط© ظ…ظ† ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طµظٹط§ظ†ط© */
  statuses?: Array<{
    id: string;
    label: string;
    color?: string;
    order?: number;
    isTerminal?: boolean;
    isEnabled?: boolean;
  }>;
  /** ط§ظ„ط­ط§ظ„ط© ط§ظ„ط§ظپطھط±ط§ط¶ظٹط© ط¹ظ†ط¯ ط¥ظ†ط´ط§ط، ط·ظ„ط¨ ط¬ط¯ظٹط¯ */
  initialStatusId?: string;
  /** ط­ط§ظ„ط§طھ طھط¹طھط¨ط± ظ…ظپطھظˆط­ط© ظپظٹ ط§ظ„طھظ‚ط§ط±ظٹط± ظˆط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ */
  openStatusIds?: string[];
}

export interface RepairDefaultsSettings {
  /** ط§ظ„ط¶ظ…ط§ظ† ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ط¹ظ†ط¯ ط¥ظ†ط´ط§ط، ط§ظ„ط·ظ„ط¨ */
  defaultWarranty?: 'none' | '3months' | '6months';
  /** ط§ظ„ط­ط¯ ط§ظ„ط£ط¯ظ†ظ‰ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ„ظ…ط®ط²ظˆظ† ظ‚ط·ط¹ ط§ظ„ط؛ظٹط§ط± */
  defaultMinStock?: number;
  /** SLA ط§ظپطھط±ط§ط¶ظٹ ط¨ط§ظ„ط³ط§ط¹ط§طھ */
  defaultSlaHours?: number;
}

export interface RepairTreasuryAutoCloseSettings {
  enabled?: boolean;
  mode?: 'scheduled_midnight';
  timezone?: string;
  blockOperationsIfPrevDayOpen?: boolean;
}

export interface RepairTreasurySettings {
  autoClose?: RepairTreasuryAutoCloseSettings;
}

export interface RepairSettings {
  access?: RepairAccessSettings;
  workflow?: RepairWorkflowSettings;
  defaults?: RepairDefaultsSettings;
  treasury?: RepairTreasurySettings;
}

export interface SystemSettings {
  /**
   * Logical path after tenant prefix for the default home screen, e.g. `/online` or `/online/dashboard`.
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
  branding?: BrandingSettings;
  theme?: ThemeSettings;
  dashboardDisplay?: DashboardDisplaySettings;
  alertToggles?: AlertToggleSettings;
  quickActions?: QuickActionItem[];
  exportImport?: ExportImportSettings;
  attendanceIntegration?: AttendanceIntegrationSettings;
  /** ط£ظ‚ظ„ ط¥طµط¯ط§ط± ط¹ظ…ظٹظ„ ظ…ط³ظ…ظˆط­ (طµظٹط؛ط© x.y.z) ط¹ظ†ط¯ طھظپط¹ظٹظ„ forceClientUpdate */
  minimumClientVersion?: string;
  /** ط¹ظ†ط¯ true ظ…ط¹ minimumClientVersion ط£ظ‚ظ„ ظ…ظ† ط¥طµط¯ط§ط± ط§ظ„ط¨ظ†ط§ط،طŒ ظٹظڈظ…ظ†ط¹ ط§ط³طھط®ط¯ط§ظ… ط§ظ„طھط·ط¨ظٹظ‚ ط­طھظ‰ ط§ظ„طھط­ط¯ظٹط« */
  forceClientUpdate?: boolean;
  /** ط±ط³ط§ظ„ط© طھط¸ظ‡ط± ط¹ظ„ظ‰ ط´ط§ط´ط© ط§ظ„طھط­ط¯ظٹط« ط§ظ„ط¥ط¬ط¨ط§ط±ظٹ */
  clientUpdateMessageAr?: string;
  /** ط¹ط²ظ„ ط¨ظٹط§ظ†ط§طھ ط§ظ„طµظٹط§ظ†ط©: ظ†ط·ط§ظ‚ ط§ظ„ظ…ط¯ظٹط± ظˆط؛ظٹط±ظ‡ (ط§ط®طھظٹط§ط±ظٹ) */
  repairAccess?: RepairAccessSettings;
  /** ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طµظٹط§ظ†ط© ط§ظ„ظ…ط¬ظ…ط¹ط© (ظˆطµظˆظ„ + ط³ظٹط± ط¹ظ…ظ„ + ط§ظپطھط±ط§ط¶ظٹط§طھ) */
  repairSettings?: RepairSettings;
}

// â”€â”€â”€ Multi-tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FirestoreTenant {
  id?: string;
  slug: string;
  name: string;
  phone?: string;
  address?: string;
  theme?: ThemeSettings;
  status: 'pending' | 'active' | 'suspended';
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
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  adminUid?: string;
}

// â”€â”€â”€ Dynamic Roles & Permissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** @deprecated use FirestoreRole + dynamic permissions instead */
export type UserRole = 'admin' | 'factory_manager' | 'hall_supervisor' | 'supervisor';

/** Stable key for defaults and Cloud Functions (e.g. admin, factory_manager) */
export type FirestoreRoleKey =
  | 'admin'
  | 'factory_manager'
  | 'hall_supervisor'
  | 'supervisor'
  | 'hr_manager'
  | 'accountant';

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
  notifications?: {
    productionReports?: boolean;
    workOrderAlerts?: boolean;
    stockAlerts?: boolean;
  };
  uiPreferences?: {
    /** UI language preference stored per user. */
    language?: 'ar' | 'en';
    [key: string]: unknown;
  };
  createdAt?: any;
  createdBy?: string;
}
