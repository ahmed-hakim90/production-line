import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/UI';
import { toast } from '../../../../components/Toast';
import { stockService } from '../../services/stockService';
import type { StockTransaction, Warehouse } from '../../types';
import {
  movementFateLabel,
  movementPathLabel,
  type ConsumableOption,
} from '../../lib/itemMovementTrace';
import { ModalShell } from './ModalShell';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));
const PAGE_SIZE = 30;

type Props = {
  open: boolean;
  onClose: () => void;
  item: ConsumableOption | null;
  warehouses: Warehouse[];
};

export const ItemMovementTraceModal: React.FC<Props> = ({ open, onClose, item, warehouses }) => {
  const [balances, setBalances] = useState<Array<{ warehouseName: string; qty: number }>>([]);

  const warehouseName = useCallback((id: string) => {
    return warehouses.find((w) => w.id === id)?.name || id;
  }, [warehouses]);

  const loadMovementPage = useCallback(async (cursor: Parameters<typeof stockService.getTransactionsPaged>[0] extends infer P
    ? P extends { cursor?: infer C } ? C : never : never) => {
      if (!item?.id) return { items: [], nextCursor: null, hasNext: false };
      const result = await stockService.getTransactionsPaged({
        itemId: item.id,
        itemType: 'material',
        limit: PAGE_SIZE,
        cursor,
      });
      return { items: result.items, nextCursor: result.nextCursor, hasNext: result.hasMore };
  }, [item?.id]);
  const movementPager = useCursorPagination<StockTransaction, NonNullable<Awaited<ReturnType<typeof stockService.getTransactionsPaged>>['nextCursor']>>({
    queryKey: `inventory:item-trace:${open ? item?.id || '' : ''}`,
    loadPage: loadMovementPage,
    enabled: open && Boolean(item?.id),
  });
  const rows = movementPager.items;
  const loading = movementPager.loading;

  useEffect(() => {
    if (!open || !item?.id) {
      setBalances([]);
      return;
    }
    void stockService.getBalances().then((bals) => {
      setBalances(
        bals
          .filter((b) => b.itemType === 'material' && b.itemId === item.id)
          .map((b) => ({ warehouseName: warehouseName(b.warehouseId), qty: Number(b.quantity || 0) })),
      );
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'تعذر تحميل الأرصدة.'));
  }, [open, item?.id, warehouseName]);

  if (!open || !item) return null;

  return (
    <ModalShell
      title={`سجل حركات: ${item.name}`}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      footer={(
        <Button type="button" variant="secondary" onClick={onClose}>إغلاق</Button>
      )}
    >
      <div className="rounded-lg border p-3 text-sm space-y-1">
        <p><span className="font-bold">الكود:</span> {item.code}</p>
        <p><span className="font-bold">الوحدة:</span> {item.unit}</p>
        <p className="font-bold">الأرصدة الحالية:</p>
        {balances.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">لا يوجد رصيد.</p>
        ) : (
          balances.map((b) => (
            <p key={b.warehouseName} className="tabular-nums">
              {b.warehouseName}: {fmt(b.qty)}
            </p>
          ))
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="erp-table w-full">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">التاريخ</th>
              <th className="erp-th">المرجع</th>
              <th className="erp-th">المسار</th>
              <th className="erp-th">الكمية</th>
              <th className="erp-th">الحالة</th>
              <th className="erp-th">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                  لا توجد حركات لهذا الصنف.
                </td>
              </tr>
            )}
            {rows.map((tx) => (
              <tr key={tx.id || `${tx.createdAt}-${tx.referenceNo}`} className="border-t border-[var(--color-border)]">
                <td className="p-2 text-xs">{tx.createdAt?.slice(0, 16)?.replace('T', ' ') || '—'}</td>
                <td className="p-2 text-xs font-bold">{tx.referenceNo || tx.sourceId || '—'}</td>
                <td className="p-2 text-xs">{movementPathLabel(tx)}</td>
                <td className="p-2 text-xs tabular-nums">
                  {tx.movementType === 'OUT' ? '−' : tx.movementType === 'IN' ? '+' : ''}
                  {fmt(Math.abs(Number(tx.quantity || 0)))} {tx.unit || item.unit}
                </td>
                <td className="p-2 text-xs">{movementFateLabel(tx)}</td>
                <td className="p-2 text-xs text-[var(--color-text-muted)]">{tx.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DataPaginationFooter
        page={movementPager.page}
        itemCount={rows.length}
        itemLabel="حركة"
        hasPrevious={movementPager.hasPrevious}
        hasNext={movementPager.hasNext}
        onPrevious={movementPager.previous}
        onNext={() => void movementPager.next()}
        loading={loading}
      />
    </ModalShell>
  );
};
