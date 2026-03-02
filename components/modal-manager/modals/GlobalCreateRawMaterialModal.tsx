import React, { useState } from 'react';
import { Button } from '../../../modules/production/components/UI';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateRawMaterialModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE);
  const { can } = usePermission();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('kg');
  const [minStock, setMinStock] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  if (!isOpen) return null;
  if (!can('inventory.items.manage')) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    const cleanUnit = unit.trim() || 'unit';
    if (!cleanName || !cleanCode) {
      setMessage({ type: 'error', text: 'اسم المادة الخام والكود مطلوبان.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const id = await rawMaterialService.create({
        name: cleanName,
        code: cleanCode,
        unit: cleanUnit,
        minStock: Number(minStock || 0),
        isActive: true,
      });
      if (!id) throw new Error('create failed');
      setMessage({ type: 'success', text: 'تمت إضافة المادة الخام بنجاح.' });
      setName('');
      setCode('');
      setUnit('kg');
      setMinStock(0);
    } catch {
      setMessage({ type: 'error', text: 'تعذر إضافة المادة الخام. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">إضافة مادة خام</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
              <span className="material-icons-round text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <p className="flex-1">{message.text}</p>
            </div>
          )}
          <input
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 outline-none"
            placeholder="اسم المادة الخام"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 outline-none"
              placeholder="الكود"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 outline-none"
              placeholder="الوحدة"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <input
            type="number"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 outline-none"
            placeholder="الحد الأدنى"
            value={minStock}
            onChange={(e) => setMinStock(Number(e.target.value))}
          />
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !name.trim() || !code.trim()}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">inventory_2</span>
            إضافة مادة خام
          </Button>
        </div>
      </div>
    </div>
  );
};
