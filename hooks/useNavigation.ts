/**
 * Lightweight navigation hooks: badge counters, active route, collapse state.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MENU_CONFIG, ALL_MENU_ITEMS, type MenuItem } from '../config/menu.config';
import { logicalPathnameFromLocation } from '../lib/tenantPaths';

// ─── Badge Counts (approval-center + payroll, refreshed every 60s) ──────────

const BADGE_INTERVAL = 60_000;

export function useBadgeCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const items = ALL_MENU_ITEMS.filter((i) => i.badgeSource);
    const results = await Promise.allSettled(
      items.map(async (item) => ({ key: item.key, count: await item.badgeSource!() })),
    );
    if (!mounted.current) return;

    const next: Record<string, number> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.count > 0) {
        next[r.value.key] = r.value.count;
      }
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, BADGE_INTERVAL);
    return () => { mounted.current = false; clearInterval(id); };
  }, [refresh]);

  return counts;
}

// ─── Active Route (supports nested routes like /employees/123) ──────────────

export function useActiveRoute() {
  const { pathname } = useLocation();
  const logicalPath = logicalPathnameFromLocation(pathname);

  const isActive = useCallback(
    (item: MenuItem): boolean => {
      if (logicalPath === item.path) return true;
      if (item.activePatterns?.some((p) => logicalPath.startsWith(p))) {
        if (item.activePathExcludePrefixes?.some((ex) => logicalPath.startsWith(ex))) return false;
        return true;
      }
      if (item.path !== '/' && logicalPath.startsWith(`${item.path}/`)) {
        if (item.activePathExcludePrefixes?.some((ex) => logicalPath.startsWith(ex))) return false;
        return true;
      }
      return false;
    },
    [logicalPath],
  );

  const isGroupActive = useCallback(
    (groupKey: string): boolean => {
      const g = MENU_CONFIG.find((g) => g.key === groupKey);
      return g ? g.children.some((c) => isActive(c)) : false;
    },
    [isActive],
  );

  return { isActive, isGroupActive };
}

// ─── Sidebar Collapse (persisted in localStorage) ───────────────────────────

const COLLAPSE_KEY = 'sidebar_collapsed';

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; }
    catch { return false; }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
