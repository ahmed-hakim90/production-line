import type { ReactNode } from 'react';
import { usePermissions } from '@/core/auth/usePermissions';

interface RoleGuardProps {
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGuard({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: RoleGuardProps) {
  const { can, canAny, canAll } = usePermissions();

  const allowedBySingle = permission ? can(permission) : true;
  const allowedByAny = anyOf?.length ? canAny(anyOf) : true;
  const allowedByAll = allOf?.length ? canAll(allOf) : true;
  const isAllowed = allowedBySingle && allowedByAny && allowedByAll;

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
