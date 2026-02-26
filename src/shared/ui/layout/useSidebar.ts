import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ALL_MENU_ITEMS, MENU_CONFIG, type MenuItem } from '@/config/menu.config';

const SIDEBAR_COLLAPSE_KEY = 'ui.sidebar.collapsed';
const BADGE_REFRESH_INTERVAL = 60_000;

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      } catch {
        // No-op for restricted browser storage.
      }
      return next;
    });
  }, []);

  return { collapsed, toggleCollapse };
}

export function useSidebarBadges() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const itemsWithBadges = ALL_MENU_ITEMS.filter((item) => item.badgeSource);
    if (!itemsWithBadges.length) {
      return;
    }

    const results = await Promise.allSettled(
      itemsWithBadges.map(async (item) => ({
        key: item.key,
        count: await item.badgeSource!(),
      })),
    );

    if (!mountedRef.current) {
      return;
    }

    const nextCounts: Record<string, number> = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.count > 0) {
        nextCounts[result.value.key] = result.value.count;
      }
    });

    setCounts(nextCounts);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, BADGE_REFRESH_INTERVAL);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  return counts;
}

export function useSidebarActiveRoute() {
  const { pathname } = useLocation();

  const isActiveItem = useCallback(
    (item: MenuItem) => {
      if (pathname === item.path) {
        return true;
      }
      if (item.activePatterns?.some((pattern) => pathname.startsWith(pattern))) {
        return true;
      }
      return item.path !== '/' && pathname.startsWith(`${item.path}/`);
    },
    [pathname],
  );

  const activeGroupKey = useMemo(() => {
    const activeGroup = MENU_CONFIG.find((group) =>
      group.children.some((item) => isActiveItem(item)),
    );
    return activeGroup?.key ?? null;
  }, [isActiveItem]);

  const isActiveGroup = useCallback(
    (groupKey: string) => {
      return MENU_CONFIG.some(
        (group) => group.key === groupKey && group.children.some((item) => isActiveItem(item)),
      );
    },
    [isActiveItem],
  );

  return { isActiveItem, isActiveGroup, activeGroupKey };
}
