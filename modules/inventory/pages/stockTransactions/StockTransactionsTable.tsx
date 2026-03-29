import React from 'react';
import { Badge } from '../../components/UI';
import { formatNumber } from '../../../../utils/calculations';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../../utils/transferUnits';
import { Skeleton } from '@/components/ui/skeleton';
import type { InventoryTransferRequest, StockTransaction } from '../../types';
import type { ApprovedTransferGroup, CombinedRow } from './types';
import { movementLabel } from './types';

export interface StockTransactionsTableProps {
  loading: boolean;
  combinedRows: CombinedRow[];
  selectedSet: Set<string>;
  allFilteredSelected: boolean;
  toggleSelectAllFiltered: () => void;
  toggleSelectRow: (rowId?: string) => void;
  warehouseMap: Map<string, string>;
  transferDisplayUnit: TransferDisplayUnitMode;
  withResolvedUnitsPerCarton: <T extends { itemType: 'finished_good' | 'raw_material'; itemId: string; unitsPerCarton?: number }>(
    line: T,
  ) => T;
  perm: {
    export: boolean;
    print: boolean;
    edit: boolean;
    delete: boolean;
  };
  processing: boolean;
  onExportExcel: (rows: StockTransaction[]) => void;
  onPrintTransfer: (tx: StockTransaction) => void | Promise<void>;
  onShareTransfer: (tx: StockTransaction, scope?: 'line' | 'transfer') => void | Promise<void>;
  onEditRow: (tx: StockTransaction) => void | Promise<void>;
  onDeleteRows: (rows: StockTransaction[]) => void | Promise<void>;
  onOpenApproved: (group: ApprovedTransferGroup) => void;
  onOpenPending: (row: InventoryTransferRequest) => void;
  onPrintPending: (row: InventoryTransferRequest) => void | Promise<void>;
  onSharePending: (row: InventoryTransferRequest) => void | Promise<void>;
  onOpenPendingEdit: (row: InventoryTransferRequest) => void;
}

