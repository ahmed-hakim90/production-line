import React, { createContext, useContext } from 'react';

export type TenantSlugResolveValue = {
  /** Slug resolves to a row in `pending_tenants` awaiting super-admin approval. */
  pendingRegistration: boolean;
  /** Last resolved tenant status from `tenants` or pending flow (`pending`, `active`, …). */
  tenantStatus: string;
};

const defaultValue: TenantSlugResolveValue = {
  pendingRegistration: false,
  tenantStatus: '',
};

export const TenantSlugResolveContext = createContext<TenantSlugResolveValue>(defaultValue);

export function useTenantSlugResolve(): TenantSlugResolveValue {
  return useContext(TenantSlugResolveContext);
}

export const TenantSlugResolveProvider: React.FC<{
  value: TenantSlugResolveValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <TenantSlugResolveContext.Provider value={value}>{children}</TenantSlugResolveContext.Provider>
);
