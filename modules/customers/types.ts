import type { Timestamp } from 'firebase/firestore';

export type CustomerDepositEntryStatus = 'pending' | 'confirmed';

/** يُمرَّر مع رابط تفاصيل الإيداع لتنقّل سابق/تالي */
export type DepositListNavState = { depositNavIds?: string[] };

export interface CustomerDepositCustomer {
  id: string;
  tenantId: string;
  code: string;
  codeNormalized: string;
  name: string;
  openingBalance: number;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDepositCompanyBankAccount {
  id: string;
  tenantId: string;
  accountNumber: string;
  accountNumberNormalized: string;
  bankLabel: string;
  openingBalance: number;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDepositEntry {
  id: string;
  tenantId: string;
  /** رقم مسلسل للعرض لكل شركة؛ يُعاد استخدام الرقم عند حذف الإيداع */
  depositSerial?: number;
  amount: number;
  depositorName: string;
  depositorAccountNumber: string;
  customerId: string;
  customerCodeSnapshot: string;
  customerNameSnapshot: string;
  companyBankAccountId: string;
  bankLabelSnapshot: string;
  depositDate: string;
  status: CustomerDepositEntryStatus;
  createdByUid: string;
  createdAt: Timestamp;
  confirmedByUid?: string;
  confirmedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDepositAdjustment {
  id: string;
  tenantId: string;
  effectiveDate: string;
  signedAmount: number;
  note: string;
  customerId?: string;
  companyBankAccountId?: string;
  createdByUid: string;
  createdAt: Timestamp;
}

export type CustomerDepositStatementRow =
  | {
      kind: 'deposit';
      id: string;
      date: string;
      amount: number;
      status: CustomerDepositEntryStatus;
      label: string;
    }
  | {
      kind: 'adjustment';
      id: string;
      date: string;
      amount: number;
      label: string;
    };
