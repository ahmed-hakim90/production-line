import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, LoadingSkeleton } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { qualityWorkersService } from '../services/qualityWorkersService';
import type { QualityWorkerAssignment } from '@/types';

type QualityRole = QualityWorkerAssignment['qualityRole'];

const ROLE_OPTIONS: { value: QualityRole; label: string }[] = [
  { value: 'inspector', label: 'مفتش' },
  { value: 'senior', label: 'مفتش أول' },
  { value: 'lead', label: 'قائد جودة' },
  { value: 'manager', label: 'مدير جودة' },
];

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const QualityWorkers: React.FC = () => {
  const { can } = usePermission();
  const canManage = can('quality.workers.manage');
  const rawEmployees = useAppStore((s) => s._rawEmployees);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [assignments, setAssignments] = useState<QualityWorkerAssignment[]>([]);
  const [form, setForm] = useState({
    id: '',
    employeeId: '',
    qualityRole: 'inspector' as QualityRole,
    activeLines: '',
    activeProducts: '',
    isActive: true,
  });

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await qualityWorkersService.getAll();
      setAssignments(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const employeeMap = useMemo(
    () => new Map(rawEmployees.map((employee) => [employee.id ?? '', employee])),
    [rawEmployees],
  );

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((row) => {
      const emp = employeeMap.get(row.employeeId);
      const name = emp?.name ?? '';
      const code = emp?.code ?? '';
      return (
        name.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        row.qualityRole.toLowerCase().includes(q)
      );
    });
  }, [assignments, search, employeeMap]);

  const resetForm = () => {
    setForm({
      id: '',
      employeeId: '',
      qualityRole: 'inspector',
      activeLines: '',
      activeProducts: '',
      isActive: true,
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!form.employeeId) {
      setMessage('يرجى اختيار موظف');
      return;
    }

    const payload = {
      employeeId: form.employeeId,
      qualityRole: form.qualityRole,
      activeLines: splitCsv(form.activeLines),
      activeProducts: splitCsv(form.activeProducts),
      isActive: form.isActive,
    };

    try {
      if (form.id) {
        await qualityWorkersService.update(form.id, payload);
      } else {
        const existing = assignments.find((row) => row.employeeId === form.employeeId);
        if (existing?.id) {
          await qualityWorkersService.update(existing.id, payload);
        } else {
          await qualityWorkersService.create(payload);
        }
      }
      await loadAssignments();
      resetForm();
      setMessage('تم حفظ تعيين عامل الجودة');
    } catch {
      setMessage('تعذر حفظ تعيين العامل');
    }
  };

  const onEdit = (row: QualityWorkerAssignment) => {
    setForm({
      id: row.id ?? '',
      employeeId: row.employeeId,
      qualityRole: row.qualityRole,
      activeLines: (row.activeLines ?? []).join(', '),
      activeProducts: (row.activeProducts ?? []).join(', '),
      isActive: row.isActive,
    });
  };

  const onRemove = async (rowId?: string) => {
    if (!canManage || !rowId) return;
    if (!window.confirm('هل تريد حذف التعيين؟')) return;
    try {
      await qualityWorkersService.remove(rowId);
      await loadAssignments();
      setMessage('تم حذف التعيين');
    } catch {
      setMessage('تعذر حذف التعيين');
    }
  };

  if (loading) return <LoadingSkeleton type="table" rows={8} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">عمال الجودة</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            ربط أدوار الجودة بموظفي HR الحاليين دون إنشاء بيانات عاملين منفصلة.
          </p>
        </div>
        <Badge variant="info">إجمالي التعيينات: {assignments.length}</Badge>
      </div>

      {message && (
        <Card>
          <p className="text-sm font-semibold text-[var(--color-text)]">{message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-1" title={form.id ? 'تعديل تعيين' : 'تعيين عامل جودة'}>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-bold text-[var(--color-text)]">الموظف</label>
              <select
                value={form.employeeId}
                onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                disabled={!canManage}
                className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa]"
              >
                <option value="">اختر موظفاً</option>
                {rawEmployees
                  .filter((employee) => employee.id)
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}{employee.code ? ` (${employee.code})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-bold text-[var(--color-text)]">الدور</label>
              <select
                value={form.qualityRole}
                onChange={(e) => setForm((prev) => ({ ...prev, qualityRole: e.target.value as QualityRole }))}
                disabled={!canManage}
                className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa]"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-bold text-[var(--color-text)]">الخطوط الفعالة (CSV)</label>
              <input
                value={form.activeLines}
                onChange={(e) => setForm((prev) => ({ ...prev, activeLines: e.target.value }))}
                disabled={!canManage}
                placeholder="line-a, line-b"
                className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-bold text-[var(--color-text)]">المنتجات الفعالة (CSV)</label>
              <input
                value={form.activeProducts}
                onChange={(e) => setForm((prev) => ({ ...prev, activeProducts: e.target.value }))}
                disabled={!canManage}
                placeholder="prod-1, prod-2"
                className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa]"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                disabled={!canManage}
              />
              <span>نشط</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={!canManage} className="flex-1">
                <span className="material-icons-round text-sm">save</span>
                <span>{form.id ? 'حفظ التعديل' : 'حفظ التعيين'}</span>
              </Button>
              {form.id && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card className="xl:col-span-2" title="تعيينات الجودة الحالية">
          <div className="mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الكود أو الدور..."
              className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الموظف</th>
                  <th className="erp-th">الدور</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">الخطوط</th>
                  <th className="erp-th">المنتجات</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((row) => {
                  const employee = employeeMap.get(row.employeeId);
                  const roleLabel = ROLE_OPTIONS.find((role) => role.value === row.qualityRole)?.label ?? row.qualityRole;
                  return (
                    <tr key={row.id} className="border-b border-[var(--color-border)]">
                      <td className="py-2 px-2">
                        <div className="font-semibold text-[var(--color-text)]">
                          {employee?.name ?? `#${row.employeeId}`}
                        </div>
                        {employee?.code && (
                          <div className="text-xs text-[var(--color-text-muted)]">{employee.code}</div>
                        )}
                      </td>
                      <td className="py-2 px-2">{roleLabel}</td>
                      <td className="py-2 px-2">
                        <Badge variant={row.isActive ? 'success' : 'neutral'}>
                          {row.isActive ? 'نشط' : 'معطّل'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">{(row.activeLines ?? []).join(', ') || '-'}</td>
                      <td className="py-2 px-2 text-xs">{(row.activeProducts ?? []).join(', ') || '-'}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="outline" className="!px-2 !py-1" onClick={() => onEdit(row)}>
                            تعديل
                          </Button>
                          <Button
                            variant="outline"
                            className="!px-2 !py-1"
                            onClick={() => onRemove(row.id)}
                            disabled={!canManage}
                          >
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[var(--color-text-muted)]">
                      لا توجد تعيينات مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};


