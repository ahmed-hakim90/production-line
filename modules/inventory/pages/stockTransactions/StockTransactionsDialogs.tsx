import React from 'react';
import { Button } from '../../components/UI';
import { TableIconAction, ToneActionButton } from '@/src/components/erp/TableIconAction';
import { formatNumber } from '../../../../utils/calculations';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../../utils/transferUnits';
import type { InventoryTransferRequest, StockTransaction, TransferRequestLine } from '../../types';
import type { StockVoucherGroup } from '../../lib/groupStockVouchers';
import { voucherMovementTitle } from '../../lib/groupStockVouchers';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';

export interface StockTransactionsDialogsProps {
  shareToast: string | null;
  onDismissShareToast: () => void;
  selectedPending: InventoryTransferRequest | null;
  onClosePending: () => void;
  selectedApprovedTransfer: {
    referenceNo: string;
    createdAt: string;
    createdBy: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    lines: StockTransaction[];
  } | null;
  onCloseApproved: () => void;
  selectedVoucher: StockVoucherGroup | null;
  onCloseVoucher: () => void;
  spareContext?: boolean;
  editPending: InventoryTransferRequest | null;
  editLines: TransferRequestLine[];
  editNote: string;
  onEditNoteChange: (value: string) => void;
  onEditLineQuantity: (index: number, value: number) => void;
  onCloseEdit: () => void;
  onSaveEdit: () => void;
  warehouseMap: Map<string, string>;
  transferDisplayUnit: TransferDisplayUnitMode;
  withResolvedUnitsPerCarton: <T extends { itemType: import('../../types').InventoryItemType; itemId: string; unitsPerCarton?: number }>(
    line: T,
  ) => T;
  processing: boolean;
  canPrint: boolean;
  canDelete?: boolean;
  onPrintPendingFromModal: (row: InventoryTransferRequest) => void;
  onPrintApprovedFromModal: (firstLine: StockTransaction) => void;
  onPrintVoucherFromModal?: (group: StockVoucherGroup) => void;
  onShareTransfer: (tx: StockTransaction, scope?: 'line' | 'transfer') => void | Promise<void>;
  onDeleteVoucherLines?: (rows: StockTransaction[]) => void;
}

