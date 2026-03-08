
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './modules/dashboards/pages/Dashboard';
import { AUTH_PUBLIC_ROUTES } from './modules/auth/routes';
import { DASHBOARD_ROUTES } from './modules/dashboards/routes';
import { PRODUCTION_ROUTES } from './modules/production/routes';
import { QUALITY_ROUTES } from './modules/quality/routes';
import { HR_ROUTES } from './modules/hr/routes';
import { COST_ROUTES } from './modules/costs/routes';
import { SYSTEM_ROUTES } from './modules/system/routes';
import { INVENTORY_ROUTES } from './modules/inventory/routes';
import type { AppRouteDef } from './modules/shared/routes';
import { useAppStore } from './store/useAppStore';
import { useAuthUiSlice } from './store/selectors';
import { onAuthChange } from './services/firebase';
import { getHomeRoute } from './utils/permissions';
import { eventBus, registerSystemEventListeners, SystemEvents } from './shared/events';
import { useTenantTheme } from './core/ui-engine/theme/useTenantTheme';
import { GlobalModalManagerProvider, useGlobalModalManager } from './components/modal-manager/GlobalModalManager';
import { ModalHost } from './components/modal-manager/ModalHost';
import { ToastContainer } from './components/Toast';
import { useJobsStore } from './components/background-jobs/useJobsStore';
import { presenceService } from './services/presenceService';
import { pushService } from './services/pushService';

const POST_LOGIN_REDIRECT_KEY = 'post_login_redirect_path';

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
  ...PRODUCTION_ROUTES,
  ...QUALITY_ROUTES,
  ...HR_ROUTES,
  ...COST_ROUTES,
  ...SYSTEM_ROUTES,
  ...INVENTORY_ROUTES,
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

const App: React.FC = () => {
  useTenantTheme();

  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const subscribeToWorkOrders = useAppStore((s) => s.subscribeToWorkOrders);
  const subscribeToScanEventsToday = useAppStore((s) => s.subscribeToScanEventsToday);
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);
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
    });

    return () => {
      window.clearTimeout(resolveTimer);
      unsub();
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
    if (!isAuthenticated || isPendingApproval || !uid || !currentEmployeeId) return;
    void pushService.registerDevice(uid, currentEmployeeId);
  }, [isAuthenticated, isPendingApproval, uid, currentEmployeeId]);

  useEffect(() => {
    let unsub = () => {};
    void pushService.subscribeForeground((title, body) => {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }).then((fn) => {
      unsub = fn;
    });

    const onWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type !== 'notification-click') return;
      const targetUrl = String(event.data.targetUrl || '/');
      if (targetUrl.startsWith('/')) {
        window.location.hash = targetUrl;
      }
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      unsub();
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, []);

  if (!authResolved) {
    return (
      <div className="erp-auth-page has-panel" dir="rtl">
        {/* Brand Panel — desktop left side */}
        <div className="erp-auth-panel">
          {/* decorative circles handled by ::before / ::after */}
          <div className="erp-auth-panel-logo">
            <span className="material-icons-round" style={{ fontSize: 26 }}>factory</span>
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
                <span className="material-icons-round">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Loading Content */}
        <div className="erp-auth-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            {/* App icon with spinning ring */}
            <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 28 }}>
              <div
                style={{
                  width: 80, height: 80,
                  borderRadius: 20,
                  background: 'rgb(79 70 229)',
                  boxShadow: '0 12px 32px rgba(79,70,229,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-icons-round" style={{ fontSize: 40, color: '#fff' }}>factory</span>
              </div>
              {/* spinning ring around icon */}
              <div style={{
                position: 'absolute', inset: -6,
                border: '2.5px solid rgba(79,70,229,0.15)',
                borderTopColor: 'rgb(79 70 229)',
                borderRadius: '50%',
                animation: 'erp-spin 1s linear infinite',
              }} />
            </div>

            <h2 style={{
              fontSize: 22, fontWeight: 800,
              color: '#1e1b4b', marginBottom: 6,
              fontFamily: 'Cairo, sans-serif',
            }}>
              Hakimo ERP
            </h2>
            <p style={{
              fontSize: 13, color: '#6b7280',
              marginBottom: 32, fontFamily: 'Cairo, sans-serif',
            }}>
              جاري تهيئة النظام...
            </p>

            {/* Animated dots */}
            <div className="erp-loading-dots" style={{ justifyContent: 'center', marginBottom: 24 }}>
              <span />
              <span />
              <span />
            </div>

            {/* Thin progress bar */}
            <div style={{
              width: 200, height: 3,
              background: 'rgba(79,70,229,0.12)',
              borderRadius: 99, overflow: 'hidden',
              margin: '0 auto',
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, rgb(79 70 229), rgb(129 140 248))',
                borderRadius: 99,
                animation: 'erp-loading-bar 1.6s ease-in-out infinite',
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <GlobalModalManagerProvider>
      <AuthUiStateGuard />
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
  );
};

export default App;
