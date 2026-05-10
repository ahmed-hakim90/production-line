import type { FirestoreUser } from '../../types';

/** حالات افتراضية للفلاتر عندما الإعدادات لسه فاضية — الموديول الفعلي بياخد الحالة من systemSettings */
export const REPAIR_JOB_STATUSES = [
  'received',
  'diagnosing',
  'waiting_approval',
  'waiting_parts',
  'repairing',
  'testing',
  'ready',
  'delivered',
  'cancelled',
  'unrepairable',
  'inspection',
  'repair',
] as const;

export type RepairJobStatus = string;
export const REPAIR_JOB_STATUS_LABELS: Record<string, string> = {
  received: 'وارد',
  diagnosing: 'تشخيص',
  waiting_approval: 'بانتظار موافقة العميل',
  waiting_parts: 'بانتظار قطع الغيار',
  repairing: 'إصلاح',
  testing: 'اختبار',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  unrepairable: 'غير قابل للإصلاح',
  inspection: 'فحص (قديم)',
  repair: 'إصلاح (قديم)',
};
export const REPAIR_JOB_STATUS_COLORS: Record<string, string> = {
  received: '#64748b',
  diagnosing: '#f59e0b',
  waiting_approval: '#a855f7',
  waiting_parts: '#ea580c',
  repairing: '#0ea5e9',
  testing: '#6366f1',
  ready: '#22c55e',
  delivered: '#16a34a',
  cancelled: '#78716c',
  unrepairable: '#ef4444',
  inspection: '#f59e0b',
  repair: '#0ea5e9',
};
export type RepairWarranty = 'none' | '3months' | '6months';
export type RepairJobPriority = 'normal' | 'urgent';
/** ضمان الجهاز عند الاستلام (مختلف عن ضمان الورشة بعد الإصلاح) */
export type RepairWarrantyScope = 'none' | 'manufacturer' | 'in_store';
export type RepairApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type RepairPartTransactionType = 'IN' | 'OUT';
export type RepairTreasuryEntryType = 'OPENING' | 'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'CLOSING';

export interface RepairBranch {
  id?: string;
  tenantId: string;
  name: string;
  address: string;
  phone: string;
  isMain: boolean;
  managerEmployeeId?: string;
  managerEmployeeName?: string;
  warehouseId?: string;
  warehouseCode?: string;
  technicianIds?: string[];
  createdAt: string;
}

export interface RepairPartUsage {
  partId: string;
  partName: string;
  quantity: number;
  unitCost: number;
  scope?: 'job' | 'product';
  productItemId?: string;
  productName?: string;
}

export interface RepairStatusHistoryItem {
  status: RepairJobStatus;
  at: string;
  technicianId?: string;
  reason?: string;
}

export interface RepairJobProduct {
  itemId: string;
  productId?: string;
  productName: string;
  deviceType?: string;
  deviceBrand?: string;
  deviceModel?: string;
  serialNo?: string;
  accessories?: string;
  diagnosis?: string;
  estimatedCost?: number;
  finalCost?: number;
  inWarranty?: boolean;
}

