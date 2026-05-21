import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '@/utils/permissions';
import { useMaterial } from '../hooks/useMaterials';
import { useMaterialBom, useBomItemMutations } from '../hooks/useProductBom';
import { useMaterials as useMaterialsCatalog } from '../hooks/useMaterials';
import { MATERIAL_TYPE_LABELS, type MaterialUnit } from '../types';

export const MaterialDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManage = can('bom.manage') || can('materials.manage');
  const { data: material, isLoading } = useMaterial(id);
  const { data: bomData, isLoading: bomLoading, refetch } = useMaterialBom(id);
  const { data: materials = [] } = useMaterialsCatalog();
  const { addItem, deleteItem } = useBomItemMutations('material', id || '');
  const [form, setForm] = useState({ materialId: '', qtyPerUnit: 0, unit: 'piece' as MaterialUnit });
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => materials.filter((m) => m.id && m.id !== id),
    [materials, id],
  );

  const handleAdd = async () => {
    if (!canManage || !form.materialId || form.qtyPerUnit <= 0) return;
    setSaving(true);
    try {
      const mat = options.find((m) => m.id === form.materialId);
      await addItem.mutateAsync({
        itemId: form.materialId,
        itemType: 'material',
        itemName: mat?.name,
        qtyPerUnit: form.qtyPerUnit,
        unit: mat?.baseUnit ?? form.unit,
      });
      setForm({ materialId: '', qtyPerUnit: 0, unit: 'piece' });
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!material || !id) {
    return <p className="p-8 text-center">المادة غير موجودة</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={material.name}
        subtitle={`${material.code} · ${MATERIAL_TYPE_LABELS[material.type]}`}
        backAction={{ label: 'المواد', onClick: () => navigate('/manufacturing/materials') }}
      />
      <div>
        <h3 className="mb-3 text-sm font-semibold">قائمة المواد (BOM)</h3>
        {bomLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <>
            <table className="erp-table w-full text-right text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1">المادة</th>
                  <th className="px-2 py-1">كمية/وحدة</th>
                  {canManage && <th className="px-2 py-1">إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {(bomData?.rows ?? []).map((row) => (
                  <tr key={row.id || row.itemId}>
                    <td className="px-2 py-1">{row.itemName}</td>
                    <td className="px-2 py-1">{row.qtyPerUnit}</td>
                    {canManage && (
                      <td className="px-2 py-1">
                        {row.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void deleteItem.mutateAsync(row.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={form.materialId}
                  onChange={(e) => setForm((f) => ({ ...f, materialId: e.target.value }))}
                >
                  <option value="">مادة</option>
                  {options.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="w-24 rounded border px-2 py-1 text-sm"
                  value={form.qtyPerUnit || ''}
                  onChange={(e) => setForm((f) => ({ ...f, qtyPerUnit: Number(e.target.value) }))}
                />
                <Button size="sm" disabled={saving} onClick={() => void handleAdd()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