export const StockTransactionsTable: React.FC<StockTransactionsTableProps> = ({
  loading,
  combinedRows,
  selectedSet,
  allFilteredSelected,
  toggleSelectAllFiltered,
  toggleSelectRow,
  warehouseMap,
  transferDisplayUnit,
  withResolvedUnitsPerCarton,
  perm,
  processing,
  onExportExcel,
  onPrintTransfer,
  onShareTransfer,
  onEditRow,
  onDeleteRows,
  onOpenApproved,
  onOpenPending,
  onPrintPending,
  onSharePending,
  onOpenPendingEdit,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-right border-collapse">
      <thead className="erp-thead">
        <tr>
          <th className="erp-th text-center">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
              aria-label="تحديد كل الصفوف الظاهرة"
            />
          </th>
          <th className="erp-th">التاريخ</th>
          <th className="erp-th">الصنف</th>
          <th className="erp-th">الحركة</th>
          <th className="erp-th text-center">الكمية</th>
          <th className="erp-th">المخزن</th>
          <th className="erp-th">المنفذ</th>
          <th className="erp-th">إجراءات</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border)]">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <tr key={`tx-skeleton-${i}`}>
              <td colSpan={8} className="px-4 py-3">
                <Skeleton className="h-6 w-full rounded-md" />
              </td>
            </tr>
          ))}
        {!loading && combinedRows.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
              لا توجد حركات مطابقة.
            </td>
          </tr>
        )}
        {!loading &&
          combinedRows.map((entry) => {
            if (entry.kind === 'transaction') {
              const tx = entry.tx;
              return (
                <tr key={`tx-${tx.id}`}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!tx.id && selectedSet.has(tx.id)}
                      onChange={() => toggleSelectRow(tx.id)}
                      aria-label={`تحديد حركة ${tx.itemName}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[var(--color-text)]">{tx.itemName}</p>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">{tx.itemCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="info">{movementLabel[tx.movementType] ?? tx.movementType}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.movementType === 'TRANSFER' ? (
                      <span className="font-bold tabular-nums text-emerald-600">
                        {(() => {
                          const display = getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit);
                          return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                        })()}
                      </span>
                    ) : (
                      <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {tx.quantity >= 0 ? '+' : ''}
                        {formatNumber(tx.quantity)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{warehouseMap.get(tx.warehouseId) ?? tx.warehouseId}</td>
                  <td className="px-4 py-3 text-sm">{tx.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {perm.export && (
                        <button
                          type="button"
                          onClick={() => onExportExcel([tx])}
                          title="تصدير Excel"
                          aria-label={`تصدير Excel للحركة ${tx.itemName}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors"
                        >
                          <span className="material-icons-round text-sm">download</span>
                        </button>
                      )}
                      {perm.print && tx.movementType === 'TRANSFER' && (
                        <button
                          type="button"
                          onClick={() => void onPrintTransfer(tx)}
                          disabled={processing}
                          title="طباعة"
                          aria-label={`طباعة تحويلة ${tx.referenceNo ?? ''}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">print</span>
                        </button>
                      )}
                      {perm.print && tx.movementType === 'TRANSFER' && (
                        <button
                          type="button"
                          onClick={() => void onShareTransfer(tx)}
                          disabled={processing}
                          title="مشاركة واتساب"
                          aria-label={`مشاركة تحويلة ${tx.referenceNo ?? ''} على واتساب`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">share</span>
                        </button>
                      )}
                      {perm.edit && (
                        <button
                          type="button"
                          onClick={() => void onEditRow(tx)}
                          disabled={processing}
                          title="تعديل"
                          aria-label={`تعديل حركة ${tx.itemName}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">edit</span>
                        </button>
                      )}
                      {perm.delete && (
                        <button
                          type="button"
                          onClick={() => void onDeleteRows([tx])}
                          disabled={processing}
                          title="حذف"
                          aria-label={`حذف حركة ${tx.itemName}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }

            if (entry.kind === 'approved_transfer') {
              const group = entry.group;
              const qtySummary = group.lines
                .slice(0, 2)
                .map((line) => {
                  const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                  return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                })
                .join('، ');
              const fromName = warehouseMap.get(group.fromWarehouseId) ?? group.fromWarehouseId;
              const toName = warehouseMap.get(group.toWarehouseId) ?? group.toWarehouseId;
              return (
                <tr key={`approved-transfer-${group.referenceNo}`} className="bg-emerald-50/30 dark:bg-emerald-900/10">
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">—</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(group.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[var(--color-text)]">تحويلة #{group.referenceNo}</p>
                    <p className="text-xs text-slate-500">{group.lines.length} صنف</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">تحويل</Badge>
                      <Badge variant="success">معتمدة</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold tabular-nums text-emerald-700">
                      {qtySummary}
                      {group.lines.length > 2 ? ' ...' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {fromName} ← {toName}
                  </td>
                  <td className="px-4 py-3 text-sm">{group.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenApproved(group)}
                        disabled={processing}
                        title="عرض التفاصيل"
                        aria-label={`عرض تفاصيل التحويلة ${group.referenceNo}`}
                        className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-sm">visibility</span>
                      </button>
                      {perm.print && group.lines[0] && (
                        <button
                          type="button"
                          onClick={() => void onPrintTransfer(group.lines[0])}
                          disabled={processing}
                          title="طباعة"
                          aria-label={`طباعة التحويلة ${group.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">print</span>
                        </button>
                      )}
                      {perm.print && group.lines[0] && (
                        <button
                          type="button"
                          onClick={() => void onShareTransfer(group.lines[0], 'transfer')}
                          disabled={processing}
                          title="مشاركة واتساب"
                          aria-label={`مشاركة التحويلة ${group.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">share</span>
                        </button>
                      )}
                      {perm.export && (
                        <button
                          type="button"
                          onClick={() => onExportExcel(group.lines)}
                          title="تصدير Excel"
                          aria-label={`تصدير Excel للتحويلة ${group.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors"
                        >
                          <span className="material-icons-round text-sm">download</span>
                        </button>
                      )}
                      {perm.delete && group.lines[0] && (
                        <button
                          type="button"
                          onClick={() => void onDeleteRows([group.lines[0]])}
                          disabled={processing}
                          title="حذف"
                          aria-label={`حذف التحويلة ${group.referenceNo}`}
                          className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }

            const row = entry.row;
            const qtySummary = row.lines
              .slice(0, 2)
              .map((line) => {
                const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                return `${formatNumber(display.quantity)} ${display.unitLabel}`;
              })
              .join('، ');
            const fromName = warehouseMap.get(row.fromWarehouseId) ?? row.fromWarehouseId;
            const toName = warehouseMap.get(row.toWarehouseId) ?? row.toWarehouseId;
            return (
              <tr key={`pending-${row.id}`} className="bg-amber-50/40 dark:bg-amber-900/10">
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">—</td>
                <td className="px-4 py-3 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString('ar-EG')}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-bold text-[var(--color-text)]">تحويلة معلقة #{row.referenceNo}</p>
                  <p className="text-xs text-slate-500">{row.lines.length} صنف</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="info">تحويل</Badge>
                    <Badge variant="warning">معلقة</Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold tabular-nums text-amber-700">
                    {qtySummary}
                    {row.lines.length > 2 ? ' ...' : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {fromName} ← {toName}
                </td>
                <td className="px-4 py-3 text-sm">{row.createdBy}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenPending(row)}
                      disabled={processing}
                      title="عرض التفاصيل"
                      aria-label={`عرض تحويلة معلقة ${row.referenceNo}`}
                      className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons-round text-sm">visibility</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onPrintPending(row)}
                      disabled={processing}
                      title="طباعة"
                      aria-label={`طباعة تحويلة معلقة ${row.referenceNo}`}
                      className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons-round text-sm">print</span>
                    </button>
                    {perm.print && (
                      <button
                        type="button"
                        onClick={() => void onSharePending(row)}
                        disabled={processing}
                        title="مشاركة واتساب"
                        aria-label={`مشاركة تحويلة معلقة ${row.referenceNo}`}
                        className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-sm">share</span>
                      </button>
                    )}
                    {perm.edit && (
                      <button
                        type="button"
                        onClick={() => onOpenPendingEdit(row)}
                        disabled={processing}
                        title="تعديل"
                        aria-label={`تعديل تحويلة معلقة ${row.referenceNo}`}
                        className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-sm">edit</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  </div>
);
