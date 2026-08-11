import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { activityLogService } from '../services/activityLogService';
import { Badge, Button, LoadingSkeleton, SearchableSelect } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { usePermission } from '../../../utils/permissions';
import { employeeService } from '../../hr/employeeService';
import { roleService } from '../services/roleService';
import { presenceService } from '../../../services/presenceService';
import { notificationComposerService } from '../../../services/notificationComposerService';
import { userService } from '../../../services/userService';
import type {
  ActivityLog as ActivityLogType,
  ActivityAction,
  FirestoreEmployee,
  FirestoreRole,
  FirestoreUser,
  UserPresence,
} from '../../../types';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

const PAGE_SIZE = 20;
const HIDDEN_ACTIVITY_ACTIONS = new Set<ActivityAction>([
  'CREATE_REPORT',
  'UPDATE_REPORT',
  'DELETE_REPORT',
]);

function formatActivityMetadataJson(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const keys = Object.keys(metadata as object).filter((k) => {
    const v = (metadata as Record<string, unknown>)[k];
    return v !== undefined && v !== null && v !== '';
  });
  if (keys.length === 0) return null;
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return null;
  }
}

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
  ROUTING_SOFT_DELETE_PLAN: { label: 'حذف مسار إنتاج', icon: 'delete', variant: 'danger' },
  CUSTOMER_CREATE: { label: 'إنشاء عميل', icon: 'person_add', variant: 'success' },
  CUSTOMER_UPDATE: { label: 'تحديث عميل', icon: 'edit', variant: 'warning' },
  CUSTOMER_IMPORT: { label: 'استيراد عملاء', icon: 'upload_file', variant: 'info' },
};

interface ActivityLogUserGroup {
  userKey: string;
  userId: string;
  userEmail: string;
  logs: ActivityLogType[];
}

interface ActivityLogDayGroup {
  dayKey: string;
  dayDate: Date;
  users: ActivityLogUserGroup[];
}

