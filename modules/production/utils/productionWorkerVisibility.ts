export const UNASSIGNED_LINE_FILTER_VALUE = '__unassigned__';

export const normalizeWorkerLineIds = (workerLineIds: readonly string[]): string[] => (
  workerLineIds
    .map((lineId) => String(lineId || '').trim())
    .filter(Boolean)
);

export const hasAnyAssignedLine = (
  workerLineIds: readonly string[],
  allowedLineIds: ReadonlySet<string>,
): boolean => {
  if (allowedLineIds.size === 0) return false;
  return normalizeWorkerLineIds(workerLineIds).some((lineId) => allowedLineIds.has(lineId));
};

export const shouldShowProductionWorkerForSupervisor = (
  workerLineIds: readonly string[],
  isSupervisor: boolean,
  allowedLineIds: ReadonlySet<string>,
  options?: { includeUnassigned?: boolean },
): boolean => {
  if (!isSupervisor) return true;
  if (options?.includeUnassigned && normalizeWorkerLineIds(workerLineIds).length === 0) return true;
  return hasAnyAssignedLine(workerLineIds, allowedLineIds);
};

export const matchesProductionWorkerLineFilter = (
  workerLineIds: readonly string[],
  filterLine: string,
): boolean => {
  const normalized = normalizeWorkerLineIds(workerLineIds);
  if (!filterLine || filterLine === 'all') return true;
  if (filterLine === UNASSIGNED_LINE_FILTER_VALUE) return normalized.length === 0;
  return normalized.includes(filterLine);
};
