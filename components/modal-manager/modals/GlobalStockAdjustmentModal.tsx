import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { stockService } from '../../../modules/inventory/services/stockService';
import { useStockAvailabilityPreview } from '../../../modules/inventory/hooks/useStockAvailabilityPreview';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { InventoryItemType, StockAdjustmentReason } from '../../../modules/inventory/types';

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

  if (!isOpen || !data.warehouseId) return null;

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
      });
      data.onSaved?.();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التسوية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => close()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md border p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">تسوية مخزون</h3>
          <button type="button" onClick={() => close()}><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600">{data.itemName} ({data.itemCode})</p>
        <p className="text-sm font-bold text-primary">
          {loading ? 'جاري التحميل...' : `الرصيد الحالي: ${available ?? 0}`}
        </p>
        <input
          type="number"
          className="w-full border rounded-lg px-3 py-2"
          placeholder="قيمة التسوية (+ أو -)"
          value={quantity || ''}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <select className="w-full border rounded-lg px-3 py-2 font-bold text-sm" value={reason} onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}>
          <option value="count_correction">تصحيح جرد</option>
          <option value="damage">تلف</option>
          <option value="missing">نقص</option>
          <option value="extra">زيادة</option>
          <option value="manual_correction">تصحيح يدوي</option>
        </select>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {error && <p className="text-sm text-rose-600 font-bold">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close()}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>حفظ</Button>
        </div>
      </div>
    </div>
  );
};
