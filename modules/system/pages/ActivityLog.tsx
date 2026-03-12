import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { activityLogService } from '../services/activityLogService';
import { Card, Badge, LoadingSkeleton, SearchableSelect } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import type {
  ActivityLog as ActivityLogType,
  ActivityAction,
  FirestoreEmployee,
  FirestoreRole,
  UserPresence,
} from '../../../types';
import { employeeService } from '../../hr/employeeService';
import { roleService } from '../services/roleService';
import { presenceService } from '../../../services/presenceService';
import { notificationComposerService } from '../../../services/notificationComposerService';

const PAGE_SIZE = 15;
const HIDDEN_ACTIVITY_ACTIONS = new Set<ActivityAction>([
  'CREATE_REPORT',
  'UPDATE_REPORT',
  'DELETE_REPORT',
]);

const ACTION_LABELS: Partial<Record<ActivityAction, { label: string; icon: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }>> = {
  LOGIN: { label: 'تسجيل دخول', icon: 'login', variant: 'info' },
  LOGOUT: { label: 'تسجيل خروج', icon: 'logout', variant: 'neutral' },
  CREATE_REPORT: { label: 'إنشاء تقرير', icon: 'add_circle', variant: 'success' },
  UPDATE_REPORT: { label: 'تعديل تقرير', icon: 'edit', variant: 'warning' },
  DELETE_REPORT: { label: 'حذف تقرير', icon: 'delete', variant: 'danger' },
  CREATE_USER: { label: 'إنشاء مستخدم', icon: 'person_add', variant: 'success' },
  UPDATE_USER_ROLE: { label: 'تغيير دور', icon: 'swap_horiz', variant: 'warning' },
  TOGGLE_USER_ACTIVE: { label: 'تبديل حالة مستخدم', icon: 'toggle_on', variant: 'warning' },
  APPROVE_USER: { label: 'موافقة على مستخدم', icon: 'check_circle', variant: 'success' },
  REJECT_USER: { label: 'رفض مستخدم', icon: 'cancel', variant: 'danger' },
  CREATE_LEAVE_REQUEST: { label: 'طلب إجازة', icon: 'beach_access', variant: 'info' },
  APPROVE_LEAVE: { label: 'موافقة على إجازة', icon: 'check_circle', variant: 'success' },
  REJECT_LEAVE: { label: 'رفض إجازة', icon: 'cancel', variant: 'danger' },
  CREATE_LOAN_REQUEST: { label: 'طلب سلفة', icon: 'payments', variant: 'info' },
  APPROVE_LOAN: { label: 'موافقة على سلفة', icon: 'check_circle', variant: 'success' },
  REJECT_LOAN: { label: 'رفض سلفة', icon: 'cancel', variant: 'danger' },
  PROCESS_INSTALLMENT: { label: 'معالجة قسط', icon: 'receipt', variant: 'warning' },
};