export interface RepairJob {
  id?: string;
  tenantId: string;
  receiptNo: string;
  branchId: string;
  productId?: string;
  productName?: string;
  technicianId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  /** رقم سريال سريع للبحث — غالبًا نفس أول صنف في jobProducts */
  deviceSerial?: string;
  deviceColor?: string;
  devicePassword?: string;
  problemDescription: string;
  accessories?: string;
  status: RepairJobStatus;
  jobProducts?: RepairJobProduct[];
  isServiceOnly?: boolean;
  serviceOnlyCost?: number;
  estimatedCost?: number;
  finalCostOverride?: number;
  finalCost?: number;
  laborCost?: number;
  warranty: RepairWarranty;
  warrantyScope?: RepairWarrantyScope;
  /** تاريخ انتهاء ضمان الجهاز (ISO) — للتحليلات */
  warrantyExpiresAt?: string;
  priority?: RepairJobPriority;
  intakePhotoUrls?: string[];
  repairPhotoUrls?: string[];
  approvalStatus?: RepairApprovalStatus;
  approvalRequestedAt?: string;
  approvalResolvedAt?: string;
  approvalNote?: string;
  /** SHA-256 hex للتوكن — التوكن نفسه بس في الرابط العام */
  approvalTokenHash?: string;
  approvalTokenExpiresAt?: string;
  notes?: string;
  partsUsed: RepairPartUsage[];
  statusHistory?: RepairStatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  assignedAt?: string;
  resolvedAt?: string;
  slaHours?: number;
  /** تاريخ الاستحقاق المتوقع — نفس «الموعد المتوقع للتسليم» */
  dueAt?: string;
  breachedAt?: string;
  resolutionMinutes?: number;
  preventivePlanId?: string;
  isPreventive?: boolean;
  isClosed?: boolean;
  closedAt?: string;
  reopenedFromJobId?: string;
  parentJobId?: string;
}

export type RepairServiceEventAction =
  | 'status_change'
  | 'note'
  | 'job_created'
  | 'parts_reserved'
  | 'parts_consumed'
  | 'parts_released'
  | 'parts_released_all'
  | 'approval_requested'
  | 'approval_resolved'
  | 'photo_added'
  | 'field_update'
  | 'sla_breached'
  | 'technician_assigned';

/**
 * أسماء أحداث نطاقية (نمط resource.action) للأتمتة ولوحات المراقبة.
 * تُخزَّن في `service_events.domainEvent` مع الإبقاء على `action` للتوافق مع البيانات القديمة.
 */
export type RepairDomainEventName =
  | 'job.created'
  | 'job.status_changed'
  | 'job.ready'
  | 'job.delivered'
  | 'job.cancelled'
  | 'job.unrepairable'
  | 'job.waiting_parts'
  | 'job.waiting_approval'
  | 'diagnosis.started'
  | 'diagnosis.completed'
  | 'customer.approval_requested'
  | 'customer.approved'
  | 'customer.rejected'
  | 'part.reserved'
  | 'part.consumed'
  | 'parts.released_all'
  | 'technician.assigned'
  | 'repair.started'
  | 'repair.finished'
  | 'testing.started'
  | 'testing.completed'
  | 'job.photo_added'
  | 'sla.breached';

export interface RepairServiceEvent {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  at: string;
  actorUid: string;
  actorName: string;
  action: RepairServiceEventAction;
  /** إصدار مخطط الحمولة الاختيارية للمستهلكين الخارجيين */
  eventSchemaVersion?: number;
  domainEvent?: RepairDomainEventName;
  statusBefore?: string;
  statusAfter?: string;
  note?: string;
  payload?: Record<string, unknown>;
}

export type RepairPartReservationStatus = 'active' | 'consumed' | 'released';

export interface RepairPartReservation {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  partId: string;
  partName: string;
  quantity: number;
  warehouseId?: string;
  warehouseName?: string;
  status: RepairPartReservationStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  releasedBy?: string;
  consumedBy?: string;
  partiallyConsumedBy?: string;
}

