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
 * Honors `systemSettings.defaultHomeLogicalPath` when set and permitted; otherwise legacy home dashboards.
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
