import React, { Suspense, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { defaultTenantSlug, withTenantPath } from '../../../lib/tenantPaths';
import { resolveDefaultHomeLogicalPath } from '../../../lib/defaultHomePath';
import { lazyNamed } from '../../shared/routes/lazyNamed';
import { PageRouteFallback } from '../../../components/PageRouteFallback';

const HomeDashboardRouter = lazyNamed(() => import('./HomeDashboardRouter'), 'HomeDashboardRouter');

/**
 * Honors `systemSettings.defaultHomeLogicalPath` when a non-default allowlisted
 * path is configured. Today the settings UI only offers the role-based dashboard
 * default (`''` / `/`), so this always falls through to HomeDashboardRouter until
 * ALLOWED_DEFAULT_HOME_LOGICAL_PATHS is expanded.
 */
export const DefaultHomeEntry: React.FC = () => {
  const { tenantSlug: tenantSlugParam } = useParams<{ tenantSlug: string }>();
  const tenantSlug = tenantSlugParam || defaultTenantSlug();
  const defaultHomeLogicalPath = useAppStore((s) => s.systemSettings.defaultHomeLogicalPath);
  const { can } = usePermission();

  const target = useMemo(
    () => resolveDefaultHomeLogicalPath(defaultHomeLogicalPath, can),
    [defaultHomeLogicalPath, can],
  );

  if (target) {
    return <Navigate to={withTenantPath(tenantSlug, target)} replace />;
  }

  return (
    <Suspense fallback={<PageRouteFallback />}>
      <HomeDashboardRouter />
    </Suspense>
  );
};
