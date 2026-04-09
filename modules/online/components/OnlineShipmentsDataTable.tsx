import React from 'react';
import type { OnlineDispatchShipment } from '../../../types';
import { onlineDispatchTsToMs } from '../services/onlineDispatchService';
import { OnlineDispatchStatusBadge } from './OnlineDispatchStatusBadge';
import { useFirestoreUserLabels } from '../utils/firestoreUserLabels';
import { onlineDispatchCreatorUid } from '../utils/onlineDispatchActorUids';

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

export type OnlineShipmentsDataTableProps = {
  rows: OnlineShipmentsTableRow[];
  emptyMessage: string;
  showActionColumn?: boolean;
  renderActionCell?: (row: OnlineShipmentsTableRow) => React.ReactNode;
};

export const OnlineShipmentsDataTable: React.FC<OnlineShipmentsDataTableProps> = ({
  rows,
  emptyMessage,
  showActionColumn = false,
  renderActionCell,
}) => {
  const colSpan = showActionColumn ? 5 : 4;
  const actorUids = rows.flatMap((row) => [onlineDispatchCreatorUid(row), row.handedToPostByUid]);
  const userLabels = useFirestoreUserLabels(actorUids);

  const cellPad = 'py-2.5 px-3 align-top';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[28%]" />
          <col className="w-[28%]" />
          <col className={showActionColumn ? 'w-[23%]' : 'w-[31%]'} />
          {showActionColumn && <col className="w-[8%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>الباركود</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
              تم تسليم المخزن (مين أنشأ / امتى)
            </th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
              تسليم البوسطة (مين سلّم / امتى)
            </th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>الحالة الحالية</th>
            {showActionColumn && (
              <th className={`${cellPad} text-center text-xs font-semibold text-muted-foreground`}>إجراء</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 transition-colors hover:bg-muted/20">
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
                  <p className="text-[11px] leading-tight text-muted-foreground">
...                  </p>
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
