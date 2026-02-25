import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import { attendanceLogService } from '../attendanceService';
import { leaveRequestService, leaveBalanceService } from '../leaveService';
import { loanService } from '../loanService';
import { generateApprovalChain } from '../approvalEngine';
import type {
  FirestoreAttendanceLog,
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  FirestoreEmployeeLoan,
  LeaveType,
  ApprovalChainItem,
  JobLevel,
} from '../types';
import { LEAVE_TYPE_LABELS } from '../types';
import { formatNumber } from '../../../utils/calculations';
import type { FirestoreEmployee } from '../../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';

type SelfServiceTab = 'attendance' | 'leave' | 'loan' | 'payroll' | 'requests';

function formatTime(ts: any): string {
  if (!ts) return '—';
  const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateAr(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function calculateDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'موافق',
  rejected: 'مرفوض',
};

const STATUS_BADGE_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function toHierarchyInfo(e: FirestoreEmployee): { employeeId: string; managerId?: string; departmentId: string; jobPositionId: string; jobLevel: JobLevel } {
  const level = e.level as number;
  const jobLevel = Math.min(4, Math.max(1, level)) as JobLevel;
  return {
    employeeId: e.id!,
    managerId: e.managerId,
    departmentId: e.departmentId,
    jobPositionId: e.jobPositionId,
    jobLevel,
  };
}

export const EmployeeSelfService: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const uid = useAppStore((s) => s.uid);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);

  const [activeTab, setActiveTab] = useState<SelfServiceTab>('attendance');
  const [loading, setLoading] = useState(true);
  const [attendanceLogs, setAttendanceLogs] = useState<FirestoreAttendanceLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<FirestoreLeaveRequest[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<FirestoreLeaveBalance | null>(null);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);

  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [leaveSubmitError, setLeaveSubmitError] = useState<string | null>(null);
  const [leaveSubmitSuccess, setLeaveSubmitSuccess] = useState(false);

  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [installmentAmount, setInstallmentAmount] = useState<number>(0);
  const [totalInstallments, setTotalInstallments] = useState<number>(0);
  const [loanReason, setLoanReason] = useState('');
  const [loanSubmitting, setLoanSubmitting] = useState(false);
  const [loanSubmitError, setLoanSubmitError] = useState<string | null>(null);
  const [loanSubmitSuccess, setLoanSubmitSuccess] = useState(false);

  const totalDays = useMemo(() => calculateDays(startDate, endDate), [startDate, endDate]);

  const employeeId = currentEmployee?.id ?? '';

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await fetchEmployees?.();
      try {
        const [logs, leaveReqs, balance, loanList] = await Promise.all([
          attendanceLogService.getByEmployee(employeeId),
          leaveRequestService.getByEmployee(employeeId),
          leaveBalanceService.getByEmployee(employeeId).then((b) => b ?? leaveBalanceService.getOrCreate(employeeId)),
          loanService.getByEmployee(employeeId),
        ]);
        if (!cancelled) {
          setAttendanceLogs(logs);
          setLeaveRequests(leaveReqs);
          setLeaveBalance(balance);
          setLoans(loanList);
        }
      } catch (err) {
        console.error('Employee self-service load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId, fetchEmployees]);

  const attendanceStats = useMemo(() => {
    const total = attendanceLogs.length;
    const present = attendanceLogs.filter((l) => !l.isAbsent).length;
    const absent = attendanceLogs.filter((l) => l.isAbsent).length;
    const late = attendanceLogs.filter((l) => l.lateMinutes > 0).length;
    return { total, present, absent, late };
  }, [attendanceLogs]);

  const recentAttendance = useMemo(() => attendanceLogs.slice(0, 30), [attendanceLogs]);

  const allRequests = useMemo(() => {
    const leaveItems = leaveRequests.map((r) => ({
      type: 'leave' as const,
      id: r.id!,
      date: r.createdAt,
      details: `${LEAVE_TYPE_LABELS[r.leaveType]} — ${r.totalDays} يوم`,
      status: r.finalStatus,
      approvalChain: r.approvalChain,
    }));
    const loanItems = loans.map((l) => ({
      type: 'loan' as const,
      id: l.id!,
      date: l.createdAt,
      details: `${formatNumber(l.loanAmount)} ج.م — ${l.totalInstallments} قسط`,
      status: l.finalStatus,
      approvalChain: l.approvalChain,
    }));
    const combined = [...leaveItems, ...loanItems];
    combined.sort((a, b) => {
      const da = a.date?.toDate?.() ?? (typeof a.date === 'object' && a.date !== null ? new Date((a.date as any).seconds * 1000) : new Date(0));
      const db = b.date?.toDate?.() ?? (typeof b.date === 'object' && b.date !== null ? new Date((b.date as any).seconds * 1000) : new Date(0));
      return db.getTime() - da.getTime();
    });
    return combined;
  }, [leaveRequests, loans]);

  const canAccessPayroll = can('payroll.view');

  if (!currentEmployee || !currentEmployee.hasSystemAccess) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6">
        <span className="material-icons-round text-6xl text-slate-400 dark:text-slate-500">lock</span>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200">غير مصرح بالوصول</h2>
        <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
          ليس لديك صلاحية الوصول للخدمة الذاتية
        </p>
      </div>
    );
  }

  const handleLeaveSubmit = async () => {
    if (!employeeId || !uid || !startDate || !endDate || totalDays <= 0) {
      setLeaveSubmitError('يرجى تعبئة تاريخ البداية والنهاية والسبب');
      return;
    }
    if (!currentEmployee) {
      setLeaveSubmitError('لم يتم العثور على بيانات الموظف — تأكد من ربط حسابك بموظف');
      return;
    }
    setLeaveSubmitError(null);
    setLeaveSubmitSuccess(false);
    setSubmitting(true);
    try {
      const allEmployees = rawEmployees.length ? rawEmployees : await (await import('../employeeService')).employeeService.getAll();
      const hierarchy = toHierarchyInfo(currentEmployee);
      const allHierarchy = allEmployees.map((e) => toHierarchyInfo(e as FirestoreEmployee));
      const { chain, errors } = await generateApprovalChain(hierarchy, allHierarchy, 'leave');
      if (errors.length > 0) {
        setLeaveSubmitError(errors[0] || 'تعذر إنشاء سلسلة الموافقات');
        return;
      }
      await leaveRequestService.create({
        employeeId,
        leaveType,
        startDate,
        endDate,
        totalDays,
        affectsSalary: leaveType !== 'unpaid',
        status: 'pending',
        approvalChain: chain,
        finalStatus: 'pending',
        reason: reason.trim() || '—',
        createdBy: uid,
      });
      setLeaveSubmitSuccess(true);
      setStartDate('');
      setEndDate('');
      setReason('');
      const updated = await leaveRequestService.getByEmployee(employeeId);
      setLeaveRequests(updated);
      const balance = await leaveBalanceService.getByEmployee(employeeId) ?? await leaveBalanceService.getOrCreate(employeeId);
      setLeaveBalance(balance);
    } catch (err: any) {
      console.error('Leave request create error:', err);
      const msg = err?.message || 'حدث خطأ غير متوقع';
      setLeaveSubmitError(`فشل إرسال طلب الإجازة: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoanSubmit = async () => {
    if (!employeeId || !uid || loanAmount <= 0 || installmentAmount <= 0) {
      setLoanSubmitError('يرجى إدخال مبلغ السلفة وعدد الأقساط أو قيمة القسط');
      return;
    }
    const installments = Math.max(1, Math.round(loanAmount / installmentAmount));
    if (installments !== totalInstallments) {
      setTotalInstallments(installments);
    }
    setLoanSubmitError(null);
    setLoanSubmitSuccess(false);
    setLoanSubmitting(true);
    try {
      const employee = currentEmployee;
      const allEmployees = rawEmployees.length ? rawEmployees : await (await import('../employeeService')).employeeService.getAll();
      const hierarchy = toHierarchyInfo(employee);
      const allHierarchy = allEmployees.map((e) => toHierarchyInfo(e as FirestoreEmployee));
      const { chain, errors } = await generateApprovalChain(hierarchy, allHierarchy, 'loan');
      if (errors.length > 0) {
        setLoanSubmitError(errors[0] || 'تعذر إنشاء سلسلة الموافقات');
        return;
      }
      const finalInstallments = totalInstallments > 0 ? totalInstallments : Math.max(1, Math.round(loanAmount / installmentAmount));
      const startMonth = new Date().toISOString().slice(0, 7);
      await loanService.create({
        employeeId,
        employeeName: employee?.name || '',
        employeeCode: (employee as any)?.code || '',
        loanType: finalInstallments > 1 ? 'installment' : 'monthly_advance',
        loanAmount,
        installmentAmount,
        totalInstallments: finalInstallments,
        remainingInstallments: finalInstallments,
        startMonth,
        month: finalInstallments <= 1 ? startMonth : undefined,
        status: 'pending',
        approvalChain: chain,
        finalStatus: 'pending',
        reason: loanReason.trim() || '—',
        disbursed: false,
        createdBy: uid,
      });
      setLoanSubmitSuccess(true);
      setLoanAmount(0);
      setInstallmentAmount(0);
      setTotalInstallments(0);
      setLoanReason('');
      const updated = await loanService.getByEmployee(employeeId);
      setLoans(updated);
    } catch (err) {
      console.error('Loan create error:', err);
      setLoanSubmitError('حدث خطأ أثناء إرسال طلب السلفة');
    } finally {
      setLoanSubmitting(false);
    }
  };

  const tabs: { id: SelfServiceTab; label: string; icon: string }[] = [
    { id: 'attendance', label: 'الحضور', icon: 'fingerprint' },
    { id: 'leave', label: 'طلب إجازة', icon: 'beach_access' },
    { id: 'loan', label: 'طلب سلفة', icon: 'payments' },
    { id: 'payroll', label: 'الرواتب', icon: 'receipt_long' },
    { id: 'requests', label: 'طلباتي', icon: 'list_alt' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">الخدمة الذاتية</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">مرحباً، {currentEmployee.name}</p>
      </header>

      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full mb-2" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-4/5" />
        </div>
      )}

      {!loading && activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">إجمالي الأيام</p>
              <p className="text-xl font-bold">{formatNumber(attendanceStats.total)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">حاضر</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(attendanceStats.present)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">غائب</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{formatNumber(attendanceStats.absent)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">متأخر</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatNumber(attendanceStats.late)}</p>
            </Card>
          </div>
          <Card title="سجل الحضور الأخير">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">التاريخ</th>
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">دخول</th>
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">خروج</th>
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">الساعات</th>
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">دقائق تأخر</th>
                    <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttendance.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        لا توجد سجلات حضور
                      </td>
                    </tr>
                  )}
                  {recentAttendance.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2">{formatDateAr(log.date)}</td>
                      <td className="py-2 px-2">{formatTime(log.checkIn)}</td>
                      <td className="py-2 px-2">{formatTime(log.checkOut)}</td>
                      <td className="py-2 px-2">{formatNumber(log.totalHours)}</td>
                      <td className="py-2 px-2">{formatNumber(log.lateMinutes)}</td>
                      <td className="py-2 px-2">
                        {log.isAbsent ? (
                          <Badge variant="danger">غائب</Badge>
                        ) : log.lateMinutes > 0 ? (
                          <Badge variant="warning">متأخر</Badge>
                        ) : (
                          <Badge variant="success">حاضر</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {!loading && activeTab === 'leave' && (
        <div className="space-y-6">
          {leaveBalance && (
            <Card title="رصيد الإجازات الحالي">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">سنوية</p>
                  <p className="text-lg font-bold">{formatNumber(leaveBalance.annualBalance)} يوم</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">مرضية</p>
                  <p className="text-lg font-bold">{formatNumber(leaveBalance.sickBalance)} يوم</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">طارئة</p>
                  <p className="text-lg font-bold">{formatNumber(leaveBalance.emergencyBalance)} يوم</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">بدون راتب (مستخدم)</p>
                  <p className="text-lg font-bold">{formatNumber(leaveBalance.unpaidTaken)} يوم</p>
                </div>
              </div>
            </Card>
          )}
          <Card title="طلب إجازة جديد">
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">نوع الإجازة</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  {(Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
              {totalDays > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-400">عدد الأيام: <strong>{formatNumber(totalDays)}</strong></p>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">السبب (اختياري)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 resize-none"
                  placeholder="سبب طلب الإجازة"
                />
              </div>
              {leaveSubmitError && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{leaveSubmitError}</p>
              )}
              {leaveSubmitSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">تم إرسال طلب الإجازة بنجاح.</p>
              )}
              <Button
                onClick={handleLeaveSubmit}
                disabled={submitting || !startDate || !endDate || totalDays <= 0}
              >
                {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {!loading && activeTab === 'loan' && (
        <div className="space-y-6">
          {loans.length > 0 && (
            <Card title="السُلف">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="p-3 font-bold text-xs text-slate-400">النوع</th>
                      <th className="p-3 font-bold text-xs text-slate-400">المبلغ</th>
                      <th className="p-3 font-bold text-xs text-slate-400">القسط</th>
                      <th className="p-3 font-bold text-xs text-slate-400">الأقساط</th>
                      <th className="p-3 font-bold text-xs text-slate-400">الشهر</th>
                      <th className="p-3 font-bold text-xs text-slate-400">الحالة</th>
                      <th className="p-3 font-bold text-xs text-slate-400">الصرف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id} className={`border-t border-slate-100 dark:border-slate-800 ${loan.disbursed ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
                        <td className="p-3 text-xs font-bold">
                          {(loan.loanType || 'installment') === 'monthly_advance' ? 'شهرية' : 'مقسطة'}
                        </td>
                        <td className="p-3 font-bold">{formatNumber(loan.loanAmount)} ج.م</td>
                        <td className="p-3">{formatNumber(loan.installmentAmount)} ج.م</td>
                        <td className="p-3">{loan.remainingInstallments} / {loan.totalInstallments}</td>
                        <td className="p-3 font-mono text-xs" dir="ltr">{loan.month || loan.startMonth}</td>
                        <td className="p-3">
                          <Badge variant={loan.status === 'active' ? 'success' : loan.status === 'pending' ? 'warning' : 'neutral'}>
                            {loan.status === 'active' ? 'نشطة' : loan.status === 'pending' ? 'قيد المراجعة' : 'مغلقة'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {loan.disbursed ? (
                            <Badge variant="success">تم الصرف</Badge>
                          ) : (
                            <Badge variant="warning">لم يُصرف</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title="طلب سلفة جديدة">
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">مبلغ السلفة (ج.م)</label>
                <input
                  type="number"
                  min={1}
                  value={loanAmount || ''}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    setLoanAmount(isNaN(v) ? 0 : v);
                    if (installmentAmount > 0 && !isNaN(v) && v > 0) setTotalInstallments(Math.max(1, Math.round(v / installmentAmount)));
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">قيمة القسط (ج.م)</label>
                <input
                  type="number"
                  min={1}
                  value={installmentAmount || ''}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    setInstallmentAmount(isNaN(v) ? 0 : v);
                    if (loanAmount > 0 && !isNaN(v) && v > 0) setTotalInstallments(Math.max(1, Math.round(loanAmount / v)));
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
              {loanAmount > 0 && installmentAmount > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  عدد الأقساط: <strong>{formatNumber(totalInstallments > 0 ? totalInstallments : Math.max(1, Math.round(loanAmount / installmentAmount)))}</strong>
                </p>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">السبب (اختياري)</label>
                <textarea
                  value={loanReason}
                  onChange={(e) => setLoanReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 resize-none"
                  placeholder="سبب طلب السلفة"
                />
              </div>
              {loanSubmitError && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{loanSubmitError}</p>
              )}
              {loanSubmitSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">تم إرسال طلب السلفة بنجاح.</p>
              )}
              <Button
                onClick={handleLoanSubmit}
                disabled={loanSubmitting || loanAmount <= 0 || installmentAmount <= 0}
              >
                {loanSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {!loading && activeTab === 'payroll' && (
        <Card title="معلومات الراتب">
          <div className="space-y-4 max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">الراتب الأساسي</p>
                <p className="text-lg font-bold">{formatNumber(currentEmployee.baseSalary)} ج.م</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">أجر الساعة</p>
                <p className="text-lg font-bold">{formatNumber(currentEmployee.hourlyRate)} ج.م</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">نوع التوظيف</p>
                <p className="text-lg font-bold">{EMPLOYMENT_TYPE_LABELS[currentEmployee.employmentType]}</p>
              </div>
            </div>
            {canAccessPayroll && (
              <p className="text-slate-600 dark:text-slate-400">
                لعرض كشف الراتب والتفاصيل الكاملة،{' '}
                <button
                  type="button"
                  onClick={() => navigate('/payroll')}
                  className="text-primary font-bold underline hover:no-underline"
                >
                  انتقل إلى صفحة الرواتب
                </button>
              </p>
            )}
            {!canAccessPayroll && (
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                للاطلاع على تفاصيل الرواتب يرجى التنسيق مع الإدارة أو الموارد البشرية.
              </p>
            )}
          </div>
        </Card>
      )}

      {!loading && activeTab === 'requests' && (
        <Card title="طلباتي (إجازات وسُلف)">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">النوع</th>
                  <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">التفاصيل</th>
                  <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">الحالة</th>
                  <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">التاريخ</th>
                  <th className="py-3 px-2 font-bold text-slate-600 dark:text-slate-300">سلسلة الموافقة</th>
                </tr>
              </thead>
              <tbody>
                {allRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      لا توجد طلبات
                    </td>
                  </tr>
                )}
                {allRequests.map((req) => {
                  const dateStr = req.date
                    ? (req.date.toDate ? req.date.toDate() : new Date((req.date as any)?.seconds ? (req.date as any).seconds * 1000 : req.date))
                    : null;
                  return (
                    <tr key={`${req.type}-${req.id}`} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2">{req.type === 'leave' ? 'إجازة' : 'سلفة'}</td>
                      <td className="py-2 px-2">{req.details}</td>
                      <td className="py-2 px-2">
                        <Badge variant={STATUS_BADGE_VARIANT[req.status] ?? 'neutral'}>
                          {APPROVAL_STATUS_LABELS[req.status] ?? req.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">{dateStr ? formatDateAr(dateStr.toISOString().slice(0, 10)) : '—'}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          {(req.approvalChain as ApprovalChainItem[]).map((item, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              title={item.notes || undefined}
                            >
                              مستوى {item.level}: {APPROVAL_STATUS_LABELS[item.status] ?? item.status}
                            </span>
                          ))}
                          {(!req.approvalChain || req.approvalChain.length === 0) && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
