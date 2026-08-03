import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/UI';
import { SelectableTable, type TableColumn } from '@/components/SelectableTable';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useAppStore } from '@/store/useAppStore';
import type { FirestoreEmployee } from '@/types';
import type { AttendanceLog } from '../types';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../../shared/lib/pageDataCache';

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
  const [activePeriod, setActivePeriod] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const [dateFilters, setDateFilters] = useState({ startDate: getWeekStart(), endDate: getToday() });
  const [loading, setLoading] = useState(false);
  const employeeNames = useMemo(() => (
    rawEmployees.reduce<Record<string, string>>((acc, employee: FirestoreEmployee) => {
      if (employee.id) acc[employee.id] = employee.name;
      return acc;
    }, {})
  ), [rawEmployees]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    const cacheKey = `hr:attendance-logs:${startDate}:${endDate}`;
    const cached = peekPageDataCache<AttendanceLog[]>(cacheKey);
    if (cached != null) {
      useAppStore.setState({ attendanceLogs: cached });
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        cacheKey,
        async () => {
          await Promise.all([
            fetchAttendanceLogs(startDate, endDate),
            rawEmployees.length === 0 ? fetchEmployees() : Promise.resolve(),
          ]);
          return useAppStore.getState().attendanceLogs as AttendanceLog[];
        },
        { force, maxAgeMs: 60_000 },
      );
      useAppStore.setState({ attendanceLogs: data });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, fetchAttendanceLogs, fetchEmployees, rawEmployees.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApplyDates = useCallback(() => {
    setStartDate(dateFilters.startDate);
    setEndDate(dateFilters.endDate);
    setActivePeriod('custom');
  }, [dateFilters]);

  const handleDateFilterChange = (key: string, value: string) => {
    setDateFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyDatePreset = (value: string) => {
    if (value === 'today') {
      const today = getToday();
      setActivePeriod('today');
      setDateFilters({ startDate: today, endDate: today });
    } else if (value === 'week') {
      setActivePeriod('week');
      setDateFilters({ startDate: getWeekStart(), endDate: getToday() });
    } else if (value === 'month') {
      setActivePeriod('month');
      setDateFilters({ startDate: getMonthStart(), endDate: getToday() });
    }
  };

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

      <div className="card p-0">
        <SmartFilterBar
      pageId="attendance-logs"
          periods={[
            { label: 'اليوم', value: 'today' },
            { label: 'آخر 7 أيام', value: 'week' },
            { label: 'هذا الشهر', value: 'month' },
          ]}
          activePeriod={activePeriod}
          onPeriodChange={applyDatePreset}
          advancedFilters={[
            {
              key: 'startDate',
              label: 'من',
              placeholder: 'من',
              type: 'date',
              options: [],
            },
            {
              key: 'endDate',
              label: 'إلى',
              placeholder: 'إلى',
              type: 'date',
              options: [],
            },
          ]}
          advancedFilterValues={dateFilters}
          onAdvancedFilterChange={handleDateFilterChange}
          onApply={handleApplyDates}
          applyLabel="تحديث"
          className="mb-0 border-0 rounded-none"
        />
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
    </div>
  );
};
