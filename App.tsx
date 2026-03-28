
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './modules/dashboards/pages/Dashboard';
import { AUTH_PUBLIC_ROUTES } from './modules/auth/routes';
import { DASHBOARD_ROUTES } from './modules/dashboards/routes';
import { CATALOG_ROUTES } from './modules/catalog/routes';
import { PRODUCTION_ROUTES } from './modules/production/routes';
import { QUALITY_ROUTES } from './modules/quality/routes';
import { HR_ROUTES } from './modules/hr/routes';
import { COST_ROUTES } from './modules/costs/routes';
import { SYSTEM_ROUTES } from './modules/system/routes';
import { INVENTORY_ROUTES } from './modules/inventory/routes';
import { ATTENDANCE_ROUTES } from './modules/attendance/routes';
import type { AppRouteDef } from './modules/shared/routes';
import { useAppStore } from './store/useAppStore';
import { useAuthUiSlice } from './store/selectors';
import { onAuthChange } from './services/firebase';
import { getHomeRoute } from './utils/permissions';
import { eventBus, registerSystemEventListeners, SystemEvents } from './shared/events';
import { useTenantTheme } from './core/ui-engine/theme/useTenantTheme';
import { GlobalModalManagerProvider, useGlobalModalManager } from './components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from './components/modal-manager/modalKeys';
import { ModalHost } from './components/modal-manager/ModalHost';
import { toast, ToastContainer } from './components/Toast';
import { useJobsStore } from './components/background-jobs/useJobsStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { presenceService } from './services/presenceService';
import { pushService } from './services/pushService';
import { sessionTrackerService } from './modules/system/audit';
import { BarChart3, Boxes, Factory, Hammer, Users, type LucideIcon } from 'lucide-react';

const POST_LOGIN_REDIRECT_KEY = 'post_login_redirect_path';
const DAILY_WELCOME_STORAGE_PREFIX = 'daily_welcome_seen';

const buildCurrentPath = (location: { pathname: string; search: string }) =>
  `${location.pathname}${location.search}`;

const shouldPersistRedirect = (path: string) =>
  !!path && path !== '/login' && path !== '/setup' && path !== '/pending';

const savePostLoginRedirect = (path: string) => {
  if (!shouldPersistRedirect(path)) return;
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
};

const consumePostLoginRedirect = (): string | null => {
  const saved = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (!saved) return null;
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return shouldPersistRedirect(saved) ? saved : null;
};

const getTodayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const AUTH_ICON_MAP: Record<string, LucideIcon> = {
  factory: Factory,
  precision_manufacturing: Hammer,
  inventory_2: Boxes,
  groups: Users,
  bar_chart: BarChart3,
};

const renderAuthIcon = (name: string, className?: string, size = 20) => {
  const Icon = AUTH_ICON_MAP[name] ?? Factory;
  return <Icon size={size} className={className} />;
};

const playNotificationTone = () => {
  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    void audio.play().catch(() => {});
    return;
  } catch {
    // Fall through to oscillator fallback when Audio is unavailable.
  }

  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    oscillator.start(start);
    oscillator.stop(start + 0.38);
    oscillator.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // Browser policy can block audio if user did not interact yet.
  }
};

/** Redirects to the role-appropriate dashboard after login */
const LoginRedirect: React.FC = () => {
  const permissions = useAppStore((s) => s.userPermissions);
  const home = getHomeRoute(permissions);
  const target = useMemo(() => {
    // Employee role should always land on employee dashboard after login.
    if (home === '/employee-dashboard') return home;
    return consumePostLoginRedirect() ?? home;
  }, [home]);
  return <Navigate to={target} replace />;
};

/** Shows the main Dashboard or redirects to the role-specific one on `/` */
const HomeRedirect: React.FC = () => {
  const permissions = useAppStore((s) => s.userPermissions);
  const home = getHomeRoute(permissions);
  if (home === '/') return <Dashboard />;
  return <Navigate to={home} replace />;
};

