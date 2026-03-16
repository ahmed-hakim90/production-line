import React, { useEffect, useMemo, useState } from 'react';
import { leaveBalanceService } from '../leaveService';
import { attendanceLogService } from '../attendanceService';
import { loanService } from '../loanService';
import { LEAVE_TYPE_LABELS } from '../types';

interface ApprovalEmployeeContextProps {
  employeeId: string;
  requestType: 'leave' | 'loan' | 'overtime';
  requestData: Record<string, any>;
}

interface ContextState {
  leaveBalance: Awaited<ReturnType<typeof leaveBalanceService.getByEmployee>> | null;
  attendance: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalLateMinutes: number;
    attendanceRate: number;
  };
  loans: {
    count: number;
    monthlyDeduction: number;
  };
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export const ApprovalEmployeeContext: React.FC<ApprovalEmployeeContextProps> = ({
  employeeId,
  requestType,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [state, setState] = useState<ContextState>({
    leaveBalance: null,
    attendance: {
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      totalLateMinutes: 0,
      attendanceRate: 0,
    },
    loans: {
      count: 0,
      monthlyDeduction: 0,
    },
  });

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - 30);
        const startDate = from.toISOString().slice(0, 10);
        const endDate = today.toISOString().slice(0, 10);

        const [balanceResult, logsResult, loansResult] = await Promise.allSettled([
          requestType === 'leave' ? leaveBalanceService.getByEmployee(employeeId) : Promise.resolve(null),
          attendanceLogService.getByEmployeeRange(employeeId, startDate, endDate),
          loanService.getByEmployee(employeeId),
        ]);

        const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : null;
        const logs = logsResult.status === 'fulfilled' ? logsResult.value : [];
        const loans = loansResult.status === 'fulfilled' ? loansResult.value : [];

        const attendance = logs.reduce(
          (acc, row) => {
            if (row.isAbsent) acc.absentDays += 1;
            else acc.presentDays += 1;
            if ((row.lateMinutes || 0) > 0) {
              acc.lateDays += 1;
              acc.totalLateMinutes += row.lateMinutes || 0;
            }
            return acc;
          },
          { presentDays: 0, absentDays: 0, lateDays: 0, totalLateMinutes: 0 },
        );
        const totalDays = attendance.presentDays + attendance.absentDays;
        const attendanceRate = totalDays > 0 ? (attendance.presentDays / totalDays) * 100 : 0;
        const activeLoans = loans.filter((loan) => loan.status === 'active');
        const monthlyDeduction = activeLoans.reduce((sum, loan) => sum + Number(loan.installmentAmount || 0), 0);

        if (!active) return;
        setState({
          leaveBalance: balance,
          attendance: { ...attendance, attendanceRate },
          loans: { count: activeLoans.length, monthlyDeduction },
        });
      } catch {
        if (!active) return;
        setError('تعذر تحميل البيانات');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [employeeId, requestType]);

  const leaveRows = useMemo(() => {
    if (!state.leaveBalance) return [];
    return [
      { label: LEAVE_TYPE_LABELS.annual, remaining: state.leaveBalance.annualBalance, total: 21 },
      { label: LEAVE_TYPE_LABELS.sick, remaining: state.leaveBalance.sickBalance, total: 14 },
      { label: LEAVE_TYPE_LABELS.emergency, remaining: state.leaveBalance.emergencyBalance, total: 5 },
    ];
  }, [state.leaveBalance]);

  if (loading) {
    return (
      <div className="mt-3 border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-3 space-y-2">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="h-7 rounded bg-[#f0f2f5] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 border border-rose-200 text-rose-600 rounded-[var(--border-radius-base)] p-3 text-xs font-bold">
        {error}
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[var(--color-border)] rounded-[var(--border-radius-base)] overflow-hidden">
      <div className="px-3 py-2 text-xs font-bold bg-[#f8f9fa] border-b border-[var(--color-border)]">
        بيانات الموظف لمساعدتك في اتخاذ القرار
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 text-xs">
        {requestType === 'leave' && (
          <>
            <div className="px-3 py-2 font-bold border-b sm:border-b-0 sm:border-l border-[var(--color-border)]">رصيد الإجازات</div>
            <div className="px-3 py-2 border-b border-[var(--color-border)]">
              {leaveRows.map((row) => (
                <div key={row.label}>{row.label}: {row.remaining} من {row.total}</div>
              ))}
            </div>
          </>
        )}
        <div className="px-3 py-2 font-bold border-b sm:border-b-0 sm:border-l border-[var(--color-border)]">الحضور 30 يوم</div>
        <div className="px-3 py-2 border-b border-[var(--color-border)]">
          حاضر {state.attendance.presentDays} · غائب {state.attendance.absentDays} · متأخر {state.attendance.lateDays}
          <div>معدل الحضور: {formatPercent(state.attendance.attendanceRate)}</div>
        </div>
        <div className="px-3 py-2 font-bold sm:border-l border-[var(--color-border)]">السُلف النشطة</div>
        <div className="px-3 py-2">
          {state.loans.count === 0 ? 'لا توجد سُلف نشطة' : `${state.loans.count} سلفة — خصم ${state.loans.monthlyDeduction.toLocaleString('en-US')} ج.م/شهر`}
        </div>
      </div>
    </div>
  );
};