export const ActivityLogPage: React.FC = () => {
  const { can } = usePermission();
  const canBroadcast = can('roles.manage');
  const loadLogPage = useCallback(async (cursor: Parameters<typeof activityLogService.getPaginated>[1] = null) => {
    const result = await activityLogService.getPaginated(PAGE_SIZE, cursor);
    return { items: result.logs, nextCursor: result.lastDoc, hasNext: result.hasMore };
  }, []);
  const logPager = useCursorPagination<ActivityLogType, NonNullable<Awaited<ReturnType<typeof activityLogService.getPaginated>>['lastDoc']>>({
    queryKey: 'system:activity-log',
    loadPage: loadLogPage,
  });
  const logs = logPager.items;
  const loading = logPager.loading;
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, FirestoreEmployee>>({});
  const [accountUsersById, setAccountUsersById] = useState<Record<string, FirestoreUser>>({});
  const [roles, setRoles] = useState<FirestoreRole[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [targetMode, setTargetMode] = useState<'single' | 'multi' | 'role'>('single');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const reloadLogs = useCallback(async () => {
    await logPager.refresh();
  }, [logPager.refresh]);

  useEffect(() => {
    if (!canBroadcast) return;
    let mounted = true;
    void Promise.all([employeeService.getAll(), roleService.getAll(), userService.getAll()]).then(
      ([employees, rolesRows, users]) => {
        if (!mounted) return;
        const byId = (employees || []).reduce<Record<string, FirestoreEmployee>>((acc, row) => {
          if (row.id) acc[row.id] = row;
          return acc;
        }, {});
        const usersById = (users || []).reduce<Record<string, FirestoreUser>>((acc, row) => {
          if (row.id && row.isActive !== false) acc[row.id] = row;
          return acc;
        }, {});
        setEmployeesById(byId);
        setAccountUsersById(usersById);
        setRoles(rolesRows || []);
      },
    );
    return () => {
      mounted = false;
    };
  }, [canBroadcast]);

  useEffect(() => {
    const unsub = presenceService.subscribeAll((rows) => setPresences(rows));
    return unsub;
  }, []);

  const toTimestampDate = (ts: any): Date | null => {
    if (!ts) return null;
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const toTimestampMillis = (ts: any): number => {
    const date = toTimestampDate(ts);
    return date ? date.getTime() : 0;
  };

  const getLocalDayKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDayHeading = (date: Date): string => (
    date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  );

  const formatTimestamp = (ts: any): string => {
    const date = toTimestampDate(ts);
    if (!date) return '—';
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

  const groupedVisibleLogs = useMemo<ActivityLogDayGroup[]>(() => {
    const dayMap = new Map<string, { dayDate: Date; usersMap: Map<string, ActivityLogUserGroup> }>();

    visibleLogs.forEach((log) => {
      const logDate = toTimestampDate(log.timestamp);
      if (!logDate) return;

      const dayKey = getLocalDayKey(logDate);
      const userId = String(log.userId || '');
      const userEmail = String(log.userEmail || userId || 'unknown');
      const userKey = userId || userEmail;

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { dayDate: logDate, usersMap: new Map<string, ActivityLogUserGroup>() });
      }

      const dayEntry = dayMap.get(dayKey)!;
      if (!dayEntry.usersMap.has(userKey)) {
        dayEntry.usersMap.set(userKey, {
          userKey,
          userId,
          userEmail,
          logs: [],
        });
      }

      dayEntry.usersMap.get(userKey)!.logs.push(log);
    });

    return Array.from(dayMap.entries())
      .map(([dayKey, dayEntry]) => {
        const users = Array.from(dayEntry.usersMap.values())
          .map((userGroup) => ({
            ...userGroup,
            logs: [...userGroup.logs].sort(
              (a, b) => toTimestampMillis(b.timestamp) - toTimestampMillis(a.timestamp),
            ),
          }))
          .sort((a, b) => {
            const aLatest = a.logs[0] ? toTimestampMillis(a.logs[0].timestamp) : 0;
            const bLatest = b.logs[0] ? toTimestampMillis(b.logs[0].timestamp) : 0;
            return bLatest - aLatest;
          });

        return {
          dayKey,
          dayDate: dayEntry.dayDate,
          users,
        };
      })
      .sort((a, b) => b.dayDate.getTime() - a.dayDate.getTime());
  }, [visibleLogs]);

  /** Only employees linked to an active login account — notification/push recipients. */
  const accountLinkedEmployees = useMemo(() => {
    const rows = (Object.values(employeesById) as FirestoreEmployee[])
      .filter((e) => {
        if (e.isActive === false) return false;
        const userId = String(e.userId || '').trim();
        return Boolean(userId && accountUsersById[userId]);
      })
      .map((employee) => {
        const user = accountUsersById[String(employee.userId || '')];
        const email = String(user?.email || employee.email || '').trim();
        const displayName = String(user?.displayName || '').trim();
        const label = [
          employee.name || displayName || email || 'مستخدم',
          employee.code ? `(${employee.code})` : '',
          email ? `— ${email}` : '',
        ].filter(Boolean).join(' ');
        return { employee, user, email, displayName, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    return rows;
  }, [employeesById, accountUsersById]);

  const employeeOptions = useMemo(
    () => accountLinkedEmployees.map((row) => row.employee),
    [accountLinkedEmployees],
  );

  const employeeSearchOptions = useMemo(
    () =>
      accountLinkedEmployees.map((row) => ({
        value: String(row.employee.id || ''),
        label: row.label,
      })),
    [accountLinkedEmployees],
  );

  const filteredEmployeesForMulti = useMemo(() => {
    const needle = employeeSearchQuery.trim().toLowerCase();
    if (!needle) return accountLinkedEmployees;
    return accountLinkedEmployees.filter((row) => {
      const name = String(row.employee.name || '').toLowerCase();
      const code = String(row.employee.code || '').toLowerCase();
      const email = row.email.toLowerCase();
      const displayName = row.displayName.toLowerCase();
      return (
        name.includes(needle)
        || code.includes(needle)
        || email.includes(needle)
        || displayName.includes(needle)
      );
    });
  }, [accountLinkedEmployees, employeeSearchQuery]);

  const toggleMultiRecipient = (employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };

  const visibleMultiIds = useMemo(
    () => filteredEmployeesForMulti.map((row) => String(row.employee.id || '')).filter(Boolean),
    [filteredEmployeesForMulti],
  );

  const allVisibleSelected =
    visibleMultiIds.length > 0 && visibleMultiIds.every((id) => selectedEmployeeIds.includes(id));

  const selectAllVisibleRecipients = () => {
    setSelectedEmployeeIds((prev) => Array.from(new Set([...prev, ...visibleMultiIds])));
  };

  const clearVisibleRecipients = () => {
    const visible = new Set(visibleMultiIds);
    setSelectedEmployeeIds((prev) => prev.filter((id) => !visible.has(id)));
  };

  const selectAllActiveRecipients = () => {
    setSelectedEmployeeIds(
      employeeOptions.map((e) => String(e.id || '')).filter(Boolean),
    );
  };

  const clearAllRecipients = () => {
    setSelectedEmployeeIds([]);
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
      setSendResult(sent > 0 ? `تم إرسال ${sent} إشعار.` : 'لا يوجد مستلمون مطابقون.');
      setMessage('');
    } catch (error) {
      console.error('manual send failed', error);
      setSendResult('فشل إرسال الإشعار، حاول مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="سجل النشاط"
      rangeLabel={`تتبع الأحداث والعمليات؛ يُعرض ${PAGE_SIZE} سجلًا في كل صفحة. أحداث تقارير الإنتاج (إنشاء/تعديل/حذف) غير معروضة هنا.`}
      actions={(
        <Button
          variant="secondary"
          onClick={() => void reloadLogs()}
          title="تحديث"
        >
          تحديث
        </Button>
      )}
    >
      {canBroadcast && (
        <OpsDashPanel title="إرسال إشعار يدوي" accent="hr">
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
                  {targetMode === 'single' ? 'اختيار مستخدم له حساب' : 'اختيار مستخدمين لهم حساب'}
                </label>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  يظهر فقط الحسابات النشطة المرتبطة بملف موظف. غير المرتبطين من صفحة المستخدمين لن يظهروا هنا.
                  {accountLinkedEmployees.length === 0
                    ? ' — لا يوجد حالياً مستخدمون مرتبطون.'
                    : ` — ${accountLinkedEmployees.length} مستخدم.`}
                </p>
                {targetMode === 'single' ? (
                  <SearchableSelect
                    className="mt-1"
                    options={employeeSearchOptions}
                    value={selectedEmployeeIds[0] || ''}
                    onChange={(value) => setSelectedEmployeeIds(value ? [value] : [])}
                    placeholder="ابحث بالاسم أو الكود أو الإيميل"
                  />
                ) : (
                  <div className="mt-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-card)] p-2.5 space-y-2">
                    <input
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2 text-sm"
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      placeholder="ابحث بالاسم أو الكود أو الإيميل"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!h-auto !px-2 !py-1 text-[11px]"
                        onClick={allVisibleSelected ? clearVisibleRecipients : selectAllVisibleRecipients}
                        disabled={visibleMultiIds.length === 0}
                      >
                        {allVisibleSelected ? 'إلغاء الظاهر' : 'تحديد الظاهر'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!h-auto !px-2 !py-1 text-[11px]"
                        onClick={selectAllActiveRecipients}
                        disabled={employeeOptions.length === 0}
                      >
                        تحديد الكل
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!h-auto !px-2 !py-1 text-[11px]"
                        onClick={clearAllRecipients}
                        disabled={selectedEmployeeIds.length === 0}
                      >
                        مسح الكل
                      </Button>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        ظاهر {visibleMultiIds.length} · مختار {selectedEmployeeIds.length}
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredEmployeesForMulti.map((row) => {
                        const id = String(row.employee.id || '');
                        const checked = selectedEmployeeIds.includes(id);
                        return (
                          <label key={id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMultiRecipient(id)}
                            />
                            <span className="text-sm text-[var(--color-text)]">{row.label}</span>
                          </label>
                        );
                      })}
                      {filteredEmployeesForMulti.length === 0 && (
                        <p className="text-xs text-[var(--color-text-muted)] px-2 py-1">
                          {accountLinkedEmployees.length === 0
                            ? 'لا يوجد مستخدمون مرتبطون بموظفين. اربطهم من صفحة المستخدمين أولاً.'
                            : 'لا توجد نتائج مطابقة.'}
                        </p>
                      )}
                    </div>
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
            <Button
              onClick={handleSendManual}
              disabled={sending}
            >
              {sending ? 'جاري الإرسال...' : 'إرسال الإشعار'}
            </Button>
          </div>
        </OpsDashPanel>
      )}

      <OpsDashPanel title="المستخدمون المتصلون الآن" accent="hr">
        {activeRows.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
            لا يوجد مستخدمون متصلون حاليًا.
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
      </OpsDashPanel>

      {loading ? (
        <LoadingSkeleton rows={8} type="table" />
      ) : (
        <OpsDashPanel title="سجل الأحداث" accent="hr">
          <div className="space-y-5">
            {groupedVisibleLogs.map((dayGroup) => (
              <section key={dayGroup.dayKey} className="space-y-3">
                <div className="px-1">
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{formatDayHeading(dayGroup.dayDate)}</h3>
                </div>

                <div className="space-y-3">
                  {dayGroup.users.map((userGroup) => {
                    const employeeName = userGroup.userId ? employeesById[userGroup.userId]?.name : '';
                    const userLabel = employeeName ? `${employeeName} (${userGroup.userEmail})` : userGroup.userEmail;

                    return (
                      <div key={`${dayGroup.dayKey}-${userGroup.userKey}`} className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                          <p className="text-sm font-bold text-[var(--color-text)] truncate" dir="ltr">{userLabel}</p>
                          <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{userGroup.logs.length} حدث</span>
                        </div>

                        <div className="divide-y divide-[var(--color-border)]">
                          {userGroup.logs.map((log) => {
                            const info = getActionInfo(log.action);
                            return (
                              <div key={log.id} className="flex items-start gap-4 py-4 px-2">
                                <div className={`w-10 h-10 rounded-[var(--border-radius-lg)] flex items-center justify-center flex-shrink-0 ${
                                  info.variant === 'success' ? 'bg-[rgb(var(--color-success)/0.1)]' :
                                  info.variant === 'warning' ? 'bg-[rgb(var(--color-warning)/0.1)]' :
                                  info.variant === 'danger' ? 'bg-[rgb(var(--color-danger)/0.1)]' :
                                  info.variant === 'info' ? 'bg-[rgb(var(--color-primary)/0.1)]' :
                                  'bg-[var(--color-surface-hover)]'
                                }`}>
                                  <span className={`material-icons-round text-lg ${
                                    info.variant === 'success' ? 'text-[rgb(var(--color-success))]' :
                                    info.variant === 'warning' ? 'text-[rgb(var(--color-warning))]' :
                                    info.variant === 'danger' ? 'text-[rgb(var(--color-danger))]' :
                                    info.variant === 'info' ? 'text-[rgb(var(--color-primary))]' :
                                    'text-[var(--color-text-muted)]'
                                  }`}>{info.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant={info.variant}>{info.label}</Badge>
                                    <span className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">{log.userEmail}</span>
                                  </div>
                                  <p className="text-sm font-medium text-[var(--color-text)]">{log.description}</p>
                                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{formatTimestamp(log.timestamp)}</p>
                                  {(() => {
                                    const extra = formatActivityMetadataJson(log.metadata as Record<string, unknown> | undefined);
                                    if (!extra) return null;
                                    return (
                                      <details className="mt-2 group/details">
                                        <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] list-none flex items-center gap-1">
                                          <span className="material-icons-round text-sm transition-transform group-open/details:rotate-90" style={{ fontSize: 16 }}>chevron_right</span>
                                          بيانات إضافية (metadata)
                                        </summary>
                                        <pre
                                          className="mt-2 p-2.5 rounded-[var(--border-radius-base)] bg-[var(--color-bg)] border border-[var(--color-border)] overflow-x-auto max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-left"
                                          dir="ltr"
                                        >
                                          {extra}
                                        </pre>
                                      </details>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {visibleLogs.length === 0 && (
              <div className="py-16 text-center text-[var(--color-text-muted)]">
                <span className="material-icons-round text-5xl block mb-3">history</span>
                <p className="font-bold">لا توجد أحداث مسجلة</p>
              </div>
            )}
          </div>

          <DataPaginationFooter
            page={logPager.page}
            itemCount={visibleLogs.length}
            itemLabel="نشاط"
            hasPrevious={logPager.hasPrevious}
            hasNext={logPager.hasNext}
            onPrevious={logPager.previous}
            onNext={() => void logPager.next()}
            loading={loading}
          />
        </OpsDashPanel>
      )}

      {/* Summary */}
      <div className="text-xs text-[var(--color-text-muted)] font-medium text-center">
        عرض {visibleLogs.length} نشاط في الصفحة الحالية
      </div>
    </ModuleOpsPageShell>
  );
};
