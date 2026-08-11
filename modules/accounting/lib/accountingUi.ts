import type { AccountingAccountType } from "../types";

export const PAGE_SIZE = 25;

export const ACCOUNT_TYPE_LABEL: Record<AccountingAccountType, string> = {
  asset: "أصول",
  liability: "التزامات",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
  contra_revenue: "خصومات/مقابل إيراد",
};

export const SOURCE_LABEL: Record<string, string> = {
  manual_journal: "قيد يدوي",
  repair_payment: "تحصيل صيانة",
  repair_payment_reversal: "عكس تحصيل صيانة",
  repair_delivery: "تسليم صيانة",
  repair_parts_cogs: "تكلفة قطع صيانة",
  repair_parts_issue: "صرف قطع صيانة",
  repair_sales_invoice: "فاتورة بيع قطع صيانة",
  repair_treasury_manual: "مصروف/إيراد خزينة صيانة",
  journal_reversal: "عكس قيد",
};

export const REPAIR_ACCOUNT_LABELS: Record<string, string> = {
  cash: "النقدية",
  card: "البطاقات",
  bankTransfer: "التحويلات البنكية",
  customerDeposits: "دفعات العملاء المقدمة",
  receivables: "ذمم العملاء",
  serviceRevenue: "إيراد خدمات الصيانة",
  partsRevenue: "إيراد قطع الغيار",
  discounts: "خصومات الصيانة",
  partsInventory: "مخزون قطع الغيار",
  partsCogs: "تكلفة قطع الغيار المباعة",
};

export const REPAIR_ACCOUNT_TYPES: Record<string, AccountingAccountType> = {
  cash: "asset",
  card: "asset",
  bankTransfer: "asset",
  customerDeposits: "liability",
  receivables: "asset",
  serviceRevenue: "revenue",
  partsRevenue: "revenue",
  discounts: "contra_revenue",
  partsInventory: "asset",
  partsCogs: "expense",
};

export const COST_CENTER_CATEGORY_LABEL: Record<string, string> = {
  production: "إنتاج",
  repair: "صيانة",
  warehouse: "مخزن",
  branch: "فرع",
  administration: "إدارة",
  sales: "مبيعات",
  other: "عام",
};

export const formatAccountingMoney = (value: unknown) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const accountingToday = () => new Date().toISOString().slice(0, 10);

export const accountingMonthStart = () =>
  `${accountingToday().slice(0, 7)}-01`;

export const accountingRequestId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function exportAccountingCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const escape = (value: string | number) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv =
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type AccountingReadiness = {
  repairBranches: Array<{
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    costCenterId: string;
    ready: boolean;
    accountingAccounts: Record<string, string>;
    missingAccountKeys?: string[];
  }>;
  defaultRepairAccountingAccounts?: Record<string, string>;
  costCenters: Array<{
    id: string;
    name: string;
    code: string;
    type?: "direct" | "indirect";
    productionCostingEnabled?: boolean;
    accountingCategory?: string;
    parentId?: string;
    allowPosting?: boolean;
    isActive: boolean;
  }>;
};
