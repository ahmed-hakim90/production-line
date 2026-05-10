import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Package, Save, Unlock, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import type { RawMaterial } from '../../../modules/inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { categoryService } from '../../../modules/catalog/services/categoryService';
import { useTranslation } from 'react-i18next';
import { useAutoEntityCode } from '../../../modules/shared/hooks/useAutoEntityCode';
import { DUPLICATE_ENTITY_CODE } from '../../../modules/shared/services/entityCodeSequenceService';

type Message = { type: 'success' | 'error'; text: string } | null;

function isDuplicateEntityCodeError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === DUPLICATE_ENTITY_CODE || (e as Error & { code?: string }).code === DUPLICATE_ENTITY_CODE)
  );
}

export const GlobalCreateRawMaterialModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE);
  const { can } = usePermission();
  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoriesMeta, setCategoriesMeta] = useState<Array<{ name: string; code: string }>>([]);
  const [unit, setUnit] = useState('kg');
  const [minStock, setMinStock] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const rawPayload = (payload || {}) as {
    mode?: 'create' | 'edit';
    rawMaterial?: RawMaterial;
    onSaved?: () => void;
  };
  const editingRawMaterial = rawPayload.mode === 'edit' ? rawPayload.rawMaterial : undefined;
  const isEditMode = useMemo(() => Boolean(editingRawMaterial?.id), [editingRawMaterial?.id]);

  const selectedCategoryMeta = useMemo(
    () => categoriesMeta.find((c) => c.name === categoryName.trim()),
    [categoriesMeta, categoryName],
  );

  const peekRm = useCallback(() => {
    const code = selectedCategoryMeta?.code?.trim();
    const n = categoryName.trim();
    if (!code || !n) return Promise.resolve('');
    return rawMaterialService.peekNextCode({ categoryCode: code, categoryName: n });
  }, [selectedCategoryMeta, categoryName]);

  const {
    code,
    setCode,
    locked: codeLocked,
    toggleLock: toggleCodeLock,
    isLoading: codePreviewLoading,
  } = useAutoEntityCode({
    enabled: isOpen,
    isEditMode,
    initialCode: editingRawMaterial?.code ?? '',
    peek: peekRm,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode && editingRawMaterial) {
      setName(editingRawMaterial.name || '');
      setCategoryName(editingRawMaterial.categoryName || '');
      setUnit(editingRawMaterial.unit || 'unit');
      setMinStock(Number(editingRawMaterial.minStock || 0));
    } else {
      setName('');
      setCategoryName('');
      setUnit('kg');
      setMinStock(0);
    }
    setMessage(null);
  }, [isOpen, isEditMode, editingRawMaterial]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCategoryOptions = async () => {
      try {
        const rows = await categoryService.getByType('raw_material');
        if (cancelled) return;
        const meta = rows
          .filter((row) => row.isActive !== false)
          .map((row) => ({
            name: String(row.name || '').trim(),
            code: String(row.code || '').trim(),
          }))
          .filter((row) => row.name);
        const byName = new Map<string, { name: string; code: string }>();
        for (const row of meta) {
          if (!byName.has(row.name)) byName.set(row.name, row);
        }
        setCategoriesMeta(
          Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
        );
      } catch {
        if (cancelled) return;
        setCategoriesMeta([]);
      }
    };
    void loadCategoryOptions();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (!can('inventory.items.manage')) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanCategoryName = categoryName.trim();
    const cleanUnit = unit.trim() || 'unit';
    if (!cleanName) {
      setMessage({ type: 'error', text: t('modalManager.createRawMaterial.requiredNameError') });
      return;
    }

    let cleanCode = '';
    if (isEditMode) {
      cleanCode = code.trim().toUpperCase();
      if (!cleanCode) {
        setMessage({ type: 'error', text: t('modalManager.createRawMaterial.requiredFieldsError') });
        return;
      }
    } else if (codeLocked) {
      if (!cleanCategoryName) {
        setMessage({ type: 'error', text: t('modalManager.createRawMaterial.requiredCategoryAutoCodeError') });
        return;
      }
      if (!selectedCategoryMeta?.code?.trim()) {
        setMessage({ type: 'error', text: t('modalManager.createRawMaterial.categoryMissingCodeError') });
        return;
      }
      cleanCode = '';
    } else {
      cleanCode = code.trim().toUpperCase();
      if (!cleanCode) {
        setMessage({ type: 'error', text: t('modalManager.createRawMaterial.manualCodeRequired') });
        return;
      }
    }

    setSaving(true);
    setMessage(null);
    try {
      if (isEditMode && editingRawMaterial?.id) {
        await rawMaterialService.update(editingRawMaterial.id, {
          name: cleanName,
          code: cleanCode,
          categoryName: cleanCategoryName || undefined,
          unit: cleanUnit,
          minStock: Number(minStock || 0),
        });
      } else {
        const id = await rawMaterialService.create(
          {
            name: cleanName,
            code: cleanCode,
            categoryName: cleanCategoryName || undefined,
            unit: cleanUnit,
            minStock: Number(minStock || 0),
            isActive: true,
          },
          codeLocked
            ? {
                autoFromCategory: {
                  categoryCode: selectedCategoryMeta!.code.trim(),
                  categoryName: cleanCategoryName,
                },
              }
            : undefined,
        );
        if (!id) throw new Error('create failed');
      }
      rawPayload.onSaved?.();
      close();
    } catch (e) {
      if (isDuplicateEntityCodeError(e)) {
        setMessage({ type: 'error', text: t('entityCode.duplicateError') });
      } else {
        setMessage({
          type: 'error',
          text: isEditMode
            ? t('modalManager.createRawMaterial.updateError')
            : t('modalManager.createRawMaterial.createError'),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const canSubmitCreate =
    !!name.trim() &&
    (codeLocked
      ? !!categoryName.trim() &&
        !!selectedCategoryMeta?.code?.trim() &&
        !!code.trim() &&
        !codePreviewLoading
      : !!code.trim());
  const canSubmit = isEditMode ? !!name.trim() && !!code.trim() : canSubmitCreate;

  const categoryPlaceholder = isEditMode
    ? t('modalManager.createRawMaterial.categoryOptional')
    : t('modalManager.createRawMaterial.categorySelectPlaceholder');

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{isEditMode ? t('modalManager.createRawMaterial.editTitle') : t('modalManager.createRawMaterial.createTitle')}</h3>
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
            placeholder={t('modalManager.createRawMaterial.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          >
            <option value="">{categoryPlaceholder}</option>
            {categoriesMeta.map((c) => (
              <option key={`${c.name}|${c.code}`} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 min-w-0">
                  <input
                    readOnly={codeLocked}
                    className={`w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none font-mono text-sm ${codeLocked ? 'opacity-90' : ''}`}
                    placeholder={t('modalManager.createRawMaterial.codePlaceholder')}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    aria-label={t('modalManager.createRawMaterial.codePlaceholder')}
                  />
                  {codePreviewLoading && !isEditMode && (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 p-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-bg)]"
                  onClick={toggleCodeLock}
                  title={codeLocked ? t('entityCode.unlockTitle') : t('entityCode.lockTitle')}
                >
                  {codeLocked ? <Lock size={18} /> : <Unlock size={18} />}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] px-0.5">
                {codeLocked ? t('entityCode.lockHint') : t('entityCode.unlockedHint')}
              </p>
            </div>
            <input
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
              placeholder={t('modalManager.createRawMaterial.unitPlaceholder')}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <input
            type="number"
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            placeholder={t('modalManager.createRawMaterial.minStockPlaceholder')}
            value={minStock}
            onChange={(e) => setMinStock(Number(e.target.value))}
          />
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !canSubmit}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditMode ? <Save size={14} /> : <Package size={14} />}
            {isEditMode ? t('modalManager.createRawMaterial.saveChanges') : t('modalManager.createRawMaterial.addRawMaterial')}
          </Button>
        </div>
      </div>
    </div>
  );
};
