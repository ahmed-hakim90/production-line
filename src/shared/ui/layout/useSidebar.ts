import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ALL_MENU_ITEMS, MENU_CONFIG, type MenuItem } from '@/config/menu.config';
import { logicalPathnameFromLocation } from '@/lib/tenantPaths';

const SIDEBAR_COLLAPSE_KEY = 'ui.sidebar.collapsed';
const BADGE_REFRESH_INTERVAL = 60_000;

// ─── Shared Sidebar Context ───────────────────────────────────────────────────
// Single source of truth — all components share the same collapsed state.

interface SidebarContextValue {
  collapsed: boolean;
  toggleCollapse: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: true,
  toggleCollapse: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      } catch {
        // No-op for restricted browser storage.
      }
      return next;
    });
  }, []);

  return React.createElement(
    SidebarContext.Provider,
    { value: { collapsed, toggleCollapse } },
    children,
  );
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}

// ─── Badge Counts ─────────────────────────────────────────────────────────────

export function useSidebarBadges() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const itemsWithBadges = ALL_MENU_ITEMS.filter((item) => item.badgeSource);
    if (!itemsWithBadges.length) return;

    const results = await Promise.allSettled(
      itemsWithBadges.map(async (item) => ({
        key: item.key,
        count: await item.badgeSource!(),
      })),
    );

    if (!mountedRef.current) return;

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
    const intervalId = window.setInterval(() => void refresh(), BADGE_REFRESH_INTERVAL);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  return counts;
}

// ─── Active Route ─────────────────────────────────────────────────────────────

export function useSidebarActiveRoute() {
  const { pathname, search } = useLocation();

  const isActiveItem = useCallback(
    (item: MenuItem) => {
      const logicalPath = logicalPathnameFromLocation(pathname);
      if (item.path.includes('?')) {
        const [itemPath, itemQuery = ''] = item.path.split('?');
        if (logicalPath !== itemPath) return false;
        const currentParams = new URLSearchParams(search);
        const targetParams  = new URLSearchParams(itemQuery);
        return Array.from(targetParams.entries()).every(([k, v]) => currentParams.get(k) === v);
      }
      if (logicalPath === item.path) return true;
      if (item.activePatterns?.some((p) => logicalPath.startsWith(p))) return true;
      return item.path !== '/' && logicalPath.startsWith(`${item.path}/`);
    },
    [pathname, search],
  );

  const activeGroupKey = useMemo(() => {
    return MENU_CONFIG.find((g) => g.children.some((i) => isActiveItem(i)))?.key ?? null;
  }, [isActiveItem]);

  const isActiveGroup = useCallback(
    (groupKey: string) =>
      MENU_CONFIG.some((g) => g.key === groupKey && g.children.some((i) => isActiveItem(i))),
    [isActiveItem],
  );

  return { isActiveItem, isActiveGroup, activeGroupKey };
}
