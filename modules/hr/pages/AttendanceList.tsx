import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { attendanceLogService } from '../attendanceService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreAttendanceLog } from '../types';
import { Timestamp } from 'firebase/firestore';

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
  const [logs, setLogs] = useState<FirestoreAttendanceLog[]>([]);
  const [allEmployees, setAllEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getToday);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [shiftFilter, setShiftFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            سجل الحضور
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            عرض ومراجعة وتصحيح سجلات الحضور اليومية.
          </p>
        </div>
        {filteredLogs.length > 0 && can('export') && (
          <Button variant="outline" onClick={() => {
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
          }}>
            <span className="material-icons-round text-sm">download</span>
            تصدير Excel
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-500">من تاريخ</label>
            <input
              type="date"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-500">إلى تاريخ</label>
            <input
              type="date"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 min-w-[140px]">
            <label className="block text-xs font-bold text-slate-500">الحالة</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            >
              <option value="all">الكل</option>
              <option value="late">متأخر</option>
              <option value="early">انصراف مبكر</option>
              <option value="incomplete">ناقص</option>
              <option value="absent">غائب</option>
              <option value="weeklyOff">إجازة أسبوعية</option>
            </select>
          </div>
          {shiftIds.length > 1 && (
            <div className="space-y-1.5 min-w-[140px]">
              <label className="block text-xs font-bold text-slate-500">الوردية</label>
              <select
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
              >
                <option value="">الكل</option>
                {shiftIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5 flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-500">بحث بكود الموظف</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-lg">search</span>
              <input
                type="text"
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 pr-10 outline-none font-medium"
                placeholder="كود الموظف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <Button variant="outline" onClick={fetchLogs}>
            <span className="material-icons-round text-sm">refresh</span>
            تحديث
          </Button>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'الإجمالي', value: stats.total, icon: 'groups', color: 'text-primary' },
          { label: 'متأخرون', value: stats.late, icon: 'schedule', color: 'text-rose-500' },
          { label: 'انصراف مبكر', value: stats.early, icon: 'directions_walk', color: 'text-amber-500' },
          { label: 'ناقص', value: stats.incomplete, icon: 'help_outline', color: 'text-orange-500' },
          { label: 'غائبون', value: stats.absent, icon: 'person_off', color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
            <span className={`material-icons-round text-2xl mb-1 block ${s.color}`}>{s.icon}</span>
            <p className="text-xs text-slate-400 font-bold">{s.label}</p>
            <p className="text-xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-4xl text-primary animate-spin mb-3 block">sync</span>
            <p className="text-sm text-slate-400 font-bold">جاري التحميل...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-slate-200 dark:text-slate-700 mb-3 block">event_busy</span>
            <p className="text-sm font-bold text-slate-400">لا توجد سجلات حضور في هذه الفترة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                  <th className="text-right py-3 px-2">الموظف</th>
                  <th className="text-right py-3 px-2">التاريخ</th>
                  <th className="text-right py-3 px-2">الدخول</th>
                  <th className="text-right py-3 px-2">الخروج</th>
                  <th className="text-right py-3 px-2">الساعات</th>
                  <th className="text-right py-3 px-2">تأخير (د)</th>
                  <th className="text-right py-3 px-2">مبكر (د)</th>
                  <th className="text-right py-3 px-2">الحالة</th>
                  <th className="text-right py-3 px-2">المصدر</th>
                  <th className="text-right py-3 px-2">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isEditing = editingId === log.id;
                  return (
                    <tr key={log.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
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
                            className="w-16 border rounded-lg p-1 text-xs text-center"
                            value={editValues.lateMinutes ?? 0}
                            onChange={(e) => setEditValues((v) => ({ ...v, lateMinutes: Number(e.target.value) }))}
                          />
                        ) : log.lateMinutes > 0 ? (
                          <span className="text-rose-500 font-bold">{log.lateMinutes}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="w-16 border rounded-lg p-1 text-xs text-center"
                            value={editValues.earlyLeaveMinutes ?? 0}
                            onChange={(e) => setEditValues((v) => ({ ...v, earlyLeaveMinutes: Number(e.target.value) }))}
                          />
                        ) : log.earlyLeaveMinutes > 0 ? (
                          <span className="text-amber-500 font-bold">{log.earlyLeaveMinutes}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <select
                            className="border rounded-lg p-1 text-xs"
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
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
                              className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                              onClick={() => setEditingId(null)}
                            >
                              <span className="material-icons-round text-sm">close</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                              onClick={() => handleEdit(log)}
                              title="تعديل"
                            >
                              <span className="material-icons-round text-sm">edit</span>
                            </button>
                            {log.processedBatchId && (
                              <button
                                className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
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

