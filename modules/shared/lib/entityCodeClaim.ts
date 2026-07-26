/** Thrown when saving an entity whose business code already exists for the tenant. */
export const DUPLICATE_ENTITY_CODE = 'DUPLICATE_ENTITY_CODE';

export function isDuplicateEntityCodeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Error & { code?: string };
  return err.message === DUPLICATE_ENTITY_CODE || err.code === DUPLICATE_ENTITY_CODE;
}

export function throwDuplicateEntityCode(): never {
  const err = new Error(DUPLICATE_ENTITY_CODE);
  (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
  throw err;
}

export const ENTITY_CODE_CLAIMS_COLLECTION = 'entity_code_claims';

/** Deterministic claim doc id: `{tenant}__{entityType}__{CODE}` */
export function buildEntityCodeClaimId(tenantId: string, entityType: string, code: string): string {
  const t = String(tenantId || '').trim().replace(/\//g, '_');
  const e = String(entityType || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const c = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\//g, '_');
  return `${t}__${e}__${c}`;
}
