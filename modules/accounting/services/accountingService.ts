import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  db,
  isConfigured,
  mutateAccountingCallable,
} from "../../auth/services/firebase";
import { getCurrentTenantId } from "../../../lib/currentTenant";
import type {
  AccountingAccount,
  AccountingJournalEntry,
  AccountingOutboxItem,
  AccountingPeriod,
  AccountingSettings,
  InventoryValuationResult,
} from "../types";

const tenantRows = <T>(snap: Awaited<ReturnType<typeof getDocs>>): T[] => {
  const tenantId = getCurrentTenantId();
  return snap.docs
    .map(
      (item) =>
        ({
          id: item.id,
          ...(item.data() as Record<string, unknown>),
        }) as unknown as T & { tenantId?: string },
    )
    .filter((item) => item.tenantId === tenantId);
};

export const accountingService = {
  async listAccounts(): Promise<AccountingAccount[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        collection(db, "accounting_accounts"),
        where("tenantId", "==", getCurrentTenantId()),
      ),
    );
    return tenantRows<AccountingAccount>(snap).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  },

  async listJournals(): Promise<AccountingJournalEntry[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        collection(db, "accounting_journal_entries"),
        where("tenantId", "==", getCurrentTenantId()),
      ),
    );
    return tenantRows<AccountingJournalEntry>(snap).sort((a, b) =>
      String(b.date || b.postedAt || b.createdAt || "").localeCompare(
        String(a.date || a.postedAt || a.createdAt || ""),
      ),
    );
  },

  async getSettings(): Promise<AccountingSettings> {
    const fallback: AccountingSettings = {
      tenantId: getCurrentTenantId(),
      currency: "EGP",
      fiscalYearStartMonth: 1,
      decimalPlaces: 2,
      inventoryValuationMethod: "weighted_average",
      autoPostInventory: true,
      requireCostCenter: true,
      allowManualJournals: true,
      allowJournalReversal: true,
      enforceOpenPeriods: true,
      allowPeriodReopen: true,
      syncCostAndAccountingClose: true,
      autoPostRepairPayments: true,
      autoPostRepairSales: true,
      autoPostRepairCogs: true,
      autoPostRepairTreasury: true,
      cutoverPeriod: "2026-09",
      openingBalanceStatus: "pending",
    };
    if (!isConfigured) return fallback;
    const snap = await getDoc(
      doc(db, "accounting_settings", getCurrentTenantId()),
    );
    return snap.exists()
      ? ({ ...fallback, ...snap.data() } as AccountingSettings)
      : fallback;
  },

  async listPeriods(): Promise<AccountingPeriod[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        collection(db, "accounting_periods"),
        where("tenantId", "==", getCurrentTenantId()),
      ),
    );
    return tenantRows<AccountingPeriod>(snap).sort((a, b) =>
      b.period.localeCompare(a.period),
    );
  },

  async listPendingOutbox(): Promise<AccountingOutboxItem[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        collection(db, "accounting_posting_outbox"),
        where("tenantId", "==", getCurrentTenantId()),
      ),
    );
    return tenantRows<AccountingOutboxItem>(snap)
      .filter((row) => row.status === "pending")
      .sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)));
  },

  seedDefaults: () => mutateAccountingCallable({ operation: "seed_defaults" }),
  upsertAccount: (input: Record<string, unknown>) =>
    mutateAccountingCallable({ operation: "upsert_account", ...input }),
  saveSettings: (input: Record<string, unknown>) =>
    mutateAccountingCallable({ operation: "save_settings", ...input }),
  upsertCostCenter: (input: Record<string, unknown>) =>
    mutateAccountingCallable({ operation: "upsert_cost_center", ...input }),
  setPeriod: (period: string, status: "open" | "closed") =>
    mutateAccountingCallable({ operation: "set_period", period, status }),
  postJournal: (input: Record<string, unknown>) =>
    mutateAccountingCallable({ operation: "post_journal", ...input }),
  postOpeningBalance: (input: Record<string, unknown>) =>
    mutateAccountingCallable({ operation: "post_opening_balance", ...input }),
  reverseJournal: (journalId: string, reason: string) =>
    mutateAccountingCallable({
      operation: "reverse_journal",
      journalId,
      reason,
    }),
  readiness: () => mutateAccountingCallable({ operation: "readiness" }),
  linkRepairBranch: (input: {
    branchId: string;
    costCenterId: string;
    /** When true (default), server seeds chart defaults and maps the branch to them. */
    useDefaultAccounts?: boolean;
    accountingAccounts?: Record<string, string>;
  }) => mutateAccountingCallable({ operation: "link_repair_branch", ...input }),
  async inventoryValuation(): Promise<InventoryValuationResult> {
    const result = await mutateAccountingCallable({
      operation: "inventory_valuation",
    });
    return result as unknown as InventoryValuationResult;
  },
};
