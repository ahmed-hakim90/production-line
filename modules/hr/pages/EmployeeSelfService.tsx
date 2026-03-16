import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import { attendanceProcessingService } from '@/modules/attendance/services/attendanceProcessingService';
import { leaveRequestService, leaveBalanceService, getEmployeeLeaveUsageSummary } from '../leaveService';
import { getLeaveTypesFromConfig, leaveTypeMapByKey, type LeaveTypeDefinition } from '../leaveTypes';
import { loanService } from '../loanService';
import { createRequest, getPendingApprovals, type ApprovalEmployeeInfo, type FirestoreApprovalRequest } from '../approval';
import { getEmployeeLockedPayslip } from '../payroll';
import { printPayslip } from '../utils/payslipGenerator';
import type { FirestorePayrollRecord } from '../payroll';
import type {
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  FirestoreEmployeeLoan,
  LeaveType,
  ApprovalChainItem,
  JobLevel,
} from '../types';
import type { AttendanceRecord } from '@/modules/attendance/types';
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

function formatPayrollMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  return new Date(year, mon - 1, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
  });
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

function toApprovalEmployeeInfo(e: FirestoreEmployee): ApprovalEmployeeInfo {
  const level = e.level as number;
  const jobLevel = Math.min(4, Math.max(1, level)) as JobLevel;
  const departmentId = e.departmentId || 'unknown_department';
  const jobPositionId = e.jobPositionId || 'unknown_position';
  return {
    employeeId: e.id!,
    employeeName: e.name,
    managerId: e.managerId,
    departmentId,
    departmentName: departmentId,
    jobPositionId,
    jobTitle: jobPositionId,
    jobLevel,
  };
}

