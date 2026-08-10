import React, { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Button, Badge } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '../employeeService';
import {
  approvalDelegationService,
  type FirestoreApprovalDelegation,
  type ApprovalRequestType,
} from '../approval';
import type { FirestoreEmployee } from '@/types';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

type DelegationPageData = {
  delegations: FirestoreApprovalDelegation[];
  employees: FirestoreEmployee[];
};

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  leave: 'إجازات',
  loan: 'سُلف',
  penalty: 'جزاءات',
  overtime: 'عمل إضافي',
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isDelegationActive(d: FirestoreApprovalDelegation): boolean {
  if (!d.isActive) return false;
  const today = new Date().toISOString().slice(0, 10);
  return d.startDate <= today && d.endDate >= today;
}

export const DelegationManagement: React.FC = () => {
  const { can } = usePermission();
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [toEmployeeId, setToEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestTypes, setRequestTypes] = useState<ApprovalRequestType[] | 'all'>('all');

  const isAdmin = can('approval.delegate');
  const myId = currentEmployee?.id || '';
  const DELEGATION_CACHE_KEY = `hr:delegations:${isAdmin ? 'admin' : 'self'}:${myId || 'anon'}`;

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<DelegationPageData>(
    DELEGATION_CACHE_KEY,
    async () => {
      const [delegationList, employeeList] = await Promise.all([
        isAdmin ? approvalDelegationService.getAll() : approvalDelegationService.getByFromEmployee(myId),
        employeeService.getAll(),
      ]);
      return {
        delegations: delegationList,
        employees: employeeList.filter((e: FirestoreEmployee) => e.isActive),
      };
    },
    { maxAgeMs: 60_000 },
  );

  const delegations = data?.delegations ?? [];
  const employees = data?.employees ?? [];

  const loadData = useCallback(async () => {
    invalidatePageDataCache(DELEGATION_CACHE_KEY);
    await reloadCached(true);
  }, [DELEGATION_CACHE_KEY, reloadCached]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e: FirestoreEmployee) => { if (e.id) map.set(e.id, e.name); });
    return map;
  }, [employees]);

  const eligibleDelegatees = useMemo(() =>
    employees.filter((e: FirestoreEmployee) => e.id !== myId),
  [employees, myId]);

  const handleCreate = useCallback(async () => {
    if (!toEmployeeId || !startDate || !endDate) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (startDate > endDate) {
      toast.error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return;
    }

    setSaving(true);
    try {
      const delegatee = employees.find((e: FirestoreEmployee) => e.id === toEmployeeId);
      await approvalDelegationService.create({
        fromEmployeeId: myId,
        fromEmployeeName: currentEmployee?.name || userDisplayName || '',
        toEmployeeId,
        toEmployeeName: delegatee?.name || '',
        startDate,
        endDate,
        requestTypes,
        isActive: true,
        createdBy: myId,
      });

      toast.success('تم إنشاء التفويض بنجاح');
      setShowForm(false);
      setToEmployeeId('');
      setStartDate('');
      setEndDate('');
      setRequestTypes('all');
      await loadData();
    } catch (err) {
      console.error('Failed to create delegation:', err);
      toast.error('فشل في إنشاء التفويض');
    } finally {
      setSaving(false);
    }
  }, [toEmployeeId, startDate, endDate, requestTypes, myId, currentEmployee, userDisplayName, employees, loadData]);

  const handleDeactivate = useCallback(async (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا التفويض؟')) return;
    try {
      await approvalDelegationService.deactivate(id);
      toast.success('تم إلغاء التفويض');
      await loadData();
    } catch (err) {
      console.error('Failed to deactivate:', err);
      toast.error('فشل في إلغاء التفويض');
    }
  }, [loadData]);

  const toggleRequestType = (type: ApprovalRequestType) => {
    if (requestTypes === 'all') {
      setRequestTypes([type]);
    } else if (requestTypes.includes(type)) {
      const remaining = requestTypes.filter((t) => t !== type);
      setRequestTypes(remaining.length === 0 ? 'all' : remaining);
    } else {
      const updated = [...requestTypes, type];
      if (updated.length === 3) setRequestTypes('all');
      else setRequestTypes(updated);
    }
  };

  if (loading) {
    return <PageContentSkeleton variant="list" showFilters tableRows={6} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="إدارة التفويضات"
      rangeLabel="تفويض صلاحيات الموافقة لموظف آخر أثناء غيابك"
      actions={(
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'إلغاء' : 'تفويض جديد'}
        </Button>
      )}
    >
      {showForm && (
        <OpsDashPanel title="إنشاء تفويض جديد" accent="hr">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-[var(--color-text)]">المفوّض إليه *</label>
                <select
                  value={toEmployeeId}
                  onChange={(e) => setToEmployeeId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">اختر موظفاً...</option>
                  {eligibleDelegatees.map((emp: FirestoreEmployee) => (
                    <option key={emp.id} value={emp.id!}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-[var(--color-text)]">أنواع الطلبات</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setRequestTypes('all')}
                    className={`px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${
                      requestTypes === 'all' ? 'bg-primary text-white' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'
                    }`}
                  >الكل</button>
                  {(Object.entries(REQUEST_TYPE_LABELS) as [ApprovalRequestType, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleRequestType(key)}
                      className={`px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${
                        requestTypes !== 'all' && requestTypes.includes(key)
                          ? 'bg-primary text-white'
                          : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-[var(--color-text)]">تاريخ البداية *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-[var(--color-text)]">تاريخ النهاية *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'إنشاء التفويض'}
            </Button>
          </div>
        </OpsDashPanel>
      )}

      {delegations.length === 0 ? (
        <OpsDashPanel accent="hr">
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] mb-3 block">swap_horiz</span>
            <p className="text-sm font-bold text-[var(--color-text-muted)]">لا توجد تفويضات حالياً</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">أنشئ تفويضاً لتمكين شخص آخر من الموافقة نيابةً عنك</p>
          </div>
        </OpsDashPanel>
      ) : (
        <OpsDashPanel title="التفويضات" accent="hr">
        <div className="space-y-3">
          {delegations.map((d) => {
            const active = isDelegationActive(d);
            const expired = !d.isActive || d.endDate < new Date().toISOString().slice(0, 10);

            return (
              <div key={d.id} className={`bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border p-5 ${
                active ? 'border-[rgb(var(--color-success)/0.25)]' : 'border-[var(--color-border)] opacity-70'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center ${
                      active ? 'bg-[rgb(var(--color-success)/0.1)]' : 'bg-[var(--color-surface-hover)]'
                    }`}>
                      <span className={`material-icons-round ${active ? 'text-[rgb(var(--color-success))]' : 'text-[var(--color-text-muted)]'}`}>swap_horiz</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--color-text)]">
                          {employeeMap.get(d.fromEmployeeId) || d.fromEmployeeName}
                        </span>
                        <span className="material-icons-round text-[var(--color-text-muted)] text-sm">arrow_forward</span>
                        <span className="font-bold text-primary">
                          {employeeMap.get(d.toEmployeeId) || d.toEmployeeName}
                        </span>
                        {active && <Badge variant="success">نشط</Badge>}
                        {expired && <Badge variant="neutral">منتهي</Badge>}
                        {!d.isActive && !expired && <Badge variant="danger">ملغي</Badge>}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {formatDate(d.startDate)} → {formatDate(d.endDate)}
                        {' — '}
                        {d.requestTypes === 'all' ? 'جميع الأنواع' :
                          d.requestTypes.map((t) => REQUEST_TYPE_LABELS[t]).join('7R ')}
                      </p>
                    </div>
                  </div>
                  {d.isActive && (
                    <Button
                      variant="outline"
                      onClick={() => handleDeactivate(d.id!)}
                      className="!text-[rgb(var(--color-danger))] !border-[rgb(var(--color-danger)/0.25)] hover:!bg-[rgb(var(--color-danger)/0.1)]"
                    >
                      <span className="material-icons-round text-sm">block</span>
                      إلغاء التفويض
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </OpsDashPanel>
      )}
    </ModuleOpsPageShell>
  );
};

