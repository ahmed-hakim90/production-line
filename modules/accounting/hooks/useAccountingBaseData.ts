import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { accountingService } from "../services/accountingService";
import type { AccountingReadiness } from "../lib/accountingUi";
import type {
  AccountingAccount,
  AccountingJournalEntry,
  AccountingOutboxItem,
  AccountingPeriod,
  AccountingSettings,
} from "../types";

export function useAccountingBaseData() {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [journals, setJournals] = useState<AccountingJournalEntry[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [pendingOutbox, setPendingOutbox] = useState<AccountingOutboxItem[]>([]);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [readiness, setReadiness] = useState<AccountingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [accountRows, journalRows, settingRow, periodRows, readinessRow, outboxRows] =
        await Promise.all([
          accountingService.listAccounts(),
          accountingService.listJournals(),
          accountingService.getSettings(),
          accountingService.listPeriods(),
          accountingService.readiness(),
          accountingService.listPendingOutbox(),
        ]);
      setAccounts(accountRows);
      setJournals(journalRows);
      setSettings(settingRow);
      setPeriods(periodRows);
      setReadiness(readinessRow as unknown as AccountingReadiness);
      setPendingOutbox(outboxRows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تحميل بيانات الحسابات.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await action();
        toast.success(success);
        await reload();
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return {
    accounts,
    journals,
    periods,
    pendingOutbox,
    settings,
    setSettings,
    readiness,
    loading,
    busy,
    reload,
    run,
  };
}