export const EmployeeSelfService: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const uid = useAppStore((s) => s.uid);
  const permissions = useAppStore((s) => s.userPermissions);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);

  const canViewApprovals = can('approval.view');
  const [activeTab, setActiveTab] = useState<SelfServiceTab>(canViewApprovals ? 'approvals' : 'attendance');
  const [loading, setLoading] = useState(true);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<FirestoreLeaveRequest[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<FirestoreLeaveBalance | null>(null);
  const [leaveUsageSummary, setLeaveUsageSummary] = useState<Awaited<ReturnType<typeof getEmployeeLeaveUsageSummary>> | null>(null);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [managerPendingApprovals, setManagerPendingApprovals] = useState<FirestoreApprovalRequest[]>([]);
  const [lockedPayslip, setLockedPayslip] = useState<{ month: string; record: FirestorePayrollRecord } | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDefinition[]>([]);

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
  const leaveTypeByKey = useMemo(() => leaveTypeMapByKey(leaveTypes), [leaveTypes]);
  const selectedLeaveType = leaveTypeByKey[leaveType];

  const employeeId = currentEmployee?.id ?? '';

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await fetchEmployees?.();
      try {
        const [logs, leaveReqs, balance, loanList, payslipResult, configuredLeaveTypes, pendingApprovals] = await Promise.all([
          attendanceProcessingService.getRecordsByEmployee(employeeId),
          leaveRequestService.getByEmployee(employeeId),
          leaveBalanceService.getByEmployee(employeeId).then((b) => b ?? leaveBalanceService.getOrCreate(employeeId)),
          loanService.getByEmployee(employeeId),
          getEmployeeLockedPayslip(employeeId),
          getLeaveTypesFromConfig(),
          canViewApprovals ? getPendingApprovals({ approverEmployeeId: employeeId }) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setAttendanceLogs(logs);
          setLeaveRequests(leaveReqs);
          setLeaveBalance(balance);
          const usage = await getEmployeeLeaveUsageSummary(employeeId, {
            approvedRequests: leaveReqs,
            leaveBalance: balance,
          });
          if (!cancelled) setLeaveUsageSummary(usage);
          setLoans(loanList);
          setManagerPendingApprovals(pendingApprovals);
          setLockedPayslip(
            payslipResult
              ? { month: payslipResult.month.month, record: payslipResult.record }
              : null,
          );
          setLeaveTypes(configuredLeaveTypes);
          setLeaveType((prev) =>
            configuredLeaveTypes.find((row) => row.key === prev)
              ? prev
              : (configuredLeaveTypes[0]?.key || 'annual'),
          );
        }
      } catch (err) {
        console.error('Employee self-service load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId, fetchEmployees, canViewApprovals]);

  const attendanceStats = useMemo(() => {
    const total = attendanceLogs.length;
    const present = attendanceLogs.filter((l) => l.status !== 'absent').length;
    const absent = attendanceLogs.filter((l) => l.status === 'absent').length;
    const late = attendanceLogs.filter((l) => l.lateMinutes > 0).length;
    return { total, present, absent, late };
  }, [attendanceLogs]);

  const recentAttendance = useMemo(() => attendanceLogs.slice(0, 30), [attendanceLogs]);

  const allRequests = useMemo(() => {
    const leaveItems = leaveRequests.map((r) => ({
      type: 'leave' as const,
      id: r.id!,
      date: r.createdAt,
      details: `${leaveTypeByKey[r.leaveType]?.label || r.leaveTypeLabel || LEAVE_TYPE_LABELS[r.leaveType] || r.leaveType} — ${r.totalDays} يوم`,
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
  }, [leaveRequests, loans, leaveTypeByKey]);

  const canAccessPayroll = can('payroll.view');
  const handlePrintLockedPayslip = () => {
    if (!lockedPayslip) return;
    printPayslip({
      record: lockedPayslip.record,
      month: lockedPayslip.month,
    });
  };

  if (!currentEmployee || !currentEmployee.hasSystemAccess) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6">
        <span className="material-icons-round text-6xl text-[var(--color-text-muted)]">lock</span>
        <h2 className="text-xl font-bold text-[var(--color-text)]">غير مصرح بالوصول</h2>
        <p className="text-[var(--color-text-muted)] text-center max-w-md">
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
      const leaveRequestId = await leaveRequestService.create({
        employeeId,
        leaveType,
        leaveTypeLabel: selectedLeaveType?.label || LEAVE_TYPE_LABELS[leaveType] || leaveType,
        leaveTypeIsPaid: selectedLeaveType ? selectedLeaveType.isPaid : leaveType !== 'unpaid',
        startDate,
        endDate,
        totalDays,
        affectsSalary: selectedLeaveType ? !selectedLeaveType.isPaid : leaveType === 'unpaid',
        status: 'pending',
        approvalChain: [],
        finalStatus: 'pending',
        reason: reason.trim() || '—',
        createdBy: uid,
      });
      const requester = allEmployees.find((e) => e.id === employeeId);
      if (!requester) {
        throw new Error('لم يتم العثور على بيانات الموظف لربط الطلب بالموافقات');
      }
      const approvalEmployees = allEmployees
        .filter((e): e is FirestoreEmployee => Boolean(e.id))
        .map((e) => toApprovalEmployeeInfo(e));
      const createResult = await createRequest(
        {
          requestType: 'leave',
          employeeId,
          requestData: {
            leaveType,
            leaveTypeLabel: selectedLeaveType?.label || LEAVE_TYPE_LABELS[leaveType] || leaveType,
            leaveTypeIsPaid: selectedLeaveType ? selectedLeaveType.isPaid : leaveType !== 'unpaid',
            startDate,
            endDate,
            totalDays,
            affectsSalary: selectedLeaveType ? !selectedLeaveType.isPaid : leaveType === 'unpaid',
            reason: reason.trim() || '—',
          },
          sourceRequestId: leaveRequestId,
          createdBy: uid,
        },
        {
          employeeId: currentEmployee.id || requester.id || employeeId,
          employeeName: currentEmployee.name || requester.name,
          permissions,
        },
        approvalEmployees,
      );
      if (!createResult.success) {
        await leaveRequestService.delete(leaveRequestId);
        throw new Error(createResult.error || 'تعذر إنشاء طلب الموافقة');
      }
      setLeaveSubmitSuccess(true);
      setStartDate('');
      setEndDate('');
      setReason('');
      const updated = await leaveRequestService.getByEmployee(employeeId);
      setLeaveRequests(updated);
      const balance = await leaveBalanceService.getByEmployee(employeeId) ?? await leaveBalanceService.getOrCreate(employeeId);
      setLeaveBalance(balance);
      const usage = await getEmployeeLeaveUsageSummary(employeeId, {
        approvedRequests: updated,
        leaveBalance: balance,
      });
      setLeaveUsageSummary(usage);
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
      if (!employee) {
        setLoanSubmitError('لم يتم العثور على بيانات الموظف');
        return;
      }
      const allEmployees = rawEmployees.length ? rawEmployees : await (await import('../employeeService')).employeeService.getAll();
      const finalInstallments = totalInstallments > 0 ? totalInstallments : Math.max(1, Math.round(loanAmount / installmentAmount));
      const startMonth = new Date().toISOString().slice(0, 7);
      const loanId = await loanService.create({
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
        approvalChain: [],
        finalStatus: 'pending',
        reason: loanReason.trim() || '—',
        disbursed: false,
        createdBy: uid,
      });
      const approvalEmployees = allEmployees
        .filter((e): e is FirestoreEmployee => Boolean(e.id))
        .map((e) => toApprovalEmployeeInfo(e));
      const createResult = await createRequest(
        {
          requestType: 'loan',
          employeeId,
          requestData: {
            loanType: finalInstallments > 1 ? 'installment' : 'monthly_advance',
            loanAmount,
            installmentAmount,
            totalInstallments: finalInstallments,
            remainingInstallments: finalInstallments,
            startMonth,
            month: finalInstallments <= 1 ? startMonth : undefined,
            reason: loanReason.trim() || '—',
          },
          sourceRequestId: loanId,
          createdBy: uid,
        },
        {
          employeeId: employee.id || employeeId,
          employeeName: employee.name || '',
          permissions,
        },
        approvalEmployees,
      );
      if (!createResult.success) {
        await loanService.delete(loanId);
        throw new Error(createResult.error || 'تعذر إنشاء طلب الموافقة');
      }
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
    ...(canViewApprovals ? [{ id: 'approvals' as SelfServiceTab, label: 'موافقاتي', icon: 'fact_check' }] : []),
    { id: 'attendance', label: 'الحضور', icon: 'fingerprint' },
    { id: 'leave', label: 'طلب إجازة', icon: 'beach_access' },
    { id: 'loan', label: 'طلب سلفة', icon: 'payments' },
    { id: 'payroll', label: 'الرواتب', icon: 'receipt_long' },
    { id: 'requests', label: 'طلباتي', icon: 'list_alt' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">الخدمة الذاتية</h1>
        <p className="text-[var(--color-text-muted)] mt-1">مرحباً، {currentEmployee.name}</p>
      </header>

      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-[#f0f2f5] text-[var(--color-text)] hover:bg-[#e8eaed]'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-8 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-[#f0f2f5] rounded w-full mb-2" />
          <div className="h-4 bg-[#f0f2f5] rounded w-4/5" />
        </div>
      )}

      {!loading && activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-[var(--color-text-muted)] text-xs font-medium mb-1">إجمالي الأيام</p>
              <p className="text-xl font-bold">{formatNumber(attendanceStats.total)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[var(--color-text-muted)] text-xs font-medium mb-1">حاضر</p>
              <p className="text-xl font-bold text-emerald-600">{formatNumber(attendanceStats.present)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[var(--color-text-muted)] text-xs font-medium mb-1">غائب</p>
              <p className="text-xl font-bold text-rose-600">{formatNumber(attendanceStats.absent)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[var(--color-text-muted)] text-xs font-medium mb-1">متأخر</p>
              <p className="text-xl font-bold text-amber-600">{formatNumber(attendanceStats.late)}</p>
            </Card>
          </div>
          <Card title="سجل الحضور الأخير">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">التاريخ</th>
                    <th className="erp-th">دخول</th>
                    <th className="erp-th">خروج</th>
                    <th className="erp-th">الساعات</th>
                    <th className="erp-th">دقائق تأخر</th>
                    <th className="erp-th">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttendance.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--color-text-muted)]">
                        لا توجد سجلات حضور
                      </td>
                    </tr>
                  )}
                  {recentAttendance.map((log) => (
                    <tr key={log.id} className="border-b border-[var(--color-border)]">
                      <td className="py-2 px-2">{formatDateAr(log.date)}</td>
                      <td className="py-2 px-2">{formatTime(log.checkIn)}</td>
                      <td className="py-2 px-2">{formatTime(log.checkOut)}</td>
                        <td className="py-2 px-2">{formatNumber((log.workedMinutes || 0) / 60)}</td>
                      <td className="py-2 px-2">{formatNumber(log.lateMinutes)}</td>
                      <td className="py-2 px-2">
                        {log.status === 'absent' ? (
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

      {!loading && activeTab === 'approvals' && canViewApprovals && (
        <Card title="طلبات بانتظار إجراءك">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8fafc] p-4">
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  لديك {formatNumber(managerPendingApprovals.length)} طلب بانتظار اعتمادك
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  عرض مختصر هنا — المتابعة الكاملة داخل مركز الموافقات
                </p>
              </div>
              <Button onClick={() => navigate('/approval-center')}>
                <span className="material-icons-round text-sm">open_in_new</span>
                فتح مركز الموافقات
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">النوع</th>
                    <th className="erp-th">الموظف</th>
                    <th className="erp-th">التفاصيل</th>
                    <th className="erp-th">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {managerPendingApprovals.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">
                        لا توجد طلبات بانتظار إجراءك حالياً
                      </td>
                    </tr>
                  )}
                  {managerPendingApprovals.slice(0, 12).map((req) => (
                    <tr key={req.id} className="border-b border-[var(--color-border)]">
                      <td className="py-2 px-2">
                        {req.requestType === 'leave' ? 'إجازة' : req.requestType === 'loan' ? 'سلفة' : 'إضافي'}
                      </td>
                      <td className="py-2 px-2">{req.employeeName}</td>
                      <td className="py-2 px-2 text-[var(--color-text-muted)]">
                        {req.requestType === 'leave'
                          ? `${req.requestData?.startDate || '—'} → ${req.requestData?.endDate || '—'}`
                          : req.requestType === 'loan'
                            ? `${formatNumber(Number(req.requestData?.loanAmount || 0))} ج.م`
                            : (req.requestData?.description || '—')}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="warning">بانتظار الإجراء</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {!loading && activeTab === 'leave' && (
        <div className="space-y-6">
          {leaveBalance && (
            <Card title="رصيد الإجازات (المستخدم والمتاح)">
              <div className="overflow-x-auto rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                <table className="w-full text-sm text-right">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">الرصيد الأساسي</th>
                      <th className="erp-th">المستخدم</th>
                      <th className="erp-th">المتاح</th>
                      <th className="erp-th">آخر استخدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leaveUsageSummary?.perType ?? []).map((row) => (
                      <tr key={row.leaveType} className="border-t border-[var(--color-border)]">
                        <td className="p-3 font-bold">{row.label}</td>
                        <td className="p-3">{row.defaultDays == null ? 'غير محدود' : `${formatNumber(row.defaultDays)} يوم`}</td>
                        <td className="p-3 text-amber-600 font-bold">{formatNumber(row.usedDays)} يوم</td>
                        <td className="p-3 text-emerald-600 font-bold">
                          {row.leaveType === 'unpaid' ? 'غير محدود' : `${formatNumber(row.availableDays)} يوم`}
                        </td>
                        <td className="p-3">{row.lastUsedDate ? formatDateAr(row.lastUsedDate) : '—'}</td>
                      </tr>
                    ))}
                    {(leaveUsageSummary?.perType ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-[var(--color-text-muted)]">
                          لا توجد بيانات إجازات
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-[var(--color-text-muted)]">
                آخر استخدام:{' '}
                {leaveUsageSummary?.lastUsedLeave
                  ? `${leaveTypeByKey[leaveUsageSummary.lastUsedLeave.leaveType]?.label || LEAVE_TYPE_LABELS[leaveUsageSummary.lastUsedLeave.leaveType] || leaveUsageSummary.lastUsedLeave.leaveType} - ${formatDateAr(leaveUsageSummary.lastUsedLeave.date)} (${formatNumber(leaveUsageSummary.lastUsedLeave.totalDays)} يوم)`
                  : 'لا يوجد استخدام معتمد حتى الآن'}
              </div>
            </Card>
          )}
          <Card title="طلب إجازة جديد">
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-bold text-[var(--color-text)] mb-1">نوع الإجازة</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]"
                >
                  {(leaveTypes.length
                    ? leaveTypes
                    : Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => ({ key, label, isPaid: key !== 'unpaid' }))
                  ).map((row) => (
                    <option key={row.key} value={row.key}>{row.label}</option>
                  ))}
                </select>
              </div>
              <p className={`text-xs ${selectedLeaveType?.isPaid === false ? 'text-rose-600' : 'text-emerald-600'}`}>
                {selectedLeaveType?.isPaid === false ? 'هذه الإجازة غير مدفوعة وسيتم خصمها من الراتب.' : 'هذه الإجازة مدفوعة ولا ينتج عنها خصم راتب.'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--color-text)] mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--color-text)] mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]"
                  />
                </div>
              </div>
              {totalDays > 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">عدد الأيام: <strong>{formatNumber(totalDays)}</strong></p>
              )}
              <div>
                <label className="block text-sm font-bold text-[var(--color-text)] mb-1">السبب (اختياري)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] resize-none"
                  placeholder="سبب طلب الإجازة"
                />
              </div>
              {leaveSubmitError && (
                <p className="text-sm text-rose-600">{leaveSubmitError}</p>
              )}
              {leaveSubmitSuccess && (
                <p className="text-sm text-emerald-600">تم إرسال طلب الإجازة بنجاح.</p>
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
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">المبلغ</th>
                      <th className="erp-th">القسط</th>
                      <th className="erp-th">الأقساط</th>
                      <th className="erp-th">الشهر</th>
                      <th className="erp-th">الحالة</th>
                      <th className="erp-th">الصرف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id} className={`border-t border-[var(--color-border)] ${loan.disbursed ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
                        <td className="p-3 text-xs font-bold">
                          {(loan.loanType || 'installment') === 'monthly_advance' ? 'شهرية' : 'مقسطة'}
                        </td>
                        <td className="erp-th">{formatNumber(loan.loanAmount)} ج.م</td>
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
                <label className="block text-sm font-bold text-[var(--color-text)] mb-1">مبلغ السلفة (ج.م)</label>
                <input
                  type="number"
                  min={1}
                  value={loanAmount || ''}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    setLoanAmount(isNaN(v) ? 0 : v);
                    if (installmentAmount > 0 && !isNaN(v) && v > 0) setTotalInstallments(Math.max(1, Math.round(v / installmentAmount)));
                  }}
                  className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--color-text)] mb-1">قيمة القسط (ج.م)</label>
                <input
                  type="number"
                  min={1}
                  value={installmentAmount || ''}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    setInstallmentAmount(isNaN(v) ? 0 : v);
                    if (loanAmount > 0 && !isNaN(v) && v > 0) setTotalInstallments(Math.max(1, Math.round(loanAmount / v)));
                  }}
                  className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]"
                />
              </div>
              {loanAmount > 0 && installmentAmount > 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  عدد الأقساط: <strong>{formatNumber(totalInstallments > 0 ? totalInstallments : Math.max(1, Math.round(loanAmount / installmentAmount)))}</strong>
                </p>
              )}
              <div>
                <label className="block text-sm font-bold text-[var(--color-text)] mb-1">السبب (اختياري)</label>
                <textarea
                  value={loanReason}
                  onChange={(e) => setLoanReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] resize-none"
                  placeholder="سبب طلب السلفة"
                />
              </div>
              {loanSubmitError && (
                <p className="text-sm text-rose-600">{loanSubmitError}</p>
              )}
              {loanSubmitSuccess && (
                <p className="text-sm text-emerald-600">تم إرسال طلب السلفة بنجاح.</p>
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
                <p className="text-[var(--color-text-muted)] text-sm font-medium">الراتب الأساسي</p>
                <p className="text-lg font-bold">{formatNumber(currentEmployee.baseSalary)} ج.م</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)] text-sm font-medium">أجر الساعة</p>
                <p className="text-lg font-bold">{formatNumber(currentEmployee.hourlyRate)} ج.م</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)] text-sm font-medium">نوع التوظيف</p>
                <p className="text-lg font-bold">{EMPLOYMENT_TYPE_LABELS[currentEmployee.employmentType]}</p>
              </div>
            </div>
            {lockedPayslip ? (
              <div className="rounded-[var(--border-radius-base)] border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">سركي الراتب المتاح</p>
                    <p className="text-xs text-emerald-700">
                      {formatPayrollMonthLabel(lockedPayslip.month)} (شهر مقفول)
                    </p>
                  </div>
                  <Button onClick={handlePrintLockedPayslip}>
                    <span className="material-icons-round text-sm">print</span>
                    طباعة السركي
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[var(--color-text-muted)]">إجمالي المستحقات</p>
                    <p className="font-bold">{formatNumber(lockedPayslip.record.grossSalary)} ج.م</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-muted)]">إجمالي الاستقطاعات</p>
                    <p className="font-bold">{formatNumber(lockedPayslip.record.totalDeductions)} ج.م</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-muted)]">صافي الراتب</p>
                    <p className="font-bold text-primary">{formatNumber(lockedPayslip.record.netSalary)} ج.م</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-muted)]">الحضور / الغياب</p>
                    <p className="font-bold">
                      {formatNumber(lockedPayslip.record.presentDays)} / {formatNumber(lockedPayslip.record.absentDays)} يوم
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-[var(--border-radius-base)] p-3">
                لا يتوفر سركي راتب الآن. سيظهر بعد قفل كشف الرواتب.
              </p>
            )}
            {canAccessPayroll && (
              <p className="text-[var(--color-text-muted)]">
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
              <p className="text-[var(--color-text-muted)] text-sm">
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
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">التفاصيل</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">التاريخ</th>
                  <th className="erp-th">سلسلة الموافقة</th>
                </tr>
              </thead>
              <tbody>
                {allRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                      لا توجد طلبات
                    </td>
                  </tr>
                )}
                {allRequests.map((req) => {
                  const dateStr = req.date
                    ? (req.date.toDate ? req.date.toDate() : new Date((req.date as any)?.seconds ? (req.date as any).seconds * 1000 : req.date))
                    : null;
                  return (
                    <tr key={`${req.type}-${req.id}`} className="border-b border-[var(--color-border)]">
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
                              className="text-xs px-2 py-0.5 rounded bg-[#f0f2f5] text-[var(--color-text-muted)]"
                              title={item.notes || undefined}
                            >
                              مستوى {item.level}: {APPROVAL_STATUS_LABELS[item.status] ?? item.status}
                            </span>
                          ))}
                          {(!req.approvalChain || req.approvalChain.length === 0) && <span className="text-[var(--color-text-muted)]">—</span>}
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
