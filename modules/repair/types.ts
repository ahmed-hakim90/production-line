import type { FirestoreUser } from '../../types';

export const REPAIR_JOB_STATUSES = [
  'received',
  'inspection',
  'repair',
  'ready',
  'delivered',
  'unrepairable',
] as const;

export type RepairJobStatus = (typeof REPAIR_JOB_STATUSES)[number];
export const REPAIR_JOB_STATUS_LABELS: Record<RepairJobStatus, string> = {
  received: 'وارد',
  inspection: 'فحص',
  repair: 'إصلاح',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  unrepairable: 'غير قابل للإصلاح',
};
export const REPAIR_JOB_STATUS_COLORS: Record<RepairJobStatus, string> = {
  received: '#64748b',
  inspection: '#f59e0b',
  repair: '#0ea5e9',
  ready: '#22c55e',
  delivered: '#16a34a',
  unrepairable: '#ef4444',
};
export type RepairWarranty = 'none' | '3months' | '6months';
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
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
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
  warranty: RepairWarranty;
  notes?: string;
  partsUsed: RepairPartUsage[];
  statusHistory?: RepairStatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  assignedAt?: string;
  resolvedAt?: string;
  slaHours?: number;
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
