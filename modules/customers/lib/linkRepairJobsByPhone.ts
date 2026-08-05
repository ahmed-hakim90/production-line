import { buildCustomerPhoneDigits } from './customerCode';

export type RepairJobCustomerLinkStatus =
  | 'link'
  | 'skip_already_linked'
  | 'skip_no_phone'
  | 'skip_no_match'
  | 'skip_ambiguous';

export type RepairJobLinkInput = {
  id?: string;
  receiptNo?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
};

export type CustomerLinkInput = {
  id?: string;
  code?: string;
  phone?: string;
  phoneDigits?: string;
};

export type RepairJobCustomerLinkPlan = {
  jobId: string;
  receiptNo: string;
  customerName: string;
  customerPhone: string;
  status: RepairJobCustomerLinkStatus;
  matchCustomerId?: string;
  matchCode?: string;
  reason?: string;
};

/**
 * يخطط ربط طلبات صيانة بلا customerId بعملاء الماستر عبر تطابق phoneDigits.
 * لا ينشئ عملاء — يربط فقط عند تطابق فريد.
 */
export function planRepairJobCustomerLinks(
  jobs: readonly RepairJobLinkInput[],
  customers: readonly CustomerLinkInput[],
): RepairJobCustomerLinkPlan[] {
  const byDigits = new Map<string, CustomerLinkInput[]>();
  for (const customer of customers) {
    const id = String(customer.id || '').trim();
    if (!id) continue;
    const digits = String(customer.phoneDigits || buildCustomerPhoneDigits(customer.phone || '')).trim();
    if (digits.length < 7) continue;
    const list = byDigits.get(digits) || [];
    list.push(customer);
    byDigits.set(digits, list);
  }

  return jobs.map((job) => {
    const jobId = String(job.id || '').trim();
    const receiptNo = String(job.receiptNo || '').trim() || jobId;
    const customerName = String(job.customerName || '').trim();
    const customerPhone = String(job.customerPhone || '').trim();
    const existingId = String(job.customerId || '').trim();

    if (!jobId) {
      return {
        jobId: '',
        receiptNo,
        customerName,
        customerPhone,
        status: 'skip_no_phone' as const,
        reason: 'معرّف الطلب غير صالح',
      };
    }

    if (existingId) {
      return {
        jobId,
        receiptNo,
        customerName,
        customerPhone,
        status: 'skip_already_linked',
        matchCustomerId: existingId,
        reason: 'مربوط مسبقًا',
      };
    }

    const digits = buildCustomerPhoneDigits(customerPhone);
    if (digits.length < 7) {
      return {
        jobId,
        receiptNo,
        customerName,
        customerPhone,
        status: 'skip_no_phone',
        reason: 'هاتف غير كافٍ للمطابقة',
      };
    }

    const matches = byDigits.get(digits) || [];
    if (matches.length === 0) {
      return {
        jobId,
        receiptNo,
        customerName,
        customerPhone,
        status: 'skip_no_match',
        reason: 'لا يوجد عميل مطابق',
      };
    }
    if (matches.length > 1) {
      return {
        jobId,
        receiptNo,
        customerName,
        customerPhone,
        status: 'skip_ambiguous',
        reason: `أكثر من عميل بنفس الهاتف (${matches.length})`,
      };
    }

    const hit = matches[0];
    return {
      jobId,
      receiptNo,
      customerName,
      customerPhone,
      status: 'link',
      matchCustomerId: String(hit.id),
      matchCode: String(hit.code || ''),
    };
  });
}

export function summarizeRepairJobCustomerLinkPlan(plans: readonly RepairJobCustomerLinkPlan[]) {
  return {
    total: plans.length,
    link: plans.filter((p) => p.status === 'link').length,
    alreadyLinked: plans.filter((p) => p.status === 'skip_already_linked').length,
    noPhone: plans.filter((p) => p.status === 'skip_no_phone').length,
    noMatch: plans.filter((p) => p.status === 'skip_no_match').length,
    ambiguous: plans.filter((p) => p.status === 'skip_ambiguous').length,
  };
}
