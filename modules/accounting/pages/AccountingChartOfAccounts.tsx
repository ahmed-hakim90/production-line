import React, { useEffect, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { usePermission } from "@/utils/permissions";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import {
  ACCOUNT_TYPE_LABEL,
  PAGE_SIZE,
} from "../lib/accountingUi";
import type { AccountingAccountType } from "../types";
import { accountingService } from "../services/accountingService";

const emptyForm = () => ({
  code: "",
  name: "",
  type: "asset" as AccountingAccountType,
  parentCode: "",
  allowPosting: true,
  isActive: true,
});

export const AccountingChartOfAccounts: React.FC = () => {
  const { can } = usePermission();
  const { accounts, loading, busy, run } = useAccountingBaseData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (!q) return true;
      return `${row.code} ${row.name} ${ACCOUNT_TYPE_LABEL[row.type]}`
        .toLowerCase()
        .includes(q);
    });
  }, [accounts, search, typeFilter]);

  useEffect(() => setPage(1), [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: (typeof accounts)[number]) => {
    setForm({
      code: row.code,
      name: row.name,
      type: row.type,
      parentCode: row.parentCode || "",
      allowPosting: row.allowPosting,
      isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const save = () =>
    void run(async () => {
      await accountingService.upsertAccount(form);
      setDialogOpen(false);
      setForm(emptyForm());
    }, "تم حفظ الحساب في شجرة الحسابات.");

  return (
    <div className="erp-ds-clean space-y-5" dir="rtl">
      <PageHeader
        title="شجرة الحسابات"
        subtitle="دليل حسابات هرمي قابل للتحكم والربط مع كل الموديولات"
        icon="account_tree"
        backAction={false}
        primaryAction={
          can("accounting.accounts.manage")
            ? {
                label: "حساب جديد",
                icon: "add",
                onClick: openCreate,
              }
            : undefined
        }
        moreActions={
          can("accounting.accounts.manage")
            ? [
                {
                  label: "استكمال الشجرة الافتراضية",
                  icon: "auto_fix_high",
                  onClick: () =>
                    void run(
                      accountingService.seedDefaults,
                      "تم استكمال الحسابات الافتراضية.",
                    ),
                },
              ]
            : undefined
        }
      />

      <Card className="!p-0 overflow-hidden shadow-none">
        <SmartFilterBar
          pageId="accounting-chart"
          searchPlaceholder="بحث بالكود أو الاسم"
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: "type",
              label: "النوع",
              defaultVisible: true,
              options: [
                { value: "all", label: "كل الأنواع" },
                ...Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                })),
              ],
            },
          ]}
          filterValues={{ type: typeFilter }}
          onFilterChange={(key, value) => {
            if (key === "type") setTypeFilter(value);
          }}
          extra={
            can("accounting.accounts.manage") ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="ms-1 h-4 w-4" />
                حساب جديد
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
                key={`m-${row.code}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tabular-nums">{row.code}</p>
                    <p className="mt-0.5 text-sm font-medium">{row.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[row.type]}</p>
                  </div>
                  <Badge variant={row.isActive ? "default" : "secondary"}>
                    {row.isActive ? "نشط" : "موقوف"}
                  </Badge>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="text-[10px]">الأب</dt>
                    <dd className="font-mono text-[var(--color-text)]">{row.parentCode || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px]">الترحيل</dt>
                    <dd className="text-[var(--color-text)]">{row.allowPosting ? "نعم" : "تجميعي"}</dd>
                  </div>
                </dl>
                {can("accounting.accounts.manage") ? (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                      تعديل
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          {!loading && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حسابات.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[800px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">الكود</th>
                <th className="erp-th text-start">الحساب</th>
                <th className="erp-th text-start">النوع</th>
                <th className="erp-th">الأب</th>
                <th className="erp-th">الترحيل</th>
                <th className="erp-th">الحالة</th>
                {can("accounting.accounts.manage") ? (
                  <th className="erp-th print:hidden">إجراء</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={7} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((row) => (
                  <tr key={row.code}>
                    <td className="font-mono tabular-nums">{row.code}</td>
                    <td
                      className="font-medium"
                      style={{
                        paddingInlineStart: `${Math.max(12, row.parentCode ? 28 : 12)}px`,
                      }}
                    >
                      {row.name}
                    </td>
                    <td>{ACCOUNT_TYPE_LABEL[row.type]}</td>
                    <td className="text-center font-mono">
                      {row.parentCode || "—"}
                    </td>
                    <td className="text-center">
                      {row.allowPosting ? "نعم" : "تجميعي"}
                    </td>
                    <td className="text-center">
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        {row.isActive ? "نشط" : "موقوف"}
                      </Badge>
                    </td>
                    {can("accounting.accounts.manage") ? (
                      <td className="text-center print:hidden">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(row)}
                        >
                          تعديل
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد حسابات. أنشئ الشجرة الافتراضية أو أضف حسابًا.
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
          itemLabel="حساب"
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.code && accounts.some((row) => row.code === form.code)
                ? "تعديل حساب"
                : "حساب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>كود الحساب</Label>
              <Input
                inputMode="numeric"
                value={form.code}
                onChange={(event) =>
                  setForm((row) => ({ ...row, code: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>اسم الحساب</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((row) => ({ ...row, name: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>نوع الحساب</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((row) => ({
                    ...row,
                    type: value as AccountingAccountType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحساب الأب</Label>
              <Select
                value={form.parentCode || "none"}
                onValueChange={(value) =>
                  setForm((row) => ({
                    ...row,
                    parentCode: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="بدون أب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون أب</SelectItem>
                  {accounts
                    .filter((row) => row.isActive && row.code !== form.code)
                    .map((row) => (
                      <SelectItem key={row.code} value={row.code}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.allowPosting}
                onChange={(event) =>
                  setForm((row) => ({
                    ...row,
                    allowPosting: event.target.checked,
                  }))
                }
              />
              يسمح بالترحيل المباشر
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((row) => ({
                    ...row,
                    isActive: event.target.checked,
                  }))
                }
              />
              الحساب نشط
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={busy || !form.code || !form.name}
              onClick={save}
            >
              <Save className="ms-1 h-4 w-4" />
              حفظ الحساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
