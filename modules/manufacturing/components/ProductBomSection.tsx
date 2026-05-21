import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Calculator, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProductBom, useBomItemMutations } from '../hooks/useProductBom';
import { useMaterials as useMaterialsCatalog } from '../hooks/useMaterials';
import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  type MaterialType,
  type MaterialUnit,
  type BomItem,
} from '../types';
import { materialRequirementService } from '../services/materialRequirementService';
import { totalEstimatedCost } from '../engines/productionPlanningEngine';
import type { MaterialRequirementLine } from '../types';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';

const arNum = (n: number, fd = 2) =>
  n.toLocaleString('ar-EG', { minimumFractionDigits: fd, maximumFractionDigits: fd });

export type ProductBomSectionProps = {
  productId: string;
  canManage: boolean;
  userId: string;
};

export const ProductBomSection: React.FC<ProductBomSectionProps> = ({
  productId,
  canManage,
  userId,
}) => {
  const { data: bomData, isLoading, refetch } = useProductBom(productId);
  const { data: materials = [] } = useMaterialsCatalog();
  const { addItem, deleteItem } = useBomItemMutations('product', productId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    materialId: '',
    qtyPerUnit: 0,
    unit: 'piece' as MaterialUnit,
    wastePercent: 0,
    directCostPerUnit: 0,
    indirectCostPerUnit: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<MaterialRequirementLine[] | null>(null);
  const { openModal } = useGlobalModalManager();
  const [planQty, setPlanQty] = useState(1);
  const [reqLoading, setReqLoading] = useState(false);

  const materialOptions = useMemo(
    () => materials.filter((m) => m.isActive !== false && m.id),
    [materials],
  );

  const unitTotal = useMemo(
    () => (bomData?.rows ?? []).reduce((s, r) => s + Number(r.totalCost || 0), 0),
    [bomData?.rows],
  );

  const handleAdd = async () => {
    if (!canManage || !form.materialId || form.qtyPerUnit <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const mat = materialOptions.find((m) => m.id === form.materialId);
      await addItem.mutateAsync({
        itemId: form.materialId,
        itemType: 'material',
        itemName: mat?.name,
        qtyPerUnit: form.qtyPerUnit,
        unit: form.unit || mat?.baseUnit || 'piece',
        wastePercent: form.wastePercent,
        costBehavior: 'direct',
        directCostPerUnit: form.directCostPerUnit,
        indirectCostPerUnit: form.indirectCostPerUnit,
      });
      setShowForm(false);
      setForm({
        materialId: '',
        qtyPerUnit: 0,
        unit: 'piece',
        wastePercent: 0,
        directCostPerUnit: 0,
        indirectCostPerUnit: 0,
      });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الإضافة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BomItem) => {
    if (!canManage || !item.id) return;
    if (!window.confirm('حذف هذا السطر من الـ BOM؟')) return;
    try {
      await deleteItem.mutateAsync(item.id);
      await refetch();
    } catch {
      setError('تعذر الحذف');
    }
  };

  const handleViewRequirements = async () => {
    setReqLoading(true);
    setError(null);
    try {
      const runId = await materialRequirementService.generateFromInputs(
        [{ ownerType: 'product', ownerId: productId, quantity: Math.max(1, planQty) }],
        userId,
      );
      if (runId) {
        const run = await materialRequirementService.getRunById(runId);
        setRequirements(run?.lines ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر توليد الاحتياجات');
    } finally {
      setReqLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bomData?.isLegacy && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          يعرض بيانات قديمة من product_materials. نفّذ ترحيل المواد من صفحة المواد التصنيعية لتفعيل الـ BOM الكامل.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          إجمالي تكلفة المواد للوحدة: <span className="font-semibold text-foreground">{arNum(unitTotal)} ج.م</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">كمية للتخطيط</label>
            <input
              type="number"
              min={1}
              className="w-20 rounded border border-border px-2 py-1 text-sm"
              value={planQty}
              onChange={(e) => setPlanQty(Number(e.target.value) || 1)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={reqLoading} onClick={() => void handleViewRequirements()}>
            {reqLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            عرض الاحتياجات
          </Button>
          {canManage && (
            <Button type="button" size="sm" className="gap-1" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              إضافة مادة
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="erp-table w-full min-w-[800px] text-right">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">المادة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">النوع</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">كمية/وحدة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الوحدة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الهالك %</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">مباشر</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">غير مباشر</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الإجمالي</th>
              {canManage && <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {(bomData?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  لا توجد مواد في الـ BOM
                </td>
              </tr>
            ) : (
              (bomData?.rows ?? []).map((row) => (
                <tr key={row.id || row.itemId} className="border-b border-border/80">
                  <td className="px-3 py-2 text-sm">{row.itemName || row.itemId}</td>
                  <td className="px-3 py-2 text-sm">
                    {row.materialTypeLabel
                      ? MATERIAL_TYPE_LABELS[row.materialTypeLabel as MaterialType] ?? row.materialTypeLabel
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm">{arNum(Number(row.qtyPerUnit || 0))}</td>
                  <td className="px-3 py-2 text-sm">
                    {MATERIAL_UNIT_LABELS[row.unit as MaterialUnit] ?? row.unit}
                  </td>
                  <td className="px-3 py-2 text-sm">{arNum(Number(row.wastePercent || 0), 1)}</td>
                  <td className="px-3 py-2 text-sm">{arNum(row.directCost)}</td>
                  <td className="px-3 py-2 text-sm">{arNum(row.indirectCost)}</td>
                  <td className="px-3 py-2 text-sm font-medium">{arNum(row.totalCost)}</td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <Button type="button" variant="ghost" size="icon" onClick={() => void handleDelete(row)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && canManage && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <select
            className="w-full rounded border border-border px-3 py-2 text-sm"
            value={form.materialId}
            onChange={(e) => {
              const mat = materialOptions.find((m) => m.id === e.target.value);
              setForm((f) => ({
                ...f,
                materialId: e.target.value,
                unit: mat?.baseUnit ?? f.unit,
              }));
            }}
          >
            <option value="">اختر مادة</option>
            {materialOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              type="number"
              placeholder="كمية/وحدة"
              className="rounded border border-border px-2 py-1 text-sm"
              value={form.qtyPerUnit || ''}
              onChange={(e) => setForm((f) => ({ ...f, qtyPerUnit: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="هالك %"
              className="rounded border border-border px-2 py-1 text-sm"
              value={form.wastePercent || ''}
              onChange={(e) => setForm((f) => ({ ...f, wastePercent: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="تكلفة مباشرة/وحدة"
              className="rounded border border-border px-2 py-1 text-sm"
              value={form.directCostPerUnit || ''}
              onChange={(e) => setForm((f) => ({ ...f, directCostPerUnit: Number(e.target.value) }))}
            />
            <input
              type="number"
              placeholder="تكلفة غير مباشرة/وحدة"
              className="rounded border border-border px-2 py-1 text-sm"
              value={form.indirectCostPerUnit || ''}
              onChange={(e) => setForm((f) => ({ ...f, indirectCostPerUnit: Number(e.target.value) }))}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleAdd()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {requirements && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <Calculator className="h-4 w-4" />
              احتياجات المواد (كمية {arNum(planQty, 0)})
            </h4>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                التكلفة التقديرية: {arNum(totalEstimatedCost(requirements))} ج.م
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openModal(MODAL_KEYS.MANUFACTURING_MATERIAL_REQUIREMENTS, {
                  title: 'احتياجات المواد',
                  lines: requirements,
                })}
              >
                عرض بالنافذة
              </Button>
            </div>
          </div>
          <table className="erp-table w-full text-right text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-1">المادة</th>
                <th className="px-2 py-1">مطلوب</th>
                <th className="px-2 py-1">متاح</th>
                <th className="px-2 py-1">نقص</th>
                <th className="px-2 py-1">تكلفة</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((line) => (
                <tr key={line.materialId} className={line.shortageQty > 0 ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''}>
                  <td className="px-2 py-1">{line.materialName}</td>
                  <td className="px-2 py-1">{arNum(line.requiredQty)} {line.unit}</td>
                  <td className="px-2 py-1">{arNum(line.availableQty)}</td>
                  <td className="px-2 py-1 text-rose-600 font-medium">{arNum(line.shortageQty)}</td>
                  <td className="px-2 py-1">{arNum(line.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
