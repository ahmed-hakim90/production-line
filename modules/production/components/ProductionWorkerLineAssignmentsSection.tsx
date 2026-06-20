import React, { useCallback, useState } from 'react';
import type { ProductionLineWorkerAssignment } from '@/types';
import { getTodayDateString } from '@/utils/calculations';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { Badge, Button, Card } from './UI';

type AssignmentForm = {
  lineId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

const emptyForm = (): AssignmentForm => ({
  lineId: '',
  startDate: getTodayDateString(),
  endDate: '',
  isActive: true,
});

type Props = {
  workerId: string;
  assignments: ProductionLineWorkerAssignment[];
  productionLines: { id: string; name: string }[];
  canManage: boolean;
  onAssignmentsChange: (next: ProductionLineWorkerAssignment[]) => void;
};

export const ProductionWorkerLineAssignmentsSection: React.FC<Props> = ({
  workerId,
  assignments,
  productionLines,
  canManage,
  onAssignmentsChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const getLineName = (lineId: string) =>
    productionLines.find((l) => l.id === lineId)?.name ?? lineId;

  const refreshAssignments = useCallback(async () => {
    const next = await productionLineWorkerAssignmentService.getByWorker(workerId);
    onAssignmentsChange(next);
  }, [workerId, onAssignmentsChange]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (row: ProductionLineWorkerAssignment) => {
    if (!row.id) return;
    setEditingId(row.id);
    setForm({
      lineId: row.lineId,
      startDate: row.startDate,
      endDate: row.endDate ?? '',
      isActive: row.isActive,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.lineId || !form.startDate) return;
    setSaving(true);
    try {
      const payload = {
        workerId,
        lineId: form.lineId,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        isActive: form.isActive,
      };
      if (editingId) {
        await productionLineWorkerAssignmentService.update(editingId, payload);
      } else {
        await productionLineWorkerAssignmentService.create(payload);
      }
      await refreshAssignments();
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: ProductionLineWorkerAssignment) => {
    if (!row.id || !canManage) return;
    await productionLineWorkerAssignmentService.update(row.id, { isActive: !row.isActive });
    await refreshAssignments();
  };

  const handleRemove = async (row: ProductionLineWorkerAssignment) => {
    if (!row.id || !canManage) return;
    if (!window.confirm(`إلغاء تعيين الخط "${getLineName(row.lineId)}"؟`)) return;
    await productionLineWorkerAssignmentService.remove(row.id);
    await refreshAssignments();
  };

  const sorted = [...assignments].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <>
      <Card title="الخطوط المعينة">
        {canManage && (
          <div className="flex justify-end mb-3 -mt-1">
            <Button variant="outline" onClick={openCreate}>تعيين خط</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="text-right py-2">الخط</th>
              <th className="text-right py-2">من</th>
              <th className="text-right py-2">إلى</th>
              <th className="text-center py-2">الحالة</th>
              {canManage && <th className="text-center py-2">إجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id ?? `${row.lineId}-${row.startDate}`} className="border-t border-[var(--color-border)]">
                <td className="py-2">{getLineName(row.lineId)}</td>
                <td className="py-2">{row.startDate}</td>
                <td className="py-2">{row.endDate ?? '—'}</td>
                <td className="py-2 text-center">
                  <Badge variant={row.isActive ? 'success' : 'danger'}>
                    {row.isActive ? 'نشط' : 'غير نشط'}
                  </Badge>
                </td>
                {canManage && (
                  <td className="py-2">
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button variant="outline" onClick={() => openEdit(row)}>تعديل</Button>
                      <Button variant="outline" onClick={() => void handleToggleActive(row)}>
                        {row.isActive ? 'تعطيل' : 'تفعيل'}
                      </Button>
                      <Button variant="outline" onClick={() => void handleRemove(row)}>إلغاء</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="py-4 text-[var(--color-text-muted)]">
                  لا توجد تعيينات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showModal && canManage && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-[var(--color-card)] rounded-xl p-6 w-full max-w-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{editingId ? 'تعديل تعيين خط' : 'تعيين خط إنتاج'}</h3>
            <select
              className="w-full border rounded-lg p-3"
              value={form.lineId}
              onChange={(e) => setForm({ ...form, lineId: e.target.value })}
            >
              <option value="">اختر الخط</option>
              {productionLines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-[var(--color-text-muted)]">تاريخ البداية</span>
                <input
                  type="date"
                  className="w-full border rounded-lg p-3"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-[var(--color-text-muted)]">تاريخ النهاية (اختياري)</span>
                <input
                  type="date"
                  className="w-full border rounded-lg p-3"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              نشط
            </label>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={saving}>إلغاء</Button>
              <Button onClick={() => void handleSave()} disabled={saving || !form.lineId || !form.startDate}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
