import React, { useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './Layout';
import { ProtectedRoute } from './ProtectedRoute';
import { useAppStore } from '@/store/useAppStore';
import { isPublicDemoEnabled } from '@/services/guestDemoEnv';
import { tenantLoginPath } from '@/lib/tenantPaths';
import { HomeDashboardRouter } from '@/modules/dashboards/pages/HomeDashboardRouter';
import type { AppRouteDef } from '@/modules/shared/routes';

function guestDemoPath(appPath: string): string {
  if (appPath === '/') return '/demo';
  return `/demo${appPath}`;
}

const GuestDemoHomeRedirect: React.FC = () => <HomeDashboardRouter />;

export function buildGuestDemoRouteElements(routes: AppRouteDef[]): React.ReactNode {
  return routes.map((r) => {
    if (r.redirectTo) {
      return (
        <Route
          key={`${r.path}-redirect`}
          path={guestDemoPath(r.path)}
          element={<Navigate to={guestDemoPath(r.redirectTo)} replace />}
        />
      );
    }
    if (!r.component || !r.permission) return null;
    const Component = r.component;
    return (
      <Route
        key={r.path}
        path={guestDemoPath(r.path)}
        element={
          <ProtectedRoute permission={r.permission}>
            <Component />
          </ProtectedRoute>
        }
      />
    );
  });
}

/**
 * Public demo: same app as authenticated users, but URL stays under /demo/* (home at /demo).
 */
export const GuestDemoShell: React.FC<{ routes: AppRouteDef[] }> = ({ routes }) => {
  const navigate = useNavigate();
  const bootstrapGuestDemo = useAppStore((s) => s.bootstrapGuestDemo);

  useLayoutEffect(() => {
    if (!isPublicDemoEnabled()) {
      navigate(tenantLoginPath(), { replace: true });
      return;
    }
    bootstrapGuestDemo();
  }, [bootstrapGuestDemo, navigate]);

  return (
    <Layout>
      <Routes>
        <Route path="/demo" element={<GuestDemoHomeRedirect />} />
        {buildGuestDemoRouteElements(routes)}
        <Route path="*" element={<Navigate to="/demo" replace />} />
      </Routes>
    </Layout>
  );
};
