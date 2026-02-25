import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, Button, Badge, KPIBox } from '../components/UI';
import {
  generatePayroll,
  getPayrollMonth,
  getPayrollRecords,
  finalizePayroll,
  lockPayroll,
  payrollAuditService,
} from '../payroll';
import { printPayslip } from '../utils/payslipGenerator';
import { employeeService } from '../employeeService';
import { getDocs } from 'firebase/firestore';
import { departmentsRef } from '../collections';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreDepartment,
} from '../types';
import type {
  FirestorePayrollMonth,
  FirestorePayrollRecord,
  FirestorePayrollAuditLog,
  PayrollEmployeeData,
  EmploymentType,
} from '../payroll/types';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 15;

const STATUS_MAP: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'danger' | 'neutral' }> = {
  draft: { label: 'مسودة', variant: 'warning' },
  finalized: { label: 'مُعتمد', variant: 'success' },
  locked: { label: '8&88~8', variant: 'danger' },
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  monthly: 'شهري',
  daily: 'يومي',
  hourly: 'بالساعة',
};

async function loadPayrollEmployees(): Promise<PayrollEmployeeData[]> {
  const [employees, deptSnap] = await Promise.all([
    employeeService.getAll(),
    getDocs(departmentsRef()),
  ]);

  const deptMap = new Map<string, string>();
  deptSnap.docs.forEach((d) => {
    const data = d.data() as FirestoreDepartment;
    deptMap.set(d.id, data.name);
  });

  const activeEmployees = employees.filter((e: FirestoreEmployee) => e.isActive);

  return activeEmployees.map((emp: FirestoreEmployee): PayrollEmployeeData => {
    const empType = (emp.employmentType || 'monthly') as EmploymentType;
    const workingHoursPerDay = 8;

    return {
      employeeId: emp.id!,
      employeeName: emp.name,
      departmentId: emp.departmentId || '',
      departmentName: deptMap.get(emp.departmentId || '') || emp.departmentId || '',
      costCenterId: emp.departmentId || '',
      productionLineId: null,
      employmentType: empType,
      baseSalary: emp.baseSalary || 0,
      transportDeduction: 0,
      ...(empType === 'daily' && {
        dailyRate: emp.baseSalary ? emp.baseSalary / 30 : 0,
      }),
      ...(empType === 'hourly' && {
        hourlyRate: emp.hourlyRate || (emp.baseSalary ? emp.baseSalary / (30 * workingHoursPerDay) : 0),
      }),
    };
  });
}

