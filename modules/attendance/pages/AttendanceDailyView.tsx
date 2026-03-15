import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '@/store/useAppStore';
import type { FirestoreEmployee } from '@/types';

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthStart(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export const AttendanceDailyView: React.FC = () => {
  const records = useAppStore((s) => s.attendanceRecords);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchAttendanceRecords = useAppStore((s) => s.fetchAttendanceRecords);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getToday);
  const [loading, setLoading] = useState(false);
  const names = useMemo(() => (
    rawEmployees.reduce<Record<string, string>>((acc, employee: FirestoreEmployee) => {
      if (employee.id) acc[employee.id] = employee.name;
      return acc;
    }, {})
  ), [rawEmployees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchAttendanceRecords(startDate, endDate),
        rawEmployees.length === 0 ? fetchEmployees() : Promise.resolve(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, fetchAttendanceRecords, fetchEmployees, rawEmployees.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((record) => record.status === 'present').length;
    const late = records.filter((record) => record.status === 'late').length;
    const absent = records.filter((record) => record.status === 'absent').length;
    return { total, present, late, absent };
  }, [records]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحضور اليومي المعالج"
        subtitle="نتائج المعالجة اليومية للحضور (check-in / check-out / ساعات العمل)"
        icon="fact_check"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="erp-kpi-card"><div className="erp-kpi-label">الإجمالي</div><div className="erp-kpi-value">{stats.total}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">حضور</div><div className="erp-kpi-value">{stats.present}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">متأخر</div><div className="erp-kpi-value">{stats.late}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">غياب</div><div className="erp-kpi-value">{stats.absent}</div></div>
      </div>

      <div className="erp-filter-bar">
        <div className="erp-filter-date">
          <span className="erp-filter-label">من</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="erp-filter-date">
          <span className="erp-filter-label">إلى</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button className="erp-filter-apply" onClick={() => void load()}>
          <span className="material-icons-round" style={{ fontSize: 14 }}>refresh</span>
          تحديث
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-right">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">الموظف</th>
              <th className="erp-th">التاريخ</th>
              <th className="erp-th">الحضور</th>
              <th className="erp-th">الانصراف</th>
              <th className="erp-th">الدقائق</th>
              <th className="erp-th">تأخير</th>
              <th className="erp-th">إضافي</th>
              <th className="erp-th">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {!loading && records.length === 0 && (
              <tr>
                <td className="py-8 text-center text-[var(--color-text-muted)]" colSpan={8}>
                  لا توجد بيانات معالجة
                </td>
              </tr>
            )}
            {records.map((record) => {
              const checkIn = record.checkIn?.toDate ? record.checkIn.toDate() : null;
              const checkOut = record.checkOut?.toDate ? record.checkOut.toDate() : null;
              return (
                <tr key={record.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2">{names[record.employeeId] || record.employeeId}</td>
                  <td className="py-2 px-2">{record.date}</td>
                  <td className="py-2 px-2">{checkIn ? checkIn.toLocaleTimeString('ar-EG') : '—'}</td>
                  <td className="py-2 px-2">{checkOut ? checkOut.toLocaleTimeString('ar-EG') : '—'}</td>
                  <td className="py-2 px-2">{record.workedMinutes}</td>
                  <td className="py-2 px-2">{record.lateMinutes}</td>
                  <td className="py-2 px-2">{record.overtimeMinutes}</td>
                  <td className="py-2 px-2">{record.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
