import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/UI';
import { VoucherItemCombobox } from '../VoucherItemCombobox';
import { buildCodeVoucherPicker } from '../../lib/materialVoucherPicker';
import { toast } from '../../../../components/Toast';
import { stockService } from '../../services/stockService';
import type { Warehouse, WarehouseLocation } from '../../types';
import type { ConsumableOption } from '../../lib/itemMovementTrace';
import { ModalShell } from './ModalShell';
import { INVENTORY_STOCK_MOVE_PATHS } from '../../../system/lib/operationPathSettings';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDefineConsumable: () => void;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  consumables: ConsumableOption[];
  canAdd: boolean;
  createdBy: string;
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
  createdBy,
}) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [locationId, setLocationId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWarehouseId((prev) => prev || warehouses[0]?.id || '');
  }, [open, warehouses]);

  const warehouseLocations = useMemo(
    () => locations.filter((loc) => loc.warehouseId === warehouseId && loc.isActive !== false),
    [locations, warehouseId],
  );
  const locationsRequired = warehouseLocations.length > 0;
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
    setLocationId('');
    setNote('');
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
    if (locationsRequired && !locationId) {
      toast.error('حدد الرف.');
      return;
    }
    const loc = warehouseLocations.find((l) => l.id === locationId);
    setSaving(true);
    try {
      await stockService.createMovement({
        warehouseId,
        locationId: locationId || undefined,
        locationCode: loc?.code || undefined,
        itemType: 'material',
        itemId: material.id,
        itemName: material.name,
        itemCode: material.code,
        unit: material.unit,
        movementType: 'IN',
        quantity: Number(quantity),
        sourceModule: 'manual_movement',
        sourceId: `CNS-IN-${Date.now()}`,
        note: note.trim() || `إضافة مستهلكات — ${material.name}`,
        createdBy,
      }, { path: INVENTORY_STOCK_MOVE_PATHS.consumableAddStock });
      toast.success('تم إضافة الكمية للمخزن.');
      onSaved();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إضافة الكمية.');
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
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setLocationId('');
          }}
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

      {locationsRequired && (
        <label className="block text-sm space-y-1">
          <span className="font-bold">الرف *</span>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">اختر رف</option>
            {warehouseLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.code}</option>
            ))}
          </select>
        </label>
      )}

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
