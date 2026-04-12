import React, { useMemo } from 'react';
import type { OnlineDispatchShipment } from '../../../types';
import { onlineDispatchTsToMs } from '../services/onlineDispatchService';
import { OnlineDispatchStatusBadge } from './OnlineDispatchStatusBadge';
import { useFirestoreUserLabels } from '../utils/firestoreUserLabels';
import { onlineDispatchCreatorUid } from '../utils/onlineDispatchActorUids';
import { Checkbox } from '@/components/ui/checkbox';

export type OnlineShipmentsTableRow = OnlineDispatchShipment & { id: string };

function formatDispatchTimestamp(ts: unknown): string {
  const ms = onlineDispatchTsToMs(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type OnlineShipmentsSelectionProps = {
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onTogglePage: (pageRowIds: string[], checked: boolean) => void;
};

export type OnlineShipmentsDataTableProps = {
  rows: OnlineShipmentsTableRow[];
  emptyMessage: string;
  showActionColumn?: boolean;
  renderActionCell?: (row: OnlineShipmentsTableRow) => React.ReactNode;
  /** When set, used for user display names instead of fetching inside the table. */
  userLabels?: Record<string, string>;
  selection?: OnlineShipmentsSelectionProps;
};

export const OnlineShipmentsDataTable: React.FC<OnlineShipmentsDataTableProps> = ({
  rows,
  emptyMessage,
  showActionColumn = false,
  renderActionCell,
  userLabels: userLabelsProp,
  selection,
}) => {
  const internalUids = useMemo(
    () =>
      rows.flatMap((row) => [
        onlineDispatchCreatorUid(row),
        row.handedToWarehouseByUid,
        row.handedToPostByUid,
        row.cancelledByUid,
        row.lastStatusByUid,
      ]),
    [rows],
  );
  const internalLabels = useFirestoreUserLabels(userLabelsProp ? [] : internalUids);
  const userLabels = userLabelsProp ?? internalLabels;

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selection?.selectedIds.has(id));
  const somePageSelected =
    !!selection && pageIds.some((id) => selection.selectedIds.has(id)) && !allPageSelected;

  const hasSelectCol = Boolean(selection);
  const colSpan = (hasSelectCol ? 1 : 0) + 5 + (showActionColumn ? 1 : 0);

  const cellPad = 'py-2.5 px-3 align-top';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <colgroup>
          {hasSelectCol && <col className="w-[44px]" />}
          <col className="w-[11%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
          <col className={showActionColumn ? 'w-[13%]' : 'w-[21%]'} />
          {showActionColumn && <col className="w-[8%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {selection ? (
              <th className={`${cellPad} text-center`}>
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                  onCheckedChange={(v) => selection.onTogglePage(pageIds, v === true)}
                  aria-label="تحديد كل الصفوف في هذه الصفحة"
                />
              </th>
            ) : null}
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>الباركود</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
              المنشئ والإنشاء
            </th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
              تسليم المخزن
            </th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
              تسليم البوسطة
            </th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>الحالة</th>
            {showActionColumn && (
              <th className={`${cellPad} text-center text-xs font-semibold text-muted-foreground`}>إجراء</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 transition-colors hover:bg-muted/20">
              {selection ? (
                <td className={`${cellPad} text-center`}>
                  <Checkbox
                    checked={selection.selectedIds.has(r.id)}
                    onCheckedChange={(v) => selection.onToggle(r.id, v === true)}
                    aria-label={`تحديد ${r.barcode}`}
                  />
                </td>
              ) : null}
              <td className={`${cellPad} font-mono text-xs break-all`}>{r.barcode}</td>
              <td className={cellPad}>
                <div className="min-w-0 space-y-0.5 text-[11px] leading-tight">
                  <p className="break-words text-muted-foreground">
                    المنشئ: {onlineDispatchCreatorUid(r) ? userLabels[onlineDispatchCreatorUid(r)!] ?? '…' : '—'}
                  </p>
                  <p className="tabular-nums text-foreground">الإنشاء: {formatDispatchTimestamp(r.createdAt)}</p>
                </div>
              </td>
              <td className={cellPad}>
                {onlineDispatchTsToMs(r.handedToWarehouseAt) ? (
                  <div className="min-w-0 space-y-0.5 text-[11px] leading-tight">
                    <p className="break-words text-muted-foreground">
                      مَن سلّم:{' '}
                      {r.handedToWarehouseByUid ? userLabels[r.handedToWarehouseByUid] ?? '…' : '—'}
                    </p>
                    <p className="tabular-nums text-foreground">
                      الوقت: {formatDispatchTimestamp(r.handedToWarehouseAt)}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] leading-tight text-muted-foreground">—</p>
                )}
              </td>
              <td className={cellPad}>
                {onlineDispatchTsToMs(r.handedToPostAt) ? (
                  <div className="min-w-0 space-y-0.5 text-[11px] leading-tight">
                    <p className="break-words text-muted-foreground">
                      مَن سلّم: {r.handedToPostByUid ? userLabels[r.handedToPostByUid] ?? '…' : '—'}
                    </p>
                    <p className="tabular-nums text-foreground">
                      الوقت: {formatDispatchTimestamp(r.handedToPostAt)}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] leading-tight text-muted-foreground">—</p>
                )}
              </td>
              <td className={cellPad}>
                <OnlineDispatchStatusBadge status={r.status} />
              </td>
              {showActionColumn && (
                <td className={`${cellPad} text-center`}>{renderActionCell?.(r)}</td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
