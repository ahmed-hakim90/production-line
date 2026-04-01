import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ProductionLineStatus, type FirestoreProductionLine } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useTranslation } from 'react-i18next';

const statusOptions: { value: ProductionLineStatus; key: string }[] = [
  { value: ProductionLineStatus.ACTIVE, key: 'active' },
  { value: ProductionLineStatus.INJECTION, key: 'injection' },
  { value: ProductionLineStatus.MAINTENANCE, key: 'maintenance' },
  { value: ProductionLineStatus.IDLE, key: 'idle' },
  { value: ProductionLineStatus.WARNING, key: 'warning' },
];

const emptyForm: Omit<FirestoreProductionLine, 'id'> = {
  name: '',
  code: '',
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
};

export const GlobalCreateLineModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.LINES_CREATE);
  const { can } = usePermission();
  const createLine = useAppStore((s) => s.createLine);
  const lines = useAppStore((s) => s._rawLines);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;
  if (!can('lines.create')) return null;

  const normalizeLineCode = (value: string) => value.trim().toUpperCase();
  const normalizeArabicDigits = (value: string) =>
    value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const buildCodeFromLineName = (name: string) => {
    const normalizedName = normalizeArabicDigits(name);
    const numberMatches = normalizedName.match(/\d+/g);
    if (!numberMatches?.length) return '';
    const lineNumber = Number(numberMatches[numberMatches.length - 1]);
    if (!Number.isFinite(lineNumber)) return '';
    return `LINE-${String(lineNumber).padStart(2, '0')}`;
  };

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    const normalizedCode = normalizeLineCode((form.code ?? '').trim() || buildCodeFromLineName(form.name ?? ''));
    if (!form.name || !normalizedCode) {
      setMessage({ type: 'error', text: t('modalManager.createLine.nameOrCodeRequiredError') });
      return;
    }
    const isDuplicateCode = lines.some((line) => normalizeLineCode(line.code ?? '') === normalizedCode);
    if (isDuplicateCode) {
      setMessage({ type: 'error', text: t('modalManager.createLine.duplicateCodeError') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const id = await createLine({ ...form, code: normalizedCode });
      if (!id) throw new Error('create failed');
      setMessage({ type: 'success', text: t('modalManager.createLine.createSuccess') });
      setForm(emptyForm);
    } catch {
      setMessage({ type: 'error', text: t('modalManager.createLine.saveError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{t('modalManager.createLine.title')}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="flex-1">{message.text}</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.codeOptional')}</label>
            <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('modalManager.createLine.codePlaceholder')} />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.nameRequired')}</label>
            <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('modalManager.createLine.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.dailyWorkingHours')}</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={1} max={24} value={form.dailyWorkingHours} onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.maxWorkers')}</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={1} value={form.maxWorkers} onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.status')}</label>
            <select className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductionLineStatus })}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(`modalManager.createLine.statuses.${opt.key}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Plus size={14} />
            {t('modalManager.createLine.addLine')}
          </Button>
        </div>
      </div>
    </div>
  );
};

