import React, { useCallback, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Button, Badge } from '../components/UI';
import { PageHeader } from '@/components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { employeeService } from '../employeeService';
import { getPayrollMonth, getPayrollRecords } from '../payroll';
import type { FirestorePayrollMonth, FirestorePayrollRecord } from '../payroll/types';
import { getEmployeeLeaveUsageSummariesByRange } from '../leaveService';

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const EmployeeFinancialOverview: React.FC = () => {
  const navigate = useTenantNavigate();
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payrollMonth, setPayrollMonth] = useState<FirestorePayrollMonth | null>(null);
  const [records, setRecords] = useState<FirestorePayrollRecord[]>([]);
  const [deptNameById, setDeptNameById] = useState<Record<string, string>>({});
  const [leaveSummaryByEmployee, setLeaveSummaryByEmployee] = useState<
    Record<string, Awaited<ReturnType<typeof getEmployeeLeaveUsageSummariesByRange>>[string]>
  >({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [monthDoc, employees] = await Promise.all([
        getPayrollMonth(month),
        employeeService.getAll(),
      ]);
      setPayrollMonth(monthDoc);

      const deptMap: Record<string, string> = {};
      employees.forEach((emp) => {
        if (emp.departmentId && !deptMap[emp.departmentId]) {
          deptMap[emp.departmentId] = emp.departmentId;
        }
      });
      setDeptNameById(deptMap);

      if (!monthDoc?.id) {
        setRecords([]);
        setLeaveSummaryByEmployee({});
        return;
      }

      const payrollRecords = await getPayrollRecords(monthDoc.id);
      setRecords(payrollRecords);

      const employeeIds = payrollRecords.map((r) => r.employeeId);
      const range = getMonthRange(month);
      const leaveMap = await getEmployeeLeaveUsageSummariesByRange(
        employeeIds,
        range.startDate,
        range.endDate,
      );
      setLeaveSummaryByEmployee(leaveMap);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تحميل بيانات التحليل المالي');
    } finally {
      setLoading(false);
    }
  }, [month]);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (departmentFilter) {
      list = list.filter((r) => r.departmentId === departmentFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.employeeName.toLowerCase().includes(q));
    }
    return list;
  }, [records, departmentFilter, search]);

  const departmentOptions = useMemo(() => {
    const uniq = new Set(records.map((r) => r.departmentId).filter(Boolean));
    return Array.from(uniq);
  }, [records]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="التحليل المالي للموظفين"
        subtitle="عرض شامل للأجر الأساسي والبدلات والخصومات والمؤثرات والإجازات والصافي"
        icon="table_view"
        primaryAction={{
          label: loading ? 'جاري التحميل...' : 'تحميل البيانات',
          icon: loading ? 'refresh' : 'search',
          onClick: loadData,
          disabled: loading,
        }}
      />

      <SmartFilterBar
        searchPlaceholder="بحث باسم الموظف..."
        searchValue={search}
        onSearchChange={setSearch}
        quickFilters={[
          {
            key: 'department',
            placeholder: 'كل الأقسام',
            options: departmentOptions.map((deptId) => ({
              value: deptId,
              label: deptNameById[deptId] || deptId,
            })),
            width: 'w-[180px]',
          },
        ]}
        quickFilterValues={{ department: departmentFilter || 'all' }}
        onQuickFilterChange={(_, value) => setDepartmentFilter(value === 'all' ? '' : value)}
        onApply={loadData}
        applyLabel={loading ? 'جار التحميل...' : 'تطبيق'}
        extra={(
          <div className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-2.5">
            <span className="ml-2 text-xs text-slate-500">الشهر</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-[28px] text-xs outline-none" />
          </div>
        )}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 text-rose-700 text-sm font-bold">
          {error}
        </div>
      )}

      {payrollMonth && (
        <Card className="!p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[var(--color-text-muted)]">
              الشهر: <strong>{month}</strong> - موظفون: <strong>{payrollMonth.totalEmployees}</strong>
            </div>
            <Badge variant={payrollMonth.status === 'locked' ? 'danger' : payrollMonth.status === 'finalized' ? 'success' : 'warning'}>
              {payrollMonth.status === 'locked' ? 'مقفل' : payrollMonth.status === 'finalized' ? 'معتمد' : 'مسودة'}
            </Badge>
          </div>
        </Card>
      )}

      {records.length > 0 && (
        <Card>
          <div className="erp-table-scroll">
            <table className="erp-table w-full text-sm text-right">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الموظف</th>
                  <th className="erp-th">القسم</th>
                  <th className="erp-th">الأجر الأساسي</th>
                  <th className="erp-th">البدلات (تفصيلي)</th>
                  <th className="erp-th">الخصومات (تفصيلي)</th>
                  <th className="erp-th">المؤثرات</th>
                  <th className="erp-th">الإجازات</th>
                  <th className="erp-th">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => {
                  const leaveSummary = leaveSummaryByEmployee[r.employeeId];
                  const leaveUsageText = leaveSummary
                    ? leaveSummary.perType
                        .map((item) => `${item.label}: ${item.approvedDaysInRange}ي`)
                        .join(' | ')
                    : '—';
                  const leaveAvailableText = leaveSummary
                    ? leaveSummary.perType
                        .filter((item) => item.defaultDays != null)
                        .map((item) => `${item.label}: ${item.availableDays}ي`)
                        .join(' | ')
                    : '—';

                  return (
                    <tr key={r.id} className="border-t border-[var(--color-border)] align-top">
                      <td className="p-3 font-bold">{r.employeeName}</td>
                      <td className="p-3">{deptNameById[r.departmentId] || r.departmentId || '—'}</td>
                      <td className="p-3 font-mono font-bold">{formatMoney(r.baseSalary)}</td>
                      <td className="p-3">
                        <div className="font-bold text-emerald-700 mb-1">+ {formatMoney(r.allowancesTotal + r.employeeAllowancesTotal)}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {r.allowancesBreakdown.map((a) => `${a.name}: ${formatMoney(a.amount)}`).join(' | ') || 'بدلات عامة: —'}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-1">
                          {r.employeeAllowancesBreakdown.map((a) => `${a.name}: ${formatMoney(a.amount)}`).join(' | ') || 'بدلات موظف: —'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-rose-700 mb-1">- {formatMoney(r.totalDeductions)}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {r.employeeDeductionsBreakdown.map((d) => `${d.name}: ${formatMoney(d.amount)}`).join(' | ') || 'خصومات مخصصة: —'}
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>غياب: {formatMoney(r.absenceDeduction)}</div>
                        <div>تأخير: {formatMoney(r.latePenalty)}</div>
                        <div>سلف: {formatMoney(r.loanInstallment)}</div>
                        <div>إجازة بدون راتب: {formatMoney(r.unpaidLeaveDeduction)} ({r.unpaidLeaveDays} يوم)</div>
                        <div>جزاءات أخرى: {formatMoney(r.otherPenalties)}</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>المستخدم بالشهر: {leaveUsageText}</div>
                        <div className="mt-1">المتاح الحالي: {leaveAvailableText}</div>
                      </td>
                      <td className="p-3 font-mono font-black text-primary">{formatMoney(r.netSalary)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && records.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] mb-3 block">receipt_long</span>
            <p className="text-sm font-bold text-[var(--color-text-muted)] mb-4">
              لا توجد بيانات رواتب للشهر المحدد. قم بإنشاء/تحميل كشف الرواتب أولاظ‹.
            </p>
            <Button variant="outline" onClick={() => navigate('/payroll')}>
              الانتقال إلى كشف الرواتب
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};




