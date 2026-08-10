import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Warehouse, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { GlobalModalPayload } from '../modalOpenPayload';
import { useTranslation } from 'react-i18next';
import type { WarehouseRole } from '../../../modules/inventory/types';
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

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateWarehouseModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE);
  const whPayload = (payload || {}) as GlobalModalPayload;
  const { can } = usePermission();
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [warehouseRole, setWarehouseRole] = useState<WarehouseRole>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  if (!isOpen) return null;
  if (!can('inventory.warehouses.manage')) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanName || !cleanCode) {
      setMessage({ type: 'error', text: t('modalManager.createWarehouse.requiredFieldsError') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const id = await warehouseService.create({
        name: cleanName,
        code: cleanCode,
        isActive: true,
        warehouseRole,
      });
      if (!id) throw new Error('create failed');
      let routingSyncFailed = false;
      let routingUpdated = false;
      if (warehouseRole !== 'general' && (can('settings.edit') || can('roles.manage'))) {
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
          ? 'تم إنشاء المخزن، لكن تعذر ربط دوره تلقائيًا. اربطه من إعدادات الإنتاج والمخازن.'
          : routingUpdated
            ? 'تم إنشاء المخزن وربطه تلقائيًا بتوجيه المخزون.'
            : t('modalManager.createWarehouse.createSuccess'),
      });
      setName('');
      setCode('');
      whPayload.onSaved?.();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error && err.message
          ? err.message
          : t('modalManager.createWarehouse.createError'),
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
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate text-base font-bold sm:text-lg">{t('modalManager.createWarehouse.title')}</h3>
          <button onClick={handleClose} className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]" aria-label={t('ui.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {message && (
            <div className={`flex items-center gap-2 rounded-[var(--border-radius-lg)] border px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]'}`}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="min-w-0 flex-1 break-words">{message.text}</p>
            </div>
          )}
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 outline-none"
            placeholder={t('modalManager.createWarehouse.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 outline-none"
            placeholder={t('modalManager.createWarehouse.codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <select
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm font-bold outline-none"
            value={warehouseRole}
            onChange={(e) => setWarehouseRole(e.target.value as WarehouseRole)}
          >
            {WAREHOUSE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="-mt-2 text-[11px] text-[var(--color-text-muted)]">
            الاسم حر (زي ما تحب تسمّيه). الدور التشغيلي منفصل ويُستخدم في توجيه الإنتاج.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={handleClose} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !name.trim() || !code.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Warehouse size={14} />
            {t('modalManager.createWarehouse.addWarehouse')}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
