import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { buildMaterialVoucherPicker } from '@/modules/inventory/lib/materialVoucherPicker';
import { toast } from '../../../components/Toast';
import { getCurrentTenantIdOrNull } from '@/lib/currentTenant';
import { useLocalFormDraft } from '@/modules/shared/hooks';
import { useAppStore } from '../../../store/useAppStore';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import { materialService } from '../../manufacturing/services/materialService';
import { isMaterialOptedInForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import type { Material } from '../../manufacturing/types';
import { usePermission } from '../../../utils/permissions';
import type { RepairSparePart } from '../types';

type DraftLine = { key: string; itemId: string; quantity: string };

type ReplenishmentFormDraft = {
  note: string;
  draftLines: DraftLine[];
};

const emptyReplenishmentLines = (): DraftLine[] => [{ key: '1', itemId: '', quantity: '1' }];

const isReplenishmentFormDraftEmpty = (draft: ReplenishmentFormDraft): boolean => {
  const hasNote = Boolean(draft.note.trim());
  const hasLines = draft.draftLines.some((line) => Boolean(line.itemId) || String(line.quantity || '1') !== '1');
  return !hasNote && !hasLines;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toWarehouseId?: string;
  /** Optional branch catalog — merged with full materials master. */
  parts?: RepairSparePart[];
  onCreated?: () => void;
};

export const CreateRepairReplenishmentModal: React.FC<Props> = ({
  open,
  onOpenChange,
  toWarehouseId,
  parts = [],
  onCreated,
}) => {
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile);
  const canCreate = can('sparePartsReplenishment.create');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>(emptyReplenishmentLines());
  const [draftItemFocusIndex, setDraftItemFocusIndex] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (draftItemFocusIndex == null) return;
    const el = document.getElementById(`repair-replenish-draft-item-${draftItemFocusIndex}`);
    if (!el) return;
    el.focus();
    setDraftItemFocusIndex(null);
  }, [draftItemFocusIndex, draftLines.length]);

  const replenishmentDraftValue = useMemo<ReplenishmentFormDraft>(() => ({
    note,
    draftLines,
  }), [note, draftLines]);

  const { hasDraft, clearDraft } = useLocalFormDraft<ReplenishmentFormDraft>({
    formKey: 'repair:replenishmentCreate',
    tenantId: getCurrentTenantIdOrNull() || user?.tenantId,
    userId: user?.id,
    value: replenishmentDraftValue,
    enabled: open,
    isEmpty: isReplenishmentFormDraftEmpty,
    onRestore: (draft) => {
      setNote(String(draft.note || ''));
      setDraftLines(
        Array.isArray(draft.draftLines) && draft.draftLines.length > 0
          ? draft.draftLines.map((line, index) => ({
              key: String(line.key || String(index + 1)),
              itemId: String(line.itemId || ''),
              quantity: String(line.quantity || '1'),
            }))
          : emptyReplenishmentLines(),
      );
    },
  });

  useEffect(() => {
    if (!open) return;
    void materialService.getAll()
      .then((rows) => setMaterials(rows.filter(
        (m) => m.isActive !== false && m.id && isMaterialOptedInForSpareParts(m),
      )))
      .catch(() => setMaterials([]));
  }, [open]);

  const materialPicker = useMemo(() => {
    const base = buildMaterialVoucherPicker(materials);
    const partRank = new Map<string, number>();
    parts.forEach((part, index) => {
      const itemId = String(part.materialId || part.rawMaterialId || '').trim();
      if (itemId && !partRank.has(itemId)) partRank.set(itemId, index);
    });
    if (partRank.size === 0) return base;
    return {
      catalog: base.catalog,
      options: [...base.options].sort((a, b) => {
        const aRank = partRank.get(a.value);
        const bRank = partRank.get(b.value);
        if (aRank == null && bRank == null) return 0;
        if (aRank == null) return 1;
        if (bRank == null) return -1;
        return aRank - bRank;
      }),
    };
  }, [materials, parts]);

  const reset = () => {
    clearDraft();
    setNote('');
    setDraftLines(emptyReplenishmentLines());
  };

  const submitCreate = async () => {
    if (!canCreate) {
      toast.error('ليس لديك صلاحية إنشاء طلب تموين.');
      return;
    }
    if (!toWarehouseId) {
      toast.error('اختر فرعًا مربوطًا بمخزن صيانة أولًا.');
      return;
    }
    const lines = draftLines
      .map((line) => ({
        itemId: String(line.itemId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.itemId && line.quantity > 0);
    if (lines.length === 0) {
      toast.error('أضف بند قطعة واحد على الأقل.');
      return;
    }
    setBusy(true);
    try {
      const created = await sparePartsReplenishmentService.create({
        fromWarehouseId: '',
        toWarehouseId,
        note: note.trim() || undefined,
        lines,
      });
      toast.success(`تم إنشاء طلب التموين ${created.referenceNo}`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنشاء طلب التموين.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep local draft on dismiss — only successful submit clears it.
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب تموين من المخزن الرئيسي</DialogTitle>
          <DialogDescription>
            اختر من الأصناف المفعّلة كقطع غيار فقط. التجهيز والموافقة تتم في المخزن المركزي، ثم تستلم الرصيد هنا.
          </DialogDescription>
        </DialogHeader>

        {!toWarehouseId ? (
          <p className="text-sm text-muted-foreground">اختر فرعًا مربوطًا بمخزن صيانة أولًا.</p>
        ) : materialPicker.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد أصناف مفعّلة كقطع غيار. فعّل «متاح لقطع الغيار» من شاشة المواد التصنيعية أولاً.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>ملاحظة</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اختياري"
              />
            </div>
            {draftLines.map((line, index) => (
              <div key={line.key} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-0 flex-1 space-y-1 sm:min-w-[180px]">
                  <Label>القطعة</Label>
                  <VoucherItemCombobox
                    id={`repair-replenish-draft-item-${index}`}
                    options={materialPicker.options}
                    catalog={materialPicker.catalog}
                    value={line.itemId}
                    onChange={(itemId) => {
                      setDraftLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, itemId } : row)),
                      );
                    }}
                    onSelected={() => {
                      window.setTimeout(() => {
                        const qtyInput = document.querySelector<HTMLInputElement>(
                          `[data-repair-replenish-draft-qty="${index}"]`,
                        );
                        qtyInput?.focus();
                        qtyInput?.select();
                      }, 0);
                    }}
                    placeholder="ابحث بالاسم أو امسح الباركود"
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Label>الكمية</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    data-repair-replenish-draft-qty={index}
                    value={line.quantity}
                    onChange={(e) => {
                      const quantity = e.target.value;
                      setDraftLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, quantity } : row)),
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (!String(line.itemId || '').trim() || !(Number(line.quantity) > 0)) {
                        toast.error('أدخل صنفاً وكمية أكبر من صفر قبل فتح بند جديد.');
                        return;
                      }
                      const nextIndex = index + 1;
                      if (index >= draftLines.length - 1) {
                        setDraftLines((prev) => [
                          ...prev,
                          { key: String(Date.now()), itemId: '', quantity: '1' },
                        ]);
                      }
                      setDraftItemFocusIndex(nextIndex);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    setDraftLines((prev) =>
                      prev.length <= 1
                        ? [{ key: String(Date.now()), itemId: '', quantity: '1' }]
                        : prev.filter((_, i) => i !== index),
                    )
                  }
                >
                  حذف البند
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() =>
                setDraftLines((prev) => [
                  ...prev,
                  { key: String(Date.now()), itemId: '', quantity: '1' },
                ])
              }
            >
              + إضافة بند
            </Button>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {hasDraft ? (
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={reset} disabled={busy}>
              مسح المسودة
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => void submitCreate()}
            disabled={busy || !canCreate || !toWarehouseId || materialPicker.options.length === 0}
          >
            {busy ? 'جاري الإرسال…' : 'إرسال الطلب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
