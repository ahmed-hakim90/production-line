import {
  getCurrentTenantId,
  getCurrentTenantIdOrNull,
} from '../../lib/currentTenant';

/**
 * Tenant context helpers for usecases/services.
 * UI checks are UX-only — Firestore rules / Cloud Functions remain the security boundary.
 */

export function assertTenantContext(): string {
  return getCurrentTenantId();
}

export function requireTenantIdOrThrow(message = 'Tenant context not initialised'): string {
  const tenantId = getCurrentTenantIdOrNull();
  if (!tenantId) {
    throw new Error(message);
  }
  return tenantId;
}

/** Ensure a write payload always carries the active tenant id (never trust client-supplied tenantId). */
export function withTrustedTenantId<T extends Record<string, unknown>>(
  payload: T,
): T & { tenantId: string } {
  const tenantId = assertTenantContext();
  return {
    ...payload,
    tenantId,
  };
}

export function assertSameTenant(
  resourceTenantId: string | null | undefined,
  message = 'Cross-tenant access denied',
): void {
  const current = assertTenantContext();
  if (!resourceTenantId || resourceTenantId !== current) {
    throw new Error(message);
  }
}
