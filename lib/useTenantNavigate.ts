import { useCallback } from 'react';
import { useNavigate, useParams, type NavigateOptions } from 'react-router-dom';
import { resolveTenantNavigationTarget } from './tenantPaths';

type NavigateTarget = string | number;

export function useTenantNavigate() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();

  return useCallback((to: NavigateTarget, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      navigate(to);
      return;
    }
    navigate(resolveTenantNavigationTarget(tenantSlug, to), options);
  }, [navigate, tenantSlug]);
}
