import React, { useMemo, useState } from 'react';
import { Loader2, Trash2, Calculator, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useProductBom, useBomItemMutations, type BomDisplayRow } from '../hooks/useProductBom';
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
import { useAppStore } from '@/store/useAppStore';
import {
  BOM_UPSERT_PATHS,
  MANUFACTURING_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

const arNum = (n: number, fd = 2) =>
  n.toLocaleString('ar-EG', { minimumFractionDigits: fd, maximumFractionDigits: fd });

type BomLineForm = {
  materialId: string;
  qtyPerUnit: number;
  unit: MaterialUnit;
  wastePercent: number;
  directCostPerUnit: number;
  indirectCostPerUnit: number;
};

const emptyForm = (): BomLineForm => ({
  materialId: '',
  qtyPerUnit: 0,
  unit: 'piece',
  wastePercent: 0,
  directCostPerUnit: 0,
  indirectCostPerUnit: 0,
});

export type ProductBomSectionProps = {
  productId: string;
  canManage: boolean;
  userId: string;
  /** When false, hides cost columns/totals. Default true for backward compat. */
  canViewCosts?: boolean;
  /** When false, hides planning/requirements tools (BOM manage modal). Default true. */
  showRequirements?: boolean;
};

export const ProductBomSection: React.FC<ProductBomSectionProps> = ({
  productId,
  canManage: canManagePermission,
  userId,
  canViewCosts = true,
  showRequirements = true,
}) => {
  const { data: bomData, isLoading } = useProductBom(productId);
  const { data: materials = [] } = useMaterialsCatalog();
  const { addItem, updateItem, deleteItem } = useBomItemMutations('product', productId);
  const systemSettings = useAppStore((state) => state.systemSettings);
  const canManage = canManagePermission && isOperationPathEnabled(
    systemSettings,
    MANUFACTURING_OPERATION_KEYS.bomUpsert,
    BOM_UPSERT_PATHS.productBomSection,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState<BomLineForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<MaterialRequirementLine[] | null>(null);
  const { openModal } = useGlobalModalManager();
  const [planQty, setPlanQty] = useState(1);
  const [reqLoading, setReqLoading] = useState(false);

  const materialOptions = useMemo(
    () => materials.filter((m) => m.isActive !== false && m.id && m.type !== 'consumable'),
    [materials],
  );

  const usedMaterialIds = useMemo(() => {
    const ids = new Set((bomData?.rows ?? []).map((r) => r.itemId).filter(Boolean));
    if (editingItemId) {
      const editing = (bomData?.rows ?? []).find((r) => r.id === editingItemId);
      if (editing?.itemId) ids.delete(editing.itemId);
    }
    return ids;
  }, [bomData?.rows, editingItemId]);

  const unitTotal = useMemo(
    () => (bomData?.rows ?? []).reduce((s, r) => s + Number(r.totalCost || 0), 0),
    [bomData?.rows],
  );

  const openAddForm = () => {
    setEditingItemId(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (row: BomDisplayRow) => {
    if (!row.id) return;
    setEditingItemId(row.id);
    setForm({
      materialId: row.itemId,
      qtyPerUnit: Number(row.qtyPerUnit || 0),
      unit: (row.unit as MaterialUnit) || 'piece',
      wastePercent: Number(row.wastePercent || 0),
      directCostPerUnit: Number(row.directCostPerUnit || 0),
      indirectCostPerUnit: Number(row.indirectCostPerUnit || 0),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingItemId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!form.materialId) {
      setFormError('اختر المادة');
      return;
    }
    if (!(form.qtyPerUnit > 0)) {
      setFormError('كمية الوحدة يجب أن تكون أكبر من صفر');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const mat = materialOptions.find((m) => m.id === form.materialId);
      const payload = {
        itemId: form.materialId,
        itemType: 'material' as const,
        itemName: mat?.name,
        qtyPerUnit: form.qtyPerUnit,
        unit: form.unit || mat?.baseUnit || 'piece',
        wastePercent: form.wastePercent,
        costBehavior: 'direct' as const,
        directCostPerUnit: form.directCostPerUnit,
        indirectCostPerUnit: form.indirectCostPerUnit,
      };
      if (editingItemId) {
        await updateItem.mutateAsync({ itemId: editingItemId, data: payload });
        toast.success('تم تحديث المكون');
      } else {
        await addItem.mutateAsync(payload);
        toast.success('تم إضافة المكون');
      }
      closeForm();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'تعذر الحفظ';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BomItem) => {
    if (!canManage || !item.id) return;
    if (!window.confirm('حذف هذا السطر من المكونات؟')) return;
    try {
      await deleteItem.mutateAsync(item.id);
      if (editingItemId === item.id) closeForm();
      toast.success('تم حذف المكون');
    } catch {
      toast.error('تعذر الحذف');
    }
  };

  const handleViewRequirements = async () => {
    setReqLoading(true);
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
      toast.error(e instanceof Error ? e.message : 'تعذر توليد الاحتياجات');
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
        <p className="rounded-md border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-3 py-2 text-xs text-[rgb(var(--color-warning))] dark:border-[rgb(var(--color-warning))]/40 dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))]">
          يعرض بيانات قديمة من product_materials. نفّذ ترحيل المواد من صفحة المواد التصنيعية لتفعيل الـ BOM الكامل.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {canViewCosts ? (
          <p className="text-sm text-muted-foreground">
            إجمالي تكلفة المواد للوحدة: <span className="font-semibold text-foreground">{arNum(unitTotal)} ج.م</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">مكونات التصنيع لهذا المنتج</p>
        )}
        <div className="flex flex-wrap gap-2">
          {showRequirements ? (
            <>
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
              <Button type="button" variant="outline" size="sm" disabled={reqLoading} onClick={() => void handleViewRequirements()}>
                {reqLoading ? 'جاري التحميل...' : 'عرض الاحتياجات'}
              </Button>
            </>
          ) : null}
          {canManage && (
            <Button type="button" size="sm" onClick={openAddForm}>
              إضافة مكون
            </Button>
          )}
        </div>
      </div>

      <div className="erp-table-wrap overflow-x-auto">
        <table className="erp-table w-full min-w-[800px] text-right">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">المادة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">النوع</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">كمية/وحدة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الوحدة</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الهالك %</th>
              {canViewCosts ? (
                <>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">مباشر</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">غير مباشر</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الإجمالي</th>
                </>
              ) : null}
              {canManage && <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {(bomData?.rows ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={(canViewCosts ? 8 : 5) + (canManage ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  لا توجد مكونات لهذا المنتج
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
                  {canViewCosts ? (
                    <>
                      <td className="px-3 py-2 text-sm">{arNum(row.directCost)}</td>
                      <td className="px-3 py-2 text-sm">{arNum(row.indirectCost)}</td>
                      <td className="px-3 py-2 text-sm font-medium">{arNum(row.totalCost)}</td>
                    </>
                  ) : null}
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="تعديل"
                          aria-label="تعديل المكون"
                          onClick={() => openEditForm(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="حذف"
                          aria-label="حذف المكون"
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && canManage && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            {editingItemId ? 'تعديل مكون' : 'إضافة مكون'}
          </p>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <select
            className="w-full rounded border border-border px-3 py-2 text-sm"
            value={form.materialId}
            disabled={Boolean(editingItemId)}
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
              <option key={m.id} value={m.id} disabled={usedMaterialIds.has(m.id!)}>
                {m.name} ({m.code}){usedMaterialIds.has(m.id!) ? ' — مضاف مسبقاً' : ''}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              كمية/وحدة
              <input
                type="number"
                min={0}
                step="any"
                className="w-full rounded border border-border px-2 py-1 text-sm text-foreground"
                value={form.qtyPerUnit || ''}
                onChange={(e) => setForm((f) => ({ ...f, qtyPerUnit: Number(e.target.value) }))}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              هالك %
              <input
                type="number"
                min={0}
                step="any"
                className="w-full rounded border border-border px-2 py-1 text-sm text-foreground"
                value={form.wastePercent || ''}
                onChange={(e) => setForm((f) => ({ ...f, wastePercent: Number(e.target.value) }))}
              />
            </label>
            {canViewCosts ? (
              <>
                <label className="space-y-1 text-xs text-muted-foreground">
                  تكلفة مباشرة/وحدة
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="w-full rounded border border-border px-2 py-1 text-sm text-foreground"
                    value={form.directCostPerUnit || ''}
                    onChange={(e) => setForm((f) => ({ ...f, directCostPerUnit: Number(e.target.value) }))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  تكلفة غير مباشرة/وحدة
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="w-full rounded border border-border px-2 py-1 text-sm text-foreground"
                    value={form.indirectCostPerUnit || ''}
                    onChange={(e) => setForm((f) => ({ ...f, indirectCostPerUnit: Number(e.target.value) }))}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'جاري الحفظ...' : editingItemId ? 'حفظ التعديل' : 'حفظ'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={closeForm}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {showRequirements && requirements && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <Calculator className="h-4 w-4" />
              احتياجات المواد (كمية {arNum(planQty, 0)})
            </h4>
            <div className="flex items-center gap-2">
              {canViewCosts ? (
                <p className="text-sm font-medium">
                  التكلفة التقديرية: {arNum(totalEstimatedCost(requirements))} ج.م
                </p>
              ) : null}
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
                {canViewCosts ? <th className="px-2 py-1">تكلفة</th> : null}
              </tr>
            </thead>
            <tbody>
              {requirements.map((line) => (
                <tr key={line.materialId} className={line.shortageQty > 0 ? 'bg-[rgb(var(--color-danger)/0.1)]/50 dark:bg-[rgb(var(--color-danger)/0.2)]' : ''}>
                  <td className="px-2 py-1">{line.materialName}</td>
                  <td className="px-2 py-1">{arNum(line.requiredQty)} {line.unit}</td>
                  <td className="px-2 py-1">{arNum(line.availableQty)}</td>
                  <td className="px-2 py-1 text-[rgb(var(--color-danger))] font-medium">{arNum(line.shortageQty)}</td>
                  {canViewCosts ? <td className="px-2 py-1">{arNum(line.estimatedCost)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
