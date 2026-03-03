import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useShallowStore } from '../store/useAppStore';
import type { AppNotification } from '../types';

const TYPE_ICONS: Record<string, string> = {
  work_order_assigned: 'assignment',
  work_order_updated: 'edit_note',
  work_order_completed: 'check_circle',
  quality_report_created: 'verified',
  quality_report_updated: 'rule',
};

const TYPE_COLORS: Record<string, string> = {
  work_order_assigned: 'text-blue-500',
  work_order_updated: 'text-amber-500',
  work_order_completed: 'text-emerald-500',
  quality_report_created: 'text-violet-500',
  quality_report_updated: 'text-cyan-500',
};

function timeAgo(createdAt: any): string {
  if (!createdAt) return '';
  const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export const NotificationBell: React.FC = () => {
  const {
    notifications,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    subscribeToNotifications,
  } = useShallowStore((s) => ({
    notifications: s.notifications,
    fetchNotifications: s.fetchNotifications,
    markNotificationRead: s.markNotificationRead,
    markAllNotificationsRead: s.markAllNotificationsRead,
    subscribeToNotifications: s.subscribeToNotifications,
  }));

  const currentEmployeeId = useAppStore((s) => s.currentEmployee?.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentEmployeeId) return;
    fetchNotifications();
    const unsub = subscribeToNotifications();
    return unsub;
  }, [currentEmployeeId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAll = useCallback(() => {
    markAllNotificationsRead();
  }, [markAllNotificationsRead]);

  const handleClick = useCallback((n: AppNotification) => {
    if (!n.isRead) markNotificationRead(n.id!);
    if (n.referenceId && n.type.startsWith('work_order')) {
      setOpen(false);
      navigate(`/work-orders?highlight=${n.referenceId}`);
      return;
    }
    if (n.type.startsWith('quality_report')) {
      setOpen(false);
      navigate('/quality/reports');
    }
  }, [markNotificationRead, navigate]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-[var(--color-text-muted)] hover:bg-[#f0f2f5] rounded-full transition-colors group"
      >
        <span className="material-icons-round">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 left-1 min-w-[18px] h-[18px] flex items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full border-2 border-[var(--color-card)] px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 z-50 erp-notif-panel">
          <div className="erp-notif-head">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-[var(--color-text-muted)] text-[18px]">notifications</span>
              <span className="text-[13px] font-bold text-[var(--color-text)]">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                تعيين الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10">
                <span
                  className="material-icons-round text-4xl text-[var(--color-text-muted)] mb-2 block"
                  style={{ opacity: 0.35 }}
                >
                  notifications_none
                </span>
                <p className="text-xs text-[var(--color-text-muted)]">لا توجد إشعارات</p>
              </div>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`erp-notif-item${!n.isRead ? ' unread' : ''}`}
                >
                  <span className={`material-icons-round text-[20px] mt-0.5 shrink-0 ${TYPE_COLORS[n.type] || 'text-[var(--color-text-muted)]'}`}>
                    {TYPE_ICONS[n.type] || 'notifications'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--color-text)] truncate">{n.title}</p>
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="erp-notif-dot shrink-0"></span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
