import React, { useState, useEffect, useCallback } from 'react';
import { activityLogService, type PaginatedLogs } from '../../../services/activityLogService';
import { Card, Badge, LoadingSkeleton } from '../components/UI';
import type { ActivityLog as ActivityLogType, ActivityAction } from '../../../types';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

const PAGE_SIZE = 15;

const ACTION_LABELS: Record<ActivityAction, { label: string; icon: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
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
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">سجل النشاط</h2>
          <p className="text-sm text-slate-500 font-medium">تتبع جميع الأنشطة والعمليات في النظام.</p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
          title="تحديث"
        >
          <span className="material-icons-round">refresh</span>
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} type="table" />
      ) : (
        <Card>
          <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((log) => {
              const info = getActionInfo(log.action);
              return (
                <div key={log.id} className="flex items-start gap-4 py-4 px-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    info.variant === 'success' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                    info.variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                    info.variant === 'danger' ? 'bg-rose-100 dark:bg-rose-900/30' :
                    info.variant === 'info' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    'bg-slate-100 dark:bg-slate-800'
                  }`}>
                    <span className={`material-icons-round text-lg ${
                      info.variant === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
                      info.variant === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                      info.variant === 'danger' ? 'text-rose-600 dark:text-rose-400' :
                      info.variant === 'info' ? 'text-blue-600 dark:text-blue-400' :
                      'text-slate-500'
                    }`}>{info.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={info.variant}>{info.label}</Badge>
                      <span className="text-xs text-slate-400 font-mono" dir="ltr">{log.userEmail}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{log.description}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatTimestamp(log.timestamp)}</p>
                  </div>
                </div>
              );
            })}

            {logs.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <span className="material-icons-round text-5xl block mb-3">history</span>
                <p className="font-bold">لا توجد أنشطة مسجلة</p>
              </div>
            )}
          </div>

          {hasMore && (
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
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
      <div className="text-xs text-slate-400 font-medium text-center">
        عرض {logs.length} نشاط {hasMore ? '(يوجد المزيد)' : '(نهاية السجل)'}
      </div>
    </div>
  );
};
