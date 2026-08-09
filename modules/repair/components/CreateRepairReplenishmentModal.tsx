import React, { useEffect, useMemo, useState } from 'react';
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
import { SearchableSelect } from '@/components/UI';
import { toast } from '../../../components/Toast';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import { materialService } from '../../manufacturing/services/materialService';
import { isMaterialAvailableForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import type { Material } from '../../manufacturing/types';
import { usePermission } from '../../../utils/permissions';
import type { RepairSparePart } from '../types';

type DraftLine = { key: string; itemId: string; quantity: string };

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
  const canCreate = can('sparePartsReplenishment.create');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { key: '1', itemId: '', quantity: '1' },
  ]);

  useEffect(() => {
    if (!open) return;
    void materialService.getAll()
      .then((rows) => setMaterials(rows.filter(
        (m) => m.isActive !== false && m.id && isMaterialAvailableForSpareParts(m),
      )))
      .catch(() => setMaterials([]));
  }, [open]);

  const itemOptions = useMemo(() => {
    const seen = new Set<string>();
    const eligibleIds = new Set(materials.map((m) => String(m.id || '').trim()).filter(Boolean));
    const out: Array<{ value: string; label: string }> = [];
    for (const part of parts) {
      const itemId = String(part.materialId || part.rawMaterialId || '').trim();
      if (!itemId || seen.has(itemId)) continue;
      // Hide catalog rows whose material is marked not available for spare parts.
      if (eligibleIds.size > 0 && !eligibleIds.has(itemId)) continue;
      seen.add(itemId);
      out.push({
        value: itemId,
        label: `${part.name}${part.code ? ` (${part.code})` : ''}`,
      });
    }
    for (const material of materials) {
      const itemId = String(material.id || '').trim();
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      out.push({
        value: itemId,
        label: `${material.name}${material.code ? ` (${material.code})` : ''}`,
      });
    }
    return out;
  }, [parts, materials]);

  const reset = () => {
    setNote('');
    setDraftLines([{ key: '1', itemId: '', quantity: '1' }]);
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
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب تموين من المخزن الرئيسي</DialogTitle>
          <DialogDescription>
            اختر من كل الأصناف المعرفة — لا يشترط إضافتها لكتالوج الفرع أولاً. التجهيز والموافقة تتم في المخزن المركزي، ثم تستلم الرصيد هنا.
          </DialogDescription>
        </DialogHeader>

        {!toWarehouseId ? (
          <p className="text-sm text-muted-foreground">اختر فرعًا مربوطًا بمخزن صيانة أولًا.</p>
        ) : itemOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد أصناف متاحة. تأكد من وجود مواد نشطة في ماستر المكونات.
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
                  <SearchableSelect
                    options={itemOptions}
                    value={line.itemId}
                    onChange={(itemId) => {
                      setDraftLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, itemId } : row)),
                      );
                    }}
                    placeholder="ابحث واختر قطعة"
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Label>الكمية</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => {
                      const quantity = e.target.value;
                      setDraftLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, quantity } : row)),
                      );
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
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => void submitCreate()}
            disabled={busy || !canCreate || !toWarehouseId || itemOptions.length === 0}
          >
            {busy ? 'جاري الإرسال…' : 'إرسال الطلب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
