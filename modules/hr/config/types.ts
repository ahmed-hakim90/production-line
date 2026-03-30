// ─── HR Config Module Types ─────────────────────────────────────────────────
// Strict types for all modular HR configuration documents.
// Each module lives as a document in hr_config_modules/{moduleName}.

import type { DayOfWeek } from '../types';

// ─── Config Module Names ────────────────────────────────────────────────────

export const HR_CONFIG_MODULES = [
  'general',
  'attendance',
  'overtime',
  'leave',
  'loan',
  'payroll',
  'approval',
  'transport',
] as const;

export type HRConfigModuleName = (typeof HR_CONFIG_MODULES)[number];

// ─── Base Config (shared metadata on every module) ──────────────────────────

export interface ConfigMetadata {
  configVersion: number;
  updatedAt: any;
  updatedBy: string;
}

// ─── Module: General ────────────────────────────────────────────────────────

export interface GeneralConfig extends ConfigMetadata {
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  weeklyOffDays: DayOfWeek[];
  minimumRestHoursBetweenShifts: number;
  useMultipleShifts: boolean;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
}

// ─── Module: Attendance ─────────────────────────────────────────────────────

export interface AttendanceConfig extends ConfigMetadata {
  lateGraceMinutes: number;
  autoMarkAbsentAfterMinutes: number;
  allowManualEntry: boolean;
  requireCheckOut: boolean;
  minimumWorkHoursForPresent: number;
}

// ─── Module: Overtime ───────────────────────────────────────────────────────

export interface OvertimeConfig extends ConfigMetadata {
  overtimeMultiplier: number;
  maxOvertimeHoursPerDay: number;
  maxOvertimeHoursPerMonth: number;
  requireApproval: boolean;
  weekendMultiplier: number;
  holidayMultiplier: number;
}

// ─── Module: Leave ──────────────────────────────────────────────────────────

export interface LeaveConfig extends ConfigMetadata {
  defaultAnnualBalance: number;
  defaultSickBalance: number;
  defaultEmergencyBalance: number;
  leaveTypes: LeaveTypeDefinition[];
  allowNegativeBalance: boolean;
  carryOverLimit: number;
  maxConsecutiveDays: number;
  requireDocumentForSick: boolean;
  sickDocumentThresholdDays: number;
}

export type LeaveSalaryImpact =
  | 'full_paid'
  | 'deduct_daily'
  | 'deduct_percent'
  | 'unpaid';

export interface LeaveTypeDefinition {
  type: 'annual' | 'sick' | 'unpaid' | 'emergency';
  labelAr: string;
  defaultBalance: number;
  salaryImpact: LeaveSalaryImpact;
  deductPercent: number;
  requiresApproval: boolean;
  maxConsecutiveDays: number;
  carryOverAllowed: boolean;
  maxCarryOverDays: number;
}

// ─── Module: Loan ───────────────────────────────────────────────────────────

export interface LoanConfig extends ConfigMetadata {
  maxLoanMultiplier: number;
  maxInstallments: number;
  maxActiveLoans: number;
  minimumServiceMonths: number;
  allowLoanDuringProbation: boolean;
}

// ─── Module: Payroll ────────────────────────────────────────────────────────

export interface PayrollSettingsConfig extends ConfigMetadata {
  allowNegativeSalary: boolean;
  autoClosePayrollMonth: boolean;
  payDay: number;
  roundingMethod: 'none' | 'nearest' | 'floor' | 'ceil';
  includeTransportInGross: boolean;
  socialSecurityRate: number;
  taxEnabled: boolean;
}

// ─── Module: Approval ───────────────────────────────────────────────────────

export interface ApprovalConfig extends ConfigMetadata {
  requireManagerApproval: boolean;
  autoApproveBelow: number;
  escalationAfterDays: number;
  maxApprovalLevels: number;
  notifyOnPending: boolean;
  hrAlwaysFinalLevel: boolean;
  allowDelegation: boolean;
}

// ─── Module: Transport ──────────────────────────────────────────────────────

export interface TransportZone {
  name: string;
  amount: number;
}

export interface TransportConfig extends ConfigMetadata {
  defaultTransportAllowance: number;
  deductOnAbsence: boolean;
  zoneBasedTransport: boolean;
  zones: TransportZone[];
}

// ─── Union Map (module name → config type) ──────────────────────────────────

export interface HRConfigMap {
  general: GeneralConfig;
  attendance: AttendanceConfig;
  overtime: OvertimeConfig;
  leave: LeaveConfig;
  loan: LoanConfig;
  payroll: PayrollSettingsConfig;
  approval: ApprovalConfig;
  transport: TransportConfig;
}

// ─── Config Version Snapshot (captured at payroll generation) ────────────────

export interface HRConfigVersionSnapshot {
  capturedAt: any;
  versions: Record<HRConfigModuleName, number>;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export type HRConfigAuditAction = 'update' | 'reset' | 'bulk_update';

export interface FirestoreHRConfigAuditLog {
  id?: string;
  module: HRConfigModuleName;
  action: HRConfigAuditAction;
  previousVersion: number;
  newVersion: number;
  changedFields: string[];
  performedBy: string;
  timestamp: any;
  details: string;
}

// ─── Tab Metadata (for UI rendering) ────────────────────────────────────────

export interface HRConfigTabMeta {
  key: HRConfigModuleName;
  label: string;
  icon: string;
  description: string;
}

export const HR_CONFIG_TABS: HRConfigTabMeta[] = [
  { key: 'general', label: 'عام', icon: 'settings', description: 'الإعدادات العامة للموارد البشرية' },
  { key: 'attendance', label: 'الحضور', icon: 'fingerprint', description: 'إعدادات الحضور والانصراف' },
  { key: 'overtime', label: 'الإضافي', icon: 'more_time', description: 'إعدادات العمل الإضافي' },
  { key: 'leave', label: 'الإجازات', icon: 'beach_access', description: 'إعدادات الإجازات والأرصدة' },
  { key: 'loan', label: 'السُلف', icon: 'payments', description: 'إعدادات السُلف والقروض' },
  { key: 'payroll', label: 'الرواتب', icon: 'receipt_long', description: 'إعدادات كشف الرواتب' },
  { key: 'approval', label: 'الموافقات', icon: 'fact_check', description: 'إعدادات سلسلة الموافقات' },
  { key: 'transport', label: 'النقل', icon: 'directions_bus', description: 'إعدادات بدل النقل والمواصلات' },
];
