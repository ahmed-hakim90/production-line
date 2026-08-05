import { toEnglishDigits } from '@/lib/englishDigits';
import { normalizeCustomerPhoneDigits } from '@/modules/repair/utils/customerPhone';
import { normalizeCustomerCode } from './customerCode';
import type { Customer } from '../types';

const DEFAULT_LIMIT = 50;

/**
 * بحث محلي على قائمة عملاء محمّلة (كود / اسم / موبايل).
 * مناسب لحجم ~آلاف العملاء على صفحة CRM والـ picker.
 */
export function matchCustomers(
  customers: readonly Customer[],
  query: string,
  limit = DEFAULT_LIMIT,
): Customer[] {
  const raw = toEnglishDigits(String(query || '').trim());
  const active = customers.filter((c) => c.isActive !== false);
  if (!raw) return active.slice(0, limit);

  const qLower = raw.toLowerCase();
  const codeQ = normalizeCustomerCode(raw).toLowerCase();
  const digits = normalizeCustomerPhoneDigits(raw);

  const scored: Array<{ customer: Customer; score: number }> = [];
  for (const customer of active) {
    const code = String(customer.code || '').toLowerCase();
    const name = String(customer.name || '').toLowerCase();
    const phoneDigits = String(customer.phoneDigits || normalizeCustomerPhoneDigits(customer.phone));
    let score = 0;

    if (codeQ && code === codeQ) score = Math.max(score, 100);
    else if (codeQ && code.startsWith(codeQ)) score = Math.max(score, 80);
    else if (codeQ && code.includes(codeQ)) score = Math.max(score, 60);

    if (name === qLower) score = Math.max(score, 95);
    else if (name.startsWith(qLower)) score = Math.max(score, 75);
    else if (name.includes(qLower)) score = Math.max(score, 55);

    if (digits.length >= 3) {
      if (phoneDigits === digits) score = Math.max(score, 98);
      else if (phoneDigits.endsWith(digits) || digits.endsWith(phoneDigits)) score = Math.max(score, 85);
      else if (phoneDigits.includes(digits)) score = Math.max(score, 50);
    }

    if (score > 0) scored.push({ customer, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || String(a.customer.code).localeCompare(String(b.customer.code)))
    .slice(0, limit)
    .map((row) => row.customer);
}

export function formatCustomerOptionLabel(customer: Pick<Customer, 'code' | 'name' | 'phone' | 'type'>): string {
  const typeLabel = customer.type === 'trader' ? 'تاجر' : 'مستهلك';
  return `${customer.code} — ${customer.name} (${customer.phone || '-'}) · ${typeLabel}`;
}
