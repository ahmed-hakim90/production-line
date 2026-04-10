import type {
  CustomerDepositAdjustment,
  CustomerDepositCompanyBankAccount,
  CustomerDepositCustomer,
  CustomerDepositEntry,
} from '../types';
import { coerceNumericField } from './numericField';

/** مستحق على العميل (ذمم): ينقص بإيداعات مؤكدة، وتلتقط التسويات. */
export function customerReceivableBalance(
  customer: CustomerDepositCustomer,
  entries: CustomerDepositEntry[],
  adjustments: CustomerDepositAdjustment[],
): { official: number; pendingDeposits: number } {
  const opening = coerceNumericField(customer.openingBalance);
  let confirmedPaid = 0;
  let pendingDeposits = 0;
  for (const e of entries) {
    if (e.customerId !== customer.id) continue;
    const amt = coerceNumericField(e.amount);
    if (e.status === 'confirmed') confirmedPaid += amt;
    else pendingDeposits += amt;
  }
  let adj = 0;
  for (const a of adjustments) {
    if (a.customerId === customer.id) adj += coerceNumericField(a.signedAmount);
  }
  return {
    official: opening - confirmedPaid + adj,
    pendingDeposits,
  };
}

/** وارد معتمد لحساب بنك الشركة. */
export function companyBankCashBalance(
  account: CustomerDepositCompanyBankAccount,
  entries: CustomerDepositEntry[],
  adjustments: CustomerDepositAdjustment[],
): { official: number; pendingInflow: number } {
  const opening = coerceNumericField(account.openingBalance);
  let confirmedIn = 0;
  let pendingInflow = 0;
  for (const e of entries) {
    if (e.companyBankAccountId !== account.id) continue;
    const amt = coerceNumericField(e.amount);
    if (e.status === 'confirmed') confirmedIn += amt;
    else pendingInflow += amt;
  }
  let adj = 0;
  for (const a of adjustments) {
    if (a.companyBankAccountId === account.id) adj += coerceNumericField(a.signedAmount);
  }
  return {
    official: opening + confirmedIn + adj,
    pendingInflow,
  };
}
