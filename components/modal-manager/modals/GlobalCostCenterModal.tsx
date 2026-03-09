import React, { useEffect, useState } from 'react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import type { CostCenter } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type CostCenterPayload = {
  costCenter?: CostCenter;
};

export const GlobalCostCenterModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.COST_CENTERS_CREATE);
  const createCostCenter = useAppStore((s) => s.createCostCenter);
  const updateCostCenter = useAppStore((s) => s.updateCostCenter);
  const { can } = usePermission();
  const canManage = can('costs.manage');

  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [form, setForm] = useState({ name: '', type: 'indirect' as 'indirect' | 'direct', isActive: true });
  const [saving, setSaving] = useState(false);

  const modalPayload = payload as CostCenterPayload | undefined;

  useEffect(() => {
    if (!isOpen) return;
    const cc = modalPayload?.costCenter || null;
    setEditingCostCenter(cc);
    if (cc) {
      setForm({
        name: cc.name,
        type: cc.type,
        isActive: cc.isActive,
      });
    } else {
      setForm({ name: '', type: 'indirect', isActive: true });
    }
  }, [isOpen, modalPayload]);

  if (!isOpen || !canManage) return null;

  const handleClose = () => {
    if (saving) return;
    close();
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingCostCenter?.id) {
        await updateCostCenter(editingCostCenter.id, form);
      } else {
        await createCostCenter(form);
      }
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{editingCostCenter ? 'تعديل مركز التكلفة' : 'إضافة مركز تكلفة'}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم مركز التكلفة *</label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: إيجار المصنع"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">النوع *</label>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'indirect' | 'direct' })}
            >
              <option value="indirect">غير مباشر (يوزع على الخطوط)</option>
              <option value="direct">مباشر</option>
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
            />
            <span className="text-sm font-bold text-[var(--color-text-muted)]">مفعل</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            حفظ
          </Button>
        </div>
      </div>
    </div>
  );
};

