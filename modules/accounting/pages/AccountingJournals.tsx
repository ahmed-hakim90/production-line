import React, { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPaginationFooter } from "@/src/components/erp/DataPaginationFooter";
import { SmartFilterBar } from "@/src/components/erp/SmartFilterBar";
import { useAppStore } from "@/store/useAppStore";
import { usePermission } from "@/utils/permissions";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import {
  SOURCE_LABEL,
  PAGE_SIZE,
  accountingRequestId,
  accountingToday,
  exportAccountingCsv,
  formatAccountingMoney,
} from "../lib/accountingUi";
import type { AccountingJournalLine } from "../types";
import { accountingService } from "../services/accountingService";

const emptyLines = (): AccountingJournalLine[] => [
  { accountCode: "", accountName: "", debit: 0, credit: 0, costCenterId: "" },
  { accountCode: "", accountName: "", debit: 0, credit: 0, costCenterId: "" },
];

export const AccountingJournals: React.FC = () => {
  const { can } = usePermission();
  const costCenters = useAppStore((state) => state.costCenters);
  const { accounts, journals, settings, loading, busy, run } =
    useAccountingBaseData();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [journalForm, setJournalForm] = useState({
    date: accountingToday(),
    description: "",
    lines: emptyLines(),
  });

  const sourceOptions = useMemo(() => {
    const keys = new Set(journals.map((row) => row.source));
    return [
      { value: "all", label: "كل المصادر" },
      ...Array.from(keys).map((key) => ({
        value: key,
        label: SOURCE_LABEL[key] || key,
      })),
    ];
  }, [journals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return journals.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      const date = String(row.date || row.postedAt || row.createdAt || "").slice(
        0,
        10,
      );
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (!q) return true;
      return `${row.referenceNo} ${row.description || ""} ${row.source} ${SOURCE_LABEL[row.source] || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [journals, search, sourceFilter, from, to]);

  useEffect(() => setPage(1), [search, sourceFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const updateLine = (index: number, patch: Partial<AccountingJournalLine>) =>
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.map((line, rowIndex) =>
        rowIndex === index ? { ...line, ...patch } : line,
      ),
    }));

  const saveJournal = () =>
    void run(async () => {
      await accountingService.postJournal({
        ...journalForm,
        requestId: accountingRequestId(),
      });
      setJournalForm({
        date: accountingToday(),
        description: "",
        lines: emptyLines(),
      });
      setDialogOpen(false);
    }, "تم ترحيل القيد المتوازن.");

  const canPost =
    can("accounting.journals.post") &&
    settings?.allowManualJournals !== false;

  return (
    <ModuleOpsPageShell
      eyebrow="القيود اليومية"
      rangeLabel="القيود الآلية واليدوية والعكوس مع مصدر كل عملية"
      dir="rtl"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canPost ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="ms-1 h-4 w-4" />
              قيد جديد
            </Button>
          ) : null}
          <div className="[&_.erp-page-title-block]:hidden [&_.erp-page-head]:m-0 [&_.erp-page-head]:min-h-0 [&_.erp-page-head]:border-0 [&_.erp-page-head]:p-0">
            <PageHeader
              title=""
              backAction={false}
              moreActions={[
                {
                  label: "طباعة",
                  icon: "print",
                  onClick: () => window.print(),
                  group: "تصدير",
                },
                {
                  label: "تصدير CSV",
                  icon: "download",
                  onClick: () =>
                    exportAccountingCsv(
                      "journal-entries.csv",
                      ["المرجع", "التاريخ", "المصدر", "البيان", "مدين", "دائن"],
                      filtered.map((row) => [
                        row.referenceNo,
                        String(row.date || row.postedAt || "").slice(0, 10),
                        SOURCE_LABEL[row.source] || row.source,
                        row.description || "",
                        row.totalDebit,
                        row.totalCredit,
                      ]),
                    ),
                  group: "تصدير",
                },
              ]}
            />
          </div>
        </div>
      }
    >
      <OpsDashPanel title="قيود اليومية" bodyClassName="p-0">
        <SmartFilterBar
          pageId="accounting-journals"
          searchPlaceholder="بحث بالمرجع أو البيان"
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: "source",
              label: "المصدر",
              defaultVisible: true,
              options: sourceOptions,
            },
            {
              key: "from",
              label: "من تاريخ",
              type: "date",
              defaultVisible: true,
            },
            {
              key: "to",
              label: "إلى تاريخ",
              type: "date",
              defaultVisible: true,
            },
          ]}
          filterValues={{ source: sourceFilter, from, to }}
          onFilterChange={(key, value) => {
            if (key === "source") setSourceFilter(value);
            if (key === "from") setFrom(value);
            if (key === "to") setTo(value);
          }}
          extra={
            canPost ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="ms-1 h-4 w-4" />
                قيد جديد
              </Button>
            ) : null
          }
        />
        <div className="erp-mobile-card-list p-2">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border p-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))
            : null}
          {!loading &&
            paged.map((row) => (
              <div
                key={`m-${row.id}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{row.referenceNo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {String(row.date || row.postedAt || row.createdAt || "").slice(0, 10)}
                    </p>
                    <p className="mt-1 text-xs">{SOURCE_LABEL[row.source] || row.source}</p>
                  </div>
                  <Badge variant={row.status === "posted" ? "default" : "secondary"}>
                    {row.status === "posted" ? "مرحل" : "معكوس"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{row.description || "—"}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-muted-foreground">مدين</dt>
                    <dd className="tabular-nums">{formatAccountingMoney(row.totalDebit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">دائن</dt>
                    <dd className="tabular-nums">{formatAccountingMoney(row.totalCredit)}</dd>
                  </div>
                </dl>
                {row.status === "posted" && can("accounting.journals.reverse") ? (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt("سبب عكس القيد:");
                        if (reason)
                          void run(
                            () =>
                              accountingService.reverseJournal(
                                String(row.id),
                                reason,
                              ),
                            "تم إنشاء القيد العكسي.",
                          );
                      }}
                    >
                      <RotateCcw className="ms-1 h-3.5 w-3.5" />
                      عكس
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          {!loading && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد قيود محاسبية.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[860px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">المرجع</th>
                <th className="erp-th">التاريخ</th>
                <th className="erp-th text-start">المصدر</th>
                <th className="erp-th text-start">البيان</th>
                <th className="erp-th">مدين</th>
                <th className="erp-th">دائن</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th print:hidden">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={8} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono">{row.referenceNo}</td>
                    <td className="text-center tabular-nums">
                      {String(
                        row.date || row.postedAt || row.createdAt || "",
                      ).slice(0, 10)}
                    </td>
                    <td>{SOURCE_LABEL[row.source] || row.source}</td>
                    <td>{row.description || "—"}</td>
                    <td className="text-center tabular-nums">
                      {formatAccountingMoney(row.totalDebit)}
                    </td>
                    <td className="text-center tabular-nums">
                      {formatAccountingMoney(row.totalCredit)}
                    </td>
                    <td className="text-center">
                      <Badge
                        variant={
                          row.status === "posted" ? "default" : "secondary"
                        }
                      >
                        {row.status === "posted" ? "مرحل" : "معكوس"}
                      </Badge>
                    </td>
                    <td className="text-center print:hidden">
                      {row.status === "posted" &&
                      can("accounting.journals.reverse") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = window.prompt("سبب عكس القيد:");
                            if (reason)
                              void run(
                                () =>
                                  accountingService.reverseJournal(
                                    String(row.id),
                                    reason,
                                  ),
                                "تم إنشاء القيد العكسي.",
                              );
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد قيود محاسبية.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          onPageChange={setPage}
          itemLabel="قيد"
        />
      </OpsDashPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>قيد يومية جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <div>
                <Label>التاريخ</Label>
                <Input
                  type="date"
                  value={journalForm.date}
                  onChange={(event) =>
                    setJournalForm((row) => ({
                      ...row,
                      date: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>البيان</Label>
                <Input
                  value={journalForm.description}
                  onChange={(event) =>
                    setJournalForm((row) => ({
                      ...row,
                      description: event.target.value,
                    }))
                  }
                  placeholder="شرح واضح لسبب القيد"
                />
              </div>
            </div>
            <div className="space-y-2">
              {journalForm.lines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border p-2 md:grid-cols-[2fr_1fr_1fr_1.5fr_auto]"
                >
                  <Select
                    value={line.accountCode || undefined}
                    onValueChange={(value) => {
                      const account = accounts.find(
                        (row) => row.code === value,
                      );
                      updateLine(index, {
                        accountCode: value,
                        accountName: account?.name || "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="الحساب" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((row) => row.isActive && row.allowPosting)
                        .map((row) => (
                          <SelectItem key={row.code} value={row.code}>
                            {row.code} — {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="مدين"
                    value={line.debit || ""}
                    onChange={(event) =>
                      updateLine(index, {
                        debit: Number(event.target.value),
                        ...(Number(event.target.value) > 0
                          ? { credit: 0 }
                          : {}),
                      })
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="دائن"
                    value={line.credit || ""}
                    onChange={(event) =>
                      updateLine(index, {
                        credit: Number(event.target.value),
                        ...(Number(event.target.value) > 0
                          ? { debit: 0 }
                          : {}),
                      })
                    }
                  />
                  <Select
                    value={line.costCenterId || "none"}
                    onValueChange={(value) =>
                      updateLine(index, {
                        costCenterId: value === "none" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="مركز التكلفة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون مركز</SelectItem>
                      {costCenters.map((center) => (
                        <SelectItem
                          key={String(center.id)}
                          value={String(center.id)}
                        >
                          {center.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    disabled={journalForm.lines.length <= 2}
                    onClick={() =>
                      setJournalForm((row) => ({
                        ...row,
                        lines: row.lines.filter(
                          (_, rowIndex) => rowIndex !== index,
                        ),
                      }))
                    }
                  >
                    حذف
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setJournalForm((row) => ({
                    ...row,
                    lines: [
                      ...row.lines,
                      {
                        accountCode: "",
                        accountName: "",
                        debit: 0,
                        credit: 0,
                        costCenterId: "",
                      },
                    ],
                  }))
                }
              >
                <Plus className="ms-1 h-4 w-4" />
                سطر
              </Button>
              <div className="flex gap-4 text-sm">
                <span>
                  مدين:{" "}
                  <strong className="tabular-nums">
                    {formatAccountingMoney(
                      journalForm.lines.reduce(
                        (sum, row) => sum + Number(row.debit || 0),
                        0,
                      ),
                    )}
                  </strong>
                </span>
                <span>
                  دائن:{" "}
                  <strong className="tabular-nums">
                    {formatAccountingMoney(
                      journalForm.lines.reduce(
                        (sum, row) => sum + Number(row.credit || 0),
                        0,
                      ),
                    )}
                  </strong>
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={busy} onClick={saveJournal}>
              ترحيل القيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleOpsPageShell>
  );
};
