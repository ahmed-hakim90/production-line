import type {
  FirestoreProductionLine,
  ProductionLineWorkerAssignment,
  ProductionWorker,
  SupervisorLineAssignment,
} from '@/types';

export type ProductionEmployeeContext = {
  workerId: string;
  lineId: string;
  lineName: string;
  managerId: string;
  supervisorName?: string;
};

const isAssignmentActiveOnDate = (
  assignment: Pick<ProductionLineWorkerAssignment, 'isActive' | 'startDate' | 'endDate'>,
  date: string,
): boolean => {
  if (assignment.isActive === false) return false;
  if (assignment.startDate > date) return false;
  if (assignment.endDate && assignment.endDate < date) return false;
  return true;
};

const isSupervisorActiveOnDate = (
  assignment: Pick<SupervisorLineAssignment, 'isActive' | 'effectiveFrom' | 'effectiveTo'>,
  date: string,
): boolean => {
  if (assignment.isActive === false) return false;
  if (!assignment.effectiveFrom || assignment.effectiveFrom > date) return false;
  if (assignment.effectiveTo && assignment.effectiveTo < date) return false;
  return true;
};

const pickLatestLineAssignment = (
  current: ProductionLineWorkerAssignment | undefined,
  next: ProductionLineWorkerAssignment,
): ProductionLineWorkerAssignment => {
  if (!current) return next;
  const currentStart = String(current.startDate || '');
  const nextStart = String(next.startDate || '');
  if (nextStart > currentStart) return next;
  return current;
};

const pickLatestSupervisorAssignment = (
  current: SupervisorLineAssignment | undefined,
  next: SupervisorLineAssignment,
): SupervisorLineAssignment => {
  if (!current) return next;
  const currentStart = String(current.effectiveFrom || '');
  const nextStart = String(next.effectiveFrom || '');
  if (nextStart > currentStart) return next;
  return current;
};

export const buildProductionEmployeeContext = (input: {
  workers: ProductionWorker[];
  lineAssignments: ProductionLineWorkerAssignment[];
  supervisorAssignments: SupervisorLineAssignment[];
  lines: FirestoreProductionLine[];
  date: string;
}): Map<string, ProductionEmployeeContext> => {
  const workersById = new Map(
    input.workers
      .filter((worker) => worker.id && worker.employeeId && worker.isActive !== false)
      .map((worker) => [worker.id!, worker]),
  );
  const linesById = new Map(
    input.lines
      .filter((line) => line.id)
      .map((line) => [line.id!, line]),
  );

  const activeLineByWorker = new Map<string, ProductionLineWorkerAssignment>();
  for (const assignment of input.lineAssignments) {
    if (!assignment.workerId || !assignment.lineId) continue;
    if (!isAssignmentActiveOnDate(assignment, input.date)) continue;
    activeLineByWorker.set(
      assignment.workerId,
      pickLatestLineAssignment(activeLineByWorker.get(assignment.workerId), assignment),
    );
  }

  const activeSupervisorByLine = new Map<string, SupervisorLineAssignment>();
  for (const assignment of input.supervisorAssignments) {
    if (!assignment.lineId || !assignment.supervisorId) continue;
    if (!isSupervisorActiveOnDate(assignment, input.date)) continue;
    activeSupervisorByLine.set(
      assignment.lineId,
      pickLatestSupervisorAssignment(activeSupervisorByLine.get(assignment.lineId), assignment),
    );
  }

  const contextByEmployee = new Map<string, ProductionEmployeeContext>();
  for (const [workerId, assignment] of activeLineByWorker) {
    const worker = workersById.get(workerId);
    const employeeId = String(worker?.employeeId || '').trim();
    if (!employeeId) continue;

    const supervisor = activeSupervisorByLine.get(assignment.lineId);
    const managerId = String(supervisor?.supervisorId || '').trim();
    const line = linesById.get(assignment.lineId);

    contextByEmployee.set(employeeId, {
      workerId,
      lineId: assignment.lineId,
      lineName: String(line?.name || supervisor?.lineName || assignment.lineId),
      managerId,
      supervisorName: supervisor?.supervisorName,
    });
  }

  return contextByEmployee;
};
