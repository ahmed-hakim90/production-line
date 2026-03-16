// ─── HR Config Default Values ───────────────────────────────────────────────
// Each module has sensible defaults. Used for first-time setup and reset.

import type {
  GeneralConfig,
  AttendanceConfig,
  OvertimeConfig,
  LeaveConfig,
  LoanConfig,
  PayrollSettingsConfig,
  ApprovalConfig,
  TransportConfig,
  HRConfigMap,
} from './types';

type WithoutMeta<T> = Omit<T, 'configVersion' | 'updatedAt' | 'updatedBy'>;

export const DEFAULT_GENERAL: WithoutMeta<GeneralConfig> = {
  workingDaysPerWeek: 6,
  workingHoursPerDay: 8,
  weeklyOffDays: ['friday'],
  minimumRestHoursBetweenShifts: 10,
  useMultipleShifts: false,
  defaultCurrency: 'SAR',
  fiscalYearStartMonth: 1,
};

export const DEFAULT_ATTENDANCE: WithoutMeta<AttendanceConfig> = {
  lateGraceMinutes: 10,
  autoMarkAbsentAfterMinutes: 240,
  allowManualEntry: true,
  requireCheckOut: true,
  minimumWorkHoursForPresent: 4,
};

export const DEFAULT_OVERTIME: WithoutMeta<OvertimeConfig> = {
  overtimeMultiplier: 1.5,
  maxOvertimeHoursPerDay: 4,
  maxOvertimeHoursPerMonth: 60,
  requireApproval: true,
  weekendMultiplier: 2.0,
  holidayMultiplier: 2.5,
};

export const DEFAULT_LEAVE: WithoutMeta<LeaveConfig> = {
  defaultAnnualBalance: 21,
  defaultSickBalance: 14,
  defaultEmergencyBalance: 5,
  leaveTypes: [
    {
      type: 'annual',
      labelAr: 'إجازة سنوية',
      defaultBalance: 21,
      salaryImpact: 'full_paid',
      deductPercent: 0,
      requiresApproval: true,
      maxConsecutiveDays: 30,
      carryOverAllowed: true,
      maxCarryOverDays: 10,
    },
    {
      type: 'sick',
      labelAr: 'إجازة مرضية',
      defaultBalance: 14,
      salaryImpact: 'full_paid',
      deductPercent: 0,
      requiresApproval: false,
      maxConsecutiveDays: 14,
      carryOverAllowed: false,
      maxCarryOverDays: 0,
    },
    {
      type: 'emergency',
      labelAr: 'إجازة طارئة',
      defaultBalance: 5,
      salaryImpact: 'deduct_daily',
      deductPercent: 0,
      requiresApproval: true,
      maxConsecutiveDays: 3,
      carryOverAllowed: false,
      maxCarryOverDays: 0,
    },
    {
      type: 'unpaid',
      labelAr: 'إجازة بدون راتب',
      defaultBalance: 0,
      salaryImpact: 'unpaid',
      deductPercent: 0,
      requiresApproval: true,
      maxConsecutiveDays: 0,
      carryOverAllowed: false,
      maxCarryOverDays: 0,
    },
  ],
  allowNegativeBalance: false,
  carryOverLimit: 10,
  maxConsecutiveDays: 30,
  requireDocumentForSick: true,
  sickDocumentThresholdDays: 3,
};

export const DEFAULT_LOAN: WithoutMeta<LoanConfig> = {
  maxLoanMultiplier: 3,
  maxInstallments: 12,
  maxActiveLoans: 1,
  minimumServiceMonths: 6,
  allowLoanDuringProbation: false,
};

export const DEFAULT_PAYROLL: WithoutMeta<PayrollSettingsConfig> = {
  allowNegativeSalary: false,
  autoClosePayrollMonth: false,
  payDay: 28,
  roundingMethod: 'nearest',
  includeTransportInGross: false,
  socialSecurityRate: 0,
  taxEnabled: false,
};

export const DEFAULT_APPROVAL: WithoutMeta<ApprovalConfig> = {
  requireManagerApproval: true,
  autoApproveBelow: 0,
  escalationAfterDays: 3,
  maxApprovalLevels: 3,
  notifyOnPending: true,
  hrAlwaysFinalLevel: true,
  allowDelegation: true,
};

export const DEFAULT_TRANSPORT: WithoutMeta<TransportConfig> = {
  defaultTransportAllowance: 0,
  deductOnAbsence: true,
  zoneBasedTransport: false,
  zones: [],
};

export const HR_CONFIG_DEFAULTS: { [K in keyof HRConfigMap]: WithoutMeta<HRConfigMap[K]> } = {
  general: DEFAULT_GENERAL,
  attendance: DEFAULT_ATTENDANCE,
  overtime: DEFAULT_OVERTIME,
  leave: DEFAULT_LEAVE,
  loan: DEFAULT_LOAN,
  payroll: DEFAULT_PAYROLL,
  approval: DEFAULT_APPROVAL,
  transport: DEFAULT_TRANSPORT,
};
