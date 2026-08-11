import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  COST_CENTER_CATEGORY_LABEL,
  PAGE_SIZE,
} from "../lib/accountingUi";
import { accountingService } from "../services/accountingService";

const emptyForm = () => ({
  id: "",
  code: "",
  name: "",
  accountingCategory: "other",
  parentId: "",
  allowPosting: true,
  isActive: true,
});

export const AccountingCostCenters: React.FC = () => {
  const { can } = usePermission();
  const { readiness, loading, busy, run } = useAccountingBaseData();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const centers = readiness?.costCenters || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return centers.filter((center) => {
      if (
        categoryFilter !== "all" &&
        (center.accountingCategory || "other") !== categoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return `${center.code || ""} ${center.name}`.toLowerCase().includes(q);
    });
  }, [centers, search, categoryFilter]);

  useEffect(() => setPage(1), [search, categoryFilter]);

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

  const save = () =>
    void run(async () => {
      await accountingService.upsertCostCenter(form);
      setDialogOpen(false);
      setForm(emptyForm());
    }, "تم حفظ مركز التكلفة في ماستر الحسابات.");

  return (
    <ModuleOpsPageShell
      eyebrow="مراكز التكلفة"
      rangeLabel="ماستر عام للحسابات يخدم الإنتاج والصيانة والمخازن والإدارة"
      dir="rtl"
      actions={
        can("accounting.settings.manage") ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="ms-1 h-4 w-4" />
            مركز تكلفة جديد
          </Button>
        ) : undefined
      }
    >
      <OpsDashPanel title="مراكز التكلفة" bodyClassName="p-0">
        <SmartFilterBar
          pageId="accounting-cost-centers"
          searchPlaceholder="بحث بالكود أو الاسم"
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: "category",
              label: "التصنيف",
              defaultVisible: true,
              options: [
                { value: "all", label: "كل التصنيفات" },
                ...Object.entries(COST_CENTER_CATEGORY_LABEL).map(
                  ([value, label]) => ({ value, label }),
                ),
              ],
            },
          ]}
          filterValues={{ category: categoryFilter }}
          onFilterChange={(key, value) => {
            if (key === "category") setCategoryFilter(value);
          }}
          extra={
            can("accounting.settings.manage") ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="ms-1 h-4 w-4" />
                مركز جديد
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
            paged.map((center) => {
              const parent = centers.find((row) => row.id === center.parentId);
              return (
                <div
                  key={`m-${center.id}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{center.code || "—"}</p>
                      <p className="mt-0.5 text-sm font-medium">{center.name}</p>
                    </div>
                    <Badge variant={center.isActive ? "default" : "secondary"}>
                      {center.isActive ? "نشط" : "موقوف"}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[10px] text-muted-foreground">التصنيف</dt>
                      <dd>{COST_CENTER_CATEGORY_LABEL[center.accountingCategory || "other"] || "عام"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">تكلفة الإنتاج</dt>
                      <dd>{center.productionCostingEnabled ? "مرتبط" : "غير مرتبط"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">الأب</dt>
                      <dd>{parent?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">الترحيل</dt>
                      <dd>{center.allowPosting === false ? "تجميعي" : "مسموح"}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          {!loading && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مراكز تكلفة في الماستر.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[860px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">الكود</th>
                <th className="erp-th text-start">المركز</th>
                <th className="erp-th">التصنيف</th>
                <th className="erp-th">تكلفة الإنتاج</th>
                <th className="erp-th">المركز الأب</th>
                <th className="erp-th">الترحيل</th>
                <th className="erp-th">الحالة</th>
                {can("accounting.settings.manage") ? (
                  <th className="erp-th print:hidden">إجراء</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={8} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((center) => {
                  const parent = centers.find(
                    (row) => row.id === center.parentId,
                  );
                  return (
                    <tr key={center.id}>
                      <td className="font-mono">{center.code || "—"}</td>
                      <td className="font-medium">{center.name}</td>
                      <td className="text-center">
                        {COST_CENTER_CATEGORY_LABEL[
                          center.accountingCategory || "other"
                        ] || "عام"}
                      </td>
                      <td className="text-center">
                        {center.productionCostingEnabled ? "مرتبط" : "غير مرتبط"}
                      </td>
                      <td className="text-center">{parent?.name || "—"}</td>
                      <td className="text-center">
                        {center.allowPosting === false ? "تجميعي" : "مسموح"}
                      </td>
                      <td className="text-center">
                        <Badge
                          variant={center.isActive ? "default" : "secondary"}
                        >
                          {center.isActive ? "نشط" : "موقوف"}
                        </Badge>
                      </td>
                      {can("accounting.settings.manage") ? (
                        <td className="text-center print:hidden">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setForm({
                                id: center.id,
                                code: center.code || "",
                                name: center.name,
                                accountingCategory:
                                  center.accountingCategory || "other",
                                parentId: center.parentId || "",
                                allowPosting: center.allowPosting !== false,
                                isActive: center.isActive,
                              });
                              setDialogOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد مراكز تكلفة في الماستر.
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
          itemLabel="مركز"
        />
      </OpsDashPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "تعديل مركز تكلفة" : "مركز تكلفة جديد"}
            </DialogTitle>
            <DialogDescription>
              مودال الحسابات العام، مستقل عن إعدادات توزيع تكلفة الإنتاج.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>كود المركز</Label>
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm((row) => ({
                    ...row,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="CC-REPAIR-01"
              />
            </div>
            <div>
              <Label>اسم المركز</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((row) => ({ ...row, name: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>التصنيف</Label>
              <Select
                value={form.accountingCategory}
                onValueChange={(value) =>
                  setForm((row) => ({ ...row, accountingCategory: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COST_CENTER_CATEGORY_LABEL).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>المركز الأب</Label>
              <Select
                value={form.parentId || "none"}
                onValueChange={(value) =>
                  setForm((row) => ({
                    ...row,
                    parentId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مركز أب</SelectItem>
                  {centers
                    .filter(
                      (center) =>
                        center.id !== form.id && center.isActive,
                    )
                    .map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {center.code ? `${center.code} — ` : ""}
                        {center.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
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
              يسمح بترحيل القيود عليه
            </label>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
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
              المركز نشط
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
              حفظ مركز التكلفة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleOpsPageShell>
  );
};
