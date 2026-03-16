import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SelectableTable, type TableBulkAction, type TableColumn } from '@/components/SelectableTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { FirestoreEmployee } from '@/types';
import type { AttendanceRecord, AttendanceRecordStatus } from '../types';
import { exportAttendanceLogs } from '@/utils/exportExcel';

type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

const PRESENT_STATUSES = new Set<AttendanceRecordStatus>(['present', 'overtime']);
const LATE_STATUSES = new Set<AttendanceRecordStatus>(['late', 'present_late', 'present_late_early']);

const STATUS_LABELS: Partial<Record<AttendanceRecordStatus, string>> = {
  present: 'حضور',
  present_late: 'متأخر',
  present_early_leave: 'خروج مبكر',
  present_late_early: 'متأخر + خروج مبكر',
  absent: 'غائب',
  holiday: 'إجازة',
  no_checkout: 'بدون خروج',
  overtime: 'أوفر تايم',
  off_day: 'يوم راحة',
  late: 'متأخر',
  partial: 'ناقص',
  single_punch: 'بصمة واحدة',
};
const ROW_ACTION_BASE_CLASS = 'p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] transition-all';

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

function shiftDate(baseDate: Date, amount: number): string {
  const shifted = new Date(baseDate);
  shifted.setDate(shifted.getDate() + amount);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toClock(value: unknown): string {
  const maybeTimestamp = value as { toDate?: () => Date } | null | undefined;
  if (!maybeTimestamp?.toDate) return '';
  const date = maybeTimestamp.toDate();
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export const AttendanceDailyView: React.FC = () => {
  const { can } = usePermission();
  const canEdit = can('attendance.edit');
  const records = useAppStore((s) => s.attendanceRecords);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchAttendanceRecords = useAppStore((s) => s.fetchAttendanceRecords);
  const updateAttendanceRecordTimes = useAppStore((s) => s.updateAttendanceRecordTimes);
  const deleteAttendanceRecordsByIds = useAppStore((s) => s.deleteAttendanceRecordsByIds);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getToday);
  const [activeRange, setActiveRange] = useState<DateRangePreset>('month');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ visible: false, done: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
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
    const present = records.filter((record) => PRESENT_STATUSES.has(record.status)).length;
    const late = records.filter((record) => LATE_STATUSES.has(record.status)).length;
    const absent = records.filter((record) => record.status === 'absent').length;
    return { total, present, late, absent };
  }, [records]);

  const statusVariant = useCallback((status: AttendanceRecordStatus): 'success' | 'warning' | 'danger' | 'muted' => {
    if (['present', 'overtime'].includes(status)) return 'success';
    if (['present_late', 'present_early_leave', 'present_late_early', 'late', 'partial', 'no_checkout'].includes(status)) return 'warning';
    if (status === 'absent') return 'danger';
    return 'muted';
  }, []);

  const statusLabel = useCallback((status: AttendanceRecordStatus): string => (
    STATUS_LABELS[status] || status
  ), []);

  const startEdit = useCallback((recordId: string, checkIn: string, checkOut: string) => {
    setEditingId(recordId);
    setEditCheckIn(checkIn);
    setEditCheckOut(checkOut);
  }, []);

  const clearEdit = useCallback(() => {
    setEditingId(null);
    setEditCheckIn('');
    setEditCheckOut('');
  }, []);

  const applyDatePreset = useCallback((preset: Exclude<DateRangePreset, 'custom'>) => {
    if (preset === 'today') {
      const today = getToday();
      setActiveRange('today');
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (preset === 'week') {
      setActiveRange('week');
      setEndDate(getToday());
      setStartDate(shiftDate(new Date(), -6));
      return;
    }
    setActiveRange('month');
    setStartDate(getMonthStart());
    setEndDate(getToday());
  }, []);

  const handleSaveEdit = useCallback(async (recordId: string) => {
    setActionBusy(true);
    try {
      await updateAttendanceRecordTimes(recordId, {
        checkIn: editCheckIn.trim() || null,
        checkOut: editCheckOut.trim() || null,
      });
      clearEdit();
      await load();
    } finally {
      setActionBusy(false);
    }
  }, [updateAttendanceRecordTimes, editCheckIn, editCheckOut, clearEdit, load]);

  const handleDeleteRows = useCallback(async (recordIds: string[]) => {
    if (recordIds.length === 0) return;
    const confirmed = window.confirm(`سيتم حذف ${recordIds.length} سجل حضور حذفًا نهائيًا. هل تريد المتابعة؟`);
    if (!confirmed) return;

    setActionBusy(true);
    setDeleteProgress({ visible: true, done: 0, total: recordIds.length });
    try {
      await deleteAttendanceRecordsByIds(recordIds, (done, total) => {
        setDeleteProgress({ visible: true, done, total });
      });
      if (editingId && recordIds.includes(editingId)) {
        clearEdit();
      }
      await load();
    } finally {
      setActionBusy(false);
      setDeleteProgress((prev) => ({ ...prev, done: prev.total }));
      window.setTimeout(() => {
        setDeleteProgress({ visible: false, done: 0, total: 0 });
      }, 500);
    }
  }, [deleteAttendanceRecordsByIds, editingId, clearEdit, load]);

  const progressPercent = deleteProgress.total > 0
    ? Math.min(100, Math.round((deleteProgress.done / deleteProgress.total) * 100))
    : 0;

  const handleExport = useCallback(() => {
    const rows = records.map((r) => ({
      employeeId: r.employeeId,
      date: r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalMinutes: r.workedMinutes || 0,
      totalHours: r.workHours ?? Math.round(((r.workedMinutes || 0) / 60) * 10) / 10,
      lateMinutes: r.lateMinutes || 0,
      earlyLeaveMinutes: r.earlyLeaveMinutes || 0,
      isAbsent: r.status === 'absent',
      isIncomplete: r.status === 'no_checkout' || r.status === 'partial',
      isWeeklyOff: r.status === 'off_day' || r.status === 'holiday',
    })) as any;
    const empMap = new Map<string, { name: string; code?: string }>();
    rawEmployees.forEach((e) => {
      if (e.id) empMap.set(e.id, { name: e.name, code: e.code });
    });
    exportAttendanceLogs(rows, empMap, `${startDate}-${endDate}`);
  }, [records, rawEmployees, startDate, endDate]);

  const tableColumns = useMemo<TableColumn<AttendanceRecord>[]>(() => [
    {
      id: 'employee',
      header: 'الموظف',
      render: (record) => names[record.employeeId] || record.employeeId,
      sortKey: (record) => names[record.employeeId] || record.employeeId,
    },
    { id: 'date', header: 'التاريخ', render: (record) => record.date, sortKey: (record) => record.date },
    {
      id: 'checkIn',
      header: 'الحضور',
      render: (record) => {
        if (canEdit && editingId === record.id) {
          return (
            <input
              type="time"
              value={editCheckIn}
              onChange={(e) => setEditCheckIn(e.target.value)}
              className="erp-filter-input-inner max-w-[110px]"
            />
          );
        }
        return toClock(record.checkIn) || '—';
      },
      sortKey: (record) => toClock(record.checkIn),
    },
    {
      id: 'checkOut',
      header: 'الانصراف',
      render: (record) => {
        if (canEdit && editingId === record.id) {
          return (
            <input
              type="time"
              value={editCheckOut}
              onChange={(e) => setEditCheckOut(e.target.value)}
              className="erp-filter-input-inner max-w-[110px]"
            />
          );
        }
        return toClock(record.checkOut) || '—';
      },
      sortKey: (record) => toClock(record.checkOut),
    },
    {
      id: 'workHours',
      header: 'ساعات العمل',
      render: (record) => record.workHours ?? Math.round(((record.workedMinutes || 0) / 60) * 10) / 10,
      sortKey: (record) => record.workHours ?? Math.round(((record.workedMinutes || 0) / 60) * 10) / 10,
    },
    { id: 'late', header: 'تأخير', render: (record) => record.lateMinutes, sortKey: (record) => record.lateMinutes },
    {
      id: 'earlyLeave',
      header: 'خروج مبكر',
      render: (record) => record.earlyLeaveMinutes ?? 0,
      sortKey: (record) => record.earlyLeaveMinutes ?? 0,
    },
    {
      id: 'overtime',
      header: 'إضافي',
      render: (record) => record.overtimeMinutes,
      sortKey: (record) => record.overtimeMinutes,
    },
    {
      id: 'status',
      header: 'الحالة',
      render: (record) => <StatusBadge label={statusLabel(record.status)} type={statusVariant(record.status)} />,
      sortKey: (record) => statusLabel(record.status),
    },
  ], [names, canEdit, editingId, editCheckIn, editCheckOut, statusLabel, statusVariant]);

  const bulkActions = useMemo<TableBulkAction<AttendanceRecord>[]>(() => {
    if (!canEdit) return [];
    return [
      {
        label: 'حذف المحدد',
        icon: 'delete',
        variant: 'danger',
        disabled: actionBusy,
        action: (items) => {
          void handleDeleteRows(items.map((item) => item.id));
        },
      },
    ];
  }, [canEdit, actionBusy, handleDeleteRows]);

  const renderActions = useCallback((record: AttendanceRecord) => {
    const checkInClock = toClock(record.checkIn);
    const checkOutClock = toClock(record.checkOut);
    const isEditing = editingId === record.id;

    if (isEditing) {
      return (
        <div className="flex items-center justify-end gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={actionBusy}
            onClick={() => void handleSaveEdit(record.id)}
          >
            حفظ
          </button>
          <button className="btn btn-secondary btn-sm" onClick={clearEdit}>
            إلغاء
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end gap-1">
        <button
          className={`${ROW_ACTION_BASE_CLASS} hover:text-blue-600 hover:bg-blue-50`}
          disabled={actionBusy}
          onClick={() => startEdit(record.id, checkInClock, checkOutClock)}
          title="تعديل"
        >
          <span className="material-icons-round text-sm">edit</span>
        </button>
        <button
          className={`${ROW_ACTION_BASE_CLASS} hover:text-rose-500 hover:bg-rose-50`}
          disabled={actionBusy}
          onClick={() => void handleDeleteRows([record.id])}
          title="حذف نهائي"
        >
          <span className="material-icons-round text-sm">delete</span>
        </button>
      </div>
    );
  }, [editingId, actionBusy, handleSaveEdit, clearEdit, startEdit, handleDeleteRows]);

  const kpiCards = useMemo(() => [
    { label: 'الإجمالي', value: stats.total },
    { label: 'حضور', value: stats.present },
    { label: 'متأخر', value: stats.late },
    { label: 'غياب', value: stats.absent },
  ], [stats]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحضور اليومي المعالج"
        subtitle="نتائج المعالجة اليومية للحضور (check-in / check-out / ساعات العمل)"
        icon="fact_check"
        secondaryAction={{
          label: 'تصدير Excel',
          icon: 'download',
          onClick: handleExport,
          disabled: records.length === 0,
        }}
        loading={loading || actionBusy}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map((item) => (
          <div key={item.label} className="erp-kpi-card">
            <div className="erp-kpi-label">{item.label}</div>
            <div className="erp-kpi-value">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="erp-filter-bar">
        <div className="erp-date-seg">
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'today' ? 'active' : ''}`}
            onClick={() => applyDatePreset('today')}
          >
            اليوم
          </button>
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'week' ? 'active' : ''}`}
            onClick={() => applyDatePreset('week')}
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            className={`erp-date-seg-btn ${activeRange === 'month' ? 'active' : ''}`}
            onClick={() => applyDatePreset('month')}
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

      {deleteProgress.visible && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>جاري الحذف النهائي...</span>
            <span>{deleteProgress.done}/{deleteProgress.total}</span>
          </div>
          <div className="erp-progress-wrap">
            <div className="erp-progress-bar striped" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <SelectableTable<AttendanceRecord>
        data={records}
        columns={tableColumns}
        getId={(record) => record.id}
        bulkActions={bulkActions}
        renderActions={canEdit ? renderActions : undefined}
        actionsHeader="إجراءات"
        emptyIcon="fact_check"
        emptyTitle="لا توجد بيانات معالجة"
        emptySubtitle="غيّر نطاق التاريخ أو حدّث البيانات"
        tableId="attendance-daily-processed"
        pageSize={25}
        enableSearch={true}
        searchPlaceholder="بحث بالموظف أو الحالة أو التاريخ"
        enableColumnVisibility={true}
        checkboxSelection={canEdit}
        selectAllScope="filtered"
        loading={loading}
      />
    </div>
  );
};
