let _tenantId: string | null = null;

export function setCurrentTenant(id: string | null): void {
  _tenantId = id;
}

export function getCurrentTenantId(): string {
  if (!_tenantId) throw new Error('Tenant context not initialised');
  return _tenantId;
}

export function getCurrentTenantIdOrNull(): string | null {
  return _tenantId;
}
