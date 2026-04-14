import { Navigate, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';

/** Old bookmark: `/employees/:id` → `/hr/employees/:id` */
export function LegacyEmployeeProfileRedirect() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  if (!id) return <Navigate to={withTenantPath(tenantSlug, '/hr/employees')} replace />;
  return <Navigate to={withTenantPath(tenantSlug, `/hr/employees/${id}`)} replace />;
}
