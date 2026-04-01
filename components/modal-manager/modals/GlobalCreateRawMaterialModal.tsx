import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Package, Save, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import type { RawMaterial } from '../../../modules/inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { categoryService } from '../../../modules/catalog/services/categoryService';
import { useTranslation } from 'react-i18next';

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateRawMaterialModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE);
  const { can } = usePermission();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
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

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode && editingRawMaterial) {
      setName(editingRawMaterial.name || '');
      setCode(editingRawMaterial.code || '');
      setCategoryName(editingRawMaterial.categoryName || '');
      setUnit(editingRawMaterial.unit || 'unit');
      setMinStock(Number(editingRawMaterial.minStock || 0));
    } else {
      setName('');
      setCode('');
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
        const names = rows
          .filter((row) => row.isActive !== false)
          .map((row) => String(row.name || '').trim())
          .filter(Boolean);
        setCategoryOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ar')));
      } catch {
        if (cancelled) return;
        setCategoryOptions([]);
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
    const cleanCode = code.trim().toUpperCase();
    const cleanCategoryName = categoryName.trim();
    const cleanUnit = unit.trim() || 'unit';
    if (!cleanName || !cleanCode) {
      setMessage({ type: 'error', text: t('modalManager.createRawMaterial.requiredFieldsError') });
      return;
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
        const id = await rawMaterialService.create({
          name: cleanName,
          code: cleanCode,
          categoryName: cleanCategoryName || undefined,
          unit: cleanUnit,
          minStock: Number(minStock || 0),
          isActive: true,
        });
        if (!id) throw new Error('create failed');
      }
      rawPayload.onSaved?.();
      close();
    } catch {
      setMessage({
        type: 'error',
        text: isEditMode
          ? t('modalManager.createRawMaterial.updateError')
          : t('modalManager.createRawMaterial.createError'),
      });
    } finally {
      setSaving(false);
    }
  };

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
          <div className="grid grid-cols-2 gap-3">
            <input
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
              placeholder={t('modalManager.createRawMaterial.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
              placeholder={t('modalManager.createRawMaterial.unitPlaceholder')}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <select
            className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] outline-none"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          >
            <option value="">{t('modalManager.createRawMaterial.categoryOptional')}</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
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
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !name.trim() || !code.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditMode ? <Save size={14} /> : <Package size={14} />}
            {isEditMode ? t('modalManager.createRawMaterial.saveChanges') : t('modalManager.createRawMaterial.addRawMaterial')}
          </Button>
        </div>
      </div>
    </div>
  );
};
