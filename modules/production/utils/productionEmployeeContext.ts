import type {
  FirestoreEmployee,
  FirestoreProductionLine,
  ProductionLineWorkerAssignment,
  ProductionWorker,
  SupervisorLineAssignment,
} from '@/types';
import type { FirestoreDepartment } from '@/modules/hr/types';

export type ProductionEmployeeContext = {
  workerId: string;
  lineId: string;
  lineName: string;
  managerId: string;
  supervisorName?: string;
};

export type SupervisorTeamWorker = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  lineId: string;
  lineName: string;
  supervisorId: string;
  supervisorName?: string;
  employee: FirestoreEmployee;
  worker: ProductionWorker;
};

export type TeamWorkerScope = 'assigned_lines' | 'department_manager' | 'production_all' | 'hr_all';

export type TeamRequestScopePermission =
  | 'leave.manage'
  | 'plans.view'
  | 'plans.create'
  | 'plans.edit'
  | 'plans.componentInjection.manage'
  | 'production.workers.manage'
  | 'production.workers.view'
  | 'productionWorkers.view'
  | 'production.workerReports.view';

export const resolveTeamRequestScope = (input: {
  can: (permission: TeamRequestScopePermission) => boolean;
  managesDepartment: boolean;
}): TeamWorkerScope => {
  if (
    input.can('production.workers.manage')
    || input.can('production.workers.view')
    || input.can('productionWorkers.view')
    || input.can('production.workerReports.view')
    || input.can('plans.view')
    || input.can('plans.create')
    || input.can('plans.edit')
    || input.can('plans.componentInjection.manage')
  ) {
    return 'production_all';
  }
  if (input.can('leave.manage')) return 'hr_all';
  if (input.managesDepartment) return 'department_manager';
  return 'assigned_lines';
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

export const buildSupervisorTeamWorkers = (input: {
  supervisorId: string;
  employees: FirestoreEmployee[];
  workers: ProductionWorker[];
  lineAssignments: ProductionLineWorkerAssignment[];
  supervisorAssignments: SupervisorLineAssignment[];
  lines: FirestoreProductionLine[];
  departments?: FirestoreDepartment[];
  date: string;
  scope?: TeamWorkerScope;
}): SupervisorTeamWorker[] => {
  const supervisorId = String(input.supervisorId || '').trim();
  if (!supervisorId) return [];

  const contextByEmployee = buildProductionEmployeeContext(input);
  const employeeById = new Map(
    input.employees
      .filter((employee) => employee.id && employee.isActive !== false)
      .map((employee) => [employee.id!, employee]),
  );
  const workerById = new Map(
    input.workers
      .filter((worker) => worker.id && worker.isActive !== false)
      .map((worker) => [worker.id!, worker]),
  );
  const linesById = new Map(
    input.lines
      .filter((line) => line.id)
      .map((line) => [line.id!, line]),
  );
  const latestLineByWorker = new Map<string, ProductionLineWorkerAssignment>();
  for (const assignment of input.lineAssignments) {
    if (!assignment.workerId || !assignment.lineId) continue;
    if (!isAssignmentActiveOnDate(assignment, input.date)) continue;
    latestLineByWorker.set(
      assignment.workerId,
      pickLatestLineAssignment(latestLineByWorker.get(assignment.workerId), assignment),
    );
  }

  const toTeamWorker = (
    employee: FirestoreEmployee,
    worker: ProductionWorker,
    context?: ProductionEmployeeContext,
  ): SupervisorTeamWorker => {
    const fallbackAssignment = worker.id ? latestLineByWorker.get(worker.id) : undefined;
    const lineId = context?.lineId || fallbackAssignment?.lineId || worker.defaultLineId || worker.lineIds?.[0] || '';
    const line = lineId ? linesById.get(lineId) : undefined;
    return {
      employeeId: employee.id!,
      employeeName: employee.name || worker.name || employee.id!,
      employeeCode: employee.code || employee.acNo || worker.code || '',
      workerId: worker.id!,
      workerName: worker.name || employee.name || employee.id!,
      workerCode: worker.code || employee.code || '',
      lineId,
      lineName: context?.lineName || line?.name || lineId || 'كل الأقسام',
      supervisorId: context?.managerId || supervisorId,
      supervisorName: context?.supervisorName,
      employee,
      worker,
    };
  };

  if (input.scope === 'hr_all') {
    return input.employees
      .filter((employee): employee is FirestoreEmployee & { id: string } => Boolean(employee.id) && employee.isActive !== false)
      .map((employee) => {
        const worker = input.workers.find((row) => row.employeeId === employee.id && row.isActive !== false) || {
          id: `employee:${employee.id}`,
          employeeId: employee.id,
          name: employee.name,
          code: employee.code || employee.acNo || employee.id,
          workerType: 'production' as const,
          lineIds: [],
          isActive: true,
        };
        return toTeamWorker(employee, worker, contextByEmployee.get(employee.id));
      })
      .sort(sortTeamWorkers);
  }

  if (input.scope === 'production_all') {
    return input.workers
      .filter((worker): worker is ProductionWorker & { id: string; employeeId: string } => Boolean(worker.id && worker.employeeId) && worker.isActive !== false)
      .map((worker) => {
        const employee = employeeById.get(worker.employeeId);
        if (!employee) return null;
        return toTeamWorker(employee, worker, contextByEmployee.get(worker.employeeId));
      })
      .filter((row): row is SupervisorTeamWorker => row !== null)
      .sort(sortTeamWorkers);
  }

  if (input.scope === 'department_manager') {
    const managedDepartmentIds = new Set(
      (input.departments || [])
        .filter((department) => department.isActive !== false && department.managerId === supervisorId && department.id)
        .map((department) => department.id!),
    );
    return input.employees
      .filter((employee): employee is FirestoreEmployee & { id: string } => (
        Boolean(employee.id)
        && employee.isActive !== false
        && managedDepartmentIds.has(employee.departmentId)
      ))
      .map((employee) => {
        const worker = input.workers.find((row) => row.employeeId === employee.id && row.isActive !== false) || {
          id: `employee:${employee.id}`,
          employeeId: employee.id,
          name: employee.name,
          code: employee.code || employee.acNo || employee.id,
          workerType: 'production' as const,
          lineIds: [],
          isActive: true,
        };
        return toTeamWorker(employee, worker, contextByEmployee.get(employee.id));
      })
      .sort(sortTeamWorkers);
  }

  return Array.from(contextByEmployee.entries())
    .filter(([, context]) => context.managerId === supervisorId)
    .map<SupervisorTeamWorker | null>(([employeeId, context]) => {
      const employee = employeeById.get(employeeId);
      const worker = workerById.get(context.workerId);
      if (!employee || !worker) return null;
      return toTeamWorker(employee, worker, context);
    })
    .filter((row): row is SupervisorTeamWorker => row !== null)
    .sort(sortTeamWorkers);
};

const sortTeamWorkers = (a: SupervisorTeamWorker, b: SupervisorTeamWorker): number => (
  a.lineName.localeCompare(b.lineName, 'ar', { numeric: true })
  || a.employeeCode.localeCompare(b.employeeCode, 'ar', { numeric: true })
  || a.employeeName.localeCompare(b.employeeName, 'ar')
);

export const isEmployeeInSupervisorTeam = (
  rows: SupervisorTeamWorker[],
  employeeId: string,
): boolean => rows.some((row) => row.employeeId === employeeId);
