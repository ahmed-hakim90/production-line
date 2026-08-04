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
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export type CustomerActivityModule = 'customers' | 'repair' | (string & {});

export type CustomerActivityAction =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.imported'
  | 'repair.job_created'
  | 'repair.job_linked'
  | 'repair.invoice_created'
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
