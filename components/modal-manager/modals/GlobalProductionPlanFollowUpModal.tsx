import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { loadProductComponents } from '../../../modules/catalog/lib/productComponents';
import { useAppStore } from '../../../store/useAppStore';
import { useTranslation } from 'react-i18next';
import { getPortalContainer } from '@/lib/portalRoot';

type ModalPayload = {
  planId?: string;
  productId?: string;
  lineId?: string;
};

type ComponentOption = {
  id: string;
  name: string;
};

export const GlobalProductionPlanFollowUpModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE);
  const createProductionPlanFollowUp = useAppStore((s) => s.createProductionPlanFollowUp);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const uid = useAppStore((s) => s.uid);

  const typedPayload = (payload || {}) as ModalPayload;
  const planId = String(typedPayload.planId || '').trim();
  const productId = String(typedPayload.productId || '').trim();
  const lineId = String(typedPayload.lineId || '').trim();

  const [options, setOptions] = useState<ComponentOption[]>([]);
  const [componentId, setComponentId] = useState('');
  const [shortageQty, setShortageQty] = useState<number>(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productName = useMemo(
    () => products.find((p) => p.id === productId)?.name || '—',
    [products, productId],
  );
  const lineName = useMemo(
    () => lines.find((l) => l.id === lineId)?.name || '—',
    [lines, lineId],
  );

  useEffect(() => {
    if (!isOpen || !productId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const components = await loadProductComponents(productId);
        if (cancelled) return;
        setOptions(
          components
            .map((row) => ({ id: row.materialId, name: row.materialName }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
        );
      } catch {
        if (cancelled) return;
        setOptions([]);
        setError(t('modalManager.productionPlanFollowUp.loadComponentsError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, productId]);

  useEffect(() => {
    if (!isOpen) return;
    setComponentId('');
    setShortageQty(0);
    setNote('');
    setSaving(false);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const canSave = Boolean(planId && productId && lineId && uid && componentId && shortageQty > 0 && !saving);

  const handleSave = async () => {
    if (!canSave) return;
    const selected = options.find((opt) => opt.id === componentId);
    if (!selected) {
      setError(t('modalManager.productionPlanFollowUp.invalidComponentError'));
      return;
    }
    setSaving(true);
    setError(null);
    const id = await createProductionPlanFollowUp({
      planId,
      productId,
      lineId,
      componentId: selected.id,
      componentName: selected.name,
      shortageQty: Number(shortageQty || 0),
      note: note.trim(),
      status: 'open',
      createdBy: uid!,
    });
    setSaving(false);
    if (!id) {
      setError(t('modalManager.productionPlanFollowUp.saveError'));
      return;
    }
    close();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--border-radius-base)] bg-[rgb(var(--color-warning)/0.1)]">
              <AlertTriangle size={18} className="text-[rgb(var(--color-warning))]" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold sm:text-lg">{t('modalManager.productionPlanFollowUp.title')}</h3>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.subtitle')}</p>
            </div>
          </div>
          <button onClick={close} className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]" aria-label={t('ui.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
              <p className="mb-1 text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.product')}</p>
              <p className="break-words font-bold text-[var(--color-text)]">{productName}</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
              <p className="mb-1 text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.line')}</p>
              <p className="break-words font-bold text-[var(--color-text)]">{lineName}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.componentRequired')}</label>
            <select
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-sm outline-none"
              disabled={loading}
            >
              <option value="">{t('modalManager.productionPlanFollowUp.selectComponent')}</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            {loading && <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.loadingComponents')}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.shortageQtyRequired')}</label>
            <input
              type="number"
              min={0}
              step="any"
              value={shortageQty || ''}
              onChange={(e) => setShortageQty(Number(e.target.value))}
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-sm outline-none"
              placeholder={t('modalManager.productionPlanFollowUp.shortageQtyPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.productionPlanFollowUp.note')}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-sm outline-none"
              placeholder={t('modalManager.productionPlanFollowUp.notePlaceholder')}
            />
          </div>

          {error && (
            <div className="erp-alert erp-alert-warning">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={close} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            {t('modalManager.productionPlanFollowUp.saveFollowUp')}
          </Button>
        </div>
      </div>
    </div>
  );

  const portalContainer = typeof document !== 'undefined' ? getPortalContainer() : null;
  return portalContainer ? createPortal(modalContent, portalContainer) : modalContent;
};

