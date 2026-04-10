import React from 'react';
import type { CustomerDepositEntry } from '../types';
import { CustomerDepositStatusBadge } from './CustomerDepositStatusBadge';
import { cn } from '@/lib/utils';

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatShortUpdatedAt(ts: unknown): string {
  if (ts == null || typeof ts !== 'object') return '—';
  const t = ts as { toMillis?: () => number; toDate?: () => Date };
  let ms = 0;
  if (typeof t.toMillis === 'function') {
    const m = t.toMillis();
    ms = typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  } else if (typeof t.toDate === 'function') {
    const d = t.toDate();
    ms = d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('ar-EG', { dateStyle: 'short' });
}

export type CustomerDepositsDataTableProps = {
  rows: CustomerDepositEntry[];
  emptyMessage: string;
  loading?: boolean;
  /** عند التعيين: النقر على الصف يفتح الدرج؛ رابط «صفحة كاملة» يبقى داخل الدرج. */
  onRowClick?: (row: CustomerDepositEntry) => void;
  /** عمود «آخر تعديل» (مثلاً عند التحميل مرتبًا بـ updatedAt). */
  showLastUpdatedColumn?: boolean;
};

export const CustomerDepositsDataTable: React.FC<CustomerDepositsDataTableProps> = ({
  rows,
  emptyMessage,
  loading = false,
  onRowClick,
  showLastUpdatedColumn = false,
}) => {
  const cellPad = 'py-2.5 px-3 align-top';
  const colSpan = showLastUpdatedColumn ? 9 : 8;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[9%]" />
          {showLastUpdatedColumn ? <col className="w-[9%]" /> : null}
          <col className="w-[10%]" />
          <col className="w-[15%]" />
          <col className="w-[11%]" />
          <col className="w-[17%]" />
          <col className="w-[19%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>مسلسل</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>التاريخ</th>
            {showLastUpdatedColumn ? (
              <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>آخر تعديل</th>
            ) : null}
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>القيمة</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>المودع</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>رقم المودع</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>العميل</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>البنك</th>
            <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className={`${cellPad} text-center text-muted-foreground`}>
                جاري التحميل…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${cellPad} text-center text-muted-foreground`}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  'border-b border-border/80 transition-colors hover:bg-muted/40',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={() => onRowClick?.(r)}
              >
                <td className={`${cellPad} tabular-nums text-muted-foreground`}>
                  {typeof r.depositSerial === 'number' && r.depositSerial >= 1 ? r.depositSerial : '—'}
                </td>
                <td className={cellPad}>
                  <span className={cn('font-medium', onRowClick && 'text-primary')}>{r.depositDate}</span>
                </td>
                {showLastUpdatedColumn ? (
                  <td className={`${cellPad} whitespace-nowrap text-muted-foreground tabular-nums`}>
                    {formatShortUpdatedAt(r.updatedAt)}
                  </td>
                ) : null}
                <td className={`${cellPad} tabular-nums font-medium`}>{fmtMoney(r.amount)}</td>
                <td className={cellPad}>{r.depositorName}</td>
                <td className={`${cellPad} font-mono text-xs text-muted-foreground`}>
                  {r.depositorAccountNumber || '—'}
                </td>
                <td className={cellPad}>
                  <span className="block">{r.customerNameSnapshot}</span>
                  <span className="text-xs text-muted-foreground">{r.customerCodeSnapshot}</span>
                </td>
                <td className={`${cellPad} truncate text-muted-foreground`} title={r.bankLabelSnapshot}>
                  {r.bankLabelSnapshot}
                </td>
                <td className={cellPad}>
                  <CustomerDepositStatusBadge status={r.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
