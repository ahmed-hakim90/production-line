import React from 'react';
import { Badge } from '../../components/UI';
import { formatNumber } from '../../../../utils/calculations';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../../utils/transferUnits';
import { Skeleton } from '@/components/ui/skeleton';
import { TableIconAction } from '@/src/components/erp';
import type { InventoryTransferRequest, StockTransaction } from '../../types';
import type { ApprovedTransferGroup, CombinedRow, StockVoucherGroup } from './types';
import { movementLabel } from './types';
import { sourceModuleLabel } from '../../lib/stockLabels';
import { voucherMovementTitle } from '../../lib/groupStockVouchers';

export interface StockTransactionsTableProps {
  loading: boolean;
  combinedRows: CombinedRow[];
  selectedSet: Set<string>;
  allFilteredSelected: boolean;
  toggleSelectAllFiltered: () => void;
  toggleSelectRow: (rowId?: string) => void;
  warehouseMap: Map<string, string>;
  transferDisplayUnit: TransferDisplayUnitMode;
  withResolvedUnitsPerCarton: <T extends { itemType: import('../../types').InventoryItemType; itemId: string; unitsPerCarton?: number }>(
    line: T,
  ) => T;
  spareContext?: boolean;
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
  onOpenVoucher: (group: StockVoucherGroup) => void;
  onPrintVoucher: (group: StockVoucherGroup) => void | Promise<void>;
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
  spareContext = false,
  perm,
  processing,
  onExportExcel,
  onPrintTransfer,
  onShareTransfer,
  onEditRow,
  onDeleteRows,
  onOpenApproved,
  onOpenVoucher,
  onPrintVoucher,
  onOpenPending,
  onPrintPending,
  onSharePending,
  onOpenPendingEdit,
}) => (
  <>
    <div className="erp-mobile-card-list p-2">
      {loading &&
        Array.from({ length: 4 }).map((_, i) => (
          <div key={`tx-m-skel-${i}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3">
            <Skeleton className="h-5 w-full rounded-md" />
          </div>
        ))}
      {!loading && combinedRows.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد حركات مطابقة.</p>
      )}
      {!loading &&
        combinedRows.map((entry) => {
          if (entry.kind === 'transaction') {
            const tx = entry.tx;
            const qtyNode =
              tx.movementType === 'TRANSFER' ? (
                <span className="font-bold tabular-nums text-[rgb(var(--color-success))]">
                  {(() => {
                    const display = getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit);
                    return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                  })()}
                </span>
              ) : (
                <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>
                  {tx.quantity >= 0 ? '+' : ''}
                  {formatNumber(tx.quantity)}
                </span>
              );
            return (
              <div
                key={`m-tx-${tx.id}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{tx.itemName}</p>
                    <p className="font-mono text-xs text-[var(--color-text-muted)]">{tx.itemCode}</p>
                    {tx.referenceNo ? (
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{tx.referenceNo}</p>
                    ) : null}
                  </div>
                  <Badge variant="info">{movementLabel[tx.movementType] ?? tx.movementType}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">الكمية</dt>
                    <dd>{qtyNode}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">المخزن</dt>
                    <dd className="truncate">{warehouseMap.get(tx.warehouseId) ?? tx.warehouseId}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] text-[var(--color-text-muted)]">التاريخ</dt>
                    <dd className="text-xs tabular-nums">{new Date(tx.createdAt).toLocaleString('ar-EG')}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {perm.export && (
                    <TableIconAction action="export" onClick={() => onExportExcel([tx])} title="تصدير Excel" aria-label={`تصدير Excel للحركة ${tx.itemName}`} />
                  )}
                  {perm.print && tx.movementType === 'TRANSFER' && (
                    <TableIconAction action="print" onClick={() => void onPrintTransfer(tx)} disabled={processing} aria-label={`طباعة تحويلة ${tx.referenceNo ?? ''}`} />
                  )}
                  {perm.print && tx.movementType === 'TRANSFER' && (
                    <TableIconAction action="share" onClick={() => void onShareTransfer(tx)} disabled={processing} title="مشاركة واتساب" aria-label={`مشاركة تحويلة ${tx.referenceNo ?? ''} على واتساب`} />
                  )}
                  {perm.edit && (
                    <TableIconAction action="edit" onClick={() => void onEditRow(tx)} disabled={processing} aria-label={`تعديل حركة ${tx.itemName}`} />
                  )}
                  {perm.delete && (
                    <TableIconAction action="delete" onClick={() => void onDeleteRows([tx])} disabled={processing} aria-label={`حذف حركة ${tx.itemName}`} />
                  )}
                </div>
              </div>
            );
          }

          if (entry.kind === 'voucher') {
            const group = entry.group;
            const title = voucherMovementTitle(group.movementType, spareContext);
            const qtySum = group.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
            const names = group.lines.slice(0, 2).map((l) => l.itemName).join('، ');
            return (
              <div
                key={`m-voucher-${group.movementType}-${group.referenceNo}`}
                className="rounded-xl border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)]/40 p-3 shadow-sm dark:bg-[rgb(var(--color-primary)/0.15)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{title} #{group.referenceNo}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{group.lines.length} أصناف · {names}{group.lines.length > 2 ? '…' : ''}</p>
                  </div>
                  <Badge variant="info">{movementLabel[group.movementType]}</Badge>
                </div>
                <p className="mt-2 text-sm font-bold tabular-nums text-[rgb(var(--color-primary))]">
                  {group.movementType === 'IN' ? '+' : '−'}
                  {formatNumber(Math.abs(qtySum))}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{warehouseMap.get(group.warehouseId) ?? group.warehouseId}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <TableIconAction action="view" onClick={() => onOpenVoucher(group)} disabled={processing} title="عرض الأصناف" aria-label={`عرض ${title} ${group.referenceNo}`} />
                  {perm.print && (
                    <TableIconAction action="print" onClick={() => void onPrintVoucher(group)} disabled={processing} aria-label={`طباعة ${title} ${group.referenceNo}`} />
                  )}
                  {perm.export && (
                    <TableIconAction action="export" onClick={() => onExportExcel(group.lines)} title="تصدير Excel" aria-label={`تصدير ${group.referenceNo}`} />
                  )}
                  {perm.delete && (
                    <TableIconAction action="delete" onClick={() => void onDeleteRows(group.lines)} disabled={processing} aria-label={`حذف ${group.referenceNo}`} />
                  )}
                </div>
              </div>
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
              <div
                key={`m-approved-${group.referenceNo}`}
                className="rounded-xl border border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)]/40 p-3 shadow-sm dark:bg-[rgb(var(--color-success)/0.15)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">تحويلة #{group.referenceNo}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{group.lines.length} صنف</p>
                  </div>
                  <Badge variant="success">معتمدة</Badge>
                </div>
                <p className="mt-2 text-sm">{fromName} ← {toName}</p>
                <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-success))]">
                  {qtySummary}{group.lines.length > 2 ? ' ...' : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <TableIconAction action="view" onClick={() => onOpenApproved(group)} disabled={processing} title="عرض التفاصيل" aria-label={`عرض تفاصيل التحويلة ${group.referenceNo}`} />
                  {perm.print && group.lines[0] && (
                    <TableIconAction action="print" onClick={() => void onPrintTransfer(group.lines[0])} disabled={processing} aria-label={`طباعة التحويلة ${group.referenceNo}`} />
                  )}
                  {perm.print && group.lines[0] && (
                    <TableIconAction action="share" onClick={() => void onShareTransfer(group.lines[0], 'transfer')} disabled={processing} title="مشاركة واتساب" aria-label={`مشاركة التحويلة ${group.referenceNo}`} />
                  )}
                  {perm.export && (
                    <TableIconAction action="export" onClick={() => onExportExcel(group.lines)} title="تصدير Excel" aria-label={`تصدير Excel للتحويلة ${group.referenceNo}`} />
                  )}
                  {perm.delete && group.lines[0] && (
                    <TableIconAction action="delete" onClick={() => void onDeleteRows([group.lines[0]])} disabled={processing} aria-label={`حذف التحويلة ${group.referenceNo}`} />
                  )}
                </div>
              </div>
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
            <div
              key={`m-pending-${row.id}`}
              className="rounded-xl border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/40 p-3 shadow-sm dark:bg-[rgb(var(--color-warning)/0.15)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">تحويلة معلقة #{row.referenceNo}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{row.lines.length} صنف</p>
                </div>
                <Badge variant="warning">معلقة</Badge>
              </div>
              <p className="mt-2 text-sm">{fromName} ← {toName}</p>
              <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-warning))]">
                {qtySummary}{row.lines.length > 2 ? ' ...' : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TableIconAction action="view" onClick={() => onOpenPending(row)} disabled={processing} title="عرض التفاصيل" aria-label={`عرض تحويلة معلقة ${row.referenceNo}`} />
                <TableIconAction action="print" onClick={() => void onPrintPending(row)} disabled={processing} aria-label={`طباعة تحويلة معلقة ${row.referenceNo}`} />
                {perm.print && (
                  <TableIconAction action="share" onClick={() => void onSharePending(row)} disabled={processing} title="مشاركة واتساب" aria-label={`مشاركة تحويلة معلقة ${row.referenceNo}`} />
                )}
                {perm.edit && (
                  <TableIconAction action="edit" onClick={() => onOpenPendingEdit(row)} disabled={processing} aria-label={`تعديل تحويلة معلقة ${row.referenceNo}`} />
                )}
              </div>
            </div>
          );
        })}
    </div>
    <div className="erp-desktop-table erp-table-wrap overflow-x-auto">
    <table className="erp-table w-full min-w-[960px] text-right border-collapse">
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
          <th className="erp-th">المصدر</th>
          <th className="erp-th text-center">الكمية</th>
          <th className="erp-th">المخزن</th>
          <th className="erp-th">اللوكيشن</th>
          <th className="erp-th">المنفذ</th>
          <th className="erp-th">إجراءات</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border)]">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <tr key={`tx-skeleton-${i}`}>
              <td colSpan={10} className="px-4 py-3">
                <Skeleton className="h-6 w-full rounded-md" />
              </td>
            </tr>
          ))}
        {!loading && combinedRows.length === 0 && (
          <tr>
            <td colSpan={10} className="px-4 py-10 text-center text-[var(--color-text-muted)]">
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
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(tx.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[var(--color-text)]">{tx.itemName}</p>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">{tx.itemCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="info">{movementLabel[tx.movementType] ?? tx.movementType}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{sourceModuleLabel(tx.sourceModule)}</td>
                  <td className="px-4 py-3 text-center">
                    {tx.movementType === 'TRANSFER' ? (
                      <span className="font-bold tabular-nums text-[rgb(var(--color-success))]">
                        {(() => {
                          const display = getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit);
                          return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                        })()}
                      </span>
                    ) : (
                      <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>
                        {tx.quantity >= 0 ? '+' : ''}
                        {formatNumber(tx.quantity)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{warehouseMap.get(tx.warehouseId) ?? tx.warehouseId}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {tx.locationCode || '—'}
                    {tx.toLocationCode ? ` → ${tx.toLocationCode}` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm">{tx.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {perm.export && (
                        <TableIconAction
                          action="export"
                          onClick={() => onExportExcel([tx])}
                          title="تصدير Excel"
                          aria-label={`تصدير Excel للحركة ${tx.itemName}`}
                        />
                      )}
                      {perm.print && tx.movementType === 'TRANSFER' && (
                        <TableIconAction
                          action="print"
                          onClick={() => void onPrintTransfer(tx)}
                          disabled={processing}
                          aria-label={`طباعة تحويلة ${tx.referenceNo ?? ''}`}
                        />
                      )}
                      {perm.print && tx.movementType === 'TRANSFER' && (
                        <TableIconAction
                          action="share"
                          onClick={() => void onShareTransfer(tx)}
                          disabled={processing}
                          title="مشاركة واتساب"
                          aria-label={`مشاركة تحويلة ${tx.referenceNo ?? ''} على واتساب`}
                        />
                      )}
                      {perm.edit && (
                        <TableIconAction
                          action="edit"
                          onClick={() => void onEditRow(tx)}
                          disabled={processing}
                          aria-label={`تعديل حركة ${tx.itemName}`}
                        />
                      )}
                      {perm.delete && (
                        <TableIconAction
                          action="delete"
                          onClick={() => void onDeleteRows([tx])}
                          disabled={processing}
                          aria-label={`حذف حركة ${tx.itemName}`}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            }

            if (entry.kind === 'voucher') {
              const group = entry.group;
              const title = voucherMovementTitle(group.movementType, spareContext);
              const qtySum = group.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
              return (
                <tr key={`voucher-${group.movementType}-${group.referenceNo}`} className="bg-[rgb(var(--color-primary)/0.1)]/40 dark:bg-[rgb(var(--color-primary)/0.15)]">
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">—</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(group.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[var(--color-text)]">{title} #{group.referenceNo}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {group.lines.length} أصناف
                      {group.note ? ` · ${group.note}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="info">{movementLabel[group.movementType]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{sourceModuleLabel(group.sourceModule)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-black tabular-nums ${group.movementType === 'IN' ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>
                      {group.movementType === 'IN' ? '+' : '−'}
                      {formatNumber(Math.abs(qtySum))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{warehouseMap.get(group.warehouseId) ?? group.warehouseId}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {group.lines.map((l) => l.locationCode).filter(Boolean).slice(0, 2).join('، ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">{group.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TableIconAction
                        action="view"
                        onClick={() => onOpenVoucher(group)}
                        disabled={processing}
                        title="عرض الأصناف"
                        aria-label={`عرض ${title} ${group.referenceNo}`}
                      />
                      {perm.print && (
                        <TableIconAction
                          action="print"
                          onClick={() => void onPrintVoucher(group)}
                          disabled={processing}
                          aria-label={`طباعة ${title} ${group.referenceNo}`}
                        />
                      )}
                      {perm.export && (
                        <TableIconAction
                          action="export"
                          onClick={() => onExportExcel(group.lines)}
                          title="تصدير Excel"
                          aria-label={`تصدير ${group.referenceNo}`}
                        />
                      )}
                      {perm.delete && (
                        <TableIconAction
                          action="delete"
                          onClick={() => void onDeleteRows(group.lines)}
                          disabled={processing}
                          aria-label={`حذف ${group.referenceNo}`}
                        />
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
                <tr key={`approved-transfer-${group.referenceNo}`} className="bg-[rgb(var(--color-success)/0.1)]/30 dark:bg-[rgb(var(--color-success)/0.15)]">
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">—</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(group.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-[var(--color-text)]">تحويلة #{group.referenceNo}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{group.lines.length} صنف</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">تحويل</Badge>
                      <Badge variant="success">معتمدة</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {sourceModuleLabel(group.lines[0]?.sourceModule ?? 'transfer_request')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold tabular-nums text-[rgb(var(--color-success))]">
                      {qtySummary}
                      {group.lines.length > 2 ? ' ...' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {fromName} ← {toName}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {group.lines.map((line) => line.locationCode || line.toLocationCode).filter(Boolean).slice(0, 2).join('، ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">{group.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TableIconAction
                        action="view"
                        onClick={() => onOpenApproved(group)}
                        disabled={processing}
                        title="عرض التفاصيل"
                        aria-label={`عرض تفاصيل التحويلة ${group.referenceNo}`}
                      />
                      {perm.print && group.lines[0] && (
                        <TableIconAction
                          action="print"
                          onClick={() => void onPrintTransfer(group.lines[0])}
                          disabled={processing}
                          aria-label={`طباعة التحويلة ${group.referenceNo}`}
                        />
                      )}
                      {perm.print && group.lines[0] && (
                        <TableIconAction
                          action="share"
                          onClick={() => void onShareTransfer(group.lines[0], 'transfer')}
                          disabled={processing}
                          title="مشاركة واتساب"
                          aria-label={`مشاركة التحويلة ${group.referenceNo}`}
                        />
                      )}
                      {perm.export && (
                        <TableIconAction
                          action="export"
                          onClick={() => onExportExcel(group.lines)}
                          title="تصدير Excel"
                          aria-label={`تصدير Excel للتحويلة ${group.referenceNo}`}
                        />
                      )}
                      {perm.delete && group.lines[0] && (
                        <TableIconAction
                          action="delete"
                          onClick={() => void onDeleteRows([group.lines[0]])}
                          disabled={processing}
                          aria-label={`حذف التحويلة ${group.referenceNo}`}
                        />
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
              <tr key={`pending-${row.id}`} className="bg-[rgb(var(--color-warning)/0.1)]/40 dark:bg-[rgb(var(--color-warning)/0.15)]">
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">—</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(row.createdAt).toLocaleString('ar-EG')}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-bold text-[var(--color-text)]">تحويلة معلقة #{row.referenceNo}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{row.lines.length} صنف</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="info">تحويل</Badge>
                    <Badge variant="warning">معلقة</Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">{sourceModuleLabel(row.sourceModule ?? 'transfer_request')}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold tabular-nums text-[rgb(var(--color-warning))]">
                    {qtySummary}
                    {row.lines.length > 2 ? ' ...' : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {fromName} ← {toName}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {row.lines.map((line) => line.locationCode || line.toLocationCode).filter(Boolean).slice(0, 2).join('، ') || '—'}
                </td>
                <td className="px-4 py-3 text-sm">{row.createdBy}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <TableIconAction
                      action="view"
                      onClick={() => onOpenPending(row)}
                      disabled={processing}
                      title="عرض التفاصيل"
                      aria-label={`عرض تحويلة معلقة ${row.referenceNo}`}
                    />
                    <TableIconAction
                      action="print"
                      onClick={() => void onPrintPending(row)}
                      disabled={processing}
                      aria-label={`طباعة تحويلة معلقة ${row.referenceNo}`}
                    />
                    {perm.print && (
                      <TableIconAction
                        action="share"
                        onClick={() => void onSharePending(row)}
                        disabled={processing}
                        title="مشاركة واتساب"
                        aria-label={`مشاركة تحويلة معلقة ${row.referenceNo}`}
                      />
                    )}
                    {perm.edit && (
                      <TableIconAction
                        action="edit"
                        onClick={() => onOpenPendingEdit(row)}
                        disabled={processing}
                        aria-label={`تعديل تحويلة معلقة ${row.referenceNo}`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
    </div>
  </>
);
