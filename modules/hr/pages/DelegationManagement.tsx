import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge, LoadingSkeleton } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '../employeeService';
import {
  approvalDelegationService,
  type FirestoreApprovalDelegation,
  type ApprovalRequestType,
} from '../approval';
import type { FirestoreEmployee } from '../types';

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  leave: 'إجازات',
  loan: 'سُلف',
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
  const currentUser = useAppStore((s) => s.currentUser);

  const [delegations, setDelegations] = useState<FirestoreApprovalDelegation[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [toEmployeeId, setToEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestTypes, setRequestTypes] = useState<ApprovalRequestType[] | 'all'>('all');

  const isAdmin = can('approval.delegate');
  const myId = currentEmployee?.id || '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [delegationList, employeeList] = await Promise.all([
        isAdmin ? approvalDelegationService.getAll() : approvalDelegationService.getByFromEmployee(myId),
        employeeService.getAll(),
      ]);
      setDelegations(delegationList);
      setEmployees(employeeList.filter((e: FirestoreEmployee) => e.isActive));
    } catch (err) {
      console.error('Failed to load delegations:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, myId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
      setToast({ message: 'يرجى ملء جميع الحقول المطلوبة', type: 'error' });
      return;
    }
    if (startDate > endDate) {
      setToast({ message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const delegatee = employees.find((e: FirestoreEmployee) => e.id === toEmployeeId);
      await approvalDelegationService.create({
        fromEmployeeId: myId,
        fromEmployeeName: currentEmployee?.name || currentUser?.displayName || '',
        toEmployeeId,
        toEmployeeName: delegatee?.name || '',
        startDate,
        endDate,
        requestTypes,
        isActive: true,
        createdBy: myId,
      });

      setToast({ message: 'تم إنشاء التفويض بنجاح', type: 'success' });
      setShowForm(false);
      setToEmployeeId('');
      setStartDate('');
      setEndDate('');
      setRequestTypes('all');
      await loadData();
    } catch (err) {
      console.error('Failed to create delegation:', err);
      setToast({ message: 'فشل في إنشاء التفويض', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [toEmployeeId, startDate, endDate, requestTypes, myId, currentEmployee, currentUser, employees, loadData]);

  const handleDeactivate = useCallback(async (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا التفويض؟')) return;
    try {
      await approvalDelegationService.deactivate(id);
      setToast({ message: 'تم إلغاء التفويض', type: 'success' });
      await loadData();
    } catch (err) {
      console.error('Failed to deactivate:', err);
      setToast({ message: 'فشل في إلغاء التفويض', type: 'error' });
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
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-primary text-2xl">swap_horiz</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">إدارة التفويضات</h1>
            <p className="text-sm text-slate-400">تفويض صلاحيات الموافقة لموظف آخر</p>
          </div>
        </div>
        <LoadingSkeleton type="table" rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-primary text-2xl">swap_horiz</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">إدارة التفويضات</h1>
            <p className="text-sm text-slate-400">تفويض صلاحيات الموافقة لموظف آخر أثناء غيابك</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <span className="material-icons-round text-sm">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'إلغاء' : 'تفويض جديد'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <div className="space-y-5">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="material-icons-round text-primary">person_add</span>
              إنشاء تفويض جديد
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">المفوّض إليه *</label>
                <select
                  value={toEmployeeId}
                  onChange={(e) => setToEmployeeId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">اختر الموظف...</option>
                  {eligibleDelegatees.map((emp: FirestoreEmployee) => (
                    <option key={emp.id} value={emp.id!}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">أنواع الطلبات</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setRequestTypes('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      requestTypes === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >الكل</button>
                  {(Object.entries(REQUEST_TYPE_LABELS) as [ApprovalRequestType, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleRequestType(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        requestTypes !== 'all' && requestTypes.includes(key)
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">تاريخ البداية *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">تاريخ النهاية *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? (
                  <><span className="material-icons-round animate-spin text-sm">refresh</span> جاري الحفظ...</>
                ) : (
                  <><span className="material-icons-round text-sm">save</span> إنشاء التفويض</>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {delegations.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">swap_horiz</span>
            <p className="text-sm font-bold text-slate-500">لا توجد تفويضات حالياً</p>
            <p className="text-xs text-slate-400 mt-1">أنشئ تفويضاً لتمكين شخص آخر من الموافقة نيابةً عنك</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {delegations.map((d) => {
            const active = isDelegationActive(d);
            const expired = !d.isActive || d.endDate < new Date().toISOString().slice(0, 10);

            return (
              <div key={d.id} className={`bg-white dark:bg-slate-900 rounded-xl border p-5 ${
                active ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-800 opacity-70'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      active ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      <span className={`material-icons-round ${active ? 'text-emerald-500' : 'text-slate-400'}`}>swap_horiz</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 dark:text-white">
                          {employeeMap.get(d.fromEmployeeId) || d.fromEmployeeName}
                        </span>
                        <span className="material-icons-round text-slate-400 text-sm">arrow_forward</span>
                        <span className="font-bold text-primary">
                          {employeeMap.get(d.toEmployeeId) || d.toEmployeeName}
                        </span>
                        {active && <Badge variant="success">نشط</Badge>}
                        {expired && <Badge variant="neutral">منتهي</Badge>}
                        {!d.isActive && !expired && <Badge variant="danger">ملغي</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
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
                      className="!text-rose-500 !border-rose-200 hover:!bg-rose-50"
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
      )}

      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-bold text-white flex items-center gap-2 animate-slide-up ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`}>
          <span className="material-icons-round text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
};