export const ActivityLogPage: React.FC = () => {
  const { can } = usePermission();
  const canBroadcast = can('roles.manage');
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, FirestoreEmployee>>({});
  const [roles, setRoles] = useState<FirestoreRole[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [targetMode, setTargetMode] = useState<'single' | 'multi' | 'role'>('single');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const result = await activityLogService.getPaginated(PAGE_SIZE);
    setLogs(result.logs);
    setCursor(result.lastDoc);
    setHasMore(result.hasMore);
    setLoading(false);
  }, []);

  const loadMore = async () => {
    if (!cursor || !hasMore) return;
    setLoadingMore(true);
    const result = await activityLogService.getPaginated(PAGE_SIZE, cursor);
    setLogs((prev) => [...prev, ...result.logs]);
    setCursor(result.lastDoc);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([employeeService.getAll(), roleService.getAll()]).then(([employees, rolesRows]) => {
      if (!mounted) return;
      const byId = (employees || []).reduce<Record<string, FirestoreEmployee>>((acc, row) => {
        if (row.id) acc[row.id] = row;
        return acc;
      }, {});
      setEmployeesById(byId);
      setRoles(rolesRows || []);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsub = presenceService.subscribeAll((rows) => setPresences(rows));
    return unsub;
  }, []);

  const formatTimestamp = (ts: any): string => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionInfo = (action: string) => {
    return ACTION_LABELS[action as ActivityAction] ?? {
      label: action,
      icon: 'info',
      variant: 'neutral' as const,
    };
  };

  const activeRows = useMemo(() => (
    presences.filter((row) => row.state !== 'offline')
  ), [presences]);

  const visibleLogs = useMemo(
    () => logs.filter((log) => !HIDDEN_ACTIVITY_ACTIONS.has(log.action as ActivityAction)),
    [logs],
  );

  const employeeOptions = useMemo(
    () =>
      (Object.values(employeesById) as FirestoreEmployee[])
        .filter((e) => e.isActive !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar')),
    [employeesById],
  );

  const employeeSearchOptions = useMemo(
    () =>
      employeeOptions.map((employee) => ({
        value: String(employee.id || ''),
        label: `${employee.name}${employee.code ? ` (${employee.code})` : ''}`,
      })),
    [employeeOptions],
  );

  const filteredEmployeesForMulti = useMemo(() => {
    const needle = employeeSearchQuery.trim().toLowerCase();
    if (!needle) return employeeOptions;
    return employeeOptions.filter((employee) => {
      const name = String(employee.name || '').toLowerCase();
      const code = String(employee.code || '').toLowerCase();
      return name.includes(needle) || code.includes(needle);
    });
  }, [employeeOptions, employeeSearchQuery]);

  const toggleMultiRecipient = (employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };

  const handleRolesChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const ids = Array.from(event.target.selectedOptions as any as HTMLOptionElement[]).map((o) => o.value);
    setSelectedRoleIds(ids);
  };

  const handleSendManual = async () => {
    if (!title.trim() || !message.trim()) {
      setSendResult('اكتب عنوان ورسالة الإشعار أولاً.');
      return;
    }
    if (targetMode === 'role' && selectedRoleIds.length === 0) {
      setSendResult('اختر دور واحد على الأقل.');
      return;
    }
    if ((targetMode === 'single' || targetMode === 'multi') && selectedEmployeeIds.length === 0) {
      setSendResult('اختر مستخدم واحد على الأقل.');
      return;
    }

    setSending(true);
    setSendResult('');
    try {
      const sent = await notificationComposerService.create({
        title,
        message,
        targetMode,
        recipientEmployeeIds: targetMode === 'single' ? selectedEmployeeIds.slice(0, 1) : selectedEmployeeIds,
        roleIds: selectedRoleIds,
      });
      setSendResult(sent > 0 ? `تم إرسال ${sent} إشعار.` : 'لا يوجد مستلمين مطابقين.');
      setMessage('');
    } catch (error) {
      console.error('manual send failed', error);
      setSendResult('فشل إرسال الإشعار، حاول مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="erp-page-head">
        <div className="erp-page-title-block">
          <h1 className="page-title">سجل النشاط</h1>
          <p className="page-subtitle">تتبع جميع الأنشطة والعمليات في النظام</p>
        </div>
        <div className="erp-page-actions">
          <button
            className="btn btn-secondary"
            onClick={fetchLogs}
            title="تحديث"
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>refresh</span>
            تحديث
          </button>
        </div>
      </div>

      {canBroadcast && (
        <Card title="إرسال إشعار يدوي">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)]">نوع الاستهداف</label>
              <select
                className="w-full mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2.5 text-sm"
                value={targetMode}
                onChange={(e) => {
                  const next = e.target.value as 'single' | 'multi' | 'role';
                  setTargetMode(next);
                  setSelectedEmployeeIds([]);
                  setSelectedRoleIds([]);
                  setEmployeeSearchQuery('');
                }}
              >
                <option value="single">مستخدم واحد</option>
                <option value="multi">عدة مستخدمين</option>
                <option value="role">حسب الدور</option>
              </select>
            </div>

            {(targetMode === 'single' || targetMode === 'multi') && (
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">
                  {targetMode === 'single' ? 'اختيار مستخدم' : 'اختيار مستخدمين بالبحث'}
                </label>
                {targetMode === 'single' ? (
                  <SearchableSelect
                    className="mt-1"
                    options={employeeSearchOptions}
                    value={selectedEmployeeIds[0] || ''}
                    onChange={(value) => setSelectedEmployeeIds(value ? [value] : [])}
                    placeholder="ابحث باسم أو كود المستخدم"
                  />
                ) : (
                  <div className="mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2.5 space-y-2">
                    <input
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2 text-sm"
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      placeholder="ابحث باسم أو كود المستخدم"
                    />
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredEmployeesForMulti.map((employee) => {
                        const id = String(employee.id || '');
                        const checked = selectedEmployeeIds.includes(id);
                        return (
                          <label key={id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMultiRecipient(id)}
                            />
                            <span className="text-sm text-[var(--color-text)]">
                              {employee.name} {employee.code ? `(${employee.code})` : ''}
                            </span>
                          </label>
                        );
                      })}
                      {filteredEmployeesForMulti.length === 0 && (
                        <p className="text-xs text-[var(--color-text-muted)] px-2 py-1">لا يوجد نتائج مطابقة.</p>
                      )}
                    </div>
                    {selectedEmployeeIds.length > 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">تم اختيار {selectedEmployeeIds.length} مستخدم</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {targetMode === 'role' && (
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">اختيار الأدوار (Ctrl/Command)</label>
                <select
                  className="w-full mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2 text-sm min-h-[88px]"
                  multiple
                  value={selectedRoleIds}
                  onChange={handleRolesChange}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">عنوان الإشعار</label>
              <input
                className="w-full mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2.5 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تنبيه متابعة الإنتاج"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">الرسالة</label>
              <textarea
                className="w-full mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2.5 text-sm min-h-[90px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="اكتب نص الإشعار"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[var(--color-text-muted)]">{sendResult}</span>
            <button
              className="btn btn-primary"
              onClick={handleSendManual}
              disabled={sending}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>
                {sending ? 'autorenew' : 'send'}
              </span>
              {sending ? 'جاري الإرسال...' : 'إرسال الإشعار'}
            </button>
          </div>
        </Card>
      )}

      <Card title="المستخدمون النشطون الآن">
        {activeRows.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
            لا يوجد مستخدمون نشطون حاليًا.
          </div>
        ) : (
          <div className="space-y-2">
            {activeRows.map((row) => {
              const employee = row.employeeId ? employeesById[row.employeeId] : undefined;
              const stateVariant = row.state === 'online' ? 'success' : 'warning';
              return (
                <div key={row.id} className="flex items-start justify-between gap-3 border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[var(--color-text)] truncate">
                        {employee?.name || row.displayName || row.userEmail || row.userId}
                      </p>
                      <Badge variant={stateVariant}>{row.state === 'online' ? 'متصل' : 'خامل'}</Badge>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      المسار: {row.currentRoute || '—'} | الإجراء: {row.lastAction || '—'}
                    </p>
                  </div>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {formatTimestamp((row as any).lastHeartbeatAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {loading ? (
        <LoadingSkeleton rows={8} type="table" />
      ) : (
        <Card>
          <div className="space-y-0 divide-y divide-[var(--color-border)]">
            {visibleLogs.map((log) => {
              const info = getActionInfo(log.action);
              return (
                <div key={log.id} className="flex items-start gap-4 py-4 px-2">
                  <div className={`w-10 h-10 rounded-[var(--border-radius-lg)] flex items-center justify-center flex-shrink-0 ${
                    info.variant === 'success' ? 'bg-emerald-100' :
                    info.variant === 'warning' ? 'bg-amber-100' :
                    info.variant === 'danger' ? 'bg-rose-100' :
                    info.variant === 'info' ? 'bg-blue-100' :
                    'bg-[#f0f2f5]'
                  }`}>
                    <span className={`material-icons-round text-lg ${
                      info.variant === 'success' ? 'text-emerald-600' :
                      info.variant === 'warning' ? 'text-amber-600' :
                      info.variant === 'danger' ? 'text-rose-600' :
                      info.variant === 'info' ? 'text-blue-600' :
                      'text-slate-500'
                    }`}>{info.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={info.variant}>{info.label}</Badge>
                      <span className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">{log.userEmail}</span>
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{log.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">{formatTimestamp(log.timestamp)}</p>
                  </div>
                </div>
              );
            })}

            {visibleLogs.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <span className="material-icons-round text-5xl block mb-3">history</span>
                <p className="font-bold">لا توجد أنشطة مسجلة</p>
              </div>
            )}
          </div>

          {hasMore && (
            <div className="pt-4 mt-4 border-t border-[var(--color-border)] text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-[#f0f2f5] text-[var(--color-text-muted)] rounded-[var(--border-radius-lg)] text-sm font-bold hover:bg-[#e8eaed] transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2 justify-center">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري التحميل...
                  </span>
                ) : (
                  'تحميل المزيد'
                )}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Summary */}
      <div className="text-xs text-[var(--color-text-muted)] font-medium text-center">
        عرض {visibleLogs.length} نشاط {hasMore ? '(يوجد المزيد)' : '(نهاية السجل)'}
      </div>
    </div>
  );
};
