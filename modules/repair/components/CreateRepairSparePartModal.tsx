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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { buildCodeVoucherPicker } from '@/modules/inventory/lib/materialVoucherPicker';
import { toast } from '../../../components/Toast';
import {
  filterCatalogComponentsForSpareParts,
  loadProductComponents,
  loadSparePartsCatalogMaterials,
  type CatalogComponent,
} from '../../catalog/lib/productComponents';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import { useAppStore } from '../../../store/useAppStore';
import { sparePartsService } from '../services/sparePartsService';
import type { RepairSparePart } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

type FormState = {
  sourceMode: 'product_bom' | 'all_materials';
  productId: string;
  materialId: string;
  unit: string;
  minStock: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  existingParts: RepairSparePart[];
  defaultMinStock?: number;
  onCreated?: () => void | Promise<void>;
};

const nextSparePartCode = (parts: RepairSparePart[]) => {
  const maxSerial = parts.reduce((max, part) => {
    const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
    if (!match) return max;
    const current = Number(match[1] || 0);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);
  return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
};

export const CreateRepairSparePartModal: React.FC<Props> = ({
  open,
  onOpenChange,
  branchId,
  existingParts,
  defaultMinStock = 1,
  onCreated,
}) => {
  const { dir } = useAppDirection();
  const products = useAppStore((s) => s._rawProducts);
  const [busy, setBusy] = useState(false);
  const [catalogComponents, setCatalogComponents] = useState<CatalogComponent[]>([]);
  const [bomComponents, setBomComponents] = useState<CatalogComponent[]>([]);
  const [materialsById, setMaterialsById] = useState<Map<string, Material>>(new Map());
  const [form, setForm] = useState<FormState>({
    sourceMode: 'all_materials',
    productId: '',
    materialId: '',
    unit: 'قطعة',
    minStock: String(defaultMinStock),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      sourceMode: 'all_materials',
      productId: '',
      materialId: '',
      unit: 'قطعة',
      minStock: String(defaultMinStock),
    });
    void loadSparePartsCatalogMaterials()
      .then(setCatalogComponents)
      .catch(() => setCatalogComponents([]));
    void materialService.getAll()
      .then((rows) => {
        const map = new Map<string, Material>();
        for (const row of rows) {
          const id = String(row.id || '').trim();
          if (id) map.set(id, row);
        }
        setMaterialsById(map);
      })
      .catch(() => setMaterialsById(new Map()));
  }, [open, defaultMinStock]);

  useEffect(() => {
    if (!open) return;
    const productId = String(form.productId || '').trim();
    if (form.sourceMode !== 'product_bom' || !productId) {
      setBomComponents([]);
      return;
    }
    let cancelled = false;
    void Promise.all([loadProductComponents(productId), materialService.getAll()])
      .then(([rows, materials]) => {
        if (!cancelled) setBomComponents(filterCatalogComponentsForSpareParts(rows, materials));
      })
      .catch(() => {
        if (!cancelled) setBomComponents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.productId, form.sourceMode, open]);

  const selectableComponents = useMemo(() => {
    if (form.sourceMode === 'all_materials') return catalogComponents;
    return bomComponents;
  }, [bomComponents, catalogComponents, form.sourceMode]);

  const productPicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        products
          .filter((product) => product.id)
          .map((product) => ({
            value: String(product.id),
            label: [
              product.name,
              product.model ? `- ${product.model}` : '',
              product.code ? `(${product.code})` : '',
            ]
              .filter(Boolean)
              .join(' ')
              .trim(),
            name: product.name,
            code: product.code,
            barcode: product.barcode,
            stockItemType: 'finished_good' as const,
          })),
      ),
    [products],
  );

  const componentPicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        selectableComponents.map((material) => ({
          value: material.materialId,
          label: material.materialCode
            ? `${material.materialName} (${material.materialCode})`
            : material.materialName,
          name: material.materialName,
          code: material.materialCode,
          barcode: materialsById.get(material.materialId)?.barcode,
          stockItemType: 'material' as const,
        })),
      ),
    [selectableComponents, materialsById],
  );

  const selectedMaterial = useMemo(
    () => selectableComponents.find((row) => row.materialId === form.materialId) || null,
    [form.materialId, selectableComponents],
  );

  const applyComponentSelection = (materialId: string) => {
    const selected = selectableComponents.find((row) => row.materialId === materialId);
    setForm((prev) => ({
      ...prev,
      materialId,
      unit: selected?.unitLabel || prev.unit || 'قطعة',
    }));
  };

  const createPart = async () => {
    if (!branchId || busy) return;
    if (!selectedMaterial) {
      toast.error('اختر مكونًا من الماستر داتا أولًا.');
      return;
    }
    const partName = String(selectedMaterial.materialName || '').trim();
    const materialId = String(selectedMaterial.materialId || '').trim();
    if (!partName || !materialId) {
      toast.error('بيانات المكون غير صالحة.');
      return;
    }
    const existing = existingParts.find((part) => {
      const linkedId = String(part.materialId || part.rawMaterialId || '').trim();
      if (materialId && linkedId && linkedId === materialId) return true;
      return String(part.name || '').trim().toLowerCase() === partName.toLowerCase();
    });
    if (existing) {
      toast.error('هذا المكون مضاف بالفعل كقطعة غيار.');
      return;
    }
    const minStock = Number(form.minStock);
    if (!Number.isFinite(minStock) || minStock < 0) {
      toast.error('الحد الأدنى غير صالح.');
      return;
    }
    setBusy(true);
    try {
      await sparePartsService.createPart({
        branchId,
        name: partName,
        code: nextSparePartCode(existingParts),
        category: selectedMaterial.categoryName || 'مكونات منتج',
        unit: form.unit || selectedMaterial.unitLabel || 'قطعة',
        minStock,
        materialId,
        ...(form.sourceMode === 'product_bom' && form.productId
          ? { sourceProductId: form.productId }
          : {}),
        ...(selectedMaterial.itemType === 'legacy_raw' ? { rawMaterialId: materialId } : {}),
      });
      toast.success('تمت إضافة القطعة.');
      onOpenChange(false);
      await onCreated?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر إضافة القطعة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent dir={dir} className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>إضافة صنف جديد</DialogTitle>
          <DialogDescription>
            اختر المكون من كتالوج المشروع. الماستر داتا تُدار من التصنيع بواسطة المسؤولين.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="spare-part-source">مصدر المكون</Label>
            <Select
              value={form.sourceMode}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  sourceMode: value as FormState['sourceMode'],
                  materialId: '',
                  productId: value === 'all_materials' ? '' : prev.productId,
                }))
              }
            >
              <SelectTrigger id="spare-part-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product_bom">مكونات منتج (BOM)</SelectItem>
                <SelectItem value="all_materials">كل المواد التصنيعية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.sourceMode === 'product_bom' ? (
            <div className="space-y-2">
              <Label>المنتج</Label>
              <VoucherItemCombobox
                options={productPicker.options}
                catalog={productPicker.catalog}
                value={form.productId}
                onChange={(value) => setForm((prev) => ({ ...prev, productId: value, materialId: '' }))}
                placeholder="ابحث بالاسم أو امسح الباركود"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>المكون</Label>
            <VoucherItemCombobox
              options={componentPicker.options}
              catalog={componentPicker.catalog}
              value={form.materialId}
              onChange={applyComponentSelection}
              disabled={form.sourceMode === 'product_bom' && !form.productId}
              placeholder={
                form.sourceMode === 'product_bom' && !form.productId
                  ? 'اختر المنتج أولًا'
                  : selectableComponents.length === 0
                    ? 'لا توجد مكونات'
                    : 'ابحث بالاسم أو امسح الباركود'
              }
            />
            {selectedMaterial?.materialCode ? (
              <p className="text-xs text-muted-foreground">
                الكود: {selectedMaterial.materialCode}
                {selectedMaterial.categoryName ? ` · ${selectedMaterial.categoryName}` : ''}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="spare-part-unit">الوحدة</Label>
              <Input
                id="spare-part-unit"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                placeholder="قطعة"
                readOnly={Boolean(selectedMaterial?.unitLabel)}
                className={selectedMaterial?.unitLabel ? 'bg-muted' : undefined}
              />
              {selectedMaterial?.unitLabel ? (
                <p className="text-xs text-muted-foreground">تُؤخذ من الماستر داتا</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="spare-part-min">الحد الأدنى</Label>
              <Input
                id="spare-part-min"
                type="number"
                min={0}
                step={1}
                value={form.minStock}
                onChange={(e) => setForm((prev) => ({ ...prev, minStock: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" disabled={busy || !branchId || !form.materialId} onClick={() => void createPart()}>
            {busy ? 'جاري الإضافة…' : 'إضافة الصنف'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
