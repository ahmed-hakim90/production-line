import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Warehouse, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { GlobalModalPayload } from '../modalOpenPayload';
import { useTranslation } from 'react-i18next';

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateWarehouseModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE);
  const whPayload = (payload || {}) as GlobalModalPayload;
  const { can } = usePermission();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
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
      });
      if (!id) throw new Error('create failed');
      setMessage({ type: 'success', text: t('modalManager.createWarehouse.createSuccess') });
      setName('');
      setCode('');
      whPayload.onSaved?.();
    } catch {
      setMessage({ type: 'error', text: t('modalManager.createWarehouse.createError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{t('modalManager.createWarehouse.title')}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="flex-1">{message.text}</p>
            </div>
          )}
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            placeholder={t('modalManager.createWarehouse.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            placeholder={t('modalManager.createWarehouse.codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !name.trim() || !code.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Warehouse size={14} />
            {t('modalManager.createWarehouse.addWarehouse')}
          </Button>
        </div>
      </div>
    </div>
  );
};
