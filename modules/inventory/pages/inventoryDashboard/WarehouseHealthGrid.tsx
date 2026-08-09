import React from 'react';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '../../../../utils/calculations';
import type { WarehouseHealthRow } from './useInventoryControlData';

type Props = {
  loading: boolean;
  rows: WarehouseHealthRow[];
  onSelectWarehouse?: (warehouseId: string) => void;
};

export const WarehouseHealthGrid: React.FC<Props> = ({ loading, rows, onSelectWarehouse }) => {
  return (
    <OpsDashPanel title="صحة المخازن" accent="inventory">
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`wh-sk-${i}`} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مخازن.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((row) => {
            const alertish = row.negativeCount > 0 || row.lowCount > 0;
            return (
              <button
                key={row.warehouseId}
                type="button"
                onClick={() => onSelectWarehouse?.(row.warehouseId)}
                className={`text-right rounded-[var(--border-radius-lg)] border px-3 py-3 transition-colors ${
                  alertish
                    ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--color-text)]">{row.warehouseName}</p>
                  {row.roleHint && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {row.roleHint}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>أصناف: {row.skuCount}</span>
                  <span className="tabular-nums">كمية: {formatNumber(row.totalQty)}</span>
                  <span className={row.lowCount > 0 ? 'text-amber-700 font-medium' : ''}>
                    منخفضة: {row.lowCount}
                  </span>
                  <span className={row.negativeCount > 0 ? 'text-rose-700 font-medium' : ''}>
                    سالبة: {row.negativeCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </OpsDashPanel>
  );
};
