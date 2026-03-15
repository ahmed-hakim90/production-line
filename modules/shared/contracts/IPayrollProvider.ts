export interface MonthlyPayrollData {
  employeeId: string;
  netSalary: number;
  month: string; // "YYYY-MM"
  costCenterId?: string;
}

export interface IPayrollProvider {
  getMonthlyPayroll(month: string, costCenterIds?: string[]): Promise<MonthlyPayrollData[]>;
  getEmployeeBaseSalaries(employeeIds: string[]): Promise<Record<string, number>>;
}
