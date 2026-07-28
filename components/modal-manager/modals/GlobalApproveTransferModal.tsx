import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { formatNumber } from '../../../utils/calculations';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => close()}>
      <div className="bg-[var(--color-card)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-[var(--color-card)] z-10">
          <div>
            <h3 className="text-lg font-bold">طلب تحويل #{request.referenceNo}</h3>
            <p className="text-xs text-slate-500">{transferRequestTypeLabel(request.requestType)} — {request.status}</p>
          </div>
          <button type="button" onClick={() => close()} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">من:</span> <strong>{fromName}</strong></div>
            <div><span className="text-slate-500">إلى:</span> <strong>{toName}</strong></div>
            <div><span className="text-slate-500">المنشئ:</span> {request.createdBy}</div>
            <div><span className="text-slate-500">التاريخ:</span> {new Date(request.createdAt).toLocaleString('ar-EG')}</div>
          </div>
          {request.note && <p className="text-sm bg-slate-50 rounded-lg p-3">{request.note}</p>}
          <table className="w-full text-sm text-right border-collapse">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">الصنف</th>
                <th className="py-2 text-center">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {request.lines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{line.itemName} ({line.itemCode})</td>
                  <td className="py-2 text-center font-bold">{formatNumber(line.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t flex flex-wrap justify-end gap-1.5 sticky bottom-0 bg-[var(--color-card)]">
          {data.onPrint && (
            <button
              type="button"
              onClick={() => void data.onPrint?.()}
              title="طباعة"
              aria-label="طباعة طلب التحويل"
              className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors"
            >
              <span className="material-icons-round text-sm">print</span>
            </button>
          )}
          {request.status === 'pending' && data.canApprove && (
            <>
              <button
                type="button"
                onClick={() => { void data.onReject?.(); close(); }}
                title="رفض"
                aria-label="رفض طلب التحويل"
                className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <span className="material-icons-round text-sm">cancel</span>
              </button>
              <button
                type="button"
                title={data.approveDisabledReason || 'اعتماد'}
                aria-label="اعتماد طلب التحويل"
                disabled={Boolean(data.approveDisabledReason)}
                onClick={() => { void data.onApprove?.(); close(); }}
                className="p-2 rounded-[var(--border-radius-base)] border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-icons-round text-sm">check_circle</span>
              </button>
            </>
          )}
          {request.status === 'approved' && data.canCancelMovement && (
            <button
              type="button"
              title="إلغاء الحركة"
              aria-label="إلغاء حركة التحويل"
              onClick={() => { void data.onCancelMovement?.(); close(); }}
              className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <span className="material-icons-round text-sm">undo</span>
            </button>
          )}
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
        </div>
      </div>
    </div>
  );
};
