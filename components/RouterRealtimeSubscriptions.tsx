import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useAuthUiSlice } from '../store/selectors';

/** Segments after `/t/:tenantSlug/` (empty string = tenant home). */
function tenantRelativePathFromLocation(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 't' || parts.length < 2) return null;
  return parts.slice(2).join('/') || '';
}

/**
 * HR / system screens rarely need live work-order + line listeners; deferring cuts
 * Firestore reads when users stay on those routes.
 */
const DEFER_PRODUCTION_REALTIME_PREFIXES = [
  'employees',
  'hr-dashboard',
  'organization',
  'self-service',
  'leave-requests',
  'loan-requests',
  'approval-center',
  'delegations',
  'payroll',
  'hr-settings',
  'hr-transactions',
  'employee-financials',
  'employee-financial-overview',
  'vehicles',
  'system/users',
  'roles',
  'activity-log',
  'settings',
  'dev',
];

function shouldDeferProductionRealtime(relPath: string | null): boolean {
  if (relPath === null) return true;
  if (!relPath) return false;
  if (relPath.startsWith('hr/')) return true;
  return DEFER_PRODUCTION_REALTIME_PREFIXES.some(
    (p) => relPath === p || relPath.startsWith(`${p}/`),
  );
}

/**
 * Mount inside `BrowserRouter`. Subscribes to dashboard / lines / work orders / scans
 * only when the tenant route is not a deferred (HR/system-heavy) path.
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

    const unsubReports = subscribeToDashboard();
    const unsubStatuses = subscribeToLineStatuses();
    const unsubWorkOrders = subscribeToWorkOrders();
    const unsubScans = subscribeToScanEventsToday();
    return () => {
      unsubReports();
      unsubStatuses();
      unsubWorkOrders();
      unsubScans();
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
