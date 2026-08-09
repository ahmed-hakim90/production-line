import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { sparePartsRecallService } from '../services/sparePartsRecallService';
import type { MaintenanceCenterSpareBalanceRow } from '../types';

const PAGE_SIZE = 20;

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

export const SparePartsCenterStock: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canView = can('sparePartsRecall.view') || can('sparePartsReplenishment.view') || can('inventory.view');
  const canCreateRecall = can('sparePartsRecall.create');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MaintenanceCenterSpareBalanceRow[]>([]);
  const [centers, setCenters] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get('warehouseId') || '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await sparePartsRecallService.listCenterBalances({
        warehouseId: warehouseFilter || undefined,
      });
      setRows(result.rows);
      setCenters(result.centers);
    } catch (error: unknown) {
      setRows([]);
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل أرصدة المراكز.');
    } finally {
      setLoading(false);
    }
  }, [canView, warehouseFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [warehouseFilter, search]);

  const selectionKey = (row: MaintenanceCenterSpareBalanceRow) =>
    `${row.warehouseId}__${row.itemId}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = `${row.warehouseName} ${row.itemName} ${row.itemCode}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => Number(selected[selectionKey(row)] || 0) > 0),
    [rows, selected],
  );

  const pageCenterId = useMemo(() => {
    if (!paged.length) return '';
    const first = paged[0]?.warehouseId || '';
    return paged.every((row) => row.warehouseId === first) ? first : '';
  }, [paged]);

  const fillPageQty = () => {
    if (!pageCenterId) {
      toast.error('صفّ حسب مركز واحد أولاً ثم عبّئ كميات الصفحة.');
      return;
    }
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of paged) {
        if (row.warehouseId !== pageCenterId) continue;
        next[selectionKey(row)] = String(row.quantity);
      }
      return next;
    });
  };

  const buildRecallQuery = () => {
    if (selectedRows.length === 0) return '';
    const warehouseId = selectedRows[0]?.warehouseId || '';
    const sameWarehouse = selectedRows.every((row) => row.warehouseId === warehouseId);
    if (!sameWarehouse) {
      toast.error('اختر أصنافاً من نفس المركز لطلب سحب واحد.');
      return '';
    }
    const lines = selectedRows
      .map((row) => {
        const qty = Number(selected[selectionKey(row)] || 0);
        return `${row.itemId}:${qty}`;
      })
      .join(',');
    return `?fromWarehouseId=${encodeURIComponent(warehouseId)}&lines=${encodeURIComponent(lines)}`;
  };

  if (!canView) {
    return (
      <ModuleOpsPageShell eyebrow="أرصدة المراكز">
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="أرصدة قطع الغيار في المراكز"
      rangeLabel="اعرض رصيد كل مركز، حدّد الكمية، وأنشئ طلب سحب للرئيسي مباشرة."
      actions={(
        <div className="flex flex-wrap gap-2">
          <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-recall')}>
            <Button type="button" variant="secondary">طلبات السحب</Button>
          </Link>
          {canCreateRecall ? (
            <Button
              type="button"
              onClick={() => {
                const q = buildRecallQuery();
                if (!q) return;
                navigate(withTenantPath(tenantSlug, `/inventory/spare-parts-recall${q}`));
              }}
              disabled={selectedRows.length === 0}
            >
              سحب المحدد للرئيسي ({selectedRows.length})
            </Button>
          ) : null}
        </div>
      )}
    >
      <OpsDashPanel title="أرصدة المراكز" accent="inventory" bodyClassName="p-0">
        <SmartFilterBar
          pageId="spare-parts-center-stock"
          searchPlaceholder="اسم أو كود الصنف أو اسم المركز…"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'warehouse',
              placeholder: 'كل المراكز',
              options: centers.map((c) => ({ value: c.id, label: c.name })),
            },
          ]}
          quickFilterValues={{
            warehouse: warehouseFilter || 'all',
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'warehouse') setWarehouseFilter(value === 'all' ? '' : value);
          }}
          extra={(
            <div className="flex flex-wrap gap-2">
              {canCreateRecall && pageCenterId ? (
                <Button type="button" variant="ghost" size="sm" onClick={fillPageQty}>
                  تعبئة كميات الصفحة
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
                تحديث
              </Button>
            </div>
          )}
        />

        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">المركز</th>
                <th className="erp-th text-start">الصنف</th>
                <th className="erp-th text-start">الكود</th>
                <th className="erp-th text-start">الرصيد</th>
                {canCreateRecall ? <th className="erp-th text-start">كمية السحب</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td className="py-3 px-2" colSpan={canCreateRecall ? 5 : 4}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={canCreateRecall ? 5 : 4}
                    className="py-10 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    لا توجد أرصدة موجبة مطابقة للتصفية.
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const key = selectionKey(row);
                  return (
                    <tr key={key} className="border-b border-[var(--color-border)]/50">
                      <td className="py-2 px-2 font-medium">{row.warehouseName}</td>
                      <td className="py-2 px-2">{row.itemName}</td>
                      <td className="py-2 px-2 font-mono text-xs">{row.itemCode || '—'}</td>
                      <td className="py-2 px-2 tabular-nums">{fmt(row.quantity)}</td>
                      {canCreateRecall ? (
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            max={row.quantity}
                            step="any"
                            className="w-28 border rounded-lg px-2 py-1"
                            value={selected[key] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSelected((prev) => ({ ...prev, [key]: value }));
                            }}
                            placeholder="0"
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 ? (
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            onPageChange={setPage}
            itemLabel="صنف"
          />
        ) : null}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};

export default SparePartsCenterStock;
