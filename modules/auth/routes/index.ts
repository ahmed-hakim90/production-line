import React from 'react';
import { Navigate } from 'react-router-dom';
import type { PublicRouteDef } from '../../shared/routes';
import { Setup } from '../pages/Setup';
import { Login } from '../pages/Login';
import { PendingApproval } from '../pages/PendingApproval';

export const AUTH_PUBLIC_ROUTES: PublicRouteDef[] = [
  {
    path: '/setup',
    resolveElement: () => React.createElement(Setup),
  },
  {
    path: '/login',
    resolveElement: ({ isAuthenticated, isPendingApproval, loginRedirectElement }) =>
      isAuthenticated
        ? (isPendingApproval ? React.createElement(Navigate, { to: '/pending', replace: true }) : loginRedirectElement)
        : React.createElement(Login),
  },
  {
    path: '/pending',
    resolveElement: ({ isAuthenticated, isPendingApproval, loginRedirectElement }) =>
      !isAuthenticated
        ? React.createElement(Navigate, { to: '/login', replace: true })
        : isPendingApproval
          ? React.createElement(PendingApproval)
          : loginRedirectElement,
  },
];

export const AUTH_ROUTES = AUTH_PUBLIC_ROUTES.map((r) => r.path) as readonly string[];
