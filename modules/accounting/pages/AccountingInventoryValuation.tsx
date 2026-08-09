import React, { useEffect, useMemo, useState } from "react";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/Toast";
import { DataPaginationFooter } from "@/src/components/erp/DataPaginationFooter";
import { SmartFilterBar } from "@/src/components/erp/SmartFilterBar";
import { AccountingKpiStrip } from "../components/AccountingKpiStrip";
import {
  PAGE_SIZE,
  exportAccountingCsv,
  formatAccountingMoney,
} from "../lib/accountingUi";
import type { InventoryValuationResult } from "../types";
import { accountingService } from "../services/accountingService";

export const AccountingInventoryValuation: React.FC = () => {
  const [valuation, setValuation] = useState<InventoryValuationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      setValuation(await accountingService.inventoryValuation());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تقييم المخزون.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const warehouseOptions = useMemo(
    () => [
      { value: "all", label: "كل المخازن" },
      ...(valuation?.warehouses || []).map((row) => ({
        value: row.warehouseId,
        label: row.warehouseName || row.warehouseId,
      })),
    ],
    [valuation],
  );

  const filteredRows = useMemo(() => {
    const rows = valuation?.rows || [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (warehouseFilter !== "all" && row.warehouseId !== warehouseFilter) {
        return false;
      }
      if (!q) return true;
      return `${row.itemCode} ${row.itemName} ${row.warehouseName}`
        .toLowerCase()
        .includes(q);
    });
  }, [valuation, search, warehouseFilter]);

  useEffect(() => setPage(1), [search, warehouseFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <ModuleOpsPageShell
      eyebrow="قيمة المخزون"
      rangeLabel="تقييم المخزون حسب المخزن والصنف مع كشف الأسعار الناقصة"
      dir="rtl"
      onRefresh={() => void load()}
      refreshing={loading}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!valuation) return;
              exportAccountingCsv(
                "inventory-valuation.csv",
                ["المخزن", "الكود", "الصنف", "الكمية", "تكلفة الوحدة", "القيمة"],
                filteredRows.map((row) => [
                  row.warehouseName,
                  row.itemCode,
                  row.itemName,
                  row.quantity,
                  row.unitCost,
                  row.value,
                ]),
              );
            }}
          >
            تصدير CSV
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <AccountingKpiStrip
          items={[
            {
              label: "قيمة المخزون الحالية",
              value: valuation?.totalValue || 0,
              tone: "emerald",
              suffix: "ج.م",
            },
            {
              label: "عدد المخازن",
              value: valuation?.warehouses.length || 0,
              format: "integer",
            },
            {
              label: "أصناف بلا تكلفة شراء",
              value: valuation?.unknownCostLines || 0,
              tone: "rose",
              format: "integer",
            },
          ]}
        />
      )}

      <OpsDashPanel title="ملخص المخازن">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {valuation?.warehouses.map((row) => (
              <div key={row.warehouseId} className="rounded-lg border p-3">
                <div className="flex justify-between gap-2">
                  <strong className="text-sm">
                    {row.warehouseName || row.warehouseId}
                  </strong>
                  <Badge
                    variant={row.unknownCostLines ? "destructive" : "default"}
                  >
                    {row.lines} صنف
                  </Badge>
                </div>
                <p className="mt-3 text-xl font-bold tabular-nums">
                  {formatAccountingMoney(row.value)} ج.م
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.unknownCostLines} صنف بدون تكلفة
                </p>
              </div>
            ))}
            {!loading && !valuation?.warehouses.length ? (
              <p className="col-span-full p-6 text-center text-muted-foreground">
                لا توجد مخازن بأرصدة.
              </p>
            ) : null}
          </div>
      </OpsDashPanel>

      <OpsDashPanel title="تفصيل الأرصدة" bodyClassName="p-0">
        <SmartFilterBar
          pageId="accounting-inventory"
          searchPlaceholder="بحث بالصنف أو المخزن"
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: "warehouse",
              label: "المخزن",
              defaultVisible: true,
              options: warehouseOptions,
            },
          ]}
          filterValues={{ warehouse: warehouseFilter }}
          onFilterChange={(key, value) => {
            if (key === "warehouse") setWarehouseFilter(value);
          }}
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
                className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm ${!row.costKnown ? "bg-rose-50/60" : ""}`}
              >
                <p className="text-sm font-semibold truncate">{row.itemName}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.itemCode}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.warehouseName}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-muted-foreground">الكمية</dt>
                    <dd className="tabular-nums">{formatAccountingMoney(row.quantity)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">تكلفة الوحدة</dt>
                    <dd className="tabular-nums">{row.costKnown ? formatAccountingMoney(row.unitCost) : "غير محدد"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">القيمة</dt>
                    <dd className="font-semibold tabular-nums">{formatAccountingMoney(row.value)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          {!loading && filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد أرصدة مخزون.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[720px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">المخزن</th>
                <th className="erp-th text-start">الكود</th>
                <th className="erp-th text-start">الصنف</th>
                <th className="erp-th">الكمية</th>
                <th className="erp-th">تكلفة الوحدة</th>
                <th className="erp-th">القيمة</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((row) => (
                  <tr
                    key={row.id}
                    className={!row.costKnown ? "bg-rose-50/60" : undefined}
                  >
                    <td>{row.warehouseName}</td>
                    <td className="font-mono">{row.itemCode}</td>
                    <td>{row.itemName}</td>
                    <td className="text-center tabular-nums">
                      {formatAccountingMoney(row.quantity)}
                    </td>
                    <td className="text-center tabular-nums">
                      {row.costKnown
                        ? formatAccountingMoney(row.unitCost)
                        : "غير محدد"}
                    </td>
                    <td className="text-center font-semibold tabular-nums">
                      {formatAccountingMoney(row.value)}
                    </td>
                  </tr>
                ))}
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد أرصدة مخزون.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          onPageChange={setPage}
          itemLabel="صنف"
        />
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
