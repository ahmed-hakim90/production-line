import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { formatNumber } from '../../../utils/calculations';
import { TableIconAction } from '@/src/components/erp';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { InventoryTransferRequest } from '../../../modules/inventory/types';
import { transferRequestTypeLabel } from '../../../modules/inventory/lib/stockLabels';

type Payload = GlobalModalPayload & {
  request: InventoryTransferRequest;
  warehouseMap?: Map<string, string>;
  canApprove?: boolean;
  canCancelMovement?: boolean;
  approveDisabledReason?: string;
  onApprove?: () => void | Promise<void>;
  onReject?: () => void | Promise<void>;
  onCancelMovement?: () => void | Promise<void>;
  onPrint?: () => void | Promise<void>;
};

export const GlobalApproveTransferModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_APPROVE_TRANSFER);
  const data = (payload || {}) as Payload;
  const request = data.request;
  const warehouseMap = data.warehouseMap ?? new Map<string, string>();

  if (!isOpen || !request) return null;

  const requestType = request.requestType || 'manual_transfer';
  const fromName = requestType === 'production_entry'
    ? (request.fromWarehouseName || 'تقارير الإنتاج')
    : (warehouseMap.get(request.fromWarehouseId) || request.fromWarehouseName || request.fromWarehouseId);
  const toName = warehouseMap.get(request.toWarehouseId) || request.toWarehouseName || request.toWarehouseId;

  return (
    <ManagedModalPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => close()}>
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border bg-[var(--color-card)] shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-[var(--color-card)] px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold sm:text-lg">طلب تحويل #{request.referenceNo}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{transferRequestTypeLabel(request.requestType)} — {request.status}</p>
          </div>
          <button type="button" onClick={() => close()} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-[var(--color-text-muted)]">من:</span> <strong>{fromName}</strong></div>
            <div><span className="text-[var(--color-text-muted)]">إلى:</span> <strong>{toName}</strong></div>
            <div><span className="text-[var(--color-text-muted)]">المنشئ:</span> {request.createdBy}</div>
            <div><span className="text-[var(--color-text-muted)]">التاريخ:</span> {new Date(request.createdAt).toLocaleString('ar-EG')}</div>
          </div>
          {request.note && <p className="rounded-lg bg-[var(--color-bg)] p-3 text-sm">{request.note}</p>}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] border-collapse text-right text-sm">
            <thead>
              <tr className="border-b text-[var(--color-text-muted)]">
                <th className="py-2">الصنف</th>
                <th className="py-2 text-center">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {request.lines.map((line, i) => (
                <tr key={i} className="border-b border-[var(--color-border)]">
                  <td className="py-2">{line.itemName} ({line.itemCode})</td>
                  <td className="py-2 text-center font-bold">{formatNumber(line.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 border-t bg-[var(--color-card)] px-4 py-3 sm:px-6 sm:py-4">
          {data.onPrint && (
            <TableIconAction
              action="print"
              onClick={() => void data.onPrint?.()}
              aria-label="طباعة طلب التحويل"
            />
          )}
          {request.status === 'pending' && data.canApprove && (
            <>
              <TableIconAction
                action="reject"
                onClick={() => { void data.onReject?.(); close(); }}
                aria-label="رفض طلب التحويل"
              />
              <TableIconAction
                action="approve"
                title={data.approveDisabledReason || 'اعتماد'}
                aria-label="اعتماد طلب التحويل"
                disabled={Boolean(data.approveDisabledReason)}
                onClick={() => { void data.onApprove?.(); close(); }}
              />
            </>
          )}
          {request.status === 'approved' && data.canCancelMovement && (
            <TableIconAction
              action="undo"
              title="إلغاء الحركة"
              aria-label="إلغاء حركة التحويل"
              onClick={() => { void data.onCancelMovement?.(); close(); }}
            />
          )}
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
