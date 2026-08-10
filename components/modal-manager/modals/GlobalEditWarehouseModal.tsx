import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import type { Warehouse, WarehouseRole } from '../../../modules/inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { GlobalModalPayload } from '../modalOpenPayload';
import { useAppStore } from '../../../store/useAppStore';

const WAREHOUSE_ROLES: { value: WarehouseRole; label: string }[] = [
  { value: 'general', label: 'عام' },
  { value: 'raw_material', label: 'مواد خام' },
  { value: 'decomposed', label: 'مفكك' },
  { value: 'production_floor', label: 'صالة الإنتاج' },
  { value: 'production_wip', label: 'تحت التسليم' },
  { value: 'finished_staging', label: 'بانتظار التغليف' },
  { value: 'final_product', label: 'منتج تام' },
  { value: 'packaging', label: 'تغليف' },
  { value: 'waste', label: 'هالك' },
  { value: 'spare_parts_central', label: 'قطع غيار (مركزي)' },
  { value: 'maintenance_center', label: 'مخزن مركز صيانة' },
];

type Payload = GlobalModalPayload & { warehouse?: Warehouse };

export const GlobalEditWarehouseModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT);
  const whPayload = (payload || {}) as Payload;
  const { can } = usePermission();
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [warehouseRole, setWarehouseRole] = useState<WarehouseRole>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !whPayload.warehouse) return;
    setName(whPayload.warehouse.name || '');
    setCode(whPayload.warehouse.code || '');
    setIsActive(whPayload.warehouse.isActive !== false);
    setWarehouseRole(whPayload.warehouse.warehouseRole ?? 'general');
    setMessage(null);
  }, [isOpen, whPayload.warehouse]);

  if (!isOpen || !whPayload.warehouse?.id) return null;
  if (!can('inventory.warehouses.manage')) return null;

  const handleClose = () => {
    if (saving) return;
    close();
  };

  const handleSave = async () => {
    const id = whPayload.warehouse!.id!;
    setSaving(true);
    setMessage(null);
    try {
      await warehouseService.update(id, {
        name: name.trim(),
        code: code.trim(),
        isActive,
        warehouseRole,
      });
      let routingSyncFailed = false;
      let routingUpdated = false;
      if (isActive && warehouseRole !== 'general' && (can('settings.edit') || can('roles.manage'))) {
        try {
          routingUpdated = await warehouseService.syncEmptyRoutingFromRoles();
          await fetchSystemSettings();
        } catch {
          routingSyncFailed = true;
        }
      }
      setMessage({
        type: routingSyncFailed ? 'error' : 'success',
        text: routingSyncFailed
          ? 'تم حفظ المخزن، لكن تعذر ربط دوره تلقائيًا. اربطه من إعدادات الإنتاج والمخازن.'
          : routingUpdated
            ? 'تم حفظ المخزن وربطه تلقائيًا بتوجيه المخزون.'
            : 'تم حفظ المخزن.',
      });
      whPayload.onSaved?.();
      if (!routingSyncFailed) setTimeout(() => close(), 400);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر حفظ المخزن.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate text-base font-bold sm:text-lg">تعديل مخزن</h3>
          <button type="button" onClick={handleClose} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {message && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]'}`}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span className="min-w-0 break-words">{message.text}</span>
            </div>
          )}
          <input className="w-full rounded-lg border px-3 py-2.5" placeholder="اسم المخزن (حر — زي ما تحب تسمّيه)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-lg border px-3 py-2.5" placeholder="الكود" value={code} onChange={(e) => setCode(e.target.value)} />
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">الدور التشغيلي (مش الاسم)</label>
            <select className="w-full rounded-lg border px-3 py-2.5 text-sm font-bold" value={warehouseRole} onChange={(e) => setWarehouseRole(e.target.value as WarehouseRole)}>
              {WAREHOUSE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              الاسم يظهر في الشاشات؛ الدور يساعد الربط في إعدادات التوجيه.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            مخزن نشط
          </label>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            حفظ
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
