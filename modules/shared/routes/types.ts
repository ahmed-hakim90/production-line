import type { ComponentType, ReactElement } from 'react';
import type { Permission } from '../../../utils/permissions';

export interface AppRouteDef {
  path: string;
  permission?: Permission;
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
