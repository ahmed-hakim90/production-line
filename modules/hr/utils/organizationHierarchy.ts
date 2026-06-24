type EmployeeHierarchyNode = {
  id?: string;
  userId?: string;
  managerId?: string;
  managerEmployeeId?: string;
  reportsTo?: string;
};

type DepartmentHierarchyNode = {
  id?: string;
  name: string;
  managerId?: string;
};

type PositionHierarchyNode = {
  id?: string;
  title: string;
  departmentId?: string;
  level?: number;
};

type EmployeePositionNode = EmployeeHierarchyNode & {
  name: string;
  departmentId?: string;
  jobPositionId?: string;
  level?: number;
};

export type DepartmentPositionGroup<
  Department extends DepartmentHierarchyNode = DepartmentHierarchyNode,
  Position extends PositionHierarchyNode = PositionHierarchyNode,
  Employee extends EmployeePositionNode = EmployeePositionNode,
> = {
  department: Department;
  managerId: string;
  positions: Array<{
    position: Position;
    employees: Employee[];
  }>;
  employeesWithoutPosition: Employee[];
  employeeCount: number;
};

export function resolveEmployeeHierarchyId(
  employees: EmployeeHierarchyNode[],
  referenceId?: string,
): string {
  const normalizedReferenceId = String(referenceId || '').trim();
  if (!normalizedReferenceId) return '';

  const directEmployee = employees.find((employee) => String(employee.id || '').trim() === normalizedReferenceId);
  if (directEmployee?.id) return String(directEmployee.id).trim();

  const userLinkedEmployee = employees.find((employee) => String(employee.userId || '').trim() === normalizedReferenceId);
  if (userLinkedEmployee?.id) return String(userLinkedEmployee.id).trim();

  return normalizedReferenceId;
}

export function getEmployeeManagerReference(employee?: EmployeeHierarchyNode): string {
  return String(
    employee?.managerId
    || employee?.managerEmployeeId
    || employee?.reportsTo
    || '',
  ).trim();
}

export function resolveEmployeeManagerId(
  employees: EmployeeHierarchyNode[],
  employee?: EmployeeHierarchyNode,
): string {
  return resolveEmployeeHierarchyId(employees, getEmployeeManagerReference(employee));
}

export function wouldCreateManagerCycle(
  employees: EmployeeHierarchyNode[],
  employeeId: string,
  nextManagerId: string,
): boolean {
  const normalizedEmployeeId = resolveEmployeeHierarchyId(employees, employeeId);
  const normalizedNextManagerId = resolveEmployeeHierarchyId(employees, nextManagerId);
  if (!normalizedEmployeeId || !normalizedNextManagerId) return false;
  if (normalizedEmployeeId === normalizedNextManagerId) return true;

  const employeeById = new Map(
    employees
      .filter((employee): employee is EmployeeHierarchyNode & { id: string } => Boolean(employee.id))
      .map((employee) => [String(employee.id).trim(), employee]),
  );

  const visited = new Set<string>();
  let currentManagerId = normalizedNextManagerId;

  while (currentManagerId) {
    if (currentManagerId === normalizedEmployeeId) return true;
    if (visited.has(currentManagerId)) return false;
    visited.add(currentManagerId);
    currentManagerId = resolveEmployeeManagerId(employees, employeeById.get(currentManagerId));
  }

  return false;
}

export function getDirectReportCounts(employees: EmployeeHierarchyNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  employees.forEach((employee) => {
    const managerId = resolveEmployeeManagerId(employees, employee);
    if (!managerId) return;
    counts[managerId] = (counts[managerId] || 0) + 1;
  });
  return counts;
}

export function buildDepartmentPositionHierarchy<
  Department extends DepartmentHierarchyNode,
  Position extends PositionHierarchyNode,
  Employee extends EmployeePositionNode,
>(
  departments: Department[],
  positions: Position[],
  employees: Employee[],
): DepartmentPositionGroup<Department, Position, Employee>[] {
  const positionsByDepartment = new Map<string, Position[]>();
  positions.forEach((position) => {
    if (!position.departmentId) return;
    const list = positionsByDepartment.get(position.departmentId) ?? [];
    list.push(position);
    positionsByDepartment.set(position.departmentId, list);
  });

  const employeesByDepartmentAndPosition = new Map<string, Employee[]>();
  const employeesWithoutPositionByDepartment = new Map<string, Employee[]>();
  employees.forEach((employee) => {
    if (!employee.departmentId) return;
    if (!employee.jobPositionId) {
      const list = employeesWithoutPositionByDepartment.get(employee.departmentId) ?? [];
      list.push(employee);
      employeesWithoutPositionByDepartment.set(employee.departmentId, list);
      return;
    }

    const key = `${employee.departmentId}::${employee.jobPositionId}`;
    const list = employeesByDepartmentAndPosition.get(key) ?? [];
    list.push(employee);
    employeesByDepartmentAndPosition.set(key, list);
  });

  return departments
    .map((department) => {
      const departmentId = department.id ?? '';
      const departmentPositions = (positionsByDepartment.get(departmentId) ?? [])
        .sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.title.localeCompare(b.title, 'ar'))
        .map((position) => ({
          position,
          employees: [...(employeesByDepartmentAndPosition.get(`${departmentId}::${position.id ?? ''}`) ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
        }));
      const employeesWithoutPosition = [...(employeesWithoutPositionByDepartment.get(departmentId) ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      return {
        department,
        managerId: resolveEmployeeHierarchyId(employees, department.managerId),
        positions: departmentPositions,
        employeesWithoutPosition,
        employeeCount: departmentPositions.reduce((count, group) => count + group.employees.length, 0) + employeesWithoutPosition.length,
      };
    })
    .sort((a, b) => a.department.name.localeCompare(b.department.name, 'ar'));
}
