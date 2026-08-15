import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/UI';
import { VoucherItemCombobox } from '../VoucherItemCombobox';
import { buildCodeVoucherPicker } from '../../lib/materialVoucherPicker';
import { toast } from '../../../../components/Toast';
import { departmentConsumableIssueService } from '../../services/departmentConsumableIssueService';
import { stockService } from '../../services/stockService';
import { defaultItemLocationService } from '../../services/defaultItemLocationService';
import { toUserSafeFirestoreError } from '../../../repair/lib/repairFirestoreErrors';
import type { Warehouse, WarehouseLocation } from '../../types';
import type { ConsumableOption } from '../../lib/itemMovementTrace';
import { ModalShell } from './ModalShell';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDefineConsumable: () => void;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  consumables: ConsumableOption[];
  canAdd: boolean;
};

export const AddConsumableStockModal: React.FC<Props> = ({
  open,
  onClose,
  onSaved,
  onDefineConsumable,
  warehouses,
  locations,
  consumables,
  canAdd,
}) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [shelfHint, setShelfHint] = useState('');

  useEffect(() => {
    if (!open) return;
    setWarehouseId((prev) => prev || warehouses[0]?.id || '');
  }, [open, warehouses]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !warehouseId || !itemId) {
        setShelfHint('');
        return;
      }
      try {
        const warehouseLocs = locations.filter(
          (loc) => loc.warehouseId === warehouseId && loc.isActive !== false,
        );
        const [def, bals] = await Promise.all([
          defaultItemLocationService.get({
            warehouseId,
            itemType: 'material',
            itemId,
          }).catch(() => null),
          stockService.getLocationBalances({
            warehouseId,
            itemType: 'material',
            itemId,
          }).catch(() => []),
        ]);
        if (cancelled) return;
        const defId = String(def?.locationId || '').trim();
        const defLoc = warehouseLocs.find((loc) => loc.id === defId);
        if (defLoc) {
          setShelfHint(defLoc.code || defId);
          return;
        }
        const withQty = bals
          .filter((row) => Number(row.quantity || 0) > 0)
          .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
        if (withQty[0]?.locationCode || withQty[0]?.locationId) {
          setShelfHint(String(withQty[0].locationCode || withQty[0].locationId));
          return;
        }
        const first = [...warehouseLocs].sort((a, b) =>
          String(a.code || '').localeCompare(String(b.code || ''), 'ar'),
        )[0];
        setShelfHint(first?.code || '');
      } catch {
        if (!cancelled) setShelfHint('');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, itemId, locations]);

  const consumablePicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        consumables.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.code})`,
          name: c.name,
          code: c.code,
        })),
      ),
    [consumables],
  );
  const material = consumables.find((c) => c.id === itemId);

  if (!open) return null;

  const handleClose = () => {
    setItemId('');
    setQuantity(0);
    setNote('');
    setShelfHint('');
    onClose();
  };

  const handleSave = async () => {
    if (!canAdd) {
      toast.error('ليس لديك صلاحية إضافة مخزون.');
      return;
    }
    if (!warehouseId) {
      toast.error('حدد المخزن.');
      return;
    }
    if (!itemId || !material) {
      toast.error('حدد المستهلك.');
      return;
    }
    if (!(Number(quantity) > 0)) {
      toast.error('أدخل كمية أكبر من صفر.');
      return;
    }
    setSaving(true);
    try {
      await departmentConsumableIssueService.addStock({
        warehouseId,
        itemId: material.id,
        quantity: Number(quantity),
        note: note.trim() || `إضافة مستهلكات — ${material.name}`,
      });
      toast.success('تم إضافة الكمية للمخزن.');
      onSaved();
      handleClose();
    } catch (error) {
      toast.error(toUserSafeFirestoreError(error, 'تعذر إضافة الكمية للمخزن.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="إضافة مستهلكات للمخزن"
      onClose={handleClose}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>إلغاء</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !canAdd}>
            {saving ? 'جاري الحفظ...' : 'حفظ الإضافة'}
          </Button>
        </>
      )}
    >
      <label className="block text-sm space-y-1">
        <span className="font-bold">المخزن *</span>
        <select
          className="w-full border rounded-lg px-3 py-2"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">اختر مخزن</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </label>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">المستهلك *</p>
          <Button type="button" size="sm" variant="secondary" onClick={onDefineConsumable}>
            تعريف مستهلك
          </Button>
        </div>
        {consumables.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-sm text-[var(--color-text-muted)] space-y-2">
            <p>لا توجد مستهلكات معرفة — عرّف مستهلكًا أولًا (مثل جلانس تنظيف قطع الزجاج).</p>
            <Button type="button" size="sm" onClick={onDefineConsumable}>تعريف مستهلك</Button>
          </div>
        ) : (
          <VoucherItemCombobox
            options={consumablePicker.options}
            catalog={consumablePicker.catalog}
            value={itemId}
            onChange={setItemId}
            placeholder="ابحث بالاسم أو امسح الكود"
          />
        )}
      </div>

      <label className="block text-sm space-y-1">
        <span className="font-bold">الكمية {material ? `(${material.unit})` : ''} *</span>
        <input
          type="number"
          min={0}
          step="any"
          className="w-full border rounded-lg px-3 py-2"
          value={quantity || ''}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>

      <p className="text-sm text-[var(--color-text-muted)]">
        {shelfHint
          ? `الرف: ${shelfHint} — يُحدَّد تلقائيًا من مكان الصنف.`
          : 'الرف يُحدَّد تلقائيًا من مكان الصنف في المخزن.'}
      </p>

      <label className="block text-sm space-y-1">
        <span className="font-bold">ملاحظة</span>
        <input
          className="w-full border rounded-lg px-3 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="اختياري"
        />
      </label>
    </ModalShell>
  );
};
