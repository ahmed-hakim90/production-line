import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SelectableTable, type TableColumn } from '@/components/SelectableTable';
import { useAppStore } from '@/store/useAppStore';
import type { FirestoreEmployee } from '@/types';
import type { AttendanceLog } from '../types';

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

function getMonthStart(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export const AttendanceLogs: React.FC = () => {
  const logs = useAppStore((s) => s.attendanceLogs);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchAttendanceLogs = useAppStore((s) => s.fetchAttendanceLogs);
  const [startDate, setStartDate] = useState(getWeekStart);
  const [endDate, setEndDate] = useState(getToday);
  const [activeRange, setActiveRange] = useState<'today' | 'week' | 'month' | 'custom'>('week');
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

  const stats = useMemo(() => {
    const total = logs.length;
    const checkIn = logs.filter((log) => log.eventType === 'check_in').length;
    const checkOut = logs.filter((log) => log.eventType === 'check_out').length;
    const unknown = total - checkIn - checkOut;
    return { total, checkIn, checkOut, unknown };
  }, [logs]);

  const tableColumns = useMemo<TableColumn<AttendanceLog>[]>(() => [
    {
      id: 'employee',
      header: 'الموظف',
      render: (log) => employeeNames[log.employeeId] || log.employeeId,
      sortKey: (log) => employeeNames[log.employeeId] || log.employeeId,
    },
    {
      id: 'deviceUser',
      header: 'معرف الجهاز',
      render: (log) => log.deviceUserId || '—',
      sortKey: (log) => log.deviceUserId || '',
    },
    {
      id: 'device',
      header: 'الجهاز',
      render: (log) => log.deviceId || '—',
      sortKey: (log) => log.deviceId || '',
    },
    {
      id: 'timestamp',
      header: 'التوقيت',
      render: (log) => {
        const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return Number.isNaN(ts.getTime()) ? '—' : ts.toLocaleString('ar-EG');
      },
      sortKey: (log) => {
        const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return Number.isNaN(ts.getTime()) ? 0 : ts.getTime();
      },
    },
    {
      id: 'event',
      header: 'الحدث',
      render: (log) => {
        if (log.eventType === 'check_in') return 'دخول';
        if (log.eventType === 'check_out') return 'خروج';
        return 'غير معروف';
      },
      sortKey: (log) => log.eventType || '',
    },
    {
      id: 'source',
      header: 'المصدر',
      render: (log) => log.source || '—',
      sortKey: (log) => log.source || '',
    },
  ], [employeeNames]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل بصمة الحضور الخام"
        subtitle="عرض السجلات الخام الواردة من أجهزة ZKTeco"
        icon="fingerprint"
        loading={loading}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="erp-kpi-card"><div className="erp-kpi-label">الإجمالي</div><div className="erp-kpi-value">{stats.total}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">دخول</div><div className="erp-kpi-value">{stats.checkIn}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">خروج</div><div className="erp-kpi-value">{stats.checkOut}</div></div>
        <div className="erp-kpi-card"><div className="erp-kpi-label">غير معروف</div><div className="erp-kpi-value">{stats.unknown}</div></div>
      </div>

      <div className="erp-filter-bar">
        <div className="erp-date-seg">
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'today' ? 'active' : ''}`}
            onClick={() => {
              const today = getToday();
              setActiveRange('today');
              setStartDate(today);
              setEndDate(today);
            }}
          >
            اليوم
          </button>
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'week' ? 'active' : ''}`}
            onClick={() => {
              setActiveRange('week');
              setStartDate(getWeekStart());
              setEndDate(getToday());
            }}
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'month' ? 'active' : ''}`}
            onClick={() => {
              setActiveRange('month');
              setStartDate(getMonthStart());
              setEndDate(getToday());
            }}
          >
            هذا الشهر
          </button>
        </div>

        <label className="erp-filter-date">
          <span className="erp-filter-label">من</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setActiveRange('custom');
              setStartDate(e.target.value);
            }}
          />
        </label>
        <label className="erp-filter-date">
          <span className="erp-filter-label">إلى</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setActiveRange('custom');
              setEndDate(e.target.value);
            }}
          />
        </label>

        <button className="erp-filter-apply" onClick={() => void load()} disabled={loading}>
          <span className="material-icons-round text-sm">sync</span>
          {loading ? 'جار التحميل...' : 'تحديث'}
        </button>
      </div>

      <SelectableTable<AttendanceLog>
        data={logs}
        columns={tableColumns}
        getId={(log) => log.id}
        actionsHeader="إجراءات"
        emptyIcon="fingerprint"
        emptyTitle="لا توجد سجلات بصمة ضمن النطاق المحدد"
        emptySubtitle="غيّر التاريخ أو راجع مصدر الاستيراد"
        tableId="attendance-raw-logs"
        pageSize={25}
        enableSearch={true}
        searchPlaceholder="بحث بالموظف أو كود الجهاز أو المصدر"
        enableColumnVisibility={true}
        checkboxSelection={false}
        loading={loading}
      />
    </div>
  );
};
