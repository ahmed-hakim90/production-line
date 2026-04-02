import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { warehouseService } from '../services/warehouseService';
import type { Warehouse } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';

const DELETE_CONFIRM = (name: string) =>
  `سيتم حذف المخزن «${name}» وجميع البيانات المرتبطة به نهائيًا:\n`
  + 'حركات المخزون، الأرصدة، طلبات التحويل، وجلسات الجرد لهذا المخزن.\n'
  + 'لا يمكن التراجع عن هذه العملية.\n\n'
  + 'هل تريد المتابعة؟';

export const Warehouses: React.FC = () => {
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const canView = can('inventory.view');
  const canManage = can('inventory.warehouses.manage');

  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await warehouseService.getAll();
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

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar')),
    [rows],
  );

  const startEdit = (w: Warehouse) => {
    if (!w.id || !canManage) return;
    setEditId(w.id);
    setForm({
      name: w.name || '',
      code: w.code || '',
      isActive: w.isActive !== false,
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ name: '', code: '', isActive: true });
  };

  const saveEdit = async () => {
    if (!editId || !canManage) return;
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    if (!name || !code) {
      setMessage({ type: 'error', text: 'أدخل الاسم والكود.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await warehouseService.update(editId, { name, code, isActive: form.isActive });
      setMessage({ type: 'success', text: 'تم حفظ التعديلات.' });
      cancelEdit();
      await load();
    } catch {
      setMessage({ type: 'error', text: 'تعذر حفظ التعديلات.' });
    } finally {
      setSaving(false);
    }
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
        if (editId === w.id) cancelEdit();
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
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] p-4">لا توجد مخازن مسجّلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 px-3 font-semibold">الاسم</th>
                  <th className="text-start py-2 px-3 font-semibold">الكود</th>
                  <th className="text-start py-2 px-3 font-semibold">الحالة</th>
                  {canManage && <th className="text-end py-2 px-3 font-semibold w-[140px]">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((w) => (
                  <tr key={w.id || w.code} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-hover)]">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-text)]">{w.name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{w.code}</td>
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

      {canManage && editId && (
        <Card title="تعديل مخزن">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-1">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)]">الاسم</label>
              <input
                className="mt-1 w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)]">الكود</label>
              <input
                className="mt-1 w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="wh-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <label htmlFor="wh-active" className="text-sm text-[var(--color-text)]">
                نشط
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
