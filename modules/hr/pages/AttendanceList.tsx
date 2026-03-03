import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { useAppStore } from '@/store/useAppStore';
import { attendanceLogService } from '../attendanceService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreAttendanceLog } from '../types';
import { Timestamp } from 'firebase/firestore';
import { PageHeader } from '../../../components/PageHeader';

type FilterStatus = 'all' | 'late' | 'early' | 'incomplete' | 'absent' | 'weeklyOff';

function formatTimestamp(ts: any): string {
  if (!ts) return '—';
  const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const AttendanceList: React.FC = () => {
  const { can } = usePermission();
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const [logs, setLogs] = useState<FirestoreAttendanceLog[]>([]);
  const [allEmployees, setAllEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getToday);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [shiftFilter, setShiftFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'attendanceList'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  // editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<FirestoreAttendanceLog>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    allEmployees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
      if (e.userId) m.set(e.userId, e.name);
      if (e.code) m.set(e.code, e.name);
    });
    return m;
  }, [allEmployees]);

  const getEmpName = useCallback((id: string) => empNameMap.get(id) || id, [empNameMap]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [data, emps] = await Promise.all([
        attendanceLogService.getByDateRange(startDate, endDate),
        allEmployees.length > 0 ? Promise.resolve(allEmployees) : employeeService.getAll(),
      ]);
      setLogs(data);
      if (allEmployees.length === 0) setAllEmployees(emps);
    } catch (err) {
      console.error('Failed to fetch attendance logs:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (statusFilter !== 'all') {
      result = result.filter((log) => {
        switch (statusFilter) {
          case 'late': return log.lateMinutes > 0;
          case 'early': return log.earlyLeaveMinutes > 0;
          case 'incomplete': return log.isIncomplete;
          case 'absent': return log.isAbsent;
          case 'weeklyOff': return log.isWeeklyOff;
          default: return true;
        }
      });
    }

    if (shiftFilter) {
      result = result.filter((log) => log.shiftId === shiftFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((log) => {
        const name = getEmpName(log.employeeId).toLowerCase();
        return log.employeeId.toLowerCase().includes(q) || name.includes(q) || (log.employeeCode || '').toLowerCase().includes(q);
      });
    }

    return result;
  }, [logs, statusFilter, shiftFilter, searchQuery]);

  // summary stats
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const late = filteredLogs.filter((l) => l.lateMinutes > 0).length;
    const early = filteredLogs.filter((l) => l.earlyLeaveMinutes > 0).length;
    const incomplete = filteredLogs.filter((l) => l.isIncomplete).length;
    const absent = filteredLogs.filter((l) => l.isAbsent).length;
    return { total, late, early, incomplete, absent };
  }, [filteredLogs]);

  const shiftIds = useMemo(() => {
    const set = new Set(logs.map((l) => l.shiftId));
    return Array.from(set);
  }, [logs]);

  const handleEdit = (log: FirestoreAttendanceLog) => {
    setEditingId(log.id ?? null);
    setEditValues({
      lateMinutes: log.lateMinutes,
      earlyLeaveMinutes: log.earlyLeaveMinutes,
      isAbsent: log.isAbsent,
      isIncomplete: log.isIncomplete,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await attendanceLogService.update(editingId, editValues);
      setLogs((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, ...editValues } : l)),
      );
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update attendance log:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('هل أنت متأكد من حذف جميع سجلات هذه الدفعة؟')) return;
    try {
      const deleted = await attendanceLogService.deleteByBatchId(batchId);
      if (deleted > 0) fetchLogs();
    } catch (err) {
      console.error('Failed to delete batch:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="سجل الحضور"
        subtitle="عرض ومراجعة وتصحيح سجلات الحضور اليومية"
        icon="fact_check"
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExportFromPage || filteredLogs.length === 0,
            onClick: () => {
              const rows = filteredLogs.map((l) => ({
                'الموظف': getEmpName(l.employeeId),
                'كود الموظف': l.employeeCode || '—',
                'التاريخ': l.date,
                'الحضور': l.checkIn ? formatTimestamp(l.checkIn) : '—',
                'الانصراف': l.checkOut ? formatTimestamp(l.checkOut) : '—',
                'الساعات': l.totalHours?.toFixed(1) ?? '0',
                'تأخير (دقيقة)': l.lateMinutes || 0,
                'انصراف مبكر (دقيقة)': l.earlyLeaveMinutes || 0,
                'الحالة': l.isAbsent ? 'غائب' : l.isWeeklyOff ? 'إجازة أسبوعية' : l.isIncomplete ? 'ناقص' : 'حاضر',
              }));
              exportHRData(rows, 'سجل الحضور', `حضور-${startDate}-${endDate}`);
            },
          },
        ]}
      />

      {/* Filters */}
      <div className="erp-filter-bar">
        <div className="erp-search-input" style={{ minWidth: 180 }}>
          <span className="material-icons-round">search</span>
          <input
            type="text"
            placeholder="بحث بكود الموظف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>
        <div className="erp-filter-sep" />
        <div className="erp-filter-date">
          <span className="erp-filter-label">من</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="erp-filter-date">
          <span className="erp-filter-label">إلى</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="erp-filter-sep" />
        <select
          className={`erp-filter-select${statusFilter !== 'all' ? ' active' : ''}`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
        >
          <option value="all">كل الحالات</option>
          <option value="late">متأخر</option>
          <option value="early">انصراف مبكر</option>
          <option value="incomplete">ناقص</option>
          <option value="absent">غائب</option>
          <option value="weeklyOff">إجازة أسبوعية</option>
        </select>
        {shiftIds.length > 1 && (
          <select
            className={`erp-filter-select${shiftFilter ? ' active' : ''}`}
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
          >
            <option value="">كل الورديات</option>
            {shiftIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        )}
        <button className="erp-filter-apply" onClick={fetchLogs}>
          <span className="material-icons-round" style={{ fontSize: 14 }}>refresh</span>
          تحديث
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'الإجمالي', value: stats.total, icon: 'groups', color: 'text-primary' },
          { label: 'متأخرون', value: stats.late, icon: 'schedule', color: 'text-rose-500' },
          { label: 'انصراف مبكر', value: stats.early, icon: 'directions_walk', color: 'text-amber-500' },
          { label: 'ناقص', value: stats.incomplete, icon: 'help_outline', color: 'text-orange-500' },
          { label: 'غائبون', value: stats.absent, icon: 'person_off', color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
            <span className={`material-icons-round text-2xl mb-1 block ${s.color}`}>{s.icon}</span>
            <p className="text-xs text-[var(--color-text-muted)] font-bold">{s.label}</p>
            <p className="text-xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-4xl text-primary animate-spin mb-3 block">sync</span>
            <p className="text-sm text-[var(--color-text-muted)] font-bold">جاري التحميل...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-3 block">event_busy</span>
            <p className="text-sm font-bold text-slate-400">لا توجد سجلات حضور في هذه الفترة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الموظف</th>
                  <th className="erp-th">التاريخ</th>
                  <th className="erp-th">الدخول</th>
                  <th className="erp-th">الخروج</th>
                  <th className="erp-th">الساعات</th>
                  <th className="erp-th">تأخير (د)</th>
                  <th className="erp-th">مبكر (د)</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">المصدر</th>
                  <th className="erp-th">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isEditing = editingId === log.id;
                  return (
                    <tr key={log.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                      <td className="py-2.5 px-2 font-bold text-xs">{getEmpName(log.employeeId)}</td>
                      <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">{log.date}</td>
                      <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">{formatTimestamp(log.checkIn)}</td>
                      <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">{formatTimestamp(log.checkOut)}</td>
                      <td className="py-2.5 px-2 font-bold">{log.totalHours}</td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="w-16 border rounded-[var(--border-radius-base)] p-1 text-xs text-center"
                            value={editValues.lateMinutes ?? ''}
                            placeholder="0"
                            onChange={(e) => setEditValues((v) => ({ ...v, lateMinutes: Number(e.target.value) }))}
                          />
                        ) : log.lateMinutes > 0 ? (
                          <span className="text-rose-500 font-bold">{log.lateMinutes}</span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="w-16 border rounded-[var(--border-radius-base)] p-1 text-xs text-center"
                            value={editValues.earlyLeaveMinutes ?? ''}
                            placeholder="0"
                            onChange={(e) => setEditValues((v) => ({ ...v, earlyLeaveMinutes: Number(e.target.value) }))}
                          />
                        ) : log.earlyLeaveMinutes > 0 ? (
                          <span className="text-amber-500 font-bold">{log.earlyLeaveMinutes}</span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <select
                            className="border rounded-[var(--border-radius-base)] p-1 text-xs"
                            value={editValues.isAbsent ? 'absent' : editValues.isIncomplete ? 'incomplete' : 'present'}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditValues((prev) => ({
                                ...prev,
                                isAbsent: v === 'absent',
                                isIncomplete: v === 'incomplete',
                              }));
                            }}
                          >
                            <option value="present">حاضر</option>
                            <option value="absent">غائب</option>
                            <option value="incomplete">ناقص</option>
                          </select>
                        ) : log.isAbsent ? (
                          <Badge variant="danger">غائب</Badge>
                        ) : log.isIncomplete ? (
                          <Badge variant="warning">ناقص</Badge>
                        ) : log.isWeeklyOff ? (
                          <Badge variant="info">إجازة</Badge>
                        ) : (
                          <Badge variant="success">حاضر</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">
                          {log.createdFrom === 'zk_csv' ? 'ZK' : 'يدوي'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              className="p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                            >
                              <span className="material-icons-round text-sm">{savingEdit ? 'sync' : 'check'}</span>
                            </button>
                            <button
                              className="p-1 text-[var(--color-text-muted)] hover:bg-[#f0f2f5] rounded transition-colors"
                              onClick={() => setEditingId(null)}
                            >
                              <span className="material-icons-round text-sm">close</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              className="p-1 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 rounded transition-colors"
                              onClick={() => handleEdit(log)}
                              title="تعديل"
                            >
                              <span className="material-icons-round text-sm">edit</span>
                            </button>
                            {log.processedBatchId && (
                              <button
                                className="p-1 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                onClick={() => handleDeleteBatch(log.processedBatchId)}
                                title="حذف الدفعة"
                              >
                                <span className="material-icons-round text-sm">delete_sweep</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

