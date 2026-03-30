import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { PublicRouteDef } from '../../shared/routes';
import { Setup } from '../pages/Setup';
import { Login } from '../pages/Login';
import { PendingApproval } from '../pages/PendingApproval';

const NavigateToTenantLogin: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return React.createElement(Navigate, { to: `/t/${tenantSlug}/login`, replace: true });
};

const NavigateToTenantPending: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return React.createElement(Navigate, { to: `/t/${tenantSlug}/pending`, replace: true });
};

export const AUTH_PUBLIC_ROUTES: PublicRouteDef[] = [
  {
    path: 'setup',
    resolveElement: () => React.createElement(Setup),
  },
  {
    path: 'login',
    resolveElement: ({ isAuthenticated, isPendingApproval, loginRedirectElement }) =>
      isAuthenticated
        ? (isPendingApproval ? React.createElement(NavigateToTenantPending) : loginRedirectElement)
        : React.createElement(Login),
  },
  {
    path: 'pending',
    resolveElement: ({ isAuthenticated, isPendingApproval, loginRedirectElement }) =>
      !isAuthenticated
        ? React.createElement(NavigateToTenantLogin)
        : isPendingApproval
          ? React.createElement(PendingApproval)
          : loginRedirectElement,
  },
];

export const AUTH_ROUTES = AUTH_PUBLIC_ROUTES.map((r) => r.path) as readonly string[];
