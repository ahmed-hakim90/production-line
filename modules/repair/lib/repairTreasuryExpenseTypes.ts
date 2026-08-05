/** كتالوج أنواع مصروف خزينة الصيانة — مربوط بأكواد شجرة الحسابات الافتراضية. */

export type RepairTreasuryExpenseTypeKey =
  | 'salaries'
  | 'packaging'
  | 'electricity'
  | 'internet'
  | 'water'
  | 'cleaning'
  | 'office_supplies'
  | 'other';

export interface RepairTreasuryExpenseTypeDef {
  key: RepairTreasuryExpenseTypeKey;
  label: string;
  accountCode: string;
  accountName: string;
}

export const REPAIR_TREASURY_EXPENSE_TYPES: readonly RepairTreasuryExpenseTypeDef[] = [
  {
    key: 'salaries',
    label: 'مرتبات وأجور فنيين',
    accountCode: '611001',
    accountName: 'مرتبات وأجور فنيين الصيانة',
  },
  {
    key: 'packaging',
    label: 'تعبئة وتغليف',
    accountCode: '612001',
    accountName: 'تعبئة وتغليف — صيانة',
  },
  {
    key: 'electricity',
    label: 'كهرباء',
    accountCode: '612002',
    accountName: 'كهرباء — صيانة',
  },
  {
    key: 'internet',
    label: 'إنترنت واتصالات',
    accountCode: '612003',
    accountName: 'إنترنت واتصالات — صيانة',
  },
  {
    key: 'water',
    label: 'مياه',
    accountCode: '612004',
    accountName: 'مياه — صيانة',
  },
  {
    key: 'cleaning',
    label: 'نظافة',
    accountCode: '612005',
    accountName: 'نظافة — صيانة',
  },
  {
    key: 'office_supplies',
    label: 'أدوات مكتبية',
    accountCode: '612006',
    accountName: 'أدوات مكتبية — صيانة',
  },
  {
    key: 'other',
    label: 'مصروفات صيانة أخرى',
    accountCode: '612099',
    accountName: 'مصروفات صيانة أخرى',
  },
] as const;

export const REPAIR_TREASURY_EXPENSE_TYPE_KEYS = REPAIR_TREASURY_EXPENSE_TYPES.map(
  (row) => row.key,
) as RepairTreasuryExpenseTypeKey[];

export const REPAIR_MANUAL_INCOME_ACCOUNT_CODE = '419002';
export const REPAIR_MANUAL_INCOME_ACCOUNT_NAME = 'إيرادات متنوعة صيانة';

export function getRepairTreasuryExpenseType(
  key: string,
): RepairTreasuryExpenseTypeDef | null {
  const normalized = String(key || '').trim() as RepairTreasuryExpenseTypeKey;
  return REPAIR_TREASURY_EXPENSE_TYPES.find((row) => row.key === normalized) || null;
}

export function repairTreasuryExpenseAccountCodes(): string[] {
  return REPAIR_TREASURY_EXPENSE_TYPES.map((row) => row.accountCode);
}
