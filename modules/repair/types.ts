// ─── Repair Management Module Types ──────────────────────────────────────────

export type RepairJobStatus =
  | 'received'
  | 'inspection'
  | 'repair'
  | 'ready'
  | 'delivered'
  | 'unrepairable';

export type RepairWarranty = 'none' | '3months' | '6months';

export type RepairPaymentType = 'paid' | 'warranty_free' | 'service_only';

export const REPAIR_STATUS_LABELS: Record<RepairJobStatus, string> = {
  received: 'وارد',
  inspection: 'فحص',
  repair: 'إصلاح',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  unrepairable: 'غير قابل للإصلاح',
};

export const REPAIR_STATUS_COLORS: Record<RepairJobStatus, string> = {
  received: 'bg-blue-100 text-blue-800',
  inspection: 'bg-yellow-100 text-yellow-800',
  repair: 'bg-orange-100 text-orange-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-600',
  unrepairable: 'bg-red-100 text-red-800',
};

export const REPAIR_WARRANTY_LABELS: Record<RepairWarranty, string> = {
  none: 'بدون ضمان',
  '3months': '3 شهور',
  '6months': '6 شهور',
};

// ─── Branch ──────────────────────────────────────────────────────────────────

export interface RepairBranch {
  id?: string;
  name: string;
  address: string;
  phone: string;
  isMain: boolean;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

// ─── Spare Part ───────────────────────────────────────────────────────────────

export interface RepairSparePart {
  id?: string;
  branchId: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  minStock: number;
  sellingPrice: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

export interface RepairSparePartStock {
  id?: string; // `{branchId}__{partId}`
  branchId: string;
  partId: string;
  partName: string;
  quantity: number;
  updatedAt: string;
}

export type RepairPartsTransactionType = 'IN' | 'OUT' | 'ADJUSTMENT';

export interface RepairPartsTransaction {
  id?: string;
  branchId: string;
  partId: string;
  partName: string;
  type: RepairPartsTransactionType;
  quantity: number;
  unitCost?: number;
  jobId?: string;
  invoiceId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// ─── Parts Used in a Job ──────────────────────────────────────────────────────

export interface RepairPartUsed {
  partId: string;
  partName: string;
  quantity: number;
  unitCost: number;
}

// ─── Repair Job ───────────────────────────────────────────────────────────────

export interface RepairJob {
  id?: string;
  receiptNo: string; // REP-0001
  branchId: string;
  branchName?: string;
  technicianId?: string;
  technicianName?: string;

  // Customer
  customerName: string;
  customerPhone: string;
  customerAddress?: string;

  // Device
  deviceType: string; // موبايل، لاب توب، تابلت، أخرى
  deviceBrand: string;
  deviceModel: string;
  deviceColor?: string;
  devicePassword?: string;
  accessories?: string;
  problemDescription: string;

  // Status
  status: RepairJobStatus;
  statusHistory?: RepairStatusHistoryEntry[];

  // Financial
  estimatedCost?: number;
  finalCost?: number;
  paymentType?: RepairPaymentType;
  warranty: RepairWarranty;
  unrepairableReason?: string;

  // Parts
  partsUsed: RepairPartUsed[];

  // Timestamps
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface RepairStatusHistoryEntry {
  status: RepairJobStatus;
  changedBy: string;
  changedByName?: string;
  changedAt: string;
  notes?: string;
}

// ─── Cash Register ───────────────────────────────────────────────────────────

export type RepairCashTransactionType = 'income' | 'expense';

export const REPAIR_EXPENSE_CATEGORIES = [
  'إيجار',
  'كهرباء',
  'مياه',
  'رواتب',
  'قطع غيار',
  'مستلزمات',
  'صيانة معدات',
  'أخرى',
] as const;

export type RepairExpenseCategory = (typeof REPAIR_EXPENSE_CATEGORIES)[number];

export interface RepairCashTransaction {
  id?: string;
  branchId: string;
  sessionId?: string;
  type: RepairCashTransactionType;
  category: string;
  amount: number;
  jobId?: string;
  invoiceId?: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface RepairCashSession {
  id?: string;
  branchId: string;
  openedBy: string;
  openedByName?: string;
  openedAt: string;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transferredToMain: boolean;
  status: 'open' | 'closed';
}

// ─── Sale Invoice (direct sale without repair job) ────────────────────────────

export interface RepairSaleInvoiceLine {
  partId: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface RepairSaleInvoice {
  id?: string;
  invoiceNo: string; // SL-0001
  branchId: string;
  customerName: string;
  customerPhone?: string;
  lines: RepairSaleInvoiceLine[];
  totalAmount: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// ─── Technician Branch Assignment ─────────────────────────────────────────────

export interface RepairTechnicianAssignment {
  id?: string; // == technicianId (uid)
  technicianId: string;
  technicianName: string;
  branchIds: string[];
  updatedAt: string;
}

// ─── KPI Aggregated ───────────────────────────────────────────────────────────

export interface TechnicianKPI {
  technicianId: string;
  technicianName: string;
  branchId?: string;
  branchName?: string;
  totalJobs: number;
  deliveredJobs: number;
  unrepairableJobs: number;
  openJobs: number;
  successRate: number; // %
  avgRepairDays: number;
  totalRevenue: number;
}

export interface BranchKPI {
  branchId: string;
  branchName: string;
  isMain: boolean;
  monthlyJobs: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  netProfit: number;
  openJobs: number;
  jobsWithoutStock: number; // jobs where needed parts are out of stock
  technicianCount: number;
}
