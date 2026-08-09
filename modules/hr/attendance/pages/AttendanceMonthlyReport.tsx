import React, { useCallback, useMemo, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/UI';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useAppStore } from '@/store/useAppStore';
import { attendanceProcessingService } from '../services/attendanceProcessingService';
import type { AttendanceMonthlySummary } from '../types';
import type { FirestoreEmployee } from '@/types';
import { useCachedPageLoad } from '../../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../../shared/lib/pageDataCache';

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

type MonthlyReportPageData = {
  rows: AttendanceMonthlySummary[];
};

export const AttendanceMonthlyReport: React.FC = () => {
  const [month, setMonth] = useState(getCurrentMonth);
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth);
  const [search, setSearch] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const REPORT_CACHE_KEY = `hr:attendance-monthly:${month}`;

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<MonthlyReportPageData>(
    REPORT_CACHE_KEY,
    async () => {
      if (rawEmployees.length === 0) await fetchEmployees();
      const summaries = await attendanceProcessingService.getMonthlySummaries(month);
      return { rows: summaries };
    },
    { maxAgeMs: 60_000 },
  );

  const rows = data?.rows ?? [];

  const employeeNames = useMemo(() => (
    rawEmployees.reduce<Record<string, string>>((acc, employee: FirestoreEmployee) => {
      if (employee.id) acc[employee.id] = employee.name;
      return acc;
    }, {})
  ), [rawEmployees]);

  const load = useCallback(async (recalculate?: boolean) => {
    if (recalculate) {
      setRecalculating(true);
      try {
        if (rawEmployees.length === 0) await fetchEmployees();
        await attendanceProcessingService.recalculateMonthlySummary(month);
        invalidatePageDataCache(REPORT_CACHE_KEY);
        await reloadCached(true);
      } finally {
        setRecalculating(false);
      }
      return;
    }
    invalidatePageDataCache(REPORT_CACHE_KEY);
    await reloadCached(true);
  }, [month, rawEmployees.length, fetchEmployees, REPORT_CACHE_KEY, reloadCached]);

  const handleApplyMonth = useCallback(() => {
    setMonth(monthFilter);
  }, [monthFilter]);

  const handleMonthFilterChange = (key: string, value: string) => {
    setMonthFilter(value);
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const name = (employeeNames[row.employeeId] || '').toLowerCase();
      return row.employeeId.toLowerCase().includes(term) || name.includes(term);
    });
  }, [rows, search, employeeNames]);

  const kpis = useMemo(() => {
    const totalEmployees = filteredRows.length;
    const workDays = filteredRows.reduce((sum, row) => sum + row.workDaysInMonth, 0);
    const presentDays = filteredRows.reduce((sum, row) => sum + row.presentDays, 0);
    const absentDays = filteredRows.reduce((sum, row) => sum + row.absentDays, 0);
    const overtimeMinutes = filteredRows.reduce((sum, row) => sum + row.totalOvertimeMinutes, 0);
    return { totalEmployees, workDays, presentDays, absentDays, overtimeMinutes };
  }, [filteredRows]);

  return (
    <ModuleOpsPageShell
      eyebrow="الحضور والانصراف"
      rangeLabel={`التقرير الشهري — ${month}`}
      hero={[
        { key: 'employees', label: 'الموظفون', value: kpis.totalEmployees, accent: true },
        { key: 'workDays', label: 'أيام العمل', value: kpis.workDays },
        { key: 'present', label: 'الحضور', value: kpis.presentDays },
        { key: 'absent', label: 'الغياب', value: kpis.absentDays },
        { key: 'overtime', label: 'إضافي (دقيقة)', value: kpis.overtimeMinutes },
      ]}
    >
      <OpsDashPanel title="التقرير الشهري للحضور" accent="hr" bodyClassName="p-0 overflow-x-auto">
        <SmartFilterBar
      pageId="attendance-monthly-report"
          searchPlaceholder="بحث باسم الموظف أو الكود"
          searchValue={search}
          onSearchChange={setSearch}
          advancedFilters={[
            {
              key: 'month',
              label: 'الشهر',
              placeholder: 'الشهر',
              type: 'month',
              options: [],
            },
          ]}
          advancedFilterValues={{ month: monthFilter }}
          onAdvancedFilterChange={handleMonthFilterChange}
          onApply={handleApplyMonth}
          applyLabel="تحديث"
          extra={
            <Button onClick={() => void load(true)} disabled={loading || recalculating}>
              {recalculating ? 'جار إعادة الاحتساب...' : 'إعادة احتساب'}
            </Button>
          }
          className="mb-0 border-0 rounded-none"
        />
        <table className="erp-table w-full text-right">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">الموظف</th>
              <th className="erp-th">أيام العمل</th>
              <th className="erp-th">الحضور</th>
              <th className="erp-th">الغياب</th>
              <th className="erp-th">أيام التأخير</th>
              <th className="erp-th">أيام الخروج المبكر</th>
              <th className="erp-th">إجمالي الساعات</th>
              <th className="erp-th">التأخير (د)</th>
              <th className="erp-th">الخروج المبكر (د)</th>
              <th className="erp-th">الإضافي (د)</th>
              <th className="erp-th">نسبة الحضور</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-[var(--color-text-muted)]" colSpan={11}>
                  لا توجد بيانات لهذا الشهر
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border)]">
                <td className="py-2 px-2">{employeeNames[row.employeeId] || row.employeeId}</td>
                <td className="py-2 px-2">{row.workDaysInMonth}</td>
                <td className="py-2 px-2">{row.presentDays}</td>
                <td className="py-2 px-2">{row.absentDays}</td>
                <td className="py-2 px-2">{row.lateDays}</td>
                <td className="py-2 px-2">{row.earlyLeaveDays}</td>
                <td className="py-2 px-2">{row.totalWorkHours}</td>
                <td className="py-2 px-2">{row.totalLateMinutes}</td>
                <td className="py-2 px-2">{row.totalEarlyLeaveMinutes}</td>
                <td className="py-2 px-2">{row.totalOvertimeMinutes}</td>
                <td className="py-2 px-2">{row.attendanceRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
