import { useMemo, useState } from 'react';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { resolveWarehouseItemLocation } from '../lib/warehouseCountSheet';
import type { StockItemBalance } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type CatalogHint = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  balances: StockItemBalance[];
  locationByKey: Map<string, string>;
  catalogItems?: CatalogHint[];
};

export function WarehousePartInquiry({ balances, locationByKey, catalogItems = [] }: Props) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 250);
  const needle = debounced.toLowerCase();

  const matches = useMemo(() => {
    if (needle.length < 2) return [];
    return balances
      .filter((row) => {
        const hay = `${row.itemName} ${row.itemCode}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 12);
  }, [balances, needle]);

  const catalogOnly = useMemo(() => {
    if (needle.length < 2 || matches.length > 0) return [];
    const inStock = new Set(balances.map((row) => row.itemId));
    return catalogItems
      .filter((row) => {
        if (inStock.has(row.id)) return false;
        const hay = `${row.name} ${row.code}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [balances, catalogItems, matches.length, needle]);

  return (
    <OpsDashPanel title="استعلام قطعة — موجودة؟ وأين؟" accent="inventory">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
          ابحث بالاسم أو الكود
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="مثال: قاعدة SK أو SP-2477"
          className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
      </label>

      {needle.length > 0 && needle.length < 2 ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">اكتب حرفين على الأقل.</p>
      ) : null}

      {needle.length >= 2 && matches.length === 0 && catalogOnly.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-[rgb(var(--color-danger))]">
          غير موجودة في هذا المخزن بهذا الاسم أو الكود.
        </p>
      ) : null}

      {matches.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--color-text-muted)]">
                <th className="py-1 text-start">الصنف</th>
                <th className="py-1 text-start">الكود</th>
                <th className="py-1 text-start">الرصيد</th>
                <th className="py-1 text-start">الموقع</th>
                <th className="py-1 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((row) => {
                const qty = Number(row.quantity || 0);
                const location = resolveWarehouseItemLocation(locationByKey, row);
                return (
                  <tr key={`${row.itemType}-${row.itemId}`} className="border-t border-[var(--color-border)]/40">
                    <td className="py-1.5 font-semibold">{row.itemName}</td>
                    <td className="py-1.5 font-mono text-xs">{row.itemCode || '—'}</td>
                    <td className="py-1.5 tabular-nums">{fmt(qty)}</td>
                    <td className="py-1.5 font-mono text-xs">{location}</td>
                    <td className="py-1.5 text-xs font-bold">
                      {qty > 0 ? (
                        <span className="text-[rgb(var(--color-success))]">موجودة</span>
                      ) : (
                        <span className="text-[rgb(var(--color-warning))]">الرصيد صفر</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {catalogOnly.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold text-[rgb(var(--color-warning))]">
            القطعة في الماستر لكن بدون رصيد في هذا المخزن:
          </p>
          {catalogOnly.map((row) => (
            <p key={row.id} className="text-sm">
              {row.name} <span className="font-mono text-xs text-[var(--color-text-muted)]">({row.code || '—'})</span>
            </p>
          ))}
        </div>
      ) : null}
    </OpsDashPanel>
  );
}
