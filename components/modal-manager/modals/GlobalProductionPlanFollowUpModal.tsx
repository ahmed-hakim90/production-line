import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { productMaterialService } from '../../../modules/production/services/productMaterialService';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import { useAppStore } from '../../../store/useAppStore';

type ModalPayload = {
  planId?: string;
  productId?: string;
  lineId?: string;
};

type ComponentOption = {
  id: string;
  name: string;
};

const normalizeText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const GlobalProductionPlanFollowUpModal: React.FC = () => {
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
        const [materials, rawMaterials] = await Promise.all([
          productMaterialService.getByProduct(productId),
          rawMaterialService.getAll(),
        ]);
        if (cancelled) return;
        const rawById = new Map(rawMaterials.filter((rm) => Boolean(rm.id)).map((rm) => [String(rm.id), rm]));
        const rawByName = new Map(rawMaterials.map((rm) => [normalizeText(rm.name), rm]));
        const resolved = new Map<string, ComponentOption>();
        for (const material of materials) {
          const raw =
            (material.materialId ? rawById.get(material.materialId) : undefined)
            ?? rawByName.get(normalizeText(material.materialName || ''));
          if (!raw?.id) continue;
          if (!resolved.has(raw.id)) {
            resolved.set(raw.id, { id: raw.id, name: raw.name });
          }
        }
        setOptions(Array.from(resolved.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar')));
      } catch {
        if (cancelled) return;
        setOptions([]);
        setError('تعذر تحميل مكونات المنتج.');
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
      setError('اختر مكون صالح.');
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
      setError('تعذر حفظ المتابعة.');
      return;
    }
    close();
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]">
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold">إضافة متابعة نقص مكونات</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">تسجيل نقص مكوّن مرتبط بخطة الإنتاج</p>
            </div>
          </div>
          <button onClick={close} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-2.5">
              <p className="text-[var(--color-text-muted)] mb-1">المنتج</p>
              <p className="font-bold text-[var(--color-text)]">{productName}</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] p-2.5">
              <p className="text-[var(--color-text-muted)] mb-1">الخط</p>
              <p className="font-bold text-[var(--color-text)]">{lineName}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">المكون *</label>
            <select
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none"
              disabled={loading}
            >
              <option value="">اختر المكون...</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            {loading && <p className="text-xs text-[var(--color-text-muted)]">جاري تحميل المكونات...</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">الكمية الناقصة *</label>
            <input
              type="number"
              min={0}
              step="any"
              value={shortageQty || ''}
              onChange={(e) => setShortageQty(Number(e.target.value))}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none"
              placeholder="مثال: 250"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">ملحوظة</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none resize-none"
              placeholder="اكتب سبب النقص أو أي تفاصيل إضافية..."
            />
          </div>

          {error && (
            <div className="erp-alert erp-alert-warning">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <Button variant="outline" onClick={close}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            حفظ المتابعة
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

