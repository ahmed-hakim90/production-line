import type { FirestoreUser } from '../../types';

/** حالات افتراضية للفلاتر عندما الإعدادات لسه فاضية — الموديول الفعلي بياخد الحالة من systemSettings */
export const REPAIR_JOB_STATUSES = [
  'received',
  'diagnosing',
  'estimate_ready',
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
  diagnosing: 'فحص',
  estimate_ready: 'التقدير جاهز لمراجعة الاستقبال',
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
  estimate_ready: '#0284c7',
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
  /** Customer-owned products currently held by the center. */
  custodyWarehouseId?: string;
  custodyWarehouseCode?: string;
  /** Customer-owned products declared unrepairable. */
  unrepairableWarehouseId?: string;
  unrepairableWarehouseCode?: string;
  costCenterId?: string;
  accountingAccounts?: RepairBranchAccountingAccounts;
  technicianIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface RepairBranchAccountingAccounts {
  cash: string;
  card: string;
  bankTransfer: string;
  customerDeposits: string;
  receivables: string;
  serviceRevenue: string;
  partsRevenue: string;
  discounts: string;
  warrantyAllowances: string;
  partsInventory: string;
  partsCogs: string;
}

export type RepairPaymentMethod = 'cash' | 'card' | 'bank_transfer';
export type RepairDiscountType = 'none' | 'amount' | 'percent';
export type RepairFinancialApprovalType = 'discount' | 'credit';
export type RepairFinancialApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface RepairPricedLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Immutable internal standard service cost snapshot (warranty analytics only). */
  unitInternalCost?: number;
  internalCostTotal?: number;
  lineTotal: number;
}

