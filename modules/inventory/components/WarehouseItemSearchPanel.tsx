import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '../../../utils/calculations';
import { hasActiveItemSearch, matchesItemSearch } from '../lib/itemSearch';
import type { StockItemBalance } from '../types';

const PAGE_SIZE = 15;

type Props = {
  pageId: string;
  warehouseId: string;
  balances: StockItemBalance[];
  loading?: boolean;
  title?: string;
  locationLabel?: (row: StockItemBalance) => string;
};

export function WarehouseItemSearchPanel({
  pageId,
  warehouseId,
  balances,
  loading = false,
  title = 'بحث صنف في هذا المخزن',
  locationLabel,
}: Props) {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const showLocation = typeof locationLabel === 'function';
  const searchActive = hasActiveItemSearch(search);

  const filtered = useMemo(
    () => (searchActive ? balances.filter((row) => matchesItemSearch(row, search)) : []),
    [balances, search, searchActive],
  );

  useEffect(() => {
    setPage(1);
  }, [search, warehouseId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <OpsDashPanel
      title={title}
      accent="inventory"
      bodyClassName="p-0"
      loading={loading}
      loadingLabel="جاري تحميل أرصدة المخزن…"
    >
      <SmartFilterBar
        pageId={pageId}
        searchPlaceholder="ابحث بالاسم أو الكود..."
        searchValue={search}
        onSearchChange={setSearch}
      />
      {!searchActive ? (
        <p className="px-4 py-6 text-sm text-[var(--color-text-muted)]">
          اكتب حرفين على الأقل من الاسم أو الكود لعرض الرصيد في هذا المخزن.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-right">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الصنف</th>
                  <th className="erp-th text-center">الرصيد</th>
                  {showLocation ? <th className="erp-th">الموقع</th> : null}
                  <th className="erp-th text-center">كارت</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                      colSpan={showLocation ? 4 : 3}
                    >
                      جاري التحميل…
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                      colSpan={showLocation ? 4 : 3}
                    >
                      لا توجد أصناف مطابقة في هذا المخزن.
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => (
                    <tr key={`${row.itemType}-${row.itemId}`} className="border-t border-[var(--color-border)]/40">
                      <td className="px-4 py-2">
                        <p className="text-sm font-bold text-[var(--color-text)]">{row.itemName}</p>
                        <p className="font-mono text-xs text-[var(--color-text-muted)]">{row.itemCode || '—'}</p>
                      </td>
                      <td className="px-4 py-2 text-center text-sm font-bold tabular-nums">
                        {formatNumber(row.quantity)}
                      </td>
                      {showLocation ? (
                        <td className="px-4 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                          {locationLabel?.(row) || '—'}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-center">
                        {warehouseId && row.itemId ? (
                          <Link
                            className="text-xs font-bold text-primary underline"
                            to={withTenantPath(
                              tenantSlug,
                              `/inventory/item-card?itemType=${encodeURIComponent(row.itemType)}&itemId=${encodeURIComponent(row.itemId)}&warehouseId=${encodeURIComponent(warehouseId)}`,
                            )}
                          >
                            فتح
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            onPageChange={setPage}
            itemLabel="صنف"
          />
        </>
      )}
    </OpsDashPanel>
  );
}
