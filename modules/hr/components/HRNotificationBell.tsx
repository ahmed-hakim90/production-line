import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrNotificationService } from '../approval/notifications';
import { employeeService } from '../employeeService';
import type { HRNotification } from '../types';

interface HRNotificationBellProps {
  employeeId: string;
}

export const HRNotificationBell: React.FC<HRNotificationBellProps> = ({ employeeId }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HRNotification[]>([]);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const uid = await employeeService.getUserIdByEmployeeId(employeeId);
      if (active) setUserId(uid || '');
    })();
    return () => {
      active = false;
    };
  }, [employeeId]);

  useEffect(() => {
    if (!userId) return undefined;
    return hrNotificationService.subscribeUnread(userId, setItems);
  }, [userId]);

  const unreadCount = items.length;
  const hasUnread = unreadCount > 0;

  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [items],
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] flex items-center justify-center"
      >
        <span className="material-icons-round text-[var(--color-text-muted)]">notifications</span>
        {hasUnread && (
          <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-[340px] max-w-[90vw] bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-xl z-40">
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="text-xs font-bold">الإشعارات</div>
            <button
              onClick={() => userId && hrNotificationService.markAllRead(userId)}
              className="text-xs text-primary font-bold"
            >
              تحديد الكل كمقروء
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="px-3 py-5 text-xs text-[var(--color-text-muted)]">لا توجد إشعارات غير مقروءة</div>
            ) : (
              sorted.map((n) => (
                <button
                  key={n.id}
                  className="w-full text-right px-3 py-2 border-b border-[var(--color-border)] hover:bg-[#f8f9fa]"
                  onClick={async () => {
                    if (n.id) await hrNotificationService.markRead(n.id);
                    setOpen(false);
                    navigate(n.actionUrl || '/approval-center');
                  }}
                >
                  <div className="text-xs font-bold">{n.title}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-1">{n.body}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {n.createdAt?.toDate?.()?.toLocaleString('ar-EG') || ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
