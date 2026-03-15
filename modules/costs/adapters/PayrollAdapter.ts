import type { IPayrollProvider, MonthlyPayrollData } from '../../shared/contracts/IPayrollProvider';

type PayrollRowWithMeta = MonthlyPayrollData & {
  departmentId?: string;
};

export class PayrollAdapter implements IPayrollProvider {
  async getMonthlyPayroll(month: string, costCenterIds?: string[]): Promise<MonthlyPayrollData[]> {
    const { getPayrollMonth, getPayrollRecords } = await import('../../hr/payroll/payrollEngine');
    const { employeeService } = await import('../../hr/employeeService');

    try {
      const payrollMonth = await getPayrollMonth(month);
      if (payrollMonth?.id) {
        const records = await getPayrollRecords(payrollMonth.id);
        if (records.length > 0) {
          return records
            .filter((record) => !costCenterIds || costCenterIds.length === 0 || costCenterIds.includes(String(record.costCenterId || '')))
            .map((record) => ({
              employeeId: String(record.employeeId || ''),
              netSalary: Number(record.netSalary || 0),
              month,
              costCenterId: String(record.costCenterId || '') || undefined,
              departmentId: String(record.departmentId || '') || undefined,
            } as PayrollRowWithMeta));
        }
      }

      return this.getEmployeeFallback(month, costCenterIds);
    } catch {
      return this.getEmployeeFallback(month, costCenterIds);
    }
  }

  async getEmployeeBaseSalaries(employeeIds: string[]): Promise<Record<string, number>> {
    const { employeeService } = await import('../../hr/employeeService');
    const idSet = new Set(employeeIds.map((id) => String(id || '')).filter(Boolean));
    if (idSet.size === 0) return {};

    const employees = await employeeService.getAll();
    const result: Record<string, number> = {};
    employees.forEach((employee) => {
      const id = String(employee.id || '');
      if (!id || !idSet.has(id)) return;
      result[id] = Number(employee.baseSalary || 0);
    });
    return result;
  }

  private async getEmployeeFallback(month: string, costCenterIds?: string[]): Promise<MonthlyPayrollData[]> {
    const { employeeService } = await import('../../hr/employeeService');
    const employees = await employeeService.getAll();
    const centerSet = new Set((costCenterIds || []).map((id) => String(id || '')).filter(Boolean));
    const shouldFilterByCenter = centerSet.size > 0;

    return employees
      .filter((employee) => employee.isActive !== false)
      .filter((employee) => {
        const employeeCostCenterId = String((employee as { costCenterId?: string }).costCenterId || '');
        return !shouldFilterByCenter || centerSet.has(employeeCostCenterId);
      })
      .map((employee) => {
        const employeeCostCenterId = String((employee as { costCenterId?: string }).costCenterId || '');
        return {
        employeeId: String(employee.id || ''),
        netSalary: Number(employee.baseSalary || 0),
        month,
        costCenterId: employeeCostCenterId || undefined,
        departmentId: String(employee.departmentId || '') || undefined,
        } as PayrollRowWithMeta;
      });
  }
}

export const payrollAdapter = new PayrollAdapter();
