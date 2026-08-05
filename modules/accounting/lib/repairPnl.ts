import type { AccountingAccount, AccountingJournalEntry } from "../types";
import {
  REPAIR_TREASURY_EXPENSE_TYPES,
  type RepairTreasuryExpenseTypeKey,
} from "../../repair/lib/repairTreasuryExpenseTypes";
import { accountingMoney, postedEntries } from "./accountingReports";

/** مصادر القيود المرتبطة بربحية تشغيل الصيانة */
export const REPAIR_PNL_SOURCES = new Set([
  "repair_delivery",
  "repair_sales_invoice",
  "repair_parts_cogs",
  "repair_parts_issue",
  "repair_treasury_manual",
]);

const SERVICE_REVENUE_CODE = "411001";
const PARTS_REVENUE_CODE = "412001";
const DISCOUNT_CODE = "419001";
const PARTS_COGS_CODE = "511001";
const MISC_INCOME_CODE = "419002";

export interface RepairPnlExpenseRow {
  key: RepairTreasuryExpenseTypeKey | "unclassified";
  label: string;
  accountCode: string;
  amount: number;
}

export interface RepairPnlResult {
  serviceRevenue: number;
  partsRevenue: number;
  miscIncome: number;
  discounts: number;
  netRevenue: number;
  partsCogs: number;
  operatingExpenses: number;
  expensesByType: RepairPnlExpenseRow[];
  operatingProfit: number;
  journalCount: number;
}

const expenseTypeByCode = new Map(
  REPAIR_TREASURY_EXPENSE_TYPES.map((row) => [row.accountCode, row]),
);

function entryMatchesCostCenter(
  entry: AccountingJournalEntry,
  costCenterId?: string,
) {
  if (!costCenterId) return true;
  if (String(entry.costCenterId || "") === costCenterId) return true;
  return (entry.lines || []).some(
    (line) => String(line.costCenterId || "") === costCenterId,
  );
}

function lineMatchesCostCenter(
  entry: AccountingJournalEntry,
  line: AccountingJournalEntry["lines"][number],
  costCenterId?: string,
) {
  if (!costCenterId) return true;
  const lineCc = String(line.costCenterId || "");
  if (lineCc) return lineCc === costCenterId;
  return String(entry.costCenterId || "") === costCenterId;
}

/**
 * قائمة دخل تشغيل الصيانة من القيود المرحّلة فقط.
 */
export function buildRepairPnl(
  accounts: AccountingAccount[],
  entries: AccountingJournalEntry[],
  options?: { from?: string; to?: string; costCenterId?: string },
): RepairPnlResult {
  const accountTypeByCode = new Map(
    accounts.map((account) => [account.code, account.type]),
  );
  const filtered = postedEntries(entries, options?.from, options?.to).filter(
    (entry) =>
      REPAIR_PNL_SOURCES.has(String(entry.source || "")) &&
      entryMatchesCostCenter(entry, options?.costCenterId),
  );

  let serviceRevenue = 0;
  let partsRevenue = 0;
  let miscIncome = 0;
  let discounts = 0;
  let partsCogs = 0;
  const expenseTotals = new Map<string, number>();

  for (const entry of filtered) {
    const source = String(entry.source || "");
    const entryExpenseType = String(
      (entry as AccountingJournalEntry & { expenseType?: string }).expenseType ||
        "",
    ).trim();

    for (const line of entry.lines || []) {
      if (!lineMatchesCostCenter(entry, line, options?.costCenterId)) continue;
      const code = String(line.accountCode || "");
      const debit = accountingMoney(line.debit);
      const credit = accountingMoney(line.credit);
      const type = accountTypeByCode.get(code);

      if (source === "repair_treasury_manual") {
        if (debit > 0 && (type === "expense" || expenseTypeByCode.has(code))) {
          const key =
            entryExpenseType ||
            expenseTypeByCode.get(code)?.key ||
            "unclassified";
          expenseTotals.set(
            key,
            accountingMoney((expenseTotals.get(key) || 0) + debit),
          );
        } else if (credit > 0 && (type === "revenue" || code === MISC_INCOME_CODE)) {
          miscIncome = accountingMoney(miscIncome + credit);
        }
        continue;
      }

      if (debit > 0 && code === PARTS_COGS_CODE) {
        partsCogs = accountingMoney(partsCogs + debit);
        continue;
      }

      if (source === "repair_delivery" || source === "repair_sales_invoice") {
        if (credit > 0) {
          if (code === SERVICE_REVENUE_CODE) {
            serviceRevenue = accountingMoney(serviceRevenue + credit);
          } else if (code === PARTS_REVENUE_CODE) {
            partsRevenue = accountingMoney(partsRevenue + credit);
          } else if (type === "revenue") {
            miscIncome = accountingMoney(miscIncome + credit);
          }
        }
        if (debit > 0 && (code === DISCOUNT_CODE || type === "contra_revenue")) {
          discounts = accountingMoney(discounts + debit);
        }
      }
    }
  }

  const expensesByType: RepairPnlExpenseRow[] = REPAIR_TREASURY_EXPENSE_TYPES.map(
    (row) => ({
      key: row.key,
      label: row.label,
      accountCode: row.accountCode,
      amount: accountingMoney(expenseTotals.get(row.key) || 0),
    }),
  );
  const unclassified = accountingMoney(expenseTotals.get("unclassified") || 0);
  if (unclassified > 0) {
    expensesByType.push({
      key: "unclassified",
      label: "مصروفات غير مصنّفة",
      accountCode: "",
      amount: unclassified,
    });
  }

  const operatingExpenses = accountingMoney(
    expensesByType.reduce((sum, row) => sum + row.amount, 0),
  );
  const netRevenue = accountingMoney(
    serviceRevenue + partsRevenue + miscIncome - discounts,
  );
  const operatingProfit = accountingMoney(
    netRevenue - partsCogs - operatingExpenses,
  );

  return {
    serviceRevenue,
    partsRevenue,
    miscIncome,
    discounts,
    netRevenue,
    partsCogs,
    operatingExpenses,
    expensesByType: expensesByType.filter((row) => row.amount > 0),
    operatingProfit,
    journalCount: filtered.length,
  };
}
