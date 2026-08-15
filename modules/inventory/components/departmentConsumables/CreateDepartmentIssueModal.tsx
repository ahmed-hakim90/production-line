import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/UI';
import { VoucherItemCombobox } from '../VoucherItemCombobox';
import { buildCodeVoucherPicker } from '../../lib/materialVoucherPicker';
import { toast } from '../../../../components/Toast';
import { toUserSafeFirestoreError } from '../../../repair/lib/repairFirestoreErrors';
import { departmentConsumableIssueService } from '../../services/departmentConsumableIssueService';
import { stockService } from '../../services/stockService';
import type { Warehouse, WarehouseLocation } from '../../types';
import type { FirestoreDepartment } from '../../../hr/types';
import { MATERIAL_UNIT_LABELS, type MaterialUnit } from '../../../manufacturing/types';
import type { ConsumableOption } from '../../lib/itemMovementTrace';
import { ModalShell } from './ModalShell';

type DraftLine = {
  key: string;
  itemId: string;
  quantity: number;
  locationId: string;
};

const emptyDraftLine = (): DraftLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemId: '',
  quantity: 0,
  locationId: '',
});

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onDefineConsumable: () => void;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  departments: FirestoreDepartment[];
  consumables: ConsumableOption[];
  initialWarehouseId?: string;
  initialDepartmentId?: string;
};

export const CreateDepartmentIssueModal: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  onDefineConsumable,
  warehouses,
  locations,
  departments,
  consumables,
  initialWarehouseId,
  initialDepartmentId,
}) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(initialWarehouseId || warehouses[0]?.id || '');
    setDepartmentId(initialDepartmentId || departments[0]?.id || '');
    setNote('');
    setLines([emptyDraftLine()]);
  }, [open, initialWarehouseId, initialDepartmentId, warehouses, departments]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !warehouseId) {
        setBalances(new Map());
        return;
      }
      try {
        const rows = await stockService.getBalances(warehouseId);
        if (cancelled) return;
        const map = new Map<string, number>();
        rows.forEach((row) => {
          if (row.itemType === 'material') {
            map.set(row.itemId, Number(row.quantity || 0));
          }
        });
        setBalances(map);
      } catch {
        if (!cancelled) setBalances(new Map());
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId]);

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

  if (!open) return null;

  const handleCreate = async () => {
    if (!warehouseId || !departmentId) {
      toast.error('حدد المخزن والقسم.');
      return;
    }
    const payloadLines = lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => {
        const loc = warehouseLocations.find((l) => l.id === line.locationId);
        return {
          itemId: line.itemId,
          quantity: Number(line.quantity),
          ...(line.locationId
            ? { locationId: line.locationId, locationCode: loc?.code || line.locationId }
            : {}),
        };
      });
    if (!payloadLines.length) {
      toast.error('أضف بند مستهلك واحداً على الأقل.');
      return;
    }
    if (locationsRequired && payloadLines.some((line) => !line.locationId)) {
      toast.error('حدد رف المصدر لكل بند.');
      return;
    }
    setSaving(true);
    try {
      const created = await departmentConsumableIssueService.create({
        warehouseId,
        departmentId,
        note: note.trim() || undefined,
        lines: payloadLines,
      });
      toast.success(`تم إنشاء السند ${created.referenceNo}`);
      onCreated();
      onClose();
    } catch (error) {
      toast.error(toUserSafeFirestoreError(error, 'تعذر إنشاء السند.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="سند صرف مستهلكات"
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ السند'}
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm space-y-1">
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
        <label className="text-sm space-y-1">
          <span className="font-bold">القسم *</span>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">اختر قسم</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="font-bold">ملاحظة</span>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">البنود</p>
        <Button type="button" size="sm" variant="secondary" onClick={onDefineConsumable}>
          تعريف مستهلك
        </Button>
      </div>

      {consumables.length === 0 && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-[var(--color-text-muted)] space-y-2">
          <p>لا توجد مستهلكات معرفة — عرّف مستهلكًا أولًا (مثل جلانس تنظيف قطع الزجاج).</p>
          <Button type="button" size="sm" onClick={onDefineConsumable}>تعريف مستهلك</Button>
        </div>
      )}

      {lines.map((line, index) => {
        const material = consumables.find((c) => c.id === line.itemId);
        const available = line.itemId ? Number(balances.get(line.itemId) || 0) : 0;
        const unitLabel = material?.unit
          ? (MATERIAL_UNIT_LABELS[material.unit as MaterialUnit] || material.unit)
          : '';
        const unitCost = Number(material?.purchaseCost || 0);
        return (
          <div
            key={line.key}
            className="flex flex-wrap md:flex-nowrap items-start gap-2 border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-card)]"
          >
            <div className="flex-1 min-w-[160px] space-y-1">
              <p className="text-xs font-bold h-4">المستهلك</p>
              <VoucherItemCombobox
                options={consumablePicker.options}
                catalog={consumablePicker.catalog}
                value={line.itemId}
                onChange={(value) => {
                  setLines((prev) => prev.map((row, i) => (
                    i === index ? { ...row, itemId: value } : row
                  )));
                }}
                placeholder="ابحث بالاسم أو امسح الكود"
              />
              <p className="text-[11px] text-[var(--color-text-muted)] h-4">
                {line.itemId
                  ? `سعر الوحدة: ${fmt(unitCost)}`
                  : '\u00a0'}
              </p>
            </div>
            <div className="w-[7.5rem] shrink-0 space-y-1">
              <p className="text-xs font-bold h-4">الكمية {unitLabel ? `(${unitLabel})` : ''}</p>
              <input
                type="number"
                min={0}
                step="any"
                className="w-full h-10 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-card)]"
                value={line.quantity || ''}
                onChange={(e) => {
                  const quantity = Number(e.target.value);
                  setLines((prev) => prev.map((row, i) => (
                    i === index ? { ...row, quantity } : row
                  )));
                }}
              />
              <p className="text-[11px] text-[var(--color-text-muted)] h-4">
                {line.itemId ? `المتاح: ${fmt(available)}` : '\u00a0'}
              </p>
            </div>
            {locationsRequired && (
              <div className="w-[7.5rem] shrink-0 space-y-1">
                <p className="text-xs font-bold h-4">الرف</p>
                <select
                  className="w-full h-10 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-card)]"
                  value={line.locationId}
                  onChange={(e) => {
                    setLines((prev) => prev.map((row, i) => (
                      i === index ? { ...row, locationId: e.target.value } : row
                    )));
                  }}
                >
                  <option value="">اختر رف</option>
                  {warehouseLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.code}</option>
                  ))}
                </select>
                <p className="text-[11px] h-4">{'\u00a0'}</p>
              </div>
            )}
            <div className="shrink-0 space-y-1">
              <p className="text-xs font-bold h-4">{'\u00a0'}</p>
              <Button
                type="button"
                variant="danger"
                className="h-10"
                onClick={() => setLines((prev) => (
                  prev.length <= 1 ? [emptyDraftLine()] : prev.filter((_, i) => i !== index)
                ))}
              >
                حذف
              </Button>
              <p className="text-[11px] h-4">{'\u00a0'}</p>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyDraftLine()])}>
        إضافة بند
      </Button>
    </ModalShell>
  );
};