export interface PreventiveMaintenancePlan {
  id?: string;
  tenantId: string;
  branchId: string;
  machineId: string;
  machineName: string;
  everyDays?: number;
  everyMachineHours?: number;
  nextDueAt: string;
  defaultSlaHours?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RepairSparePart {
  id?: string;
  tenantId: string;
  branchId: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  minStock: number;
  /** تكلفة شراء الوحدة (لحساب تكلفة الصيانة / الهامش) */
  purchaseUnitCost?: number;
  /** سعر بيع افتراضي للقطعة (مرجعي — الفواتير قد تعدّل السعر) */
  defaultSalePrice?: number;
  /** خصم تلقائي من المخزن كنسبة مئوية من تكلفة الشراء عند احتساب تكلفة الوحدة للطلب */
  warehouseDiscountPercent?: number;
  /** اختياري: ربط تقريري بمادة خام في مخزون الإنتاج */
  rawMaterialId?: string;
  createdAt: string;
}

export interface RepairSparePartStock {
  id?: string;
  tenantId: string;
  branchId: string;
  warehouseId?: string;
  warehouseName?: string;
  partId: string;
  partName: string;
  quantity: number;
  updatedAt: string;
}

export interface RepairPartTransaction {
  id?: string;
  tenantId: string;
  branchId: string;
  partId: string;
  partName: string;
  type: RepairPartTransactionType;
  quantity: number;
  jobId?: string;
  referenceId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface RepairTreasurySession {
  id?: string;
  tenantId: string;
  branchId: string;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  openingBalance: number;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  closingBalance?: number;
  closingDifference?: number;
  closingDifferenceReason?: string;
  needsManualClose?: boolean;
  closeBlockReason?: string;
  status: 'open' | 'closed';
}

export interface RepairTreasuryEntry {
  id?: string;
  tenantId: string;
  branchId: string;
  sessionId?: string;
  entryType: RepairTreasuryEntryType;
  amount: number;
  note?: string;
  referenceId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export type RepairTreasurySessionStatusFilter = 'all' | 'open' | 'closed';

export interface RepairTreasurySessionDetailsRow {
  sessionId: string;
  branchId: string;
  branchName: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  closingBalance?: number;
  closingDifference?: number;
  closingDifferenceReason?: string;
  openedByName?: string;
  closedByName?: string;
  entriesCount: number;
}

export interface RepairTreasuryBranchMonthlySummary {
  branchId: string;
  branchName: string;
  sessionsCount: number;
  totalOpening: number;
  totalIncome: number;
  totalExpense: number;
  totalTransferIn: number;
  totalTransferOut: number;
  netMovement: number;
  totalClosing: number;
}

export interface RepairTreasuryBranchDailyBreakdown {
  branchId: string;
  branchName: string;
  day: string;
  sessionsCount: number;
  opening: number;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  net: number;
  closing: number;
}

export interface RepairTreasuryMonthlyReportData {
  month: string;
  sessionStatus: RepairTreasurySessionStatusFilter;
  branchFilter: string;
  visibleBranchIds: string[];
  summaries: RepairTreasuryBranchMonthlySummary[];
  dailyBreakdown: RepairTreasuryBranchDailyBreakdown[];
  sessions: RepairTreasurySessionDetailsRow[];
}

export interface RepairSalesInvoiceLine {
  partId: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface RepairSalesInvoice {
  id?: string;
  tenantId: string;
  branchId: string;
  invoiceNo: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  total: number;
  lines: RepairSalesInvoiceLine[];
  status?: 'active' | 'cancelled';
  warehouseId?: string;
  warehouseName?: string;
  repairJobId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelReason?: string;
}

export interface RepairTechnicianKPI {
  technicianId: string;
  technicianName: string;
  totalJobs: number;
  successRate: number;
  avgRepairDays: number;
  technicianRevenue: number;
  openJobsCount: number;
  breakdownByDeviceType: Record<string, number>;
}

export interface RepairJobFilters {
  branchId?: string;
  technicianId?: string;
  fromDate?: string;
  toDate?: string;
  statuses?: RepairJobStatus[];
}

/** حالة التنقل من شاشة مركز الاتصال إلى «جهاز جديد» */
export type RepairCallCenterPrefill = {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  branchId?: string;
  productId?: string;
  diagnosis?: string;
};

export type FirestoreUserWithRepair = FirestoreUser & {
  repairBranchId?: string;
  repairBranchIds?: string[];
  role?: string;
};

export const resolveUserRepairBranchIds = (user: FirestoreUserWithRepair | null | undefined): string[] => {
  if (!user) return [];
  const ids = Array.isArray(user.repairBranchIds)
    ? user.repairBranchIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : [];
  if (ids.length > 0) return Array.from(new Set(ids));
  if (typeof user.repairBranchId === 'string' && user.repairBranchId.trim().length > 0) {
    return [user.repairBranchId];
  }
  return [];
};
