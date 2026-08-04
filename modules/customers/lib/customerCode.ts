import { normalizeCustomerPhoneDigits } from '@/modules/repair/utils/customerPhone';
import type { CustomerType } from '../types';

export function normalizeCustomerCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\-./]/g, '');
}

export function customerCodePrefixForType(type: CustomerType): string {
  return type === 'trader' ? 'TRD' : 'CST';
}

export function buildCustomerPhoneDigits(phone: string): string {
  return normalizeCustomerPhoneDigits(phone);
}

/** Max numeric suffix for codes like PREFIX-0001 matching current prefix. */
export function maxCustomerSeqFromCodes(codes: readonly string[], prefix: string): number {
  const p = String(prefix || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!p) return 0;
  const re = new RegExp(`^${escapeRegExp(p)}-(\\d+)$`, 'i');
  let max = 0;
  for (const c of codes) {
    const m = String(c || '').trim().match(re);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return max;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