export const StockTransactionsDialogs: React.FC<StockTransactionsDialogsProps> = ({
  shareToast,
  onDismissShareToast,
  selectedPending,
  onClosePending,
  selectedApprovedTransfer,
  onCloseApproved,
  selectedVoucher,
  onCloseVoucher,
  spareContext = false,
  editPending,
  editLines,
  editNote,
  onEditNoteChange,
  onEditLineQuantity,
  onCloseEdit,
  onSaveEdit,
  warehouseMap,
  transferDisplayUnit,
  withResolvedUnitsPerCarton,
  processing,
  canPrint,
  canDelete = false,
  onPrintPendingFromModal,
  onPrintApprovedFromModal,
  onPrintVoucherFromModal,
  onShareTransfer,
  onDeleteVoucherLines,
}) => (
  <>
    {shareToast && (
      <div
        role="status"
        aria-live="polite"
        className="bg-[rgb(var(--color-success)/0.1)] border border-[rgb(var(--color-success)/0.25)] rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3 animate-in fade-in duration-300"
      >
        <span className="material-icons-round text-[rgb(var(--color-success))]" aria-hidden>
          image
        </span>
        <p className="text-sm font-medium text-[rgb(var(--color-success))] flex-1">{shareToast}</p>
        <button
          type="button"
          onClick={onDismissShareToast}
          className="p-1 text-[rgb(var(--color-success))] hover:text-[rgb(var(--color-success))] transition-colors shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="إغلاق التنبيه"
        >
          <span className="material-icons-round text-sm" aria-hidden>
            close
          </span>
        </button>
      </div>
    )}

    {selectedPending && (
      <ManagedModalPortal>
      <div
        className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="presentation"
        onClick={onClosePending}
        onKeyDown={(e) => e.key === 'Escape' && onClosePending()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-tx-pending-title"
          className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl border border-[var(--color-border)] max-h-[92dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 id="stock-tx-pending-title" className="text-lg font-bold">
              طلب تحويلة معلقة #{selectedPending.referenceNo}
            </h3>
            <button
              type="button"
              onClick={onClosePending}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="إغلاق النافذة"
            >
              <span className="material-icons-round" aria-hidden>
                close
              </span>
            </button>
          </div>
          <div className="p-6 min-h-0 flex-1 space-y-4 overflow-auto overscroll-contain">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">من</p>
                <p className="font-bold">{warehouseMap.get(selectedPending.fromWarehouseId) ?? selectedPending.fromWarehouseId}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">إلى</p>
                <p className="font-bold">{warehouseMap.get(selectedPending.toWarehouseId) ?? selectedPending.toWarehouseId}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">الصنف</th>
                    <th className="erp-th">النوع</th>
                    <th className="erp-th text-center">الكمية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {selectedPending.lines.map((line) => (
                    <tr key={`${line.itemType}-${line.itemId}`}>
                      <td className="px-3 py-2 text-sm font-bold">
                        {line.itemName} <span className="text-xs text-[var(--color-text-muted)]">({line.itemCode})</span>
                      </td>
                      <td className="px-3 py-2 text-sm">{line.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                      <td className="px-3 py-2 text-sm text-center font-black">
                        {(() => {
                          const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                          return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClosePending}>
              إغلاق
            </Button>
            <ToneActionButton action="print" onClick={() => onPrintPendingFromModal(selectedPending)}>
              طباعة
            </ToneActionButton>
          </div>
        </div>
      </div>
      </ManagedModalPortal>
    )}

    {selectedApprovedTransfer && (
      <ManagedModalPortal>
      <div
        className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="presentation"
        onClick={onCloseApproved}
        onKeyDown={(e) => e.key === 'Escape' && onCloseApproved()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-tx-approved-title"
          className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl border border-[var(--color-border)] max-h-[92dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 id="stock-tx-approved-title" className="text-lg font-bold">
              تفاصيل التحويلة #{selectedApprovedTransfer.referenceNo}
            </h3>
            <button
              type="button"
              onClick={onCloseApproved}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="إغلاق النافذة"
            >
              <span className="material-icons-round" aria-hidden>
                close
              </span>
            </button>
          </div>
          <div className="p-6 min-h-0 flex-1 space-y-4 overflow-auto overscroll-contain">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">من</p>
                <p className="font-bold">
                  {warehouseMap.get(selectedApprovedTransfer.fromWarehouseId) ?? selectedApprovedTransfer.fromWarehouseId}
                </p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">إلى</p>
                <p className="font-bold">
                  {warehouseMap.get(selectedApprovedTransfer.toWarehouseId) ?? selectedApprovedTransfer.toWarehouseId}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">الصنف</th>
                    <th className="erp-th">النوع</th>
                    <th className="erp-th text-center">الكمية</th>
                    {canPrint && (
                      <th className="erp-th text-center w-px" aria-label="مشاركة">
                        <span className="sr-only">مشاركة</span>
                        <span className="material-icons-round text-base align-middle text-[var(--color-text-muted)]" aria-hidden>
                          share
                        </span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {selectedApprovedTransfer.lines.map((line) => (
                    <tr key={`${line.id || ''}-${line.itemType}-${line.itemId}`}>
                      <td className="px-3 py-2 text-sm font-bold">
                        {line.itemName} <span className="text-xs text-[var(--color-text-muted)]">({line.itemCode})</span>
                      </td>
                      <td className="px-3 py-2 text-sm">{line.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                      <td className="px-3 py-2 text-sm text-center font-black">
                        {(() => {
                          const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                          return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                        })()}
                      </td>
                      {canPrint && (
                        <td className="px-3 py-2 text-center">
                          <TableIconAction
                            action="share"
                            onClick={() => void onShareTransfer(line, 'line')}
                            disabled={processing}
                            title="مشاركة واتساب"
                            aria-label={`مشاركة ${line.itemName} (${line.itemCode}) على واتساب`}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCloseApproved}>
              إغلاق
            </Button>
            {canPrint && selectedApprovedTransfer.lines[0] && (
              <ToneActionButton
                action="print"
                onClick={() => onPrintApprovedFromModal(selectedApprovedTransfer.lines[0])}
              >
                طباعة
              </ToneActionButton>
            )}
          </div>
        </div>
      </div>
      </ManagedModalPortal>
    )}

    {selectedVoucher && (
      <ManagedModalPortal>
      <div
        className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="presentation"
        onClick={onCloseVoucher}
        onKeyDown={(e) => e.key === 'Escape' && onCloseVoucher()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-tx-voucher-title"
          className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl border border-[var(--color-border)] max-h-[92dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 id="stock-tx-voucher-title" className="text-lg font-bold">
              {voucherMovementTitle(selectedVoucher.movementType, spareContext)} #{selectedVoucher.referenceNo}
            </h3>
            <button
              type="button"
              onClick={onCloseVoucher}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="إغلاق النافذة"
            >
              <span className="material-icons-round" aria-hidden>
                close
              </span>
            </button>
          </div>
          <div className="p-6 min-h-0 flex-1 space-y-4 overflow-auto overscroll-contain">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">المخزن</p>
                <p className="font-bold">
                  {warehouseMap.get(selectedVoucher.warehouseId) ?? selectedVoucher.warehouseId}
                </p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">التاريخ</p>
                <p className="font-bold text-sm tabular-nums">
                  {new Date(selectedVoucher.createdAt).toLocaleString('ar-EG')}
                </p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)]">المنفذ</p>
                <p className="font-bold">{selectedVoucher.createdBy}</p>
              </div>
            </div>
            {selectedVoucher.note ? (
              <p className="text-sm text-[var(--color-text-muted)]">ملاحظة: {selectedVoucher.note}</p>
            ) : null}
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">الصنف</th>
                    <th className="erp-th">اللوكيشن</th>
                    <th className="erp-th text-center">الكمية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {selectedVoucher.lines.map((line) => (
                    <tr key={`${line.id || ''}-${line.itemId}`}>
                      <td className="px-3 py-2 text-sm font-bold">
                        {line.itemName}{' '}
                        <span className="text-xs text-[var(--color-text-muted)]">({line.itemCode})</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-muted)]">{line.locationCode || '—'}</td>
                      <td className="px-3 py-2 text-sm text-center font-black tabular-nums">
                        <span className={selectedVoucher.movementType === 'IN' ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}>
                          {selectedVoucher.movementType === 'IN' ? '+' : '−'}
                          {formatNumber(Math.abs(Number(line.quantity || 0)))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCloseVoucher}>
              إغلاق
            </Button>
            {canPrint && onPrintVoucherFromModal ? (
              <ToneActionButton
                action="print"
                disabled={processing}
                onClick={() => onPrintVoucherFromModal(selectedVoucher)}
              >
                طباعة
              </ToneActionButton>
            ) : null}
            {canDelete && onDeleteVoucherLines ? (
              <Button
                variant="outline"
                disabled={processing}
                onClick={() => {
                  onDeleteVoucherLines(selectedVoucher.lines);
                  onCloseVoucher();
                }}
              >
                حذف الإذن
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      </ManagedModalPortal>
    )}

    {editPending && (
      <ManagedModalPortal>
      <div
        className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="presentation"
        onClick={() => !processing && onCloseEdit()}
        onKeyDown={(e) => e.key === 'Escape' && !processing && onCloseEdit()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-tx-edit-title"
          className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl border border-[var(--color-border)] max-h-[92dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 id="stock-tx-edit-title" className="text-lg font-bold">
              تعديل التحويلة المعلقة #{editPending.referenceNo}
            </h3>
            <button
              type="button"
              onClick={() => !processing && onCloseEdit()}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] disabled:opacity-50 rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              disabled={processing}
              aria-label="إغلاق النافذة"
            >
              <span className="material-icons-round" aria-hidden>
                close
              </span>
            </button>
          </div>
          <div className="p-6 min-h-0 flex-1 space-y-4 overflow-auto overscroll-contain">
            <div className="space-y-2">
              <label htmlFor="stock-tx-edit-note" className="text-sm font-bold text-[var(--color-text-muted)]">
                ملاحظة
              </label>
              <input
                id="stock-tx-edit-note"
                className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]"
                value={editNote}
                onChange={(e) => onEditNoteChange(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              {editLines.map((line, idx) => (
                <div
                  key={`${line.itemType}-${line.itemId}-${idx}`}
                  className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 grid grid-cols-1 md:grid-cols-12 gap-3"
                >
                  <div className="md:col-span-7">
                    <p className="text-sm font-bold">{line.itemName}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{line.itemCode}</p>
                  </div>
                  <div className="md:col-span-5 space-y-1">
                    <label className="text-xs font-bold text-[var(--color-text-muted)]" htmlFor={`stock-tx-edit-qty-${idx}`}>
                      الكمية (
                      {line.requestUnit === 'carton' ? 'كرتونة' : line.requestUnit === 'piece' ? 'قطعة' : 'وحدة'})
                    </label>
                    <input
                      id={`stock-tx-edit-qty-${idx}`}
                      type="number"
                      step="any"
                      min={0}
                      className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]"
                      placeholder="0"
                      value={line.requestQuantity ?? line.quantity ?? ''}
                      onChange={(e) => onEditLineQuantity(idx, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCloseEdit} disabled={processing}>
              إلغاء
            </Button>
            <ToneActionButton
              action="save"
              onClick={() => void onSaveEdit()}
              disabled={processing}
              loading={processing}
            >
              حفظ التعديلات
            </ToneActionButton>
          </div>
        </div>
      </div>
      </ManagedModalPortal>
    )}
  </>
);
