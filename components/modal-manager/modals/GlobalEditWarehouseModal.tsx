import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import type { Warehouse, WarehouseRole } from '../../../modules/inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { GlobalModalPayload } from '../modalOpenPayload';

const WAREHOUSE_ROLES: { value: WarehouseRole; label: string }[] = [
  { value: 'general', label: 'عام' },
  { value: 'raw_material', label: 'مواد خام' },
  { value: 'decomposed', label: 'مفكك' },
  { value: 'production_wip', label: 'إنتاج WIP' },
  { value: 'finished_staging', label: 'تم الصنع' },
  { value: 'final_product', label: 'منتج تام' },
  { value: 'packaging', label: 'تغليف' },
  { value: 'waste', label: 'هالك' },
];

type Payload = GlobalModalPayload & { warehouse?: Warehouse };

export const GlobalEditWarehouseModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT);
  const whPayload = (payload || {}) as Payload;
  const { can } = usePermission();
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
      setMessage({ type: 'success', text: 'تم حفظ المخزن.' });
      whPayload.onSaved?.();
      setTimeout(() => close(), 400);
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-xl shadow-2xl w-full max-w-xl border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">تعديل مخزن</h3>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {message.text}
            </div>
          )}
          <input className="w-full rounded-lg border px-3 py-2.5" placeholder="اسم المخزن" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-lg border px-3 py-2.5" placeholder="الكود" value={code} onChange={(e) => setCode(e.target.value)} />
          <select className="w-full rounded-lg border px-3 py-2.5 font-bold text-sm" value={warehouseRole} onChange={(e) => setWarehouseRole(e.target.value as WarehouseRole)}>
            {WAREHOUSE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            مخزن نشط
          </label>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            حفظ
          </Button>
        </div>
      </div>
    </div>
  );
};
