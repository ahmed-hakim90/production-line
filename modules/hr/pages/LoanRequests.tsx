import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { loanService } from '../loanService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreEmployeeLoan,
  LoanStatus,
  LoanType,
} from '../types';
import { LOAN_TYPE_LABELS } from '../types';

const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: 'بانتظار الموافقة',
  active: 'نشط',
  closed: 'مُغلق',
};

const LOAN_STATUS_VARIANT: Record<LoanStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  active: 'success',
  closed: 'neutral',
};

function formatCurrency(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const LoanRequests: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const currentUser = useAppStore((s) => s.currentUser);

  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<LoanType>('monthly_advance');
  const [showForm, setShowForm] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState<LoanStatus | ''>('');
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formInstallments, setFormInstallments] = useState('1');
  const [formStartMonth, setFormStartMonth] = useState(getCurrentMonth());
  const [formReason, setFormReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isHR = can('loan.manage');
  const canDisburse = can('loan.disburse');
  const canDelete = can('loan.manage') || can('hrSettings.edit');
  const employeeId = currentEmployee?.id || uid || '';

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [loanData, empData] = await Promise.all([
        isHR ? loanService.getAll() : loanService.getByEmployee(employeeId),
        employeeService.getAll(),
      ]);
      setLoans(loanData);
      setEmployees(empData.filter((e: FirestoreEmployee) => e.isActive));
    } catch (err) {
      console.error('Error loading loans:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, isHR]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, FirestoreEmployee>();
    employees.forEach((e: FirestoreEmployee) => { if (e.id) map.set(e.id, e); });
    return map;
  }, [employees]);

  const employeeOptions = useMemo(() =>
    employees.map((e: FirestoreEmployee) => ({
      value: e.id!,
      label: `${e.code || '—'} — ${e.name}`,
    })),
  [employees]);

  const installmentAmount = useMemo(() => {
    const amount = parseFloat(formAmount) || 0;
    const inst = parseInt(formInstallments) || 1;
    return Math.ceil((amount / inst) * 100) / 100;
  }, [formAmount, formInstallments]);

  const handleSubmit = useCallback(async () => {
    const amount = parseFloat(formAmount);
    if (!amount || !formStartMonth) return;

    const targetEmpId = isHR && formEmployeeId ? formEmployeeId : employeeId;
    const emp = employeeMap.get(targetEmpId);
    if (!emp) { setToast({ message: 'يرجى اختيار الموظف', type: 'error' }); return; }

    setSubmitting(true);
    try {
      const isMonthly = activeTab === 'monthly_advance';
      const installments = isMonthly ? 1 : (parseInt(formInstallments) || 1);

      await loanService.create({
        employeeId: targetEmpId,
        employeeName: emp.name,
        employeeCode: emp.code || '',
        loanType: activeTab,
        loanAmount: amount,
        installmentAmount: isMonthly ? amount : installmentAmount,
        totalInstallments: installments,
        remainingInstallments: installments,
        startMonth: formStartMonth,
        month: isMonthly ? formStartMonth : undefined,
        status: 'active',
        approvalChain: [],
        finalStatus: 'approved',
        reason: formReason,
        disbursed: false,
        createdBy: uid || '',
      });

      setShowForm(false);
      setFormAmount('');
      setFormInstallments('1');
      setFormStartMonth(getCurrentMonth());
      setFormReason('');
      setFormEmployeeId('');
      setToast({ message: 'تم إنشاء السلفة بنجاح', type: 'success' });
      await fetchData();
    } catch (err) {
      console.error('Error creating loan:', err);
      setToast({ message: 'فشل في إنشاء السلفة', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [employeeId, uid, formAmount, formInstallments, formStartMonth, formReason, formEmployeeId, installmentAmount, activeTab, isHR, employeeMap, fetchData]);

  const handleDisburse = useCallback(async (loan: FirestoreEmployeeLoan) => {
    if (!loan.id) return;
    setActionLoading(loan.id);
    try {
      if (loan.disbursed) {
        await loanService.undoDisburse(loan.id);
        setToast({ message: 'تم إلغاء الصرف', type: 'success' });
      } else {
        await loanService.disburse(
          loan.id,
          employeeId,
          currentEmployee?.name || currentUser?.displayName || '',
        );
        setToast({ message: 'تم الصرف بنجاح', type: 'success' });
      }
      await fetchData();
    } catch (err) {
      console.error('Disburse error:', err);
      setToast({ message: 'فشل في تحديث حالة الصرف', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [employeeId, currentEmployee, currentUser, fetchData]);

  const handleDeleteLoan = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await loanService.delete(id);
      setDeleteConfirm(null);
      setToast({ message: 'تم حذف السلفة بنجاح', type: 'success' });
      await fetchData();
    } catch (err) {
      console.error('Error deleting loan:', err);
      setToast({ message: 'فشل في حذف السلفة', type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [fetchData]);

  const filtered = useMemo(() => {
    let result = loans.filter((l) => (l.loanType || 'installment') === activeTab);
    if (filterEmployee) result = result.filter((l) => l.employeeId === filterEmployee);
    if (filterStatus) result = result.filter((l) => l.status === filterStatus);
    if (activeTab === 'monthly_advance' && filterMonth) {
      result = result.filter((l) => (l.month || l.startMonth) === filterMonth);
    }
    return result;
  }, [loans, activeTab, filterEmployee, filterStatus, filterMonth]);

  const stats = useMemo(() => {
    const tabLoans = loans.filter((l) => (l.loanType || 'installment') === activeTab);
    if (activeTab === 'monthly_advance') {
      const monthLoans = tabLoans.filter((l) => (l.month || l.startMonth) === filterMonth);
      const disbursed = monthLoans.filter((l) => l.disbursed);
      const total = monthLoans.reduce((s, l) => s + l.loanAmount, 0);
      return { total: monthLoans.length, disbursed: disbursed.length, amount: total, monthly: 0 };
    }
    const active = tabLoans.filter((l) => l.status === 'active');
    const totalOutstanding = active.reduce((s, l) => s + l.installmentAmount * l.remainingInstallments, 0);
    const totalMonthly = active.reduce((s, l) => s + l.installmentAmount, 0);
    return { total: tabLoans.length, disbursed: active.length, amount: totalOutstanding, monthly: totalMonthly };
  }, [loans, activeTab, filterMonth]);

  const handleExport = useCallback(() => {
    const rows = filtered.map((l) => {
      const emp = employeeMap.get(l.employeeId);
      const base: Record<string, any> = {
        'كود الموظف': l.employeeCode || emp?.code || '—',
        'اسم الموظف': l.employeeName || emp?.name || l.employeeId,
        'المبلغ': l.loanAmount,
        'الحالة': LOAN_STATUS_LABELS[l.status],
      };
      if (activeTab === 'monthly_advance') {
        base['الشهر'] = l.month || l.startMonth;
        base['تم الصرف'] = l.disbursed ? 'نعم' : 'لا';
        base['بواسطة'] = l.disbursedByName || '';
      } else {
        base['القسط الشهري'] = l.installmentAmount;
        base['عدد الأقساط'] = l.totalInstallments;
        base['المتبقي'] = l.remainingInstallments;
        base['شهر البداية'] = l.startMonth;
        base['تم الصرف'] = l.disbursed ? 'نعم' : 'لا';
      }
      base['السبب'] = l.reason || '';
      return base;
    });

    const label = activeTab === 'monthly_advance' ? `سلف-شهرية-${filterMonth}` : 'سلف-مقسطة';
    exportHRData(rows, LOAN_TYPE_LABELS[activeTab], label);
  }, [filtered, activeTab, filterMonth, employeeMap]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدارة السُلف</h2>
          <p className="text-sm text-slate-500 font-medium">سلف شهرية وسلف مقسطة مع تتبع الصرف</p>
        </div>
        <div className="flex gap-2">
          {can('export') && (
            <Button variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          )}
          {(isHR || can('loan.create')) && (
            <Button onClick={() => setShowForm(!showForm)}>
              <span className="material-icons-round text-sm">{showForm ? 'close' : 'add'}</span>
              {showForm ? 'إغلاق' : 'سلفة جديدة'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(['monthly_advance', 'installment'] as LoanType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setExpandedLoan(null); }}
            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <span className="material-icons-round text-sm ml-1.5 align-middle">
              {tab === 'monthly_advance' ? 'today' : 'calendar_month'}
            </span>
            {LOAN_TYPE_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {activeTab === 'monthly_advance' ? (
          <>
            <StatCard icon="receipt_long" color="text-blue-500" label="إجمالي السلف" value={stats.total} />
            <StatCard icon="check_circle" color="text-emerald-500" label="تم الصرف" value={stats.disbursed} />
            <StatCard icon="hourglass_top" color="text-amber-500" label="لم يُصرف" value={stats.total - stats.disbursed} />
            <StatCard icon="payments" color="text-primary" label="إجمالي المبالغ" value={formatCurrency(stats.amount)} />
          </>
        ) : (
          <>
            <StatCard icon="receipt_long" color="text-blue-500" label="إجمالي السلف" value={stats.total} />
            <StatCard icon="trending_up" color="text-emerald-500" label="سلف نشطة" value={stats.disbursed} />
            <StatCard icon="account_balance" color="text-amber-500" label="إجمالي المتبقي" value={formatCurrency(stats.amount)} />
            <StatCard icon="payments" color="text-rose-500" label="القسط الشهري" value={formatCurrency(stats.monthly)} />
          </>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <Card>
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="material-icons-round text-primary">{activeTab === 'monthly_advance' ? 'today' : 'calendar_month'}</span>
              {activeTab === 'monthly_advance' ? 'سلفة شهرية جديدة' : 'سلفة مقسطة جديدة'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isHR && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">الموظف *</label>
                  <SearchableSelect
                    options={employeeOptions}
                    value={formEmployeeId}
                    onChange={setFormEmployeeId}
                    placeholder="اختر الموظف..."
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">
                  {activeTab === 'monthly_advance' ? 'مبلغ السلفة' : 'إجمالي المبلغ'}
                </label>
                <input type="number" className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" min="0" step="100" />
              </div>

              {activeTab === 'installment' && (
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">عدد الأقساط (أشهر)</label>
                  <input type="number" className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={formInstallments} onChange={(e) => setFormInstallments(e.target.value)} placeholder="12" min="2" max="60" />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">
                  {activeTab === 'monthly_advance' ? 'الشهر' : 'شهر البداية'}
                </label>
                <input type="month" className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formStartMonth} onChange={(e) => setFormStartMonth(e.target.value)} />
              </div>

              {activeTab === 'installment' && installmentAmount > 0 && (
                <div className="flex items-end">
                  <div className="bg-primary/10 rounded-xl p-4 w-full text-center">
                    <p className="text-xs text-primary font-bold mb-1">القسط الشهري</p>
                    <p className="text-xl font-black text-primary">{formatCurrency(installmentAmount)}</p>
                  </div>
                </div>
              )}

              <div className={activeTab === 'monthly_advance' ? '' : 'sm:col-span-2'}>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">السبب (اختياري)</label>
                <input type="text" className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="سبب السلفة..." />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={submitting || !formAmount || !formStartMonth || (isHR && !formEmployeeId && !employeeId)}>
                {submitting && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">save</span>
                إنشاء السلفة
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {isHR && (
          <SearchableSelect
            options={[{ value: '', label: 'جميع الموظفين' }, ...employeeOptions]}
            value={filterEmployee}
            onChange={setFilterEmployee}
            placeholder="تصفية بالموظف..."
            className="sm:w-64"
          />
        )}
        {activeTab === 'monthly_advance' && (
          <input type="month" className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
        )}
        <select
          className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as LoanStatus | '')}
        >
          <option value="">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="closed">مُغلق</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">money_off</span>
            <p className="text-sm font-bold text-slate-500">لا توجد سُلف</p>
          </div>
        ) : activeTab === 'monthly_advance' ? (
          <MonthlyAdvanceTable
            loans={filtered}
            employeeMap={employeeMap}
            canDisburse={canDisburse}
            canDelete={canDelete}
            actionLoading={actionLoading}
            onDisburse={handleDisburse}
            onDelete={setDeleteConfirm}
          />
        ) : (
          <InstallmentTable
            loans={filtered}
            employeeMap={employeeMap}
            expandedLoan={expandedLoan}
            setExpandedLoan={setExpandedLoan}
            canDisburse={canDisburse}
            canDelete={canDelete}
            actionLoading={actionLoading}
            onDisburse={handleDisburse}
            onDelete={setDeleteConfirm}
          />
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <span className="material-icons-round text-5xl text-rose-500 mb-2">warning</span>
              <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">تأكيد الحذف</h3>
              <p className="text-sm text-slate-500 mb-4">هل تريد حذف هذه السلفة نهائياً؟</p>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>تراجع</Button>
              <Button onClick={() => handleDeleteLoan(deleteConfirm)} disabled={deleting} className="!bg-rose-600 hover:!bg-rose-700">
                {deleting ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">delete</span>}
                حذف نهائي
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-bold text-white flex items-center gap-2 animate-slide-up ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`}>
          <span className="material-icons-round text-lg">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatCard: React.FC<{ icon: string; color: string; label: string; value: string | number }> = ({ icon, color, label, value }) => (
  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
    <span className={`material-icons-round ${color} text-3xl mb-2 block`}>{icon}</span>
    <p className="text-xs text-slate-400 font-bold mb-1">{label}</p>
    <p className="text-2xl font-black">{value}</p>
  </div>
);

const MonthlyAdvanceTable: React.FC<{
  loans: FirestoreEmployeeLoan[];
  employeeMap: Map<string, FirestoreEmployee>;
  canDisburse: boolean;
  canDelete: boolean;
  actionLoading: string | null;
  onDisburse: (loan: FirestoreEmployeeLoan) => void;
  onDelete: (id: string) => void;
}> = ({ loans, employeeMap, canDisburse, canDelete, actionLoading, onDisburse, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
          <th className="text-right py-3 px-3">الكود</th>
          <th className="text-right py-3 px-3">الموظف</th>
          <th className="text-right py-3 px-3">المبلغ</th>
          <th className="text-right py-3 px-3">الشهر</th>
          <th className="text-right py-3 px-3">السبب</th>
          <th className="text-center py-3 px-3">حالة الصرف</th>
          {canDisburse && <th className="text-center py-3 px-3">إجراء</th>}
          {canDelete && <th className="text-center py-3 px-3">حذف</th>}
        </tr>
      </thead>
      <tbody>
        {loans.map((loan) => {
          const emp = employeeMap.get(loan.employeeId);
          const isProcessing = actionLoading === loan.id;
          return (
            <tr key={loan.id} className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${loan.disbursed ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
              <td className="py-3 px-3 font-mono text-xs text-slate-500">{loan.employeeCode || emp?.code || '—'}</td>
              <td className="py-3 px-3 font-bold">{loan.employeeName || emp?.name || loan.employeeId}</td>
              <td className="py-3 px-3 font-bold text-primary">{formatCurrency(loan.loanAmount)}</td>
              <td className="py-3 px-3 font-mono text-xs" dir="ltr">{loan.month || loan.startMonth}</td>
              <td className="py-3 px-3 text-slate-500 text-xs max-w-[200px] truncate">{loan.reason || '—'}</td>
              <td className="py-3 px-3 text-center">
                {loan.disbursed ? (
                  <Badge variant="success">تم الصرف</Badge>
                ) : (
                  <Badge variant="warning">لم يُصرف</Badge>
                )}
              </td>
              {canDisburse && (
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={() => onDisburse(loan)}
                    disabled={isProcessing}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      loan.disbursed
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200'
                    }`}
                  >
                    {isProcessing ? (
                      <span className="material-icons-round animate-spin text-sm">refresh</span>
                    ) : loan.disbursed ? (
                      <><span className="material-icons-round text-sm align-middle">undo</span> تراجع</>
                    ) : (
                      <><span className="material-icons-round text-sm align-middle">check</span> صرف</>
                    )}
                  </button>
                </td>
              )}
              {canDelete && (
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={() => onDelete(loan.id!)}
                    className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-400 hover:text-rose-600 transition-colors"
                    title="حذف السلفة"
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
);

const InstallmentTable: React.FC<{
  loans: FirestoreEmployeeLoan[];
  employeeMap: Map<string, FirestoreEmployee>;
  expandedLoan: string | null;
  setExpandedLoan: (id: string | null) => void;
  canDisburse: boolean;
  canDelete: boolean;
  actionLoading: string | null;
  onDisburse: (loan: FirestoreEmployeeLoan) => void;
  onDelete: (id: string) => void;
}> = ({ loans, employeeMap, expandedLoan, setExpandedLoan, canDisburse, canDelete, actionLoading, onDisburse, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
          <th className="text-right py-3 px-3">الكود</th>
          <th className="text-right py-3 px-3">الموظف</th>
          <th className="text-right py-3 px-3">المبلغ</th>
          <th className="text-right py-3 px-3">القسط</th>
          <th className="text-right py-3 px-3">الأقساط</th>
          <th className="text-right py-3 px-3">المتبقي</th>
          <th className="text-right py-3 px-3">البداية</th>
          <th className="text-center py-3 px-3">الحالة</th>
          <th className="text-center py-3 px-3">الصرف</th>
          {canDelete && <th className="text-center py-3 px-3">حذف</th>}
          <th className="text-center py-3 px-3"></th>
        </tr>
      </thead>
      <tbody>
        {loans.map((loan) => {
          const emp = employeeMap.get(loan.employeeId);
          const isExpanded = expandedLoan === loan.id;
          const paidInstallments = loan.totalInstallments - loan.remainingInstallments;
          const progress = loan.totalInstallments > 0 ? Math.round((paidInstallments / loan.totalInstallments) * 100) : 0;
          const isProcessing = actionLoading === loan.id;

          return (
            <React.Fragment key={loan.id}>
              <tr className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${loan.disbursed ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
                <td className="py-3 px-3 font-mono text-xs text-slate-500">{loan.employeeCode || emp?.code || '—'}</td>
                <td className="py-3 px-3 font-bold">{loan.employeeName || emp?.name || loan.employeeId}</td>
                <td className="py-3 px-3 font-bold">{formatCurrency(loan.loanAmount)}</td>
                <td className="py-3 px-3">{formatCurrency(loan.installmentAmount)}</td>
                <td className="py-3 px-3 font-mono text-xs">{loan.totalInstallments}</td>
                <td className="py-3 px-3">
                  <span className={`font-bold ${loan.remainingInstallments === 0 ? 'text-emerald-500' : 'text-amber-600'}`}>
                    {loan.remainingInstallments}
                  </span>
                </td>
                <td className="py-3 px-3 font-mono text-xs" dir="ltr">{loan.startMonth}</td>
                <td className="py-3 px-3 text-center">
                  <Badge variant={LOAN_STATUS_VARIANT[loan.status]}>{LOAN_STATUS_LABELS[loan.status]}</Badge>
                </td>
                <td className="py-3 px-3 text-center">
                  {canDisburse ? (
                    <button
                      onClick={() => onDisburse(loan)}
                      disabled={isProcessing}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        loan.disbursed
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      {isProcessing ? '...' : loan.disbursed ? 'تم ✓' : 'صرف'}
                    </button>
                  ) : (
                    loan.disbursed ? <Badge variant="success">تم</Badge> : <Badge variant="warning">لا</Badge>
                  )}
                </td>
                {canDelete && (
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onDelete(loan.id!)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-400 hover:text-rose-600 transition-colors"
                      title="حذف السلفة"
                    >
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  </td>
                )}
                <td className="py-3 px-3 text-center">
                  <button onClick={() => setExpandedLoan(isExpanded ? null : loan.id!)} className="text-primary hover:text-primary/70 transition-colors">
                    <span className="material-icons-round text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                  </button>
                </td>
              </tr>

              {isExpanded && (
                <tr>
                  <td colSpan={12} className="p-4 bg-slate-50 dark:bg-slate-800/30">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="text-slate-500">التقدم في السداد</span>
                          <span className="text-primary">{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                          <span>مدفوع: {paidInstallments} قسط</span>
                          <span>متبقي: {loan.remainingInstallments} قسط</span>
                        </div>
                      </div>

                      {loan.status === 'active' && loan.remainingInstallments > 0 && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-2">جدول الأقساط المتبقية</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                            {[...Array(Math.min(loan.remainingInstallments, 12))].map((_, i) => {
                              const [y, m] = loan.startMonth.split('-').map(Number);
                              const monthDate = new Date(y, m - 1 + paidInstallments + i);
                              const label = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
                              return (
                                <div key={i} className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center border border-slate-100 dark:border-slate-700">
                                  <p className="text-xs text-slate-400 font-mono" dir="ltr">{label}</p>
                                  <p className="text-sm font-bold">{formatCurrency(loan.installmentAmount)}</p>
                                </div>
                              );
                            })}
                            {loan.remainingInstallments > 12 && (
                              <div className="bg-white dark:bg-slate-900 rounded-lg p-2 text-center border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                                <p className="text-xs text-slate-400 font-bold">+{loan.remainingInstallments - 12} أقساط</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {loan.reason && (
                        <div className="text-xs text-slate-500">
                          <span className="font-bold">السبب: </span>{loan.reason}
                        </div>
                      )}
                      {loan.disbursedByName && (
                        <div className="text-xs text-slate-500">
                          <span className="font-bold">تم الصرف بواسطة: </span>{loan.disbursedByName}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

