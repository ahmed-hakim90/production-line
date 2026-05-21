import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { warehouseService } from '../services/warehouseService';
import type { Warehouse, WarehouseRole } from '../types';

const ROLE_LABELS: Record<WarehouseRole, string> = {
  general: 'عام',
  raw_material: 'مواد خام',
  decomposed: 'مفكك',
  production_wip: 'WIP',
  finished_staging: 'تم الصنع',
  final_product: 'منتج تام',
  packaging: 'تغليف',
  waste: 'هالك',
};
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../services/inventoryRoutingService';

const DELETE_CONFIRM = (name: string) =>
  `سيتم حذف المخزن «${name}» وجميع البيانات المرتبطة به نهائيًا:\n`
  + 'حركات المخزون، الأرصدة، طلبات التحويل، وجلسات الجرد لهذا المخزن.\n'
  + 'لا يمكن التراجع عن هذه العملية.\n\n'
  + 'هل تريد المتابعة؟';

export const Warehouses: React.FC = () => {
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const routingUsageByWarehouseId = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (id: string | undefined, label: string) => {
      if (!id) return;
      const prev = map.get(id) || [];
      if (!prev.includes(label)) map.set(id, [...prev, label]);
    };
    add(routing.rawMaterialWarehouseId, 'مواد خام');
    add(routing.decomposedWarehouseId, 'مفكك');
    add(routing.productionWipWarehouseId, 'WIP');
    add(routing.finishedStagingWarehouseId, 'تم الصنع');
    add(routing.finalProductWarehouseId, 'منتج تام');
    add(routing.wasteWarehouseId, 'هالك');
    add(routing.packagingSourceWarehouseId, 'تغليف (من)');
    add(routing.packagingTargetWarehouseId, 'تغليف (إلى)');
    return map;
  }, [routing]);
  const canView = can('inventory.view');
  const canManage = can('inventory.warehouses.manage');

  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const displayRows = useMemo(
    () => rows.filter((w) => !roleFilter || (w.warehouseRole || 'general') === roleFilter),
    [rows, roleFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await warehouseService.getAllWarehouses();
      setRows(list);
    } catch {
      setMessage({ type: 'error', text: 'تعذر تحميل المخازن.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  const startEdit = (w: Warehouse) => {
    if (!w.id || !canManage) return;
    openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT, {
      warehouse: w,
      onSaved: () => void load(),
    });
  };

  const handleDelete = async (w: Warehouse) => {
    if (!w.id || !canManage) return;
    const ok = window.confirm(DELETE_CONFIRM(w.name || w.code || w.id));
    if (!ok) return;
    setMessage(null);
    setDeletingId(w.id);
    try {
      const res = await warehouseService.delete(w.id);
      if (res.ok) {
        setMessage({ type: 'success', text: 'تم حذف المخزن وجميع البيانات المرتبطة به.' });
        await fetchSystemSettings();
        await load();
      } else {
        setMessage({ type: 'error', text: res.error || 'تعذر الحذف.' });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    if (!canManage) return;
    openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE, {
      onSaved: () => void load(),
    });
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean p-6">
        <p className="text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="المخازن"
        subtitle="عرض المخازن وتعديلها. عند الحذف يُزال المخزن مع كل الحركات والأرصدة والطلبات المرتبطة به نهائيًا."
        actions={
          canManage ? (
            <Button variant="primary" onClick={openCreate}>
              <Plus size={16} />
              إضافة مخزن
            </Button>
          ) : null
        }
      />

      {message && (
        <div
          className={`rounded-[var(--border-radius-lg)] border px-4 py-3 text-sm font-semibold ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card title="قائمة المخازن">
        <div className="px-4 pt-4 pb-2">
          <select
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-bold"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">كل الأدوار</option>
            {(Object.keys(ROLE_LABELS) as WarehouseRole[]).map((role) => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] p-4">لا توجد مخازن مسجّلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 px-3 font-semibold">الاسم</th>
                  <th className="text-start py-2 px-3 font-semibold">الكود</th>
                  <th className="text-start py-2 px-3 font-semibold">الدور</th>
                  <th className="text-start py-2 px-3 font-semibold">توجيه الإنتاج</th>
                  <th className="text-start py-2 px-3 font-semibold">الحالة</th>
                  {canManage && <th className="text-end py-2 px-3 font-semibold w-[140px]">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((w) => (
                  <tr key={w.id || w.code} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-hover)]">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-text)]">{w.name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{w.code}</td>
                    <td className="py-2.5 px-3 text-xs">{ROLE_LABELS[w.warehouseRole || 'general']}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {(w.id && routingUsageByWarehouseId.get(w.id)?.join('، ')) || '—'}
                    </td>
                    <td className="py-2.5 px-3">{w.isActive === false ? 'غير نشط' : 'نشط'}</td>
                    {canManage && (
                      <td className="py-2.5 px-3 text-end">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                            onClick={() => startEdit(w)}
                          >
                            <Pencil size={14} />
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={() => void handleDelete(w)}
                            disabled={deletingId === w.id}
                          >
                            <Trash2 size={14} />
                            {deletingId === w.id ? 'جاري الحذف...' : 'حذف'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
};
