import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { useAppStore } from '@/store/useAppStore';
import { leaveRequestService, leaveBalanceService } from '../leaveService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  LeaveType,
  ApprovalStatus,
} from '../types';
import { LEAVE_TYPE_LABELS, DEFAULT_LEAVE_BALANCE } from '../types';
import { PageHeader } from '../../../components/PageHeader';

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  approved: { label: 'مُعتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'danger' },
};

function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

// ─── Component ──────────────────────────────────────────────────────────────

export const LeaveRequests: React.FC = () => {
  const { can } = usePermission();
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);

  const [requests, setRequests] = useState<FirestoreLeaveRequest[]>([]);
  const [allEmployees, setAllEmployees] = useState<FirestoreEmployee[]>([]);
  const [balance, setBalance] = useState<FirestoreLeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | ''>('');

  // Form state
  const [formLeaveType, setFormLeaveType] = useState<LeaveType>('annual');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formAffects, setFormAffects] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isHR = can('leave.manage');
  const canDelete = can('leave.manage') || can('hrSettings.edit');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'leaveRequests'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const employeeId = currentEmployee?.id || uid || '';

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    allEmployees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
      if (e.userId) m.set(e.userId, e.name);
    });
    return m;
  }, [allEmployees]);

  const getEmpName = useCallback((id: string) => empNameMap.get(id) || id, [empNameMap]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allRequests, bal, emps] = await Promise.all([
        isHR ? leaveRequestService.getAll() : leaveRequestService.getByEmployee(employeeId),
        leaveBalanceService.getOrCreate(employeeId),
        isHR ? employeeService.getAll() : Promise.resolve([]),
      ]);
      setRequests(allRequests);
      setBalance(bal);
      setAllEmployees(emps);
    } catch (err) {
      console.error('Error loading leave data:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, isHR]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0;
    return calculateDays(formStartDate, formEndDate);
  }, [formStartDate, formEndDate]);

  const handleSubmit = useCallback(async () => {
    if (!formStartDate || !formEndDate || formDays <= 0) return;
    setSubmitting(true);
    try {
      await leaveRequestService.create({
        employeeId,
        leaveType: formLeaveType,
        startDate: formStartDate,
        endDate: formEndDate,
        totalDays: formDays,
        affectsSalary: formAffects,
        status: 'pending',
        approvalChain: [],
        finalStatus: 'pending',
        reason: formReason,
        createdBy: uid || '',
      });
      setShowForm(false);
      setFormStartDate('');
      setFormEndDate('');
      setFormReason('');
      await fetchData();
    } catch (err) {
      console.error('Error creating leave request:', err);
    } finally {
      setSubmitting(false);
    }
  }, [employeeId, uid, formLeaveType, formStartDate, formEndDate, formDays, formAffects, formReason, fetchData]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await leaveRequestService.delete(id);
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      console.error('Error deleting leave request:', err);
    } finally {
      setDeleting(false);
    }
  }, [fetchData]);

  const filtered = useMemo(() => {
    let result = requests;
    if (filterEmployee) {
      result = result.filter((r) => r.employeeId === filterEmployee);
    }
    if (filterStatus) {
      result = result.filter((r) => r.finalStatus === filterStatus);
    }
    return result;
  }, [requests, filterEmployee, filterStatus]);

  const uniqueEmployees = useMemo(() => {
    const ids = [...new Set(requests.map((r) => r.employeeId))];
    return ids.map((id) => ({ value: id, label: getEmpName(id) }));
  }, [requests, getEmpName]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-[var(--border-radius-lg)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="إدارة الإجازات"
        subtitle="طلب إجازة ومتابعة الأرصدة وحالات الموافقة"
        icon="beach_access"
        primaryAction={{
          label: showForm ? 'إغلاق' : 'طلب إجازة',
          icon: showForm ? 'close' : 'add',
          onClick: () => setShowForm(!showForm),
        }}
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExportFromPage || requests.length === 0,
            onClick: () => {
              const rows = requests.map((r) => ({
                'الموظف': getEmpName(r.employeeId),
                'النوع': LEAVE_TYPE_LABELS[r.leaveType],
                'من': r.startDate,
                'إلى': r.endDate,
                'الأيام': r.totalDays,
                'تؤثر على الراتب': r.affectsSalary ? 'نعم' : 'لا',
                'الحالة': STATUS_CONFIG[r.finalStatus]?.label ?? r.finalStatus,
                'السبب': r.reason || '',
              }));
              exportHRData(rows, 'الإجازات', 'إجازات');
            },
          },
        ]}
      />

      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-blue-500 text-3xl mb-2 block">beach_access</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">سنوية</p>
            <p className="text-2xl font-bold text-blue-600">{balance.annualBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-rose-500 text-3xl mb-2 block">local_hospital</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مرضية</p>
            <p className="text-2xl font-bold text-rose-600">{balance.sickBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-amber-500 text-3xl mb-2 block">warning</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">طارئة</p>
            <p className="text-2xl font-bold text-amber-600">{balance.emergencyBalance}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
          <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className="material-icons-round text-[var(--color-text-muted)] text-3xl mb-2 block">money_off</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">بدون راتب (مأخوذة)</p>
            <p className="text-2xl font-bold text-slate-600">{balance.unpaidTaken}</p>
            <p className="text-xs text-slate-400">يوم</p>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <Card title="طلب إجازة جديد">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                نوع الإجازة
              </label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formLeaveType}
                onChange={(e) => setFormLeaveType(e.target.value as LeaveType)}
              >
                {(Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAffects}
                  onChange={(e) => setFormAffects(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary"
                />
                <span className="text-sm font-bold text-[var(--color-text-muted)]">
                  تؤثر على الراتب
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                تاريخ البداية
              </label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                تاريخ النهاية
              </label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                min={formStartDate}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
                السبب
              </label>
              <textarea
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none resize-none"
                rows={3}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="سبب الإجازة..."
              />
            </div>
          </div>

          {formDays > 0 && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
              <span className="material-icons-round text-blue-500">info</span>
              <p className="text-sm font-bold text-blue-700">
                مدة الإجازة: {formDays} يوم
              </p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !formStartDate || !formEndDate || formDays <= 0}
            >
              {submitting && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">send</span>
              تقديم الطلب
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {isHR && (
          <SearchableSelect
            options={[{ value: '', label: 'جميع الموظفين' }, ...uniqueEmployees]}
            value={filterEmployee}
            onChange={setFilterEmployee}
            placeholder="تصفية بالموظف..."
            className="sm:w-64"
          />
        )}
        <select
          className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ApprovalStatus | '')}
        >
          <option value="">جميع الحالات</option>
          <option value="pending">قيد الانتظار</option>
          <option value="approved">مُعتمد</option>
          <option value="rejected">مرفوض</option>
        </select>
      </div>

      {/* Requests Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">
              event_busy
            </span>
            <p className="text-sm font-bold text-slate-500">لا توجد طلبات إجازة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  {isHR && <th className="erp-th">الموظف</th>}
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">8&8 </th>
                  <th className="erp-th">إلى</th>
                  <th className="erp-th">الأيام</th>
                  <th className="erp-th">تؤثر على الراتب</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">مراحل الموافقة</th>
                  {canDelete && <th className="erp-th text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => {
                  const statusCfg = STATUS_CONFIG[req.finalStatus];
                  return (
                    <tr key={req.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                      {isHR && <td className="py-3 px-3 font-bold">{getEmpName(req.employeeId)}</td>}
                      <td className="py-3 px-3">
                        <Badge variant="info">{LEAVE_TYPE_LABELS[req.leaveType]}</Badge>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs" dir="ltr">{req.startDate}</td>
                      <td className="py-3 px-3 font-mono text-xs" dir="ltr">{req.endDate}</td>
                      <td className="py-3 px-3 font-bold">{req.totalDays}</td>
                      <td className="py-3 px-3">
                        {req.affectsSalary
                          ? <span className="text-rose-500 font-bold">نعم</span>
                          : <span className="text-[var(--color-text-muted)]">لا</span>}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          {req.approvalChain.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            req.approvalChain.map((step, i) => {
                              const stepCfg = STATUS_CONFIG[step.status];
                              return (
                                <span
                                  key={i}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                                    ${step.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                      step.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                      'bg-[#f0f2f5] text-[var(--color-text-muted)]'}`}
                                  title={`مستوى ${step.level} — ${stepCfg.label}`}
                                >
                                  {step.level}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      {canDelete && (
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setDeleteConfirm(req.id!)}
                            className="p-1.5 rounded-[var(--border-radius-base)] hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-400 hover:text-rose-600 transition-colors"
                            title="حذف الطلب"
                          >
                            <span className="material-icons-round text-lg">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <span className="material-icons-round text-5xl text-rose-500 mb-2">warning</span>
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">تأكيد الحذف</h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">هل تريد حذف طلب الإجازة نهائياً؟</p>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>تراجع</Button>
              <Button onClick={() => handleDelete(deleteConfirm)} disabled={deleting} className="!bg-rose-600 hover:!bg-rose-700">
                {deleting ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">delete</span>}
                حذف نهائي
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

