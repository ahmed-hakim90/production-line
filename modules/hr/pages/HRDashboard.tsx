import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, KPIBox, LoadingSkeleton, Badge, Button, SearchableSelect } from '../components/UI';
import { getDocs } from 'firebase/firestore';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '../employeeService';
import { attendanceLogService } from '../attendanceService';
import { leaveRequestService } from '../leaveService';
import { loanService } from '../loanService';
import { departmentsRef, allowanceTypesRef } from '../collections';
import { employeeAllowanceService, employeeDeductionService } from '../employeeFinancialsService';
import { getPayrollMonth } from '../payroll';
import { formatNumber, formatCurrency } from '@/utils/calculations';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreAttendanceLog,
  FirestoreLeaveRequest,
  FirestoreEmployeeLoan,
  FirestoreDepartment,
  FirestoreAllowanceType,
} from '../types';
import { LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS } from '../types';

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  approved: 'مُعتمد',
  rejected: 'مرفوض',
  active: 'نشط',
  closed: 'مُقفل',
};

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  active: 'success',
  closed: 'neutral',
};

export const HRDashboard: React.FC = () => {
  const navigate = useNavigate();
  const uid = useAppStore((s) => s.uid);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [attendance, setAttendance] = useState<FirestoreAttendanceLog[]>([]);
  const [leaves, setLeaves] = useState<FirestoreLeaveRequest[]>([]);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<FirestoreAllowanceType[]>([]);
  const [payrollStatus, setPayrollStatus] = useState<string | null>(null);

  // Quick Action state
  const [qaOpen, setQaOpen] = useState<'' | 'loan' | 'leave' | 'allowance' | 'penalty'>('');
  const [qaEmpId, setQaEmpId] = useState('');
  const [qaEmpIds, setQaEmpIds] = useState<string[]>([]);
  const [qaSaving, setQaSaving] = useState(false);
  const [qaLoanAmount, setQaLoanAmount] = useState(0);
  const [qaLoanInstallment, setQaLoanInstallment] = useState(0);
  const [qaLoanMonths, setQaLoanMonths] = useState(1);
  const [qaLoanType, setQaLoanType] = useState<'monthly_advance' | 'installment'>('monthly_advance');
  const [qaLeaveType, setQaLeaveType] = useState<'annual' | 'sick' | 'unpaid' | 'emergency'>('annual');
  const [qaLeaveStart, setQaLeaveStart] = useState('');
  const [qaLeaveEnd, setQaLeaveEnd] = useState('');
  const [qaLeaveReason, setQaLeaveReason] = useState('');
  const [qaAllowTypeId, setQaAllowTypeId] = useState('');
  const [qaAllowAmount, setQaAllowAmount] = useState(0);
  const [qaAllowRecurring, setQaAllowRecurring] = useState(false);
  const [qaPenaltyName, setQaPenaltyName] = useState('');
  const [qaPenaltyAmount, setQaPenaltyAmount] = useState(0);
  const [qaPenaltyReason, setQaPenaltyReason] = useState('');
  const [qaPenaltyCategory, setQaPenaltyCategory] = useState<'disciplinary' | 'manual' | 'other'>('disciplinary');

  // Staging — items waiting to be saved (batch)
  type QaStagedItem = {
    type: 'loan' | 'leave' | 'allowance' | 'penalty';
    empId: string; empName: string; empCode: string;
    detail: string; amount: number;
    // Loan-specific
    loanType?: 'monthly_advance' | 'installment';
    loanAmount?: number; installmentAmount?: number; totalInstallments?: number;
    // Leave-specific
    leaveType?: string; startDate?: string; endDate?: string; totalDays?: number; reason?: string;
    // Allowance-specific
    allowanceTypeId?: string; allowanceTypeName?: string; isRecurring?: boolean;
    // Penalty-specific
    penaltyName?: string; penaltyCategory?: string; penaltyReason?: string;
  };
  const [qaStaged, setQaStaged] = useState<QaStagedItem[]>([]);
  const [qaSaveProgress, setQaSaveProgress] = useState({ done: 0, total: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = getToday();
    const monthStart = getMonthStart();
    try {
      const [emps, depts, att, lvs, lns, allTypes, pm] = await Promise.all([
        employeeService.getAll(),
        getDocs(departmentsRef()).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreDepartment)),
        attendanceLogService.getByDateRange(monthStart, today),
        leaveRequestService.getAll(),
        loanService.getAll(),
        getDocs(allowanceTypesRef()).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreAllowanceType)),
        getPayrollMonth(getMonthKey()).catch(() => null),
      ]);
      setEmployees(emps);
      setDepartments(depts);
      setAttendance(att);
      setLeaves(lvs);
      setLoans(lns);
      setAllowanceTypes(allTypes.filter((a) => a.isActive));
      setPayrollStatus(pm?.status ?? null);
    } catch (err) {
      console.error('HR Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const empOptions = useMemo(() =>
    employees.filter((e) => e.isActive).map((e) => ({
      value: e.id!,
      label: `${e.code ? e.code + ' — ' : ''}${e.name}`,
    })),
    [employees],
  );

  const getEmpObj = useCallback((id: string) => employees.find((e) => e.id === id), [employees]);

  const resetQa = () => {
    setQaEmpId(''); setQaEmpIds([]);
    setQaLoanAmount(0); setQaLoanInstallment(0); setQaLoanMonths(1); setQaLoanType('monthly_advance');
    setQaLeaveType('annual'); setQaLeaveStart(''); setQaLeaveEnd(''); setQaLeaveReason('');
    setQaAllowTypeId(''); setQaAllowAmount(0); setQaAllowRecurring(false);
    setQaPenaltyName(''); setQaPenaltyAmount(0); setQaPenaltyReason(''); setQaPenaltyCategory('disciplinary');
  };

  const addEmpToList = (id: string) => {
    if (id && !qaEmpIds.includes(id)) setQaEmpIds((prev) => [...prev, id]);
  };
  const removeEmpFromList = (id: string) => {
    setQaEmpIds((prev) => prev.filter((x) => x !== id));
  };

  // Stage handlers — add to local table without saving
  const stageQaLoan = () => {
    if (!qaEmpId || qaLoanAmount <= 0) return;
    const emp = getEmpObj(qaEmpId);
    const finalMonths = qaLoanType === 'monthly_advance' ? 1 : qaLoanMonths;
    const finalInstallment = qaLoanType === 'monthly_advance' ? qaLoanAmount : qaLoanInstallment;
    setQaStaged((prev) => [...prev, {
      type: 'loan', empId: qaEmpId, empName: emp?.name || '', empCode: (emp as any)?.code || '',
      detail: qaLoanType === 'monthly_advance' ? 'سلفة شهرية' : `سلفة مقسطة (${finalMonths} شهر)`,
      amount: qaLoanAmount,
      loanType: qaLoanType, loanAmount: qaLoanAmount,
      installmentAmount: finalInstallment, totalInstallments: finalMonths,
    }]);
    setQaEmpId(''); setQaLoanAmount(0); setQaLoanInstallment(0); setQaLoanMonths(1);
  };

  const stageQaLeave = () => {
    if (!qaEmpId || !qaLeaveStart || !qaLeaveEnd) return;
    const emp = getEmpObj(qaEmpId);
    const days = Math.max(1, Math.ceil((new Date(qaLeaveEnd).getTime() - new Date(qaLeaveStart).getTime()) / 86400000) + 1);
    setQaStaged((prev) => [...prev, {
      type: 'leave', empId: qaEmpId, empName: emp?.name || '', empCode: (emp as any)?.code || '',
      detail: `${LEAVE_TYPE_LABELS[qaLeaveType]} (${days} يوم)`, amount: 0,
      leaveType: qaLeaveType, startDate: qaLeaveStart, endDate: qaLeaveEnd,
      totalDays: days, reason: qaLeaveReason.trim() || '—',
    }]);
    setQaEmpId(''); setQaLeaveStart(''); setQaLeaveEnd(''); setQaLeaveReason('');
  };

  const selectedQaAllowType = useMemo(
    () => allowanceTypes.find((a) => a.id === qaAllowTypeId) || null,
    [allowanceTypes, qaAllowTypeId],
  );

  const resolveAllowAmountForEmp = useCallback((empId: string) => {
    if (!selectedQaAllowType) return qaAllowAmount;
    if (selectedQaAllowType.calculationType === 'percentage') {
      const emp = employees.find((e) => e.id === empId);
      return Math.round(((emp?.baseSalary || 0) * selectedQaAllowType.value) / 100 * 100) / 100;
    }
    return qaAllowAmount;
  }, [selectedQaAllowType, qaAllowAmount, employees]);

  const stageQaAllowance = () => {
    if (qaEmpIds.length === 0 || !qaAllowTypeId) return;
    const allowType = allowanceTypes.find((a) => a.id === qaAllowTypeId);
    for (const eid of qaEmpIds) {
      const amount = resolveAllowAmountForEmp(eid);
      if (amount <= 0) continue;
      const emp = getEmpObj(eid);
      setQaStaged((prev) => [...prev, {
        type: 'allowance', empId: eid, empName: emp?.name || '', empCode: (emp as any)?.code || '',
        detail: `بدل: ${allowType?.name || ''}`, amount,
        allowanceTypeId: qaAllowTypeId, allowanceTypeName: allowType?.name || '',
        isRecurring: qaAllowRecurring,
      }]);
    }
    setQaEmpIds([]); setQaAllowTypeId(''); setQaAllowAmount(0); setQaAllowRecurring(false);
  };

  const stageQaPenalty = () => {
    if (!qaEmpId || !qaPenaltyName.trim() || qaPenaltyAmount <= 0) return;
    const emp = getEmpObj(qaEmpId);
    setQaStaged((prev) => [...prev, {
      type: 'penalty', empId: qaEmpId, empName: emp?.name || '', empCode: (emp as any)?.code || '',
      detail: `جزاء: ${qaPenaltyName.trim()}`, amount: qaPenaltyAmount,
      penaltyName: qaPenaltyName.trim(), penaltyCategory: qaPenaltyCategory,
      penaltyReason: qaPenaltyReason.trim() || '—',
    }]);
    setQaEmpId(''); setQaPenaltyName(''); setQaPenaltyAmount(0); setQaPenaltyReason('');
  };

  const removeStagedItem = (index: number) => {
    setQaStaged((prev) => prev.filter((_, i) => i !== index));
  };

  // Batch save — saves all staged items at once
  const handleSaveAllStaged = async () => {
    if (qaStaged.length === 0) return;
    setQaSaving(true);
    setQaSaveProgress({ done: 0, total: qaStaged.length });
    let done = 0;

    for (const item of qaStaged) {
      try {
        if (item.type === 'loan') {
          await loanService.create({
            employeeId: item.empId, employeeName: item.empName, employeeCode: item.empCode,
            loanType: item.loanType!, loanAmount: item.loanAmount!,
            installmentAmount: item.installmentAmount!, totalInstallments: item.totalInstallments!,
            remainingInstallments: item.totalInstallments!,
            startMonth: getMonthKey(),
            month: item.loanType === 'monthly_advance' ? getMonthKey() : undefined,
            status: 'active', approvalChain: [], finalStatus: 'approved',
            reason: '—', disbursed: false, createdBy: uid || '',
          });
        } else if (item.type === 'leave') {
          await leaveRequestService.create({
            employeeId: item.empId, leaveType: item.leaveType as any,
            startDate: item.startDate!, endDate: item.endDate!, totalDays: item.totalDays!,
            affectsSalary: item.leaveType !== 'unpaid',
            status: 'pending', approvalChain: [], finalStatus: 'pending',
            reason: item.reason || '—', createdBy: uid || '',
          });
        } else if (item.type === 'allowance') {
          await employeeAllowanceService.create({
            employeeId: item.empId, allowanceTypeId: item.allowanceTypeId!,
            allowanceTypeName: item.allowanceTypeName!, amount: item.amount,
            isRecurring: item.isRecurring ?? false,
            startMonth: getMonthKey(), endMonth: null,
            status: 'active', createdBy: uid || '',
          });
        } else if (item.type === 'penalty') {
          await employeeDeductionService.create({
            employeeId: item.empId, deductionTypeId: `penalty_${Date.now()}_${done}`,
            deductionTypeName: item.penaltyName!, amount: item.amount,
            isRecurring: false, startMonth: getMonthKey(), endMonth: null,
            reason: item.penaltyReason || '—', category: item.penaltyCategory as any || 'disciplinary',
            status: 'active', createdBy: uid || '',
          });
        }
      } catch (err) { console.error('Save error:', err); }
      done++;
      setQaSaveProgress({ done, total: qaStaged.length });
    }

    await fetchData();
    setQaSaving(false);
    setQaStaged([]);
    setQaOpen('');
    resetQa();
  };

  // ── Computed data ──────────────────────────────────────────────────────────

  const empKpis = useMemo(() => {
    const active = employees.filter((e) => e.isActive);
    const inactive = employees.filter((e) => !e.isActive);
    const byType: Record<string, number> = {};
    active.forEach((e) => { byType[e.employmentType] = (byType[e.employmentType] || 0) + 1; });
    const totalSalary = active.reduce((s, e) => s + (e.baseSalary || 0), 0);
    return { total: employees.length, active: active.length, inactive: inactive.length, byType, totalSalary };
  }, [employees]);

  const deptBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    departments.forEach((d) => map.set(d.id!, { name: d.name, count: 0 }));
    employees.filter((e) => e.isActive).forEach((e) => {
      const entry = map.get(e.departmentId);
      if (entry) entry.count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [employees, departments]);

  const attKpis = useMemo(() => {
    const today = getToday();
    const todayLogs = attendance.filter((a) => a.date === today);
    const present = todayLogs.filter((a) => !a.isAbsent && !a.isWeeklyOff).length;
    const absent = todayLogs.filter((a) => a.isAbsent).length;
    const late = todayLogs.filter((a) => a.lateMinutes > 0).length;

    const monthLogs = attendance;
    const totalLateMins = monthLogs.reduce((s, a) => s + (a.lateMinutes || 0), 0);
    const workingLogs = monthLogs.filter((a) => !a.isAbsent && !a.isWeeklyOff);
    const avgHours = workingLogs.length > 0
      ? workingLogs.reduce((s, a) => s + (a.totalHours || 0), 0) / workingLogs.length
      : 0;
    const totalAbsences = monthLogs.filter((a) => a.isAbsent).length;

    return { todayPresent: present, todayAbsent: absent, todayLate: late, totalLateMins, avgHours, totalAbsences };
  }, [attendance]);

  const leaveKpis = useMemo(() => {
    const month = getMonthKey();
    const pending = leaves.filter((l) => l.finalStatus === 'pending').length;
    const approvedThisMonth = leaves.filter((l) => l.finalStatus === 'approved' && l.startDate.startsWith(month)).length;
    const totalDaysThisMonth = leaves
      .filter((l) => l.finalStatus === 'approved' && l.startDate.startsWith(month))
      .reduce((s, l) => s + (l.totalDays || 0), 0);
    const byType: Record<string, number> = {};
    leaves.filter((l) => l.finalStatus === 'approved').forEach((l) => {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    });
    return { pending, approvedThisMonth, totalDaysThisMonth, byType };
  }, [leaves]);

  const loanKpis = useMemo(() => {
    const active = loans.filter((l) => l.status === 'active' || l.finalStatus === 'approved');
    const pending = loans.filter((l) => l.finalStatus === 'pending').length;
    const totalAmount = active.reduce((s, l) => s + (l.loanAmount || 0), 0);
    const notDisbursed = active.filter((l) => !l.disbursed).length;
    const advances = loans.filter((l) => l.loanType === 'monthly_advance').length;
    const installments = loans.filter((l) => l.loanType === 'installment').length;
    return { activeCount: active.length, pending, totalAmount, notDisbursed, advances, installments };
  }, [loans]);

  const recentLeaves = useMemo(() => {
    return [...leaves]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);
  }, [leaves]);

  const recentLoans = useMemo(() => {
    return [...loans]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);
  }, [loans]);

  const empTypeLabels: Record<string, string> = {
    full_time: 'دوام كامل',
    part_time: 'دوام جزئي',
    contract: 'عقد مؤقت',
    daily: 'يومي',
  };

  // ── Alert bar items ────────────────────────────────────────────────────────
  const alertItems = useMemo(() => {
    const items: { icon: string; text: string; color: string; path: string }[] = [];

    if (leaveKpis.pending > 0) {
      items.push({
        icon: 'pending_actions',
        text: `${leaveKpis.pending} طلب إجازة بانتظار الموافقة`,
        color: 'amber',
        path: '/leave-requests',
      });
    }
    if (loanKpis.pending > 0) {
      items.push({
        icon: 'hourglass_top',
        text: `${loanKpis.pending} سلفة بانتظار الموافقة`,
        color: 'amber',
        path: '/loan-requests',
      });
    }
    if (loanKpis.notDisbursed > 0) {
      items.push({
        icon: 'payments',
        text: `${loanKpis.notDisbursed} سلفة لم تُصرف بعد`,
        color: 'rose',
        path: '/loan-requests',
      });
    }
    if (payrollStatus === 'draft') {
      items.push({
        icon: 'receipt_long',
        text: 'كشف الرواتب مسودة — لم يُعتمد بعد',
        color: 'orange',
        path: '/payroll',
      });
    }
    if (payrollStatus === null) {
      items.push({
        icon: 'warning',
        text: `لم يتم إعداد كشف رواتب ${getMonthKey()}`,
        color: 'slate',
        path: '/payroll',
      });
    }
    return items;
  }, [leaveKpis, loanKpis, payrollStatus]);

  // ── Quick action buttons ──────────────────────────────────────────────────
  const qaActions = [
    { key: 'loan' as const, label: 'سلفة', icon: 'payments', color: 'violet' },
    { key: 'allowance' as const, label: 'بدل', icon: 'card_giftcard', color: 'emerald' },
    { key: 'penalty' as const, label: 'جزاء', icon: 'gavel', color: 'rose' },
    { key: 'leave' as const, label: 'إجازة', icon: 'beach_access', color: 'sky' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/20 transition-shadow';

  return (
    <div className="space-y-8">

      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER — Title + Search + Quick Action Toolbar
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <span className="material-icons-round text-primary text-3xl">monitoring</span>
              لوحة الموارد البشرية
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              نظرة شاملة — {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Search + Quick Actions toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Action buttons */}
            {qaActions.map((a) => (
              <button
                key={a.key}
                onClick={() => { setQaOpen(qaOpen === a.key ? '' : a.key); resetQa(); setQaStaged([]); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all
                  ${qaOpen === a.key
                    ? `ring-2 ring-${a.color}-400/40 bg-${a.color}-100 dark:bg-${a.color}-900/30 text-${a.color}-700 dark:text-${a.color}-300 border-${a.color}-300 dark:border-${a.color}-700`
                    : `bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-${a.color}-300 hover:text-${a.color}-600`
                  }`}
                title={a.label}
              >
                <span className="material-icons-round text-base">{a.icon}</span>
                <span className="hidden sm:inline">{a.label}</span>
              </button>
            ))}
            {/* Divider */}
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />
            {/* Search */}
            <div className="w-56 sm:w-64">
              <SearchableSelect
                options={empOptions}
                value=""
                onChange={(val) => { if (val) navigate(`/employees/${val}`); }}
                placeholder="بحث بالاسم أو الكود..."
              />
            </div>
          </div>
        </div>

      </div>

      {/* ── Quick Action Dialogs ─────────────────────────────────────────── */}
      {qaOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { if (!qaSaving) { setQaOpen(''); resetQa(); setQaStaged([]); } }}>
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* ── Saving overlay ── */}
            {qaSaving && (
              <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 rounded-2xl flex flex-col items-center justify-center gap-4">
                <span className="material-icons-round text-5xl text-primary animate-spin">sync</span>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-700 dark:text-white mb-2">جاري الحفظ...</p>
                  <p className="text-xs text-slate-400 font-bold">{qaSaveProgress.done} / {qaSaveProgress.total}</p>
                  <div className="w-48 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${qaSaveProgress.total > 0 ? (qaSaveProgress.done / qaSaveProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Dialog Header ── */}
            <div className={`px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between rounded-t-2xl ${
              qaOpen === 'loan' ? 'bg-violet-50 dark:bg-violet-900/20' :
              qaOpen === 'leave' ? 'bg-sky-50 dark:bg-sky-900/20' :
              qaOpen === 'allowance' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
              'bg-rose-50 dark:bg-rose-900/20'
            }`}>
              <h3 className="text-base font-black flex items-center gap-2">
                <span className={`material-icons-round text-lg ${
                  qaOpen === 'loan' ? 'text-violet-600' :
                  qaOpen === 'leave' ? 'text-sky-600' :
                  qaOpen === 'allowance' ? 'text-emerald-600' :
                  'text-rose-600'
                }`}>
                  {qaOpen === 'loan' ? 'payments' : qaOpen === 'leave' ? 'beach_access' : qaOpen === 'allowance' ? 'card_giftcard' : 'gavel'}
                </span>
                {qaOpen === 'loan' ? 'إنشاء سلفة' : qaOpen === 'leave' ? 'إنشاء إجازة' : qaOpen === 'allowance' ? 'ربط بدل بموظفين' : 'إنشاء جزاء'}
                {qaStaged.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-black">{qaStaged.length}</span>
                )}
              </h3>
              <button onClick={() => { if (!qaSaving) { setQaOpen(''); resetQa(); setQaStaged([]); } }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* ── Dialog Body ── */}
            <div className="p-5 space-y-4">

              {/* ─── LOAN — inline form ─── */}
              {qaOpen === 'loan' && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">الموظف</label>
                    <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">النوع</label>
                    <select className={inputCls} value={qaLoanType} onChange={(e) => setQaLoanType(e.target.value as any)}>
                      <option value="monthly_advance">شهرية</option>
                      <option value="installment">مقسطة</option>
                    </select>
                  </div>
                  <div className="w-28 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">المبلغ</label>
                    <input type="number" min={0} className={inputCls} value={qaLoanAmount || ''} onChange={(e) => setQaLoanAmount(Number(e.target.value))} placeholder="0" />
                  </div>
                  {qaLoanType === 'installment' && (
                    <>
                      <div className="w-24 shrink-0">
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">القسط</label>
                        <input type="number" min={0} className={inputCls} value={qaLoanInstallment || ''} onChange={(e) => setQaLoanInstallment(Number(e.target.value))} placeholder="0" />
                      </div>
                      <div className="w-20 shrink-0">
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">الأشهر</label>
                        <input type="number" min={1} className={inputCls} value={qaLoanMonths} onChange={(e) => setQaLoanMonths(Number(e.target.value) || 1)} />
                      </div>
                    </>
                  )}
                  <button
                    onClick={stageQaLoan}
                    disabled={!qaEmpId || qaLoanAmount <= 0}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-icons-round text-lg">add</span>
                  </button>
                </div>
              )}

              {/* ─── LEAVE — inline form ─── */}
              {qaOpen === 'leave' && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">الموظف</label>
                    <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                  </div>
                  <div className="w-28 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">النوع</label>
                    <select className={inputCls} value={qaLeaveType} onChange={(e) => setQaLeaveType(e.target.value as any)}>
                      {(Object.entries(LEAVE_TYPE_LABELS) as [string, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">8&8 </label>
                    <input type="date" className={inputCls} value={qaLeaveStart} onChange={(e) => setQaLeaveStart(e.target.value)} />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">إلى</label>
                    <input type="date" className={inputCls} value={qaLeaveEnd} onChange={(e) => setQaLeaveEnd(e.target.value)} min={qaLeaveStart} />
                  </div>
                  <button
                    onClick={stageQaLeave}
                    disabled={!qaEmpId || !qaLeaveStart || !qaLeaveEnd}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-icons-round text-lg">add</span>
                  </button>
                </div>
              )}

              {/* ─── ALLOWANCE — inline form ─── */}
              {qaOpen === 'allowance' && (
                <>
                  <div className="flex items-end gap-2">
                    <div className="w-40 shrink-0">
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">نوع البدل</label>
                      <select className={inputCls} value={qaAllowTypeId} onChange={(e) => {
                        setQaAllowTypeId(e.target.value);
                        const t = allowanceTypes.find((a) => a.id === e.target.value);
                        if (t && t.calculationType === 'fixed') setQaAllowAmount(t.value);
                      }}>
                        <option value="">— اختر —</option>
                        {allowanceTypes.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    {selectedQaAllowType?.calculationType === 'fixed' && (
                      <div className="w-24 shrink-0">
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">المبلغ</label>
                        <input type="number" min={0} className={inputCls} value={qaAllowAmount || ''} onChange={(e) => setQaAllowAmount(Number(e.target.value))} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">إضافة موظف</label>
                      <SearchableSelect
                        options={empOptions.filter((o) => !qaEmpIds.includes(o.value))}
                        value=""
                        onChange={(val) => { if (val) addEmpToList(val); }}
                        placeholder="ابحث وأضف..."
                      />
                    </div>
                    <label className="shrink-0 flex items-center gap-1.5 cursor-pointer pb-1">
                      <input type="checkbox" checked={qaAllowRecurring} onChange={(e) => setQaAllowRecurring(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                      <span className="text-[11px] font-bold text-slate-500">متكرر</span>
                    </label>
                    <button
                      onClick={stageQaAllowance}
                      disabled={qaEmpIds.length === 0 || !qaAllowTypeId}
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="material-icons-round text-lg">add</span>
                    </button>
                  </div>
                  {qaEmpIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {qaEmpIds.map((eid) => {
                        const emp = getEmpObj(eid);
                        return (
                          <span key={eid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {(emp as any)?.code ? `${(emp as any).code} — ` : ''}{emp?.name || eid}
                            <span className="text-[11px] text-emerald-500">{formatCurrency(resolveAllowAmountForEmp(eid))}</span>
                            <button onClick={() => removeEmpFromList(eid)} className="text-emerald-400 hover:text-rose-500 transition-colors mr-0.5">
                              <span className="material-icons-round text-sm">close</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ─── PENALTY — inline form ─── */}
              {qaOpen === 'penalty' && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">الموظف</label>
                    <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">اسم الجزاء</label>
                    <input className={inputCls} value={qaPenaltyName} onChange={(e) => setQaPenaltyName(e.target.value)} placeholder="إنذار..." />
                  </div>
                  <div className="w-24 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">المبلغ</label>
                    <input type="number" min={0} className={inputCls} value={qaPenaltyAmount || ''} onChange={(e) => setQaPenaltyAmount(Number(e.target.value))} placeholder="0" />
                  </div>
                  <div className="w-28 shrink-0">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">الفئة</label>
                    <select className={inputCls} value={qaPenaltyCategory} onChange={(e) => setQaPenaltyCategory(e.target.value as any)}>
                      <option value="disciplinary">تأديبي</option>
                      <option value="manual">يدوي</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                  <button
                    onClick={stageQaPenalty}
                    disabled={!qaEmpId || !qaPenaltyName.trim() || qaPenaltyAmount <= 0}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-icons-round text-lg">add</span>
                  </button>
                </div>
              )}

              {/* ─── STAGED ITEMS TABLE ─── */}
              {qaStaged.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 text-slate-400 text-[11px]">
                        <th className="text-right py-2 px-3 font-bold">#</th>
                        <th className="text-right py-2 px-3 font-bold">الكود</th>
                        <th className="text-right py-2 px-3 font-bold">الموظف</th>
                        <th className="text-right py-2 px-3 font-bold">التفاصيل</th>
                        <th className="text-right py-2 px-3 font-bold">المبلغ</th>
                        <th className="text-center py-2 px-3 font-bold w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {qaStaged.map((entry, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{i + 1}</td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{entry.empCode || '—'}</td>
                          <td className="py-2 px-3 font-bold text-slate-700 dark:text-slate-200 text-xs">{entry.empName}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{entry.detail}</td>
                          <td className="py-2 px-3 font-mono text-xs font-bold">{entry.amount > 0 ? formatCurrency(entry.amount) : '—'}</td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => removeStagedItem(i)} className="text-slate-300 hover:text-rose-500 transition-colors">
                              <span className="material-icons-round text-base">close</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-500 flex justify-between">
                    <span>{qaStaged.length} عملية جاهزة للحفظ</span>
                    {qaStaged.some((e) => e.amount > 0) && (
                      <span>إجمالي: {formatCurrency(qaStaged.reduce((s, e) => s + e.amount, 0))}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-300 dark:text-slate-600">
                  <span className="material-icons-round text-3xl block mb-1">playlist_add</span>
                  <p className="text-xs font-medium">أدخل البيانات واضغط + لإضافتها للجدول</p>
                </div>
              )}
            </div>

            {/* ── Dialog Footer ── */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => { setQaOpen(''); resetQa(); setQaStaged([]); }} disabled={qaSaving}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleSaveAllStaged} disabled={qaSaving || qaStaged.length === 0}>
                <span className="material-icons-round text-sm">save</span>
                حفظ وإغلاق ({qaStaged.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CRITICAL ALERTS ROW
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/approval-center')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-amber-600 dark:text-amber-400 text-xl">pending_actions</span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{leaveKpis.pending + loanKpis.pending}</p>
          <p className="text-[11px] text-slate-400 font-medium">موافقات معلقة</p>
        </button>
        <button
          onClick={() => navigate('/attendance')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-rose-600 dark:text-rose-400 text-xl">person_off</span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{attKpis.todayAbsent}</p>
          <p className="text-[11px] text-slate-400 font-medium">غياب اليوم</p>
        </button>
        <button
          onClick={() => navigate('/attendance')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-orange-600 dark:text-orange-400 text-xl">schedule</span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{attKpis.todayLate}</p>
          <p className="text-[11px] text-slate-400 font-medium">تأخير اليوم</p>
        </button>
        <button
          onClick={() => navigate('/payroll')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className={`w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center ${
            payrollStatus === 'draft' ? 'bg-orange-100 dark:bg-orange-900/30' :
            payrollStatus === 'finalized' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
            payrollStatus === 'locked' ? 'bg-blue-100 dark:bg-blue-900/30' :
            'bg-slate-100 dark:bg-slate-800'
          }`}>
            <span className={`material-icons-round text-xl ${
              payrollStatus === 'draft' ? 'text-orange-600 dark:text-orange-400' :
              payrollStatus === 'finalized' ? 'text-emerald-600 dark:text-emerald-400' :
              payrollStatus === 'locked' ? 'text-blue-600 dark:text-blue-400' :
              'text-slate-400'
            }`}>receipt_long</span>
          </div>
          <p className="text-sm font-black text-slate-800 dark:text-white">
            {payrollStatus === 'draft' ? 'مسودة' :
             payrollStatus === 'finalized' ? 'مُعتمد' :
             payrollStatus === 'locked' ? 'مقفل' : 'لم يُعد'}
          </p>
          <p className="text-[11px] text-slate-400 font-medium">كشف الرواتب</p>
        </button>
      </div>

      {/* ── Alert Bar ─────────────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertItems.map((a, i) => (
            <button
              key={i}
              onClick={() => navigate(a.path)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all hover:shadow-sm
                bg-${a.color}-50 dark:bg-${a.color}-900/20
                border-${a.color}-200 dark:border-${a.color}-800
                text-${a.color}-700 dark:text-${a.color}-400`}
            >
              <span className="material-icons-round text-sm">{a.icon}</span>
              {a.text}
              <span className="material-icons-round text-xs opacity-50">arrow_forward</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — الحالة اليومية (Daily Status)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">today</span>
          الحالة اليومية
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPIBox label="إجمالي الموظفين" value={empKpis.active} icon="groups" colorClass="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" />
          <KPIBox label="حاضرين اليوم" value={attKpis.todayPresent} icon="check_circle" colorClass="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" />
          <KPIBox label="غياب اليوم" value={attKpis.todayAbsent} icon="cancel" colorClass="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" />
          <KPIBox label="متأخرين اليوم" value={attKpis.todayLate} icon="schedule" colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — نظرة شهرية (Monthly Overview)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">calendar_month</span>
          النظرة الشهرية — {getMonthKey()}
        </h3>

        {/* Monthly KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-sky-600 dark:text-sky-400">{attendance.length}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">سجلات حضور</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-amber-600 dark:text-amber-400">{formatNumber(attKpis.totalLateMins)}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">دقائق تأخير</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{attKpis.avgHours.toFixed(1)}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">متوسط ساعات</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-rose-600 dark:text-rose-400">{attKpis.totalAbsences}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">حالات غياب</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-blue-600 dark:text-blue-400">{leaveKpis.approvedThisMonth}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">إجازات معتمدة</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-violet-600 dark:text-violet-400">{loanKpis.activeCount}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">سُلف نشطة</p>
          </div>
        </div>

        {/* Recent Leaves + Loans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="آخر طلبات الإجازات">
            {recentLeaves.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">لا توجد طلبات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800 text-xs">
                      <th className="py-2.5 px-2 text-right font-bold">الموظف</th>
                      <th className="py-2.5 px-2 text-right font-bold">النوع</th>
                      <th className="py-2.5 px-2 text-right font-bold">الأيام</th>
                      <th className="py-2.5 px-2 text-right font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeaves.map((l) => {
                      const emp = employees.find((e) => e.id === l.employeeId || e.userId === l.employeeId);
                      return (
                        <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-2 font-bold text-slate-700 dark:text-slate-200">{emp?.name || l.employeeId}</td>
                          <td className="py-2.5 px-2 text-slate-500">{LEAVE_TYPE_LABELS[l.leaveType]}</td>
                          <td className="py-2.5 px-2 font-mono text-slate-600 dark:text-slate-300">{l.totalDays}</td>
                          <td className="py-2.5 px-2">
                            <Badge variant={STATUS_VARIANT[l.finalStatus] ?? 'neutral'}>{STATUS_LABELS[l.finalStatus] ?? l.finalStatus}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => navigate('/leave-requests')} className="w-full text-xs text-primary font-bold hover:underline mt-4 flex items-center justify-center gap-1">
              عرض كل الإجازات
              <span className="material-icons-round text-xs">arrow_forward</span>
            </button>
          </Card>

          <Card title="آخر طلبات السُلف">
            {recentLoans.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">لا توجد سُلف</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800 text-xs">
                      <th className="py-2.5 px-2 text-right font-bold">الموظف</th>
                      <th className="py-2.5 px-2 text-right font-bold">النوع</th>
                      <th className="py-2.5 px-2 text-right font-bold">المبلغ</th>
                      <th className="py-2.5 px-2 text-right font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoans.map((l) => (
                      <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-2 font-bold text-slate-700 dark:text-slate-200">{l.employeeName || l.employeeId}</td>
                        <td className="py-2.5 px-2 text-slate-500">{LOAN_TYPE_LABELS[l.loanType]}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-600 dark:text-slate-300">{formatCurrency(l.loanAmount)}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant={STATUS_VARIANT[l.status] ?? 'neutral'}>{STATUS_LABELS[l.status] ?? l.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => navigate('/loan-requests')} className="w-full text-xs text-primary font-bold hover:underline mt-4 flex items-center justify-center gap-1">
              عرض كل السُلف
              <span className="material-icons-round text-xs">arrow_forward</span>
            </button>
          </Card>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — تحليلات (Analytics)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">analytics</span>
          تحليلات
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Department breakdown */}
          <Card title="توزيع الموظفين حسب القسم">
            {deptBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">لا توجد أقسام</p>
            ) : (
              <div className="space-y-3">
                {deptBreakdown.map((d) => {
                  const pct = empKpis.active > 0 ? (d.count / empKpis.active) * 100 : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-28 truncate">{d.name}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-indigo-500 dark:bg-indigo-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-500 w-8 text-left">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Employment type + Leave type */}
          <div className="space-y-6">
            <Card title="أنواع التوظيف">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(empKpis.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-md flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-indigo-600 dark:text-indigo-400 text-sm">badge</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-slate-800 dark:text-white leading-tight">{count}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">{empTypeLabels[type] || type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="الإجازات المعتمدة حسب النوع">
              {Object.keys(leaveKpis.byType).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">لا توجد بيانات</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(leaveKpis.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-md flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-emerald-600 dark:text-emerald-400 text-sm">beach_access</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-black text-slate-800 dark:text-white leading-tight">{count}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{LEAVE_TYPE_LABELS[type as keyof typeof LEAVE_TYPE_LABELS] || type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Financial summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPIBox label="إجمالي الرواتب الأساسية" value={formatCurrency(empKpis.totalSalary)} icon="payments" colorClass="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" />
          <KPIBox label="إجمالي مبالغ السُلف" value={formatCurrency(loanKpis.totalAmount)} icon="monetization_on" colorClass="bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400" />
          <KPIBox label="أيام إجازات هذا الشهر" value={leaveKpis.totalDaysThisMonth} icon="event_busy" colorClass="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" />
        </div>
      </section>

    </div>
  );
};

