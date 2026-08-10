import React, { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ProductionLineStatus, type FirestoreProductionLine } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
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
  sortOrder: 0,
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
  isPackagingLine: false,
};

export const GlobalCreateLineModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.LINES_CREATE);
  const { can } = usePermission();
  const createLine = useAppStore((s) => s.createLine);
  const lines = useAppStore((s) => s._rawLines);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
  const nextSortOrder = lines.reduce((max, line) => {
    const value = Number(line.sortOrder || 0);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0) + 1;
  const buildGenericLineCode = () => {
    const used = new Set(lines.map((line) => normalizeLineCode(line.code ?? '')).filter(Boolean));
    for (let i = nextSortOrder; i < nextSortOrder + 1000; i += 1) {
      const code = `LINE-${String(i).padStart(3, '0')}`;
      if (!used.has(code)) return code;
    }
    return `LINE-${Date.now()}`;
  };

  const handleClose = () => {
    if (saving) return;
    close();
  };

  const handleSave = async () => {
    const normalizedCode = normalizeLineCode((form.code ?? '').trim() || buildCodeFromLineName(form.name ?? '') || buildGenericLineCode());
    if (!form.name || !normalizedCode) {
      toast.error(t('modalManager.createLine.nameOrCodeRequiredError'));
      return;
    }
    const isDuplicateCode = lines.some((line) => normalizeLineCode(line.code ?? '') === normalizedCode);
    if (isDuplicateCode) {
      toast.error(t('modalManager.createLine.duplicateCodeError'));
      return;
    }
    setSaving(true);
    try {
      const id = await createLine({
        ...form,
        code: normalizedCode,
        sortOrder: Math.max(1, Number(form.sortOrder || nextSortOrder)),
      });
      if (!id) throw new Error('create failed');
      toast.success(t('modalManager.createLine.createSuccess'));
      setForm(emptyForm);
      close();
    } catch {
      toast.error(t('modalManager.createLine.saveError'));
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
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-5">
          <h3 className="min-w-0 truncate text-base font-bold sm:text-lg">{t('modalManager.createLine.title')}</h3>
          <button
            onClick={handleClose}
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            aria-label={t('ui.close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.codeOptional')}</label>
            <input className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={buildCodeFromLineName(form.name) || buildGenericLineCode() || t('modalManager.createLine.codePlaceholder')} />
            {!form.code?.trim() && (
              <p className="text-[11px] font-bold text-[var(--color-text-muted)]">
                سيتم توليد كود تلقائيًا: <span className="text-primary">{buildCodeFromLineName(form.name) || buildGenericLineCode()}</span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.nameRequired')}</label>
            <input className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('modalManager.createLine.namePlaceholder')} />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">ترتيب الظهور</label>
            <input
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none"
              type="number"
              min={1}
              value={form.sortOrder || ''}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              placeholder={`التالي: ${nextSortOrder}`}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.dailyWorkingHours')}</label>
              <input className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none" type="number" min={1} max={24} value={form.dailyWorkingHours} onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.maxWorkers')}</label>
              <input className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none" type="number" min={1} value={form.maxWorkers} onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createLine.status')}</label>
            <select className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductionLineStatus })}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(`modalManager.createLine.statuses.${opt.key}`)}</option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-muted/30 px-4 py-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-[var(--color-border)]"
              checked={Boolean(form.isPackagingLine)}
              onChange={(e) => setForm({ ...form, isPackagingLine: e.target.checked })}
            />
            <span className="text-sm font-bold leading-relaxed text-[var(--color-text)]">
              {t('modalManager.createLine.packagingLine')}
              <span className="mt-1 block text-[11px] font-semibold text-[var(--color-text-muted)]">
                {t('modalManager.createLine.packagingLineHint')}
              </span>
            </span>
          </label>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={handleClose} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !form.name}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Plus size={14} />
            {t('modalManager.createLine.addLine')}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
