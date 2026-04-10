import type { CustomerDepositEntry } from '../types';

/** عنوان عرض الإيداع: المسلسل إن وُجد، وإلا التاريخ (سجلات قديمة). */
export function formatDepositTitle(e: Pick<CustomerDepositEntry, 'depositSerial' | 'depositDate'>): string {
  if (typeof e.depositSerial === 'number' && e.depositSerial >= 1) {
    return `إيداع رقم ${e.depositSerial}`;
  }
  return `إيداع ${e.depositDate || '—'}`;
}

export function formatDepositTitleWithDate(
  e: Pick<CustomerDepositEntry, 'depositSerial' | 'depositDate'>,
): string {
  if (typeof e.depositSerial === 'number' && e.depositSerial >= 1) {
    return `إيداع رقم ${e.depositSerial} — ${e.depositDate || '—'}`;
  }
  return `إيداع ${e.depositDate || '—'}`;
}
