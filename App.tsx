
import React, { useEffect, useMemo, useRef } from 'react';
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
import type { AppRouteDef } from './modules/shared/routes';
import { useAppStore } from './store/useAppStore';
import { onAuthChange } from './services/firebase';
import { getHomeRoute } from './utils/permissions';
import { registerSystemEventListeners } from './shared/events';
import { useTenantTheme } from './core/ui-engine/theme/useTenantTheme';

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

const App: React.FC = () => {
  useTenantTheme();

  const initializeApp = useAppStore((s) => s.initializeApp);
  const subscribeToDashboard = useAppStore((s) => s.subscribeToDashboard);
  const subscribeToLineStatuses = useAppStore((s) => s.subscribeToLineStatuses);
  const subscribeToWorkOrders = useAppStore((s) => s.subscribeToWorkOrders);
  const subscribeToScanEventsToday = useAppStore((s) => s.subscribeToScanEventsToday);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isPendingApproval = useAppStore((s) => s.isPendingApproval);
  const loading = useAppStore((s) => s.loading);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const unsub = onAuthChange((user) => {
      if (user) {
        initializeApp().then(() => {
          const state = useAppStore.getState();
          if (state.isAuthenticated) {
            const cleanupEvents = registerSystemEventListeners();
            const unsubReports = subscribeToDashboard();
            const unsubStatuses = subscribeToLineStatuses();
            const unsubWorkOrders = subscribeToWorkOrders();
            const unsubScans = subscribeToScanEventsToday();
            (window as any).__cleanupSubs = () => {
              cleanupEvents();
              unsubReports();
              unsubStatuses();
              unsubWorkOrders();
              unsubScans();
            };
          }
        });
      }
    });

    return () => {
      unsub();
      (window as any).__cleanupSubs?.();
    };
  }, []);

  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/30 mx-auto mb-4 animate-pulse">
            <span className="material-icons-round text-4xl">factory</span>
          </div>
          <p className="text-sm text-slate-400 font-bold">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
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
    </HashRouter>
  );
};

export default App;