export interface RepairProtectedServiceCatalog {
  id?: string;
  tenantId: string;
  revision: number;
  services: Array<{
    id: string;
    name: string;
    price: number;
    internalCost?: number;
    enabled: boolean;
  }>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type RepairSettlementType = 'standard' | 'warranty';

export interface RepairJobFinancial {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  receiptNo: string;
  serviceGross: number;
  partsGross: number;
  grossAmount: number;
  discountType: RepairDiscountType;
  discountValue: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  /** warranty = manufacturer warranty close (full allowance, zero net collection). */
  settlementType?: RepairSettlementType;
  warrantyPartsActualCost?: number;
  warrantyServiceInternalCost?: number;
  warrantyActualCost?: number;
  settledAt?: string;
  authorizationRevision: number;
  currentAuthorizationId?: string;
  creditApprovalStatus?: RepairFinancialApprovalStatus;
  costCenterId?: string;
  migrationEvidence?: 'treasury_entries' | 'legacy_status' | 'manual_review' | 'native';
  createdAt: string;
  updatedAt: string;
}

export interface RepairPaymentAuthorization {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  receiptNo: string;
  authorizationNo: string;
  revision: number;
  grossAmount: number;
  serviceGross: number;
  partsGross: number;
  serviceLines?: RepairPricedLine[];
  partLines?: RepairPricedLine[];
  discountType: RepairDiscountType;
  discountValue: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceDue: number;
  taxRate?: number;
  taxAmount?: number;
  /** warranty = full manufacturer allowance; collect is forbidden. */
  settlementType?: RepairSettlementType;
  warrantyPartsActualCost?: number;
  warrantyServiceInternalCost?: number;
  warrantyActualCost?: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'partial' | 'paid' | 'void';
  discountApprovalStatus?: RepairFinancialApprovalStatus;
  creditApprovalStatus?: RepairFinancialApprovalStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairPayment {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  authorizationId: string;
  paymentNo: string;
  amount: number;
  method: RepairPaymentMethod;
  status: 'posted' | 'reversed';
  treasuryEntryId: string;
  journalEntryId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
}

export interface RepairFinancialApproval {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  authorizationId: string;
  type: RepairFinancialApprovalType;
  status: RepairFinancialApprovalStatus;
  requestedAmount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

/** Availability snapshot when the technician requested the part from a repair job. */
export type RepairPartAvailabilityAtRequest = 'center' | 'central' | 'none';

/** Fulfillment lifecycle for job-linked spare part demand. */
export type RepairPartFulfillmentStatus =
  | 'pending_supply'
  | 'ready_to_issue'
  | 'issued'
  | 'cancelled';

export interface RepairPartUsage {
  /** Stable id for this usage line (required for pending-supply fulfillment). */
  usageId?: string;
  partId: string;
  partName: string;
  quantity: number;
  unitCost: number;
  scope?: 'job' | 'product';
  productItemId?: string;
  productName?: string;
  /** Manufacturing material id posted on inventory (for returns). */
  materialId?: string;
  /** Inventory issue document that posted this usage (ADR-005). */
  issueId?: string;
  issueReferenceNo?: string;
  /** Purchase unit cost from inventory issue (COGS); distinct from sale `unitCost`. */
  unitCostSnapshot?: number;
  /** Purchase line total from inventory issue (COGS). */
  totalCostSnapshot?: number;
  /** Where stock was available when requested (server-computed). */
  availabilityAtRequest?: RepairPartAvailabilityAtRequest;
  /** pending_supply until center receives replenishment; then ready_to_issue / issued. */
  fulfillmentStatus?: RepairPartFulfillmentStatus;
  replenishmentRequestId?: string;
  replenishmentReferenceNo?: string;
}

export type RepairSpareApprovalMode = 'direct' | 'required';

export type RepairSpareIssueStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'issued'
  | 'rejected'
  | 'cancelled';

export interface RepairSpareIssueAllocation {
  locationId: string;
  locationCode: string;
  rack?: string;
  shelf?: string;
  quantity: number;
}

export interface RepairSpareIssueLine {
  lineId?: string;
  itemType: 'material';
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  /** Legacy / display: first allocation location when shelves are used. */
  locationId?: string;
  locationCode?: string;
  allocations?: RepairSpareIssueAllocation[];
  availableQty?: number;
  shortageQty?: number;
  unitCostSnapshot?: number;
  totalCostSnapshot?: number;
  returnedQty?: number;
}

export interface RepairSpareIssue {
  id?: string;
  referenceNo: string;
  status: RepairSpareIssueStatus;
  approvalMode: RepairSpareApprovalMode;
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  jobId?: string;
  jobCode?: string;
  lines: RepairSpareIssueLine[];
  note?: string;
  totalCostSnapshot?: number;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  submittedAt?: string;
  submittedBy?: string;
  submittedByUserId?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  issuedAt?: string;
  issuedBy?: string;
  issuedByUserId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByUserId?: string;
  tenantId?: string;
}

export interface RepairSpareReturnLine {
  lineId?: string;
  itemId: string;
  quantity: number;
  locationId?: string;
  locationCode?: string;
  note?: string;
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
  /** كمية نفس المنتج/الطراز في السطر */
  quantity?: number;
  accessories?: string;
  /** معرفات من كتالوج إكسسوارات الإعدادات */
  accessoryIds?: string[];
  /** معرفات خدمات من كتالوج الإعدادات */
  serviceIds?: string[];
  /** وصف العطل من الاستقبال / العميل — لا يُعدَّل في الورشة */
  diagnosis?: string;
  /** تشخيص الفني بعد الفحص */
  technicianDiagnosis?: string;
  /** تكلفة متوقعة للسطر بالكامل (وحدة × كمية) */
  estimatedCost?: number;
  /** تكلفة نهائية للسطر بالكامل (وحدة × كمية) */
  finalCost?: number;
  inWarranty?: boolean;
  /** Quantity physically received into the center custody warehouse. */
  receivedQuantity?: number;
  /** Quantity transferred from custody to the unrepairable warehouse. */
  unrepairableQuantity?: number;
  unrepairableReason?: string;
  unrepairableReasonCode?: string;
  unrepairableReasonLabel?: string;
  unrepairableReasonNote?: string;
  unrepairableDecisionQuantity?: number;
  reopenedFromUnrepairableQuantity?: number;
  unrepairableRecordedAt?: string;
  unrepairableRecordedBy?: string;
  unrepairableRecordedByName?: string;
  /** Repaired/cancelled quantity physically handed back to the customer. */
  handedOverQuantity?: number;
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
  /** إجمالي ما تم ترحيله/تحصيله فعليًا — مصدر حالة السداد للطلبات الجديدة. */
  paidAmount?: number;
  /** الرصيد المتبقي المحسوب، محفوظ لتسهيل التقارير والفرز. */
  balanceDue?: number;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  closedReason?: string;
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
  /** رقم ثابت لإذن تسليم المنتج، يُنشأ داخل معاملة التسليم ولا يتغير عند إعادة الطباعة. */
  deliveryAuthorizationNo?: string;
  deliveryAuthorizationIssuedAt?: string;
  deliveryAuthorizationIssuedBy?: string;
  deliveryAuthorizationIssuedByName?: string;
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
  /** Portal/customer request that was converted into this repair job. */
  sourceCustomerRequestId?: string;
  custodyPostedAt?: string;
  custodyWarehouseId?: string;
}

export type CustomerServiceRequestStatus = 'submitted' | 'assigned' | 'converted' | 'cancelled';

export interface CustomerServiceRequestLine {
  lineId: string;
  productId: string;
  productName: string;
  productCode: string;
  barcode: string;
  requestedQuantity: number;
  receivedQuantity?: number;
  note?: string;
  differenceNote?: string;
}

export interface CustomerServiceRequest {
  id?: string;
  tenantId: string;
  requestNo: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  status: CustomerServiceRequestStatus;
  branchId?: string;
  branchName?: string;
  lines: CustomerServiceRequestLine[];
  convertedJobId?: string;
  convertedReceiptNo?: string;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  convertedAt?: string;
}

export type CustomerServiceEventAction =
  | 'request.created'
  | 'request.assigned'
  | 'request.reassigned'
  | 'request.received'
  | 'request.converted'
  | 'job.technician_assigned'
  | 'job.unrepairable_recorded'
  | 'job.handed_over'
  | 'replacement.created'
  | 'replacement.approved'
  | 'replacement.rejected'
  | 'replacement.delivered'
  | 'replacement.cancelled';

export interface CustomerServiceEvent {
  id?: string;
  tenantId: string;
  customerId: string;
  referenceType: 'customer_request' | 'repair_job' | 'replacement_request';
  referenceId: string;
  action: CustomerServiceEventAction;
  title: string;
  message: string;
  branchId?: string;
  actorUid?: string;
  actorName?: string;
  createdAt: string;
}

export type RepairReplacementStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'delivered'
  | 'cancelled';

export interface RepairReplacementRequest {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  receiptNo: string;
  jobProductItemId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  originalProductId: string;
  originalProductName: string;
  requestedQuantity: number;
  replacementProductId?: string;
  replacementProductName?: string;
  replacementProductCode?: string;
  approvedQuantity?: number;
  status: RepairReplacementStatus;
  reason?: string;
  resolutionNote?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  deliveredAt?: string;
}

export interface RepairCustodyRecord {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  receiptNo: string;
  jobProductItemId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  productId: string;
  productName: string;
  productCode?: string;
  productBarcode?: string;
  unrepairableReasonCode?: string;
  unrepairableReasonLabel?: string;
  jobStatus?: RepairJobStatus;
  deliveryAuthorizationNo?: string;
  receivedQuantity: number;
  unrepairableQuantity: number;
  handedOverQuantity: number;
  custodyHandedOverQuantity?: number;
  unrepairableHandedOverQuantity?: number;
  custodyWarehouseId: string;
  unrepairableWarehouseId: string;
  createdAt: string;
  updatedAt: string;
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
  /**
   * ربط بماستر داتا المواد التصنيعية (`materials`) — المصدر الرسمي للمكونات.
   * يُستخدم لمطابقة BOM المنتج عند صرف القطع على طلب صيانة.
   */
  materialId?: string;
  /** منتج المصدر عند الإضافة من BOM (اختياري) */
  sourceProductId?: string;
  /** @deprecated استخدم materialId — إبقاء للتوافق مع سجلات قديمة */
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
  source?: string;
  sourceId?: string;
  paymentMethod?: RepairPaymentMethod;
  costCenterId?: string;
  journalEntryId?: string;
  /** نوع مصروف خزينة يدوي مُرحَّل محاسبياً */
  expenseType?: string;
  expenseAccountId?: string;
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

export type RepairTreasuryMonthCloseStatus = 'closed' | 'open';

export interface RepairTreasuryMonthCloseSnapshot {
  sessionsCount: number;
  totalOpening: number;
  totalIncome: number;
  totalExpense: number;
  netMovement: number;
  totalClosing: number;
}

export interface RepairTreasuryMonthClose {
  id?: string;
  tenantId: string;
  branchId: string;
  month: string;
  status: RepairTreasuryMonthCloseStatus;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  closingNote?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  reopenReason?: string;
  snapshot?: RepairTreasuryMonthCloseSnapshot;
  updatedAt?: string;
}

export interface RepairTreasuryMonthlyReportData {
  month: string;
  sessionStatus: RepairTreasurySessionStatusFilter;
  branchFilter: string;
  visibleBranchIds: string[];
  summaries: RepairTreasuryBranchMonthlySummary[];
  dailyBreakdown: RepairTreasuryBranchDailyBreakdown[];
  sessions: RepairTreasurySessionDetailsRow[];
  /** حالة إقفال الشهر لكل فرع ظاهر في التقرير */
  monthCloseByBranchId: Record<string, RepairTreasuryMonthClose | null>;
  paymentMethodSummaries: Array<{
    branchId: string;
    branchName: string;
    costCenterId: string;
    paymentMethod: RepairPaymentMethod | 'unspecified';
    income: number;
    expense: number;
    net: number;
    entriesCount: number;
  }>;
  reconciliation: {
    entriesCount: number;
    missingPaymentMethod: number;
    missingCostCenter: number;
    missingJournalReference: number;
  };
}

export interface RepairSalesInvoiceLine {
  partId: string;
  partName: string;
  /** Manufacturing material id when the line is linked to inventory SoT. */
  materialId?: string;
  quantity: number;
  unitPrice: number;
  /** Immutable inventory cost snapshot, written by the server only. */
  unitCost?: number;
  lineTotal: number;
}

export interface RepairSalesInvoice {
  id?: string;
  tenantId: string;
  branchId: string;
  invoiceNo: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  grossAmount?: number;
  discountType?: 'none' | 'amount' | 'percent';
  discountValue?: number;
  discountAmount?: number;
  total: number;
  taxRate?: 0;
  taxAmount?: 0;
  paymentMethod?: RepairPaymentMethod;
  costCenterId?: string;
  lines: RepairSalesInvoiceLine[];
  status?: 'draft' | 'pending_discount_approval' | 'ready_to_post' | 'posted' | 'cancelled';
  discountApprovalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  discountRequestedBy?: string;
  journalEntryId?: string;
  treasuryEntryId?: string;
  reversalJournalEntryId?: string;
  /** إصدار تسلسلي لمنع تكرار تسويات التعديل/الإلغاء على الخادم. */
  revision?: number;
  warehouseId?: string;
  warehouseName?: string;
  repairJobId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  postedAt?: string;
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
  deliveredJobs: number;
  unrepairableJobs: number;
  successRate: number | null;
  deliveryRate: number;
  avgRepairDays: number | null;
  technicianRevenue: number;
  openJobsCount: number;
  delayedJobsCount: number;
  readyJobsCount: number;
  breakdownByDeviceType: Record<string, number>;
  breakdownByStatus: Record<string, number>;
}

export interface RepairJobFilters {
  branchId?: string;
  technicianId?: string;
  fromDate?: string;
  toDate?: string;
  statuses?: RepairJobStatus[];
}

export type RepairComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export const REPAIR_COMPLAINT_STATUS_LABELS: Record<RepairComplaintStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد المتابعة',
  resolved: 'تم الحل',
  closed: 'مغلقة',
};

export interface RepairComplaintFollowUp {
  id: string;
  at: string;
  note: string;
  actorUid: string;
  actorName: string;
  followUpAt?: string;
}

export interface RepairComplaint {
  id?: string;
  tenantId: string;
  branchId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  jobId?: string;
  receiptNo?: string;
  subject: string;
  notes?: string;
  status: RepairComplaintStatus;
  followUps: RepairComplaintFollowUp[];
  createdAt: string;
  updatedAt: string;
  createdByUid?: string;
  createdByName?: string;
}

/** حالة التنقل من مركز الاتصال إلى شكاوى الصيانة */
export type RepairComplaintPrefill = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  jobId?: string;
  receiptNo?: string;
  branchId?: string;
};

/** متابعة مركز الاتصال — ملاحظة + موعد متابعة اختياري */
export interface RepairFollowUp {
  id?: string;
  tenantId: string;
  branchId: string;
  jobId: string;
  note: string;
  followUpAt?: string;
  actorUid: string;
  actorName: string;
  createdAt: string;
}

/** حالة التنقل من شاشة مركز الاتصال إلى «جهاز جديد» */
export type RepairCallCenterPrefill = {
  customerId?: string;
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