function formatCurrency(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Employee Breakdown Modal ───────────────────────────────────────────────

const RecordModal: React.FC<{
  record: FirestorePayrollRecord | null;
  onClose: () => void;
  month: string;
}> = ({ record, onClose, month }) => {
  if (!record) return null;

  const r = record;

  const handlePrint = () => {
    printPayslip({ record: r, month });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">{r.employeeName}</h3>
            <p className="text-xs text-slate-400 font-medium">{EMPLOYMENT_TYPE_LABELS[r.employmentType]}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <span className="material-icons-round text-sm">print</span>
              كشف راتب
            </Button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <span className="material-icons-round text-slate-400">close</span>
            </button>
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="px-6 py-4 grid grid-cols-4 gap-3">
          {[
            { label: 'أيام العمل', value: r.workingDays, icon: 'calendar_month', color: 'text-blue-500' },
            { label: 'حضور', value: r.presentDays, icon: 'check_circle', color: 'text-emerald-500' },
            { label: 'غياب', value: r.absentDays, icon: 'cancel', color: 'text-rose-500' },
            { label: 'تأخير', value: r.lateDays, icon: 'schedule', color: 'text-amber-500' },
          ].map((item) => (
            <div key={item.label} className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className={`material-icons-round ${item.color} text-xl block mb-1`}>{item.icon}</span>
              <p className="text-xs text-slate-400 font-bold">{item.label}</p>
              <p className="text-lg font-black">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Earnings */}
        <div className="px-6 py-3">
          <h4 className="text-sm font-black text-emerald-600 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            المستحقات
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>الراتب الأساسي</span>
              <span className="font-bold font-mono">{formatCurrency(r.baseSalary)}</span>
            </div>
            {r.overtimeAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span>بدل ساعات إضافية ({r.overtimeHours} ساعة)</span>
                <span className="font-bold font-mono">{formatCurrency(r.overtimeAmount)}</span>
              </div>
            )}
            {r.allowancesBreakdown.map((a, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{a.name}</span>
                <span className="font-bold font-mono">{formatCurrency(a.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-black pt-2 border-t border-emerald-200 dark:border-emerald-800">
              <span>إجمالي المستحقات</span>
              <span className="text-emerald-600 font-mono">{formatCurrency(r.grossSalary)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        {r.totalDeductions > 0 && (
          <div className="px-6 py-3">
            <h4 className="text-sm font-black text-rose-600 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              الاستقطاعات
            </h4>
            <div className="space-y-2">
              {r.absenceDeduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>خصم غياب ({r.absentDays} يوم)</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.absenceDeduction)}</span>
                </div>
              )}
              {r.latePenalty > 0 && (
                <div className="flex justify-between text-sm">
                  <span>خصم تأخير ({r.lateDays} يوم)</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.latePenalty)}</span>
                </div>
              )}
              {r.loanInstallment > 0 && (
                <div className="flex justify-between text-sm">
                  <span>قسط سلفة</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.loanInstallment)}</span>
                </div>
              )}
              {r.unpaidLeaveDeduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>خصم إجازة بدون راتب ({r.unpaidLeaveDays} يوم)</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.unpaidLeaveDeduction)}</span>
                </div>
              )}
              {r.transportDeduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>خصم نقل</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.transportDeduction)}</span>
                </div>
              )}
              {r.otherPenalties > 0 && (
                <div className="flex justify-between text-sm">
                  <span>جزاءات أخرى</span>
                  <span className="font-bold font-mono text-rose-500">{formatCurrency(r.otherPenalties)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-2 border-t border-rose-200 dark:border-rose-800">
                <span>إجمالي الاستقطاعات</span>
                <span className="text-rose-600 font-mono">{formatCurrency(r.totalDeductions)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Net Salary */}
        <div className="mx-6 my-4 bg-primary/10 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-black text-primary">صافي الراتب</span>
          <span className="text-2xl font-black text-primary font-mono">{formatCurrency(r.netSalary)}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Audit Log Panel ────────────────────────────────────────────────────────

const AuditPanel: React.FC<{ logs: FirestorePayrollAuditLog[] }> = ({ logs }) => {
  if (logs.length === 0) return null;

  const actionLabels: Record<string, string> = {
    generate: 'إنشاء',
    recalculate: 'إعادة احتساب',
    finalize: 'اعتماد',
    lock: 'قفل',
    edit: 'تعديل',
  };

  const actionIcons: Record<string, string> = {
    generate: 'add_circle',
    recalculate: 'refresh',
    finalize: 'verified',
    lock: 'lock',
    edit: 'edit',
  };

  return (
    <Card title="سجل المراجعة">
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 text-sm">
            <span className="material-icons-round text-slate-400 text-lg mt-0.5">
              {actionIcons[log.action] || 'info'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="info">{actionLabels[log.action] || log.action}</Badge>
                <span className="text-xs text-slate-400 font-mono">
                  {log.timestamp?.toDate?.()
                    ? log.timestamp.toDate().toLocaleString('ar-EG')
                    : '—'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{log.details}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export const Payroll: React.FC = () => {
  // State
  const [month, setMonth] = useState(getCurrentMonth());
  const [payrollMonth, setPayrollMonth] = useState<FirestorePayrollMonth | null>(null);
  const [records, setRecords] = useState<FirestorePayrollRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<FirestorePayrollAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<FirestorePayrollRecord | null>(null);
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployeeData[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);

  useEffect(() => {
    loadPayrollEmployees()
      .then((emps) => {
        setPayrollEmployees(emps);
        setEmployeesLoaded(true);
      })
      .catch(() => setEmployeesLoaded(true));
  }, []);

  // Load payroll data for selected month
  const loadPayrollData = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const pm = await getPayrollMonth(month);
      setPayrollMonth(pm);
      if (pm?.id) {
        const [recs, logs] = await Promise.all([
          getPayrollRecords(pm.id),
          payrollAuditService.getByMonth(pm.id),
        ]);
        setRecords(recs);
        setAuditLogs(logs);
      } else {
        setRecords([]);
        setAuditLogs([]);
      }
      setDataLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [month]);

  // Generate payroll
  const handleGenerate = useCallback(async () => {
    setActionLoading('generate');
    setError('');
    setSuccess('');
    try {
      const emps = payrollEmployees.length > 0
        ? payrollEmployees
        : await loadPayrollEmployees();
      if (emps.length === 0) {
        setError('لا يوجد موظفين نشطين لاحتساب الرواتب');
        setActionLoading('');
        return;
      }
      const result = await generatePayroll({
        month,
        generatedBy: 'current-user',
        employees: emps,
      });
      setSuccess(
        `تم ${payrollMonth ? 'إعادة احتساب' : 'إنشاء'} كشف الرواتب بنجاح — ${result.totalProcessed} موظف`,
      );
      await loadPayrollData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء كشف الرواتب');
    } finally {
      setActionLoading('');
    }
  }, [month, payrollMonth, loadPayrollData]);

  // Finalize payroll
  const handleFinalize = useCallback(async () => {
    if (!confirm('هل أنت متأكد من اعتماد كشف الرواتب؟ لن يمكن التعديل بعد ذلك.')) return;
    setActionLoading('finalize');
    setError('');
    setSuccess('');
    try {
      await finalizePayroll({ month, finalizedBy: 'current-user' });
      setSuccess('تم اعتماد كشف الرواتب بنجاح.');
      await loadPayrollData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء اعتماد الكشف');
    } finally {
      setActionLoading('');
    }
  }, [month, loadPayrollData]);

  // Lock payroll
  const handleLock = useCallback(async () => {
    if (!confirm('هل أنت متأكد من قفل كشف الرواتب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    setActionLoading('lock');
    setError('');
    setSuccess('');
    try {
      await lockPayroll({ month, lockedBy: 'current-user' });
      setSuccess('تم قفل كشف الرواتب نهائياً.');
      await loadPayrollData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء قفل الكشف');
    } finally {
      setActionLoading('');
    }
  }, [month, loadPayrollData]);

  // Filtered and paginated records
  const filteredRecords = useMemo(() => {
    let result = records;
    if (departmentFilter) {
      result = result.filter((r) => r.departmentId === departmentFilter);
    }
    if (employmentFilter) {
      result = result.filter((r) => r.employmentType === employmentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((r) => r.employeeName.toLowerCase().includes(q));
    }
    return result;
  }, [records, departmentFilter, employmentFilter, searchQuery]);

  const paginatedRecords = filteredRecords.slice(0, visibleCount);
  const canLoadMoreRecords = paginatedRecords.length < filteredRecords.length;
  const remainingRecordsCount = Math.max(filteredRecords.length - paginatedRecords.length, 0);

  // Department options from records
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (!map.has(r.departmentId)) map.set(r.departmentId, r.departmentId);
    }
    return Array.from(map.entries()).map(([id]) => ({ value: id, label: id }));
  }, [records]);

  const isDraft = !payrollMonth || payrollMonth.status === 'draft';
  const isFinalized = payrollMonth?.status === 'finalized';
  const isLocked = payrollMonth?.status === 'locked';

  // Export to CSV
  const handleExport = useCallback(() => {
    if (filteredRecords.length === 0) return;
    const headers = [
      'اسم الموظف', 'نوع التوظيف', 'الراتب الأساسي', 'ساعات إضافية', 'بدل إضافي',
      'البدلات', 'أيام العمل', 'أيام الحضور', 'أيام الغياب', 'خصم غياب',
      'خصم تأخير', 'قسط سلفة', 'خصم نقل', 'جزاءات أخرى',
      'إجمالي المستحقات', 'إجمالي الاستقطاعات', 'صافي الراتب',
    ];
    const rows = filteredRecords.map((r) => [
      r.employeeName, EMPLOYMENT_TYPE_LABELS[r.employmentType],
      r.baseSalary, r.overtimeHours, r.overtimeAmount,
      r.allowancesTotal, r.workingDays, r.presentDays, r.absentDays, r.absenceDeduction,
      r.latePenalty, r.loanInstallment, r.transportDeduction, r.otherPenalties,
      r.grossSalary, r.totalDeductions, r.netSalary,
    ]);

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRecords, month]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            كشف الرواتب
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            إدارة الرواتب الشهرية — الاحتساب والاعتماد والقفل.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setDataLoaded(false); setVisibleCount(ROWS_PER_PAGE); }}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
          <Button variant="primary" onClick={loadPayrollData} disabled={loading}>
            {loading
              ? <span className="material-icons-round animate-spin text-sm">refresh</span>
              : <span className="material-icons-round text-sm">search</span>}
            تحميل
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {dataLoaded && payrollMonth && (
        <div className={`rounded-xl p-4 flex items-center justify-between border ${
          isLocked
            ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800'
            : isFinalized
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`material-icons-round text-xl ${
              isLocked ? 'text-rose-500' : isFinalized ? 'text-emerald-500' : 'text-amber-500'
            }`}>
              {isLocked ? 'lock' : isFinalized ? 'verified' : 'edit_note'}
            </span>
            <div>
              <p className="text-sm font-black">
                {isLocked ? 'هذا الشهر مقفل نهائياً' : isFinalized ? 'هذا الشهر مُعتمد' : 'مسودة — يمكن التعديل وإعادة الاحتساب'}
              </p>
              <p className="text-xs text-slate-500">
                {payrollMonth.totalEmployees} موظف
                {payrollMonth.snapshotVersion && ` — نسخة: ${payrollMonth.snapshotVersion}`}
              </p>
            </div>
          </div>
          <Badge variant={STATUS_MAP[payrollMonth.status]?.variant ?? 'neutral'}>
            {STATUS_MAP[payrollMonth.status]?.label ?? payrollMonth.status}
          </Badge>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">error</span>
          <p className="text-sm font-bold text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-emerald-500">check_circle</span>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      {/* KPIs */}
      {dataLoaded && records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIBox
            label="عدد الموظفين"
            value={records.length}
            icon="groups"
            colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <KPIBox
            label="إجمالي المستحقات"
            value={formatCurrency(payrollMonth?.totalGross ?? 0)}
            icon="trending_up"
            colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          <KPIBox
            label="إجمالي الاستقطاعات"
            value={formatCurrency(payrollMonth?.totalDeductions ?? 0)}
            icon="trending_down"
            colorClass="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
          />
          <KPIBox
            label="صافي الرواتب"
            value={formatCurrency(payrollMonth?.totalNet ?? 0)}
            icon="account_balance_wallet"
            colorClass="bg-primary/10 text-primary"
          />
        </div>
      )}

      {/* Actions */}
      {dataLoaded && (
        <div className="flex flex-wrap gap-3">
          {isDraft && (
            <>
              <Button
                variant="primary"
                onClick={handleGenerate}
                disabled={!!actionLoading}
              >
                {actionLoading === 'generate'
                  ? <span className="material-icons-round animate-spin text-sm">refresh</span>
                  : <span className="material-icons-round text-sm">{payrollMonth ? 'refresh' : 'play_arrow'}</span>}
                {payrollMonth ? 'إعادة الاحتساب' : 'إنشاء كشف الرواتب'}
              </Button>
              {payrollMonth && records.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleFinalize}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'finalize'
                    ? <span className="material-icons-round animate-spin text-sm">refresh</span>
                    : <span className="material-icons-round text-sm">verified</span>}
                  اعتماد الكشف
                </Button>
              )}
            </>
          )}
          {isFinalized && (
            <Button
              variant="outline"
              onClick={handleLock}
              disabled={!!actionLoading}
              className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
            >
              {actionLoading === 'lock'
                ? <span className="material-icons-round animate-spin text-sm">refresh</span>
                : <span className="material-icons-round text-sm">lock</span>}
              قفل الشهر نهائياً
            </Button>
          )}
          {records.length > 0 && can('export') && (
            <Button variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      {records.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-icons-round text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-lg">search</span>
            <input
              type="text"
              placeholder="بحث باسم الموظف..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(ROWS_PER_PAGE); }}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setVisibleCount(ROWS_PER_PAGE); }}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            <option value="">كل الأقسام</option>
            {departments.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <select
            value={employmentFilter}
            onChange={(e) => { setEmploymentFilter(e.target.value); setVisibleCount(ROWS_PER_PAGE); }}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            <option value="">كل أنواع التوظيف</option>
            <option value="monthly">شهري</option>
            <option value="daily">يومي</option>
            <option value="hourly">بالساعة</option>
          </select>
        </div>
      )}

      {/* Records Table */}
      {records.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                  <th className="text-right py-3 px-3">الموظف</th>
                  <th className="text-right py-3 px-2">النوع</th>
                  <th className="text-right py-3 px-2">الأساسي</th>
                  <th className="text-right py-3 px-2">الإضافي</th>
                  <th className="text-right py-3 px-2">البدلات</th>
                  <th className="text-right py-3 px-2">المستحقات</th>
                  <th className="text-right py-3 px-2">الاستقطاعات</th>
                  <th className="text-right py-3 px-2">الصافي</th>
                  <th className="text-center py-3 px-2">الحالة</th>
                  <th className="text-center py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedRecord(r)}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <span className="material-icons-round text-primary text-sm">person</span>
                        </div>
                        <span className="font-bold text-sm truncate max-w-[140px]">{r.employeeName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant="neutral">{EMPLOYMENT_TYPE_LABELS[r.employmentType]}</Badge>
                    </td>
                    <td className="py-3 px-2 font-mono text-xs font-bold">{formatCurrency(r.baseSalary)}</td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {r.overtimeAmount > 0
                        ? <span className="text-blue-500 font-bold">{formatCurrency(r.overtimeAmount)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {r.allowancesTotal > 0
                        ? <span className="font-bold">{formatCurrency(r.allowancesTotal)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-2 font-mono text-xs font-bold text-emerald-600">
                      {formatCurrency(r.grossSalary)}
                    </td>
                    <td className="py-3 px-2 font-mono text-xs font-bold text-rose-500">
                      {r.totalDeductions > 0 ? formatCurrency(r.totalDeductions) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-2 font-mono text-xs font-black text-primary">
                      {formatCurrency(r.netSalary)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {r.isLocked
                        ? <span className="material-icons-round text-rose-400 text-sm">lock</span>
                        : r.calculationSnapshotVersion
                        ? <span className="material-icons-round text-emerald-400 text-sm">verified</span>
                        : <span className="material-icons-round text-slate-300 text-sm">edit_note</span>}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRecord(r); }}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <span className="material-icons-round text-slate-400 text-sm">visibility</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredRecords.length > ROWS_PER_PAGE && (
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-400 font-medium">
                عرض {paginatedRecords.length} من {filteredRecords.length}
              </p>
              {canLoadMoreRecords && (
                <button
                  onClick={() => setVisibleCount((prev) => prev + ROWS_PER_PAGE)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
                >
                  <span className="material-icons-round text-sm">expand_more</span>
                  تحميل المزيد{remainingRecordsCount > 0 ? ` (متبقي ${remainingRecordsCount})` : ''}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Empty state */}
      {dataLoaded && records.length === 0 && !loading && (
        <Card>
          <div className="text-center py-16">
            <span className="material-icons-round text-5xl text-slate-200 dark:text-slate-700 mb-4 block">
              receipt_long
            </span>
            <p className="text-sm font-bold text-slate-500 mb-2">
              لا يوجد كشف رواتب لشهر {month}
            </p>
            <p className="text-xs text-slate-400 mb-6">
              اضغط على "إنشاء كشف الرواتب" لبدء احتساب الرواتب.
            </p>
            <Button variant="primary" onClick={handleGenerate} disabled={!!actionLoading}>
              <span className="material-icons-round text-sm">play_arrow</span>
              إنشاء كشف الرواتب
            </Button>
          </div>
        </Card>
      )}

      {/* Not loaded state */}
      {!dataLoaded && !loading && (
        <Card>
          <div className="text-center py-16">
            <span className="material-icons-round text-5xl text-slate-200 dark:text-slate-700 mb-4 block">
              calendar_month
            </span>
            <p className="text-sm font-bold text-slate-500 mb-2">
              اختر الشهر واضغط "تحميل"
            </p>
            <p className="text-xs text-slate-400">
              سيتم عرض كشف الرواتب الخاص بالشهر المحدد.
            </p>
          </div>
        </Card>
      )}

      {/* Audit Logs */}
      {auditLogs.length > 0 && <AuditPanel logs={auditLogs} />}

      {/* Employee Breakdown Modal */}
      <RecordModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        month={month}
      />
    </div>
  );
};

