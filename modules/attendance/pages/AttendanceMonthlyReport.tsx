import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '@/store/useAppStore';
import { attendanceProcessingService } from '../services/attendanceProcessingService';
import type { AttendanceMonthlySummary } from '../types';
import type { FirestoreEmployee } from '@/types';

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const AttendanceMonthlyReport: React.FC = () => {
  const [month, setMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AttendanceMonthlySummary[]>([]);
  const [search, setSearch] = useState('');
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const rawEmployees = useAppStore((s) => s._rawEmployees);

  const employeeNames = useMemo(() => (
    rawEmployees.reduce<Record<string, string>>((acc, employee: FirestoreEmployee) => {
      if (employee.id) acc[employee.id] = employee.name;
      return acc;
    }, {})
  ), [rawEmployees]);

  const load = useCallback(async (recalculate?: boolean) => {
    setLoading(true);
    try {
      if (rawEmployees.length === 0) await fetchEmployees();
      if (recalculate) await attendanceProcessingService.recalculateMonthlySummary(month);
      const summaries = await attendanceProcessingService.getMonthlySummaries(month);
      setRows(summaries);
    } finally {
      setLoading(false);
    }
  }, [month, rawEmployees.length, fetchEmployees]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="space-y-6">
      <PageHeader
        title="التقرير الشهري للحضور"
        subtitle="ملخص الحضور الشهري لكل موظف مع مؤشرات الالتزام"
        icon="analytics"
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="erp-kpi-card"><div className="erp-kpi-label">الموظفون</div><div className="erp-kpi-value">{kpis.totalEmployees}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">أيام العمل</div><div className="erp-kpi-value">{kpis.workDays}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">الحضور</div><div className="erp-kpi-value">{kpis.presentDays}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">الغياب</div><div className="erp-kpi-value">{kpis.absentDays}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">إضافي (دقيقة)</div><div className="erp-kpi-value">{kpis.overtimeMinutes}</div></div>
      </div>

      <div className="erp-filter-bar">
        <div className="erp-filter-date">
          <span className="erp-filter-label">الشهر</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <input
          className="erp-search-input"
          placeholder="بحث باسم الموظف أو الكود"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="erp-filter-apply" onClick={() => void load(false)} disabled={loading}>
          {loading ? 'جار التحميل...' : 'تحديث'}
        </button>
        <button className="erp-filter-apply" onClick={() => void load(true)} disabled={loading}>
          إعادة احتساب
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-right">
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
      </div>
    </div>
  );
};
