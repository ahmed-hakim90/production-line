import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { stockService } from '../../../modules/inventory/services/stockService';
import { useStockAvailabilityPreview } from '../../../modules/inventory/hooks/useStockAvailabilityPreview';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { InventoryItemType, StockAdjustmentReason } from '../../../modules/inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  isOperationPathEnabled,
} from '../../../modules/system/lib/operationPathSettings';

type Payload = GlobalModalPayload & {
  warehouseId: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  createdBy: string;
};

export const GlobalStockAdjustmentModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT);
  const { can } = usePermission();
  const systemSettings = useAppStore((state) => state.systemSettings);
  const adjustmentPathEnabled = isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.stockMove,
    INVENTORY_STOCK_MOVE_PATHS.adjustmentModal,
  );
  const data = (payload || {}) as Payload;
  const { available, load, loading } = useStockAvailabilityPreview();
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState<StockAdjustmentReason>('manual_correction');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !data.warehouseId) return;
    void load(data.warehouseId, data.itemType, data.itemId);
    setQuantity(0);
    setError('');
  }, [isOpen, data.warehouseId, data.itemType, data.itemId, load]);

  if (
    !isOpen
    || !data.warehouseId
    || !can('inventory.transactions.create')
    || !adjustmentPathEnabled
  ) return null;

  const handleSave = async () => {
    if (quantity === 0) {
      setError('قيمة التسوية يجب ألا تساوي صفر.');
      return;
    }
    const next = Number(available ?? 0) + quantity;
    if (next < 0) {
      setError(`الرصيد الحالي ${available ?? 0} لا يسمح بهذه التسوية.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await stockService.createMovement({
        warehouseId: data.warehouseId,
        itemType: data.itemType,
        itemId: data.itemId,
        itemName: data.itemName,
        itemCode: data.itemCode,
        movementType: 'ADJUSTMENT',
        quantity,
        adjustmentReason: reason,
        sourceModule: 'manual_movement',
        note: note.trim() || `Manual adjustment: ${reason}`,
        createdBy: data.createdBy,
      }, { path: INVENTORY_STOCK_MOVE_PATHS.adjustmentModal });
      data.onSaved?.();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التسوية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => close()}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border bg-[var(--color-card)] shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate font-bold text-base sm:text-lg">تسوية مخزون</h3>
          <button type="button" onClick={() => close()} aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <p className="break-words text-sm text-[var(--color-text-muted)]">{data.itemName} ({data.itemCode})</p>
          <p className="text-sm font-bold text-primary">
            {loading ? 'جاري التحميل...' : `الرصيد الحالي: ${available ?? 0}`}
          </p>
          <input
            type="number"
            className="w-full rounded-lg border px-3 py-2"
            placeholder="قيمة التسوية (+ أو -)"
            value={quantity || ''}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <select className="w-full rounded-lg border px-3 py-2 text-sm font-bold" value={reason} onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}>
            <option value="count_correction">تصحيح جرد</option>
            <option value="damage">تلف</option>
            <option value="missing">نقص</option>
            <option value="extra">زيادة</option>
            <option value="manual_correction">تصحيح يدوي</option>
          </select>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          {error && <p className="text-sm font-bold text-[rgb(var(--color-danger))]">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => close()}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>حفظ</Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
