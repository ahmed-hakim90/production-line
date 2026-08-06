import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';

/**
 * Legacy route: spare-part pricing moved to manufacturing materials master.
 */
export const RepairPartsPricing: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  useEffect(() => {
    // Keep deep links working after menu removal.
  }, []);
  return <Navigate to={withTenantPath(tenantSlug, '/manufacturing/materials')} replace />;
};

export default RepairPartsPricing;
