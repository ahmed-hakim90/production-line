import { createHash } from 'node:crypto';

export type InventoryOperationState = 'applying' | 'applied' | 'reversing' | 'reversed';

export type InventoryMovementIntent = {
  warehouseId: string;
  toWarehouseId?: string;
  itemType: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  unit?: string;
  movementType: 'IN' | 'OUT' | 'TRANSFER';
  quantity: number;
  allowNegative?: boolean;
  sourceModule: string;
  sourceId: string;
  note: string;
  sourceMovementId?: string;
  legacyMovementId?: string;
};

export type DeterministicInventoryMovement = InventoryMovementIntent & {
  movementId: string;
};

const normalizePart = (value: unknown): string => String(value ?? '').trim();

const omitUndefined = <T extends Record<string, unknown>>(value: T): T => (
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T
);

const hashIdentity = (...parts: string[]): string =>
  createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 40);

const movementSortKey = (movement: InventoryMovementIntent): string => [
  normalizePart(movement.sourceModule),
  normalizePart(movement.sourceId),
  normalizePart(movement.movementType),
  normalizePart(movement.warehouseId),
  normalizePart(movement.toWarehouseId),
  normalizePart(movement.itemType),
  normalizePart(movement.itemId),
  String(Number(movement.quantity)),
  normalizePart(movement.unit),
  normalizePart(movement.sourceMovementId),
  normalizePart(movement.note),
].join('\u001f');

/**
 * Stable identities make each balance mutation and its ledger row one atomic,
 * retry-safe unit. Identical lines intentionally receive distinct occurrences.
 */
export function buildDeterministicMovementPlan(
  reportId: string,
  phase: 'apply' | 'reverse',
  movements: InventoryMovementIntent[],
): DeterministicInventoryMovement[] {
  const normalizedReportId = normalizePart(reportId);
  if (!normalizedReportId) throw new Error('reportId is required');

  const sorted = movements
    .filter((movement) => Number(movement.quantity) > 0)
    .map((movement) => omitUndefined({
      ...movement,
      warehouseId: normalizePart(movement.warehouseId),
      toWarehouseId: normalizePart(movement.toWarehouseId) || undefined,
      itemType: normalizePart(movement.itemType),
      itemId: normalizePart(movement.itemId),
      itemName: normalizePart(movement.itemName),
      itemCode: normalizePart(movement.itemCode),
      unit: normalizePart(movement.unit) || 'unit',
      sourceModule: normalizePart(movement.sourceModule),
      sourceId: normalizePart(movement.sourceId),
      note: normalizePart(movement.note),
      sourceMovementId: normalizePart(movement.sourceMovementId) || undefined,
      legacyMovementId: normalizePart(movement.legacyMovementId) || undefined,
      quantity: Number(movement.quantity),
    }))
    .sort((left, right) => movementSortKey(left).localeCompare(movementSortKey(right)));

  const occurrences = new Map<string, number>();
  return sorted.map((movement) => {
    const key = movementSortKey(movement);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return {
      ...movement,
      movementId: `pri_${hashIdentity(normalizedReportId, phase, key, String(occurrence))}`,
    };
  });
}

export function buildDeterministicHandoverRequestId(reportId: string): string {
  const normalizedReportId = normalizePart(reportId);
  if (!normalizedReportId) throw new Error('reportId is required');
  return `prh_${hashIdentity(normalizedReportId, 'production_handover')}`;
}

export function resolveApplyOperationAction(
  state: InventoryOperationState | undefined,
): 'claim' | 'resume' | 'done' | 'blocked' {
  if (!state) return 'claim';
  if (state === 'applying') return 'resume';
  if (state === 'applied') return 'done';
  return 'blocked';
}

export function resolveReverseOperationAction(
  state: InventoryOperationState | undefined,
): 'claim' | 'resume' | 'done' {
  if (state === 'reversed') return 'done';
  if (state === 'reversing') return 'resume';
  return 'claim';
}

export function isExplicitlyActiveUser(isActive: unknown): boolean {
  return isActive === true;
}

export function roleBelongsToTenant(roleTenantId: unknown, tenantId: unknown): boolean {
  const normalizedTenantId = normalizePart(tenantId);
  return Boolean(normalizedTenantId) && normalizePart(roleTenantId) === normalizedTenantId;
}
