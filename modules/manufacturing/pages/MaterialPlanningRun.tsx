import React, { useState } from 'react';
import { Plus, Trash2, Loader2, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { materialRequirementService } from '../services/materialRequirementService';
import { materialCategoryService } from '../services/materialCategoryService';
import { totalEstimatedCost } from '../engines/productionPlanningEngine';
import { downloadMaterialRequirementsExcel } from '../lib/exportMaterialRequirementsExcel';
import type { MaterialRequirementInput, MaterialRequirementLine } from '../types';

type InputRow = MaterialRequirementInput & { key: string };

const arNum = (n: number) => n.toLocaleString('ar-EG');

export const MaterialPlanningRun: React.FC = () => {
  const products = useAppStore((s) => s._rawProducts);
  const productCategories = useAppStore((s) => s._productCategories);
  const uid = useAppStore((s) => s.uid) || '';
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const canGenerate = can('planning.materialRequirements.generate') || can('plans.edit');

  const [rows, setRows] = useState<InputRow[]>([
    { key: '1', ownerType: 'product', ownerId: '', quantity: 0 },
  ]);
  const [lines, setLines] = useState<MaterialRequirementLine[] | null>(null);
  const [lastInputs, setLastInputs] = useState<MaterialRequirementInput[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRow = () => {
    setRows((r) => [...r, { key: String(Date.now()), ownerType: 'product', ownerId: '', quantity: 0 }]);
  };

  const removeRow = (key: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.key !== key)));
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const inputs = rows
      .filter((r) => r.ownerId && r.quantity > 0)
      .map(({ ownerType, ownerId, quantity }) => ({ ownerType, ownerId, quantity }));
    if (inputs.length === 0) {
      setError('أضف منتجاً واحداً على الأقل بكمية أكبر من صفر');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const runId = await materialRequirementService.generateFromInputs(inputs, uid);
      if (runId) {
        const run = await materialRequirementService.getRunById(runId);
        setLines(run?.lines ?? []);
        setLastInputs(inputs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التوليد');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!lastInputs?.length || !lines?.length) return;
    setExporting(true);
    setError(null);
    try {
      const materialCategories = await materialCategoryService.getAll();
      const detailRows = await materialRequirementService.getDetailLinesForExport(
        lastInputs,
        products,
        productCategories,
        materialCategories,
      );
      const date = new Date().toISOString().slice(0, 10);
      downloadMaterialRequirementsExcel({
        fileName: `material-requirements-${date}.xlsx`,
        detailRows,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تصدير Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="تشغيل تخطيط المواد"
        subtitle="تفجير BOM لعدة منتجات وحساب الاحتياجات والنواقص"
      />

      {!canGenerate && (
        <p className="text-sm text-muted-foreground">لا توجد صلاحية لتوليد الاحتياجات</p>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <select
              className="min-w-[200px] flex-1 rounded border px-2 py-1 text-sm"
              value={row.ownerId}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x) => (x.key === row.key ? { ...x, ownerId: e.target.value } : x)),
                )
              }
            >
              <option value="">منتج</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className="w-28 rounded border px-2 py-1 text-sm"
              placeholder="الكمية"
              value={row.quantity || ''}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x) =>
                    x.key === row.key ? { ...x, quantity: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            منتج
          </Button>
          <Button type="button" size="sm" disabled={loading || !canGenerate} onClick={() => void handleGenerate()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'توليد الاحتياجات'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {lines && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              التكلفة التقديرية الإجمالية: {arNum(totalEstimatedCost(lines))} ج.م
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting || !lastInputs?.length}
                onClick={() => void handleExportExcel()}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                تصدير Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openModal(MODAL_KEYS.MANUFACTURING_MATERIAL_REQUIREMENTS, {
                  title: 'نتيجة تخطيط المواد',
                  lines,
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
              {lines.map((line) => (
                <tr
                  key={line.materialId}
                  className={line.shortageQty > 0 ? 'bg-rose-50 dark:bg-rose-950/30' : ''}
                >
                  <td className="px-2 py-1">{line.materialName}</td>
                  <td className="px-2 py-1">
                    {arNum(line.requiredQty)} {line.unit}
                  </td>
                  <td className="px-2 py-1">{arNum(line.availableQty)}</td>
                  <td className="px-2 py-1 font-medium text-rose-600">{arNum(line.shortageQty)}</td>
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
