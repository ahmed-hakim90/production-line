export const hasAnyAssignedLine = (
  workerLineIds: readonly string[],
  allowedLineIds: ReadonlySet<string>,
): boolean => {
  if (allowedLineIds.size === 0) return false;
  return workerLineIds.some((lineId) => allowedLineIds.has(String(lineId || '').trim()));
};

export const shouldShowProductionWorkerForSupervisor = (
  workerLineIds: readonly string[],
  isSupervisor: boolean,
  allowedLineIds: ReadonlySet<string>,
): boolean => {
  if (!isSupervisor) return true;
  return hasAnyAssignedLine(workerLineIds, allowedLineIds);
};
