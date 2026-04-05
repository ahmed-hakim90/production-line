import type { ComponentType, ReactElement } from 'react';
import type { Permission } from '../../../utils/permissions';

export interface AppRouteDef {
  path: string;
  permission?: Permission;
  /** If set, access is granted when the user has any of these permissions (takes precedence over `permission` when both are set). */
  permissionsAny?: Permission[];
  component?: ComponentType;
  redirectTo?: string;
}

export interface PublicRouteContext {
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  loginRedirectElement: ReactElement;
}

export interface PublicRouteDef {
  path: string;
  resolveElement: (ctx: PublicRouteContext) => ReactElement;
}
