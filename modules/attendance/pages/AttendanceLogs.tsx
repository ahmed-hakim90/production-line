import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '@/store/useAppStore';
import type { FirestoreEmployee } from '@/types';

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getToday(): string {
  return toDateString(new Date());
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return toDateString(d);
}

export const AttendanceLogs: React.FC = () => {
  const logs = useAppStore((s) => s.attendanceLogs);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchAttendanceLogs = useAppStore((s) => s.fetchAttendanceLogs);
  const [startDate, setStartDate] = useState(getWeekStart);
  const [endDate, setEndDate] = useState(getToday);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const employeeNames = useMemo(() => (
    rawEmployees.reduce<Record<string, string>>((acc, employee: FirestoreEmployee) => {
      if (employee.id) acc[employee.id] = employee.name;
      return acc;
    }, {})
  ), [rawEmployees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchAttendanceLogs(startDate, endDate),
        rawEmployees.length === 0 ? fetchEmployees() : Promise.resolve(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, fetchAttendanceLogs, fetchEmployees, rawEmployees.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => {
      const name = (employeeNames[log.employeeId] || '').toLowerCase();
      return (
        log.employeeId.toLowerCase().includes(term) ||
        log.deviceUserId.toLowerCase().includes(term) ||
        name.includes(term)
      );
    });
  }, [logs, search, employeeNames]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل بصمة الحضور الخام"
        subtitle="عرض السجلات الخام الواردة من أجهزة ZKTeco"
        icon="fingerprint"
      />

      <div className="erp-filter-bar">
        <div className="erp-search-input">
          <span className="material-icons-round">search</span>
          <input
            type="text"
            placeholder="بحث بالموظف أو كود الجهاز"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
              <th className="erp-th">معرف الجهاز</th>
              <th className="erp-th">الجهاز</th>
              <th className="erp-th">التوقيت</th>
              <th className="erp-th">الحدث</th>
              <th className="erp-th">المصدر</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="py-8 text-center text-[var(--color-text-muted)]" colSpan={6}>
                  لا توجد سجلات
                </td>
              </tr>
            )}
            {filtered.map((log) => {
              const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
              return (
                <tr key={log.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2">{employeeNames[log.employeeId] || log.employeeId}</td>
                  <td className="py-2 px-2">{log.deviceUserId}</td>
                  <td className="py-2 px-2">{log.deviceId}</td>
                  <td className="py-2 px-2">{ts.toLocaleString('ar-EG')}</td>
                  <td className="py-2 px-2">{log.eventType}</td>
                  <td className="py-2 px-2">{log.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
