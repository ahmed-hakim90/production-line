import type { CustomerSizeTier } from './lib/customerSizeTier';

export type { CustomerSizeTier } from './lib/customerSizeTier';
export {
  CUSTOMER_SIZE_TIER_LABELS,
  CUSTOMER_SIZE_TIER_OPTIONS,
  CUSTOMER_SIZE_TIER_THRESHOLDS,
  classifyCustomerSizeTier,
  isCustomerSizeTier,
} from './lib/customerSizeTier';

/** نوع العميل التشغيلي في CRM */
export type CustomerType = 'consumer' | 'trader';

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  consumer: 'مستهلك',
  trader: 'تاجر',
};

export const CUSTOMER_TYPE_OPTIONS: Array<{ value: CustomerType; label: string }> = [
  { value: 'consumer', label: CUSTOMER_TYPE_LABELS.consumer },
  { value: 'trader', label: CUSTOMER_TYPE_LABELS.trader },
];

export function isCustomerType(value: unknown): value is CustomerType {
  return value === 'consumer' || value === 'trader';
}

export function parseCustomerTypeLabel(raw: string): CustomerType | null {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'consumer' || v === 'مستهلك' || v === 'فرد') return 'consumer';
  if (v === 'trader' || v === 'تاجر' || v === 'تاجر جملة' || v === 'جملة') return 'trader';
  return null;
}

/** حالة المتابعة اليدوية حتى اكتمال الموديول المالي */
export type CustomerFollowUpStatus = 'none' | 'needs_call' | 'followed_up';

export const CUSTOMER_FOLLOW_UP_LABELS: Record<CustomerFollowUpStatus, string> = {
  none: 'بدون',
  needs_call: 'يحتاج اتصال',
  followed_up: 'تمت المتابعة',
};

export const CUSTOMER_FOLLOW_UP_OPTIONS: Array<{ value: CustomerFollowUpStatus; label: string }> = [
  { value: 'none', label: CUSTOMER_FOLLOW_UP_LABELS.none },
  { value: 'needs_call', label: CUSTOMER_FOLLOW_UP_LABELS.needs_call },
  { value: 'followed_up', label: CUSTOMER_FOLLOW_UP_LABELS.followed_up },
];

export function isCustomerFollowUpStatus(value: unknown): value is CustomerFollowUpStatus {
  return value === 'none' || value === 'needs_call' || value === 'followed_up';
}

export interface Customer {
  id?: string;
  tenantId: string;
  /** كود العمل — فريد داخل الشركة */
  code: string;
  type: CustomerType;
  name: string;
  phone: string;
  /** أرقام فقط للبحث والمطابقة */
  phoneDigits: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  /** حجم الشغل المستورد من الشيت */
  businessVolume?: number;
  /** رصيد / مديونية مستورد من الشيت */
  balance?: number;
  /** تصنيف تلقائي حسب حجم الشغل */
  sizeTier?: CustomerSizeTier;
  /** متابعة يدوية للأكشن التشغيلي */
  followUpStatus?: CustomerFollowUpStatus;
  followUpNotes?: string;
  /** وقت آخر استيراد مؤشرات (حجم/رصيد) */
  metricsUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export type CustomerFinancialSummary = {
  repairJobs: number;
  warrantyJobs: number;
  outOfWarrantyJobs: number;
  repairGross: number;
  repairDiscounts: number;
  warrantyAllowances: number;
  repairPaid: number;
  repairBalanceDue: number;
  warrantyActualCost: number;
  warrantyPartsCost: number;
  warrantyServiceCost: number;
  salesInvoices: number;
  salesGross: number;
  salesDiscounts: number;
  salesNetPaid: number;
  salesQuantity: number;
  fullDiscountInvoices: number;
  totalCustomerPaid: number;
  legacyIncompleteWarrantyJobs: number;
};

export type CustomerFinancialAnalytics = {
  ok: true;
  customerId: string;
  period: { from: string; to: string };
  summary: CustomerFinancialSummary;
  repairRows: Array<Record<string, unknown>>;
  invoiceRows: Array<Record<string, unknown>>;
  paymentRows: Array<Record<string, unknown>>;
};

export type CustomerActivityModule = 'customers' | 'repair' | (string & {});

export type CustomerActivityAction =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.imported'
  | 'customer.metrics_imported'
  | 'customer.follow_up_updated'
  | 'repair.job_created'
  | 'repair.job_linked'
  | 'repair.job_delivered'
  | 'repair.job_cancelled'
  | 'repair.job_unrepairable'
  | 'repair.invoice_created'
  | 'repair.invoice_cancelled'
  | (string & {});

export interface CustomerActivity {
  id?: string;
  tenantId: string;
  customerId: string;
  module: CustomerActivityModule;
  action: CustomerActivityAction;
  title: string;
  summary?: string;
  referenceType?: string;
  referenceId?: string;
  referenceLabel?: string;
  at: string;
  actorUid?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
}

export type CustomerCreateInput = {
  code?: string;
  type: CustomerType;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
  createdBy?: string;
  createdByName?: string;
};

export type CustomerUpdateInput = Partial<
  Pick<Customer, 'code' | 'type' | 'name' | 'phone' | 'address' | 'notes' | 'isActive'>
> & {
  updatedBy?: string;
  updatedByName?: string;
};

export type CustomerMetricsInput = {
  businessVolume: number;
  balance: number;
  updatedBy?: string;
  updatedByName?: string;
};

export type CustomerFollowUpInput = {
  followUpStatus: CustomerFollowUpStatus;
  followUpNotes?: string;
  updatedBy?: string;
  updatedByName?: string;
};
