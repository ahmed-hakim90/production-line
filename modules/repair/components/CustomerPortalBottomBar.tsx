import React from 'react';
import { ClipboardList, PackagePlus, RefreshCw, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS,
  type CustomerPortalTab,
} from '../lib/customerPortalBottomBar';

interface CustomerPortalBottomBarProps {
  activeTab: CustomerPortalTab;
  onTabChange: (tab: CustomerPortalTab) => void;
  /** Optional badge count on «طلباتي» (open drafts are not counted). */
  requestsCount?: number;
  eventsCount?: number;
}

const ICONS: Record<CustomerPortalTab, React.ComponentType<{ size?: number; className?: string }>> = {
  requests: ClipboardList,
  compose: PackagePlus,
  timeline: RefreshCw,
  profile: UserRound,
};

export const CustomerPortalBottomBar: React.FC<CustomerPortalBottomBarProps> = ({
  activeTab,
  onTabChange,
  requestsCount,
  eventsCount,
}) => {
  const hasPrimary = CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.some((item) => item.primary);

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur',
        hasPrimary ? 'pt-5' : 'pt-1.5',
      )}
      aria-label="تنقل بوابة العميل"
    >
      <div
        className="mx-auto grid max-w-md items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.length}, minmax(0, 1fr))` }}
      >
        {CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.map((item) => {
          const active = activeTab === item.key;
          const isPrimary = Boolean(item.primary);
          const Icon = ICONS[item.key];
          const badge =
            item.key === 'requests' && requestsCount && requestsCount > 0
              ? requestsCount
              : item.key === 'timeline' && eventsCount && eventsCount > 0
                ? eventsCount
                : null;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex min-w-0 flex-col items-center justify-end gap-1 rounded-xl px-1 py-1.5 text-[10.5px] font-bold transition-colors',
                active ? 'text-sky-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                isPrimary && 'relative -mt-5',
              )}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center rounded-full transition-colors',
                  isPrimary
                    ? 'h-11 w-11 border-4 border-white bg-sky-600 text-white shadow-lg shadow-sky-600/25'
                    : 'h-7 w-7',
                  active && !isPrimary && 'bg-sky-50',
                )}
              >
                <Icon size={isPrimary ? 21 : 19} />
                {badge != null && (
                  <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
