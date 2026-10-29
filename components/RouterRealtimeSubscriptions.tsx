import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { shouldDeferProductionRealtime } from '../lib/productionRealtimeRoutes';
import { useAppStore } from '../store/useAppStore';
import { useAuthUiSlice } from '../store/selectors';

/** Segments after `/t/:tenantSlug/` (empty string = tenant home). */
function tenantRelativePathFromLocation(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 't' || parts.length < 2) return null;
  return parts.slice(2).join('/') || '';
}

/**
 * Mount inside `BrowserRouter`. Subscribes to dashboard / lines / work orders / scans
 * on home and factory routes only. Other modules keep their own fetches.
 */
export function RouterRealtimeSubscriptions() {
  const location = useLocation();
  const { isAuthenticated, isPendingApproval } = useAuthUiSlice();
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const subscribeToWorkOrders = useAppStore((s) => s.subscribeToWorkOrders);
  const subscribeToScanEventsToday = useAppStore((s) => s.subscribeToScanEventsToday);

  const relPath = useMemo(
    () => tenantRelativePathFromLocation(location.pathname),
    [location.pathname],
  );

  const deferRealtime = useMemo(() => shouldDeferProductionRealtime(relPath), [relPath]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || deferRealtime) return;

    let cancelled = false;
    const unsubs: Array<() => void> = [];
    let scheduleId: number | undefined;
    let usedIdleCallback = false;

    const start = () => {
      if (cancelled) return;
      unsubs.push(subscribeToDashboard());
      unsubs.push(subscribeToLineStatuses());
      unsubs.push(subscribeToWorkOrders());
      unsubs.push(subscribeToScanEventsToday());
    };

    if (typeof requestIdleCallback !== 'undefined') {
      usedIdleCallback = true;
      scheduleId = requestIdleCallback(() => {
        if (!cancelled) start();
      }, { timeout: 2800 });
    } else {
      scheduleId = window.setTimeout(() => {
        if (!cancelled) start();
      }, 400);
    }

    return () => {
      cancelled = true;
      if (scheduleId !== undefined) {
        if (usedIdleCallback) cancelIdleCallback(scheduleId);
        else window.clearTimeout(scheduleId);
      }
      unsubs.forEach((u) => u());
    };
  }, [
    isAuthenticated,
    isPendingApproval,
    deferRealtime,
    subscribeToDashboard,
    subscribeToLineStatuses,
    subscribeToWorkOrders,
    subscribeToScanEventsToday,
  ]);

  return null;
}