const PROTECTED_ROUTES: AppRouteDef[] = [
  ...DASHBOARD_ROUTES,
  ...CATALOG_ROUTES,
  ...PRODUCTION_ROUTES,
  ...QUALITY_ROUTES,
  ...HR_ROUTES,
  ...COST_ROUTES,
  ...SYSTEM_ROUTES,
  ...INVENTORY_ROUTES,
  ...ATTENDANCE_ROUTES,
];

const ProtectedLayoutRoute: React.FC<{ isAuthenticated: boolean; isPendingApproval: boolean }> = ({
  isAuthenticated,
  isPendingApproval,
}) => {
  const location = useLocation();

  if (!isAuthenticated) {
    savePostLoginRedirect(buildCurrentPath(location));
    return <Navigate to="/login" replace />;
  }

  if (isPendingApproval) {
    return <Navigate to="/pending" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        {PROTECTED_ROUTES.map((r) => {
          if (r.redirectTo) {
            return (
              <React.Fragment key={r.path}>
                <Route path={r.path} element={<Navigate to={r.redirectTo} replace />} />
              </React.Fragment>
            );
          }

          if (!r.component || !r.permission) return null;
          const Component = r.component;
          return (
            <React.Fragment key={r.path}>
              <Route
                path={r.path}
                element={<ProtectedRoute permission={r.permission}><Component /></ProtectedRoute>}
              />
            </React.Fragment>
          );
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

const AuthUiStateGuard: React.FC = () => {
  const { isAuthenticated, isPendingApproval } = useAuthUiSlice();
  const { resetAllModals } = useGlobalModalManager();
  const resetJobsUiState = useJobsStore((s) => s.resetUiState);

  useEffect(() => {
    // On any exit from protected app state, clear global overlays/stateful UI.
    if (!isAuthenticated || isPendingApproval) {
      resetAllModals();
      resetJobsUiState();
    }
  }, [isAuthenticated, isPendingApproval, resetAllModals, resetJobsUiState]);

  return null;
};

const DailyWelcomeLauncher: React.FC = () => {
  const { openModal, hasModalTarget } = useGlobalModalManager();
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || loading || !uid) return;
    const today = getTodayYmd();
    const storageKey = `${DAILY_WELCOME_STORAGE_PREFIX}_${uid}`;
    const seenDate = localStorage.getItem(storageKey);
    if (seenDate === today) return;
    const openOnce = () => {
      if (!hasModalTarget(MODAL_KEYS.DAILY_WELCOME)) return false;
      const opened = openModal(MODAL_KEYS.DAILY_WELCOME, { date: today });
      if (!opened) return false;
      localStorage.setItem(storageKey, today);
      return true;
    };

    if (openOnce()) return;
    const timer = window.setTimeout(() => {
      openOnce();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, isPendingApproval, loading, uid, openModal, hasModalTarget]);

  return null;
};

const App: React.FC = () => {
  useTenantTheme();

  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const subscribeToWorkOrders = useAppStore((s) => s.subscribeToWorkOrders);
  const subscribeToScanEventsToday = useAppStore((s) => s.subscribeToScanEventsToday);
  const syncAttendanceFromDevices = useAppStore((s) => s.syncAttendanceFromDevices);
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);
  const addRealtimeNotification = useAppStore((s) => s.addRealtimeNotification);
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const currentEmployeeId = useAppStore((s) => s.currentEmployee?.id || '');
  const activeSessionUidRef = useRef<string | null>(null);
  const cleanupSubsRef = useRef<(() => void) | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    const clearSubscriptions = () => {
      cleanupSubsRef.current?.();
      cleanupSubsRef.current = null;
    };
    const resolveTimer = window.setTimeout(() => {
      // Safety fallback for local/dev if auth callback is delayed.
      setAuthResolved(true);
      useAppStore.setState({ loading: false });
    }, 6000);

    const unsub = onAuthChange(async (user) => {
      window.clearTimeout(resolveTimer);
      setAuthResolved(true);
      if (!user) {
        sessionTrackerService.stop('auth_logout');
        activeSessionUidRef.current = null;
        clearSubscriptions();
        useAppStore.setState({
          loading: false,
          isAuthenticated: false,
          isPendingApproval: false,
        });
        return;
      }

      // Skip duplicate bootstraps for same authenticated session.
      if (activeSessionUidRef.current === user.uid && useAppStore.getState().isAuthenticated) return;

      clearSubscriptions();
      try {
        await Promise.race([
          initializeApp(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('initializeApp timeout')), 15000);
          }),
        ]);
      } catch {
        useAppStore.setState({ loading: false });
        return;
      }
      const state = useAppStore.getState();
      if (!state.isAuthenticated || state.isPendingApproval) {
        activeSessionUidRef.current = user.uid;
        return;
      }

      activeSessionUidRef.current = user.uid;

      const cleanupEvents = registerSystemEventListeners();
      const unsubReports = subscribeToDashboard();
      const unsubStatuses = subscribeToLineStatuses();
      const unsubWorkOrders = subscribeToWorkOrders();
      const unsubScans = subscribeToScanEventsToday();
      cleanupSubsRef.current = () => {
        cleanupEvents();
        unsubReports();
        unsubStatuses();
        unsubWorkOrders();
        unsubScans();
      };
      sessionTrackerService.start({
        uid: user.uid,
        userName: user.displayName ?? user.email ?? user.uid,
      });
    });

    return () => {
      window.clearTimeout(resolveTimer);
      unsub();
      sessionTrackerService.stop('app_unmount');
      cleanupSubsRef.current?.();
      cleanupSubsRef.current = null;
    };
  }, [initializeApp, subscribeToDashboard, subscribeToLineStatuses, subscribeToWorkOrders, subscribeToScanEventsToday]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    const getRoute = () => {
      const hash = window.location.hash || '#/';
      return hash.startsWith('#') ? hash.slice(1) : hash;
    };
    const deriveModule = (route: string) => {
      if (!route || route === '/') return 'dashboard';
      const first = route.split('?')[0].split('/').filter(Boolean)[0];
      return first || 'dashboard';
    };

    const emitHeartbeat = () => {
      const route = getRoute();
      void presenceService.heartbeat({
        userId: uid,
        employeeId: currentEmployeeId || '',
        userEmail: userEmail || '',
        displayName: userDisplayName || '',
        roleId: userRoleId || '',
        currentRoute: route,
        currentModule: deriveModule(route),
      });
    };

    emitHeartbeat();
    const timer = window.setInterval(emitHeartbeat, 60_000);
    const onRouteChanged = () => emitHeartbeat();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') emitHeartbeat();
    };
    const onBeforeUnload = () => {
      void presenceService.markOffline(uid);
    };

    window.addEventListener('hashchange', onRouteChanged);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    const unsubActions = eventBus.on(SystemEvents.USER_ACTION, (payload) => {
      const action = String(payload.action || payload.description || 'user.action');
      void presenceService.setLastAction(uid, action);
    });

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onRouteChanged);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsubActions();
      void presenceService.markOffline(uid);
    };
  }, [
    isAuthenticated,
    isPendingApproval,
    uid,
    currentEmployeeId,
    userEmail,
    userDisplayName,
    userRoleId,
  ]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    const timer = window.setInterval(() => {
      void syncAttendanceFromDevices({ mode: 'scheduled' }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, isPendingApproval, uid, syncAttendanceFromDevices]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    void pushService.registerDevice(uid, currentEmployeeId || '');
  }, [isAuthenticated, isPendingApproval, uid, currentEmployeeId]);

  useEffect(() => {
    let unsub = () => {};
    void pushService.subscribeForeground(({ title, body, data }) => {
      addRealtimeNotification({
        title,
        body,
        type: data.type || 'manual_broadcast',
        referenceId: data.reportId || data.referenceId,
        url: data.url || data.link,
        data,
      });
      if (Notification.permission === 'granted') {
        new Notification(title, { body, tag: data.notificationId || data.reportId || 'erp-notification' });
      }
      playNotificationTone();
    }).then((fn) => {
      unsub = fn;
    });

    const onWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type !== 'notification-click') return;
      const targetUrl = String(event.data.targetUrl || '/');
      // targetUrl is already a hash-based route (e.g. "/#/work-orders")
      // or a bare path (e.g. "/work-orders") — normalise to hash.
      const hash = targetUrl.startsWith('/#')
        ? targetUrl.slice(2)   // strip "/#" → "/work-orders"
        : targetUrl.startsWith('/')
          ? targetUrl          // bare path → use directly as hash
          : '/' + targetUrl;
      window.location.hash = hash;
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      unsub();
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, [addRealtimeNotification]);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: string) => {
      toast.error(String(message ?? 'حدث تنبيه'));
    };

    const onUnhandledError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || 'حدث خطأ غير متوقع';
      toast.error(message);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = typeof reason === 'string'
        ? reason
        : (reason?.message || 'حدث خطأ غير متوقع');
      toast.error(message);
    };

    window.addEventListener('error', onUnhandledError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.alert = nativeAlert;
      window.removeEventListener('error', onUnhandledError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  if (!authResolved) {
    return (
      <div className="erp-auth-page has-panel" dir="rtl">
        {/* Brand Panel — desktop left side */}
        <div className="erp-auth-panel">
          {/* decorative circles handled by ::before / ::after */}
          <div className="erp-auth-panel-logo">
            {renderAuthIcon('factory', undefined, 26)}
          </div>
          <h1 className="erp-auth-panel-name">Hakimo ERP</h1>
          <p className="erp-auth-panel-desc">نظام متكامل لإدارة الإنتاج والمخزون والموارد البشرية</p>
          <div className="erp-auth-panel-features">
            {[
              { icon: 'precision_manufacturing', text: 'إدارة خطوط وخطط الإنتاج' },
              { icon: 'inventory_2',             text: 'متابعة المخزون والمواد الخام' },
              { icon: 'groups',                  text: 'إدارة الموارد البشرية والحضور' },
              { icon: 'bar_chart',               text: 'تقارير وتحليلات متقدمة' },
            ].map(({ icon, text }) => (
              <div key={icon} className="erp-auth-panel-feature">
                {renderAuthIcon(icon, undefined, 20)}
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Loading Content */}
        <div className="erp-auth-container erp-auth-loading-wrap">
          <div className="erp-auth-loading-content">
            {/* App icon with spinning ring */}
            <div className="erp-auth-loading-icon-shell">
              <div className="erp-auth-loading-icon">
                {renderAuthIcon('factory', undefined, 20)}
              </div>
              {/* spinning ring around icon */}
              <div className="erp-auth-loading-ring" />
            </div>

            <h2 className="erp-auth-loading-title">Hakimo ERP</h2>
            <p className="erp-auth-loading-subtitle">جاري تهيئة النظام...</p>

            {/* Animated dots */}
            <div className="erp-loading-dots erp-auth-loading-dots">
              <span />
              <span />
              <span />
            </div>

            {/* Thin progress bar */}
            <div className="erp-auth-loading-progress">
              <div className="erp-auth-loading-progress-bar" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <GlobalModalManagerProvider>
        <AuthUiStateGuard />
        <DailyWelcomeLauncher />
        <HashRouter>
          <Routes>
            {AUTH_PUBLIC_ROUTES.map((r) => (
              <React.Fragment key={r.path}>
                <Route
                  path={r.path}
                  element={r.resolveElement({
                    isAuthenticated,
                    isPendingApproval,
                    loginRedirectElement: <LoginRedirect />,
                  })}
                />
              </React.Fragment>
            ))}

            {/* Protected: All app routes inside Layout */}
            <Route path="/*" element={<ProtectedLayoutRoute isAuthenticated={isAuthenticated} isPendingApproval={isPendingApproval} />} />
          </Routes>
          {isAuthenticated && !isPendingApproval && !loading && <ModalHost />}
          <ToastContainer />
        </HashRouter>
      </GlobalModalManagerProvider>
    </ErrorBoundary>
  );
};

export default App;
