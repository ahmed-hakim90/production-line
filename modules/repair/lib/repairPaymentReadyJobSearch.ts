import { toEnglishDigits } from '@/lib/englishDigits';
import { customerPhonesMatch } from '../utils/customerPhone';

export type RepairPaymentReadyJobSearchFields = {
  receiptNo?: string;
  customerName?: string;
  customerPhone?: string;
  productName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  serialNo?: string;
  branchName?: string;
};

/**
 * Client-side match for the "ready for payment authorization" list.
 * Digits are normalized so Arabic numerals match Western ones.
 */
export function matchesRepairPaymentReadyJobSearch(
  job: RepairPaymentReadyJobSearchFields,
  search: string,
): boolean {
  const q = toEnglishDigits(String(search || '')).trim().toLowerCase();
  if (!q) return true;

  const textHay = [
    job.receiptNo,
    job.customerName,
    job.productName,
    job.deviceBrand,
    job.deviceModel,
    job.serialNo,
    job.branchName,
  ]
    .map((part) => toEnglishDigits(String(part || '')).toLowerCase())
    .join(' ');

  if (textHay.includes(q)) return true;
  if (customerPhonesMatch(String(job.customerPhone || ''), q)) return true;
  return false;
}
