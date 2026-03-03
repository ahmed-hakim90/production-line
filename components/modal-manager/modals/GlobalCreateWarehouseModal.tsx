import React, { useState } from 'react';
import { Button } from '../../../modules/production/components/UI';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateWarehouseModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE);
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
      setMessage({ type: 'error', text: 'اسم المخزن والكود مطلوبان.' });
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
      setMessage({ type: 'success', text: 'تمت إضافة المخزن بنجاح.' });
      setName('');
      setCode('');
    } catch {
      setMessage({ type: 'error', text: 'تعذر إضافة المخزن. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">إضافة مخزن جديد</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              <span className="material-icons-round text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <p className="flex-1">{message.text}</p>
            </div>
          )}
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            placeholder="اسم المخزن"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            placeholder="كود المخزن"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !name.trim() || !code.trim()}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">warehouse</span>
            إضافة مخزن
          </Button>
        </div>
      </div>
    </div>
  );
};
