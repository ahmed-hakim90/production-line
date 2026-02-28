
export enum ProductionLineStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  IDLE = 'idle',
  WARNING = 'warning'
}

// ─── UI Types (consumed by components — do NOT change) ──────────────────────

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
  wasteUnits: number;
  avgAssemblyTime: number;
  imageUrl?: string;
}

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'daily';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'عقد',
  daily: 'يومي',
};

export interface Employee {
  id: string;
  name: string;
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
}

// ─── Firestore Document Types (match collection schemas) ────────────────────

export interface FirestoreProduct {
  id?: string;
  name: string;
  model: string;
  code: string;
  openingBalance: number;
  imageUrl?: string;
  storagePath?: string;
  imageCreatedAt?: any;
  chineseUnitCost?: number;
  innerBoxCost?: number;
  outerCartonCost?: number;
  unitsPerCarton?: number;
  sellingPrice?: number;
}

export interface ProductMaterial {
  id?: string;
  productId: string;
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
  createdAt?: any;
}

// ─── Activity Log ────────────────────────────────────────────────────────────

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
  | 'QUALITY_EXPORT_DOCUMENT';

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
  quantityWaste: number;
  workersCount: number;
  workHours: number;
  supervisorHourlyRateApplied?: number;
  supervisorIndirectCost?: number;
  notes?: string;
  workOrderId?: string;
  createdAt?: any;
}

export interface LineStatus {
  id?: string;
  lineId: string;
  currentProductId: string;
  targetTodayQty: number;
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
  status: PlanStatus;
  createdBy: string;
  createdAt?: any;
}

// ─── Work Orders ─────────────────────────────────────────────────────────────

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

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'work_order_assigned'
  | 'work_order_updated'
  | 'work_order_completed'
  | 'quality_report_created'
  | 'quality_report_updated';

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

// ─── Cost Management ─────────────────────────────────────────────────────────

export interface CostCenter {
  id?: string;
  name: string;
  type: 'indirect' | 'direct';
  isActive: boolean;
  createdAt?: any;
}

export interface CostCenterValue {
  id?: string;
  costCenterId: string;
  month: string;
  amount: number;
}

export interface CostAllocation {
  id?: string;
  costCenterId: string;
  month: string;
  allocations: { lineId: string; percentage: number }[];
}

export interface LaborSettings {
  id?: string;
  hourlyRate: number;
  cnyToEgpRate?: number;
}

// ─── Monthly Production Cost ─────────────────────────────────────────────────

export interface MonthlyProductionCost {
  id?: string;
  productId: string;
  month: string;            // "YYYY-MM"
  totalProducedQty: number;
  totalProductionCost: number;
  averageUnitCost: number;  // totalProductionCost / totalProducedQty
  isClosed: boolean;
  calculatedAt?: any;
}

// ─── System Settings (system_settings/global) ───────────────────────────────

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

export interface PrintTemplateSettings {
  logoUrl: string;
  headerText: string;
  footerText: string;
  primaryColor: string;
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
  maxWasteThreshold: number;
  efficiencyCalculationMode: 'standard' | 'weighted';
  averageProductionMode: 'daily' | 'weekly' | 'monthly';
}

// ─── General Settings (Branding, Theme, Dashboard Display, Alert Toggles) ────

export interface BrandingSettings {
  factoryName: string;
  logoUrl: string;
  currency: string;
  timezone: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';
export type UIDensity = 'comfortable' | 'compact';

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  backgroundColor: string;
  darkMode: ThemeMode;
  baseFontFamily: string;
  baseFontSize: number;
  borderRadius: number;
  density: UIDensity;
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

export interface SystemSettings {
  dashboardWidgets: Record<string, WidgetConfig[]>;
  customDashboardWidgets?: CustomWidgetConfig[];
  alertSettings: AlertSettings;
  kpiThresholds: Record<string, KPIThreshold>;
  printTemplate: PrintTemplateSettings;
  planSettings: PlanSettings;
  branding?: BrandingSettings;
  theme?: ThemeSettings;
  dashboardDisplay?: DashboardDisplaySettings;
  alertToggles?: AlertToggleSettings;
  quickActions?: QuickActionItem[];
  exportImport?: ExportImportSettings;
}

// ─── Dynamic Roles & Permissions ─────────────────────────────────────────────

/** @deprecated use FirestoreRole + dynamic permissions instead */
export type UserRole = 'admin' | 'factory_manager' | 'hall_supervisor' | 'supervisor';

export interface FirestoreRole {
  id?: string;
  name: string;
  color: string;
  permissions: Record<string, boolean>;
}

export interface FirestoreUser {
  id?: string;
  email: string;
  displayName: string;
  code?: string;
  roleId: string;
  tenantId?: string;
  isActive: boolean;
  createdAt?: any;
  createdBy?: string;
}
