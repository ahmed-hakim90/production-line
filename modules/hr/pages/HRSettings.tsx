import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Badge, Button, LoadingSkeleton } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import {
  getAllConfigModules,
  updateConfigModule,
  resetConfigModule,
  initializeConfigModules,
  hrConfigAuditService,
  HR_CONFIG_TABS,
  type HRConfigMap,
  type HRConfigModuleName,
  type FirestoreHRConfigAuditLog,
  type LeaveSalaryImpact,
  type LeaveTypeDefinition,
  type TransportZone,
} from '../config';
import type { DayOfWeek } from '../types';
import type { AttendanceIntegrationSettings } from '@/types';
import { updateApprovalSettings } from '../approval';
import { DEFAULT_ATTENDANCE_INTEGRATION } from '@/utils/dashboardConfig';

// ─── Validation ─────────────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validateGeneral(data: HRConfigMap['general']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.workingDaysPerWeek < 1 || data.workingDaysPerWeek > 7)
    errors.push({ field: 'workingDaysPerWeek', message: 'يجب أن يكون بين 1 و 7' });
  if (data.workingHoursPerDay < 1 || data.workingHoursPerDay > 24)
    errors.push({ field: 'workingHoursPerDay', message: 'يجب أن يكون بين 1 و 24' });
  if (data.minimumRestHoursBetweenShifts < 0)
    errors.push({ field: 'minimumRestHoursBetweenShifts', message: 'لا يمكن أن يكون سالباً' });
  return errors;
}

function validateAttendance(data: HRConfigMap['attendance']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.lateGraceMinutes < 0)
    errors.push({ field: 'lateGraceMinutes', message: 'لا يمكن أن يكون سالباً' });
  if (data.autoMarkAbsentAfterMinutes < 0)
    errors.push({ field: 'autoMarkAbsentAfterMinutes', message: 'لا يمكن أن يكون سالباً' });
  if (data.minimumWorkHoursForPresent < 0 || data.minimumWorkHoursForPresent > 24)
    errors.push({ field: 'minimumWorkHoursForPresent', message: 'يجب أن يكون بين 0 و 24' });
  return errors;
}

function validateOvertime(data: HRConfigMap['overtime']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.overtimeMultiplier < 1)
    errors.push({ field: 'overtimeMultiplier', message: 'يجب أن يكون 1 أو أكثر' });
  if (data.maxOvertimeHoursPerDay < 0)
    errors.push({ field: 'maxOvertimeHoursPerDay', message: 'لا يمكن أن يكون سالباً' });
  if (data.maxOvertimeHoursPerMonth < 0)
    errors.push({ field: 'maxOvertimeHoursPerMonth', message: 'لا يمكن أن يكون سالباً' });
  if (data.weekendMultiplier < 1)
    errors.push({ field: 'weekendMultiplier', message: 'يجب أن يكون 1 أو أكثر' });
  if (data.holidayMultiplier < 1)
    errors.push({ field: 'holidayMultiplier', message: 'يجب أن يكون 1 أو أكثر' });
  return errors;
}

function validateLeave(data: HRConfigMap['leave']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.defaultAnnualBalance < 0)
    errors.push({ field: 'defaultAnnualBalance', message: 'لا يمكن أن يكون سالباً' });
  if (data.defaultSickBalance < 0)
    errors.push({ field: 'defaultSickBalance', message: 'لا يمكن أن يكون سالباً' });
  if (data.defaultEmergencyBalance < 0)
    errors.push({ field: 'defaultEmergencyBalance', message: 'لا يمكن أن يكون سالباً' });
  if (data.carryOverLimit < 0)
    errors.push({ field: 'carryOverLimit', message: 'لا يمكن أن يكون سالباً' });
  if (data.maxConsecutiveDays < 1)
    errors.push({ field: 'maxConsecutiveDays', message: 'يجب أن يكون 1 على الأقل' });
  if (data.sickDocumentThresholdDays < 1)
    errors.push({ field: 'sickDocumentThresholdDays', message: 'يجب أن يكون 1 على الأقل' });
  if (!Array.isArray(data.leaveTypes) || data.leaveTypes.length === 0) {
    errors.push({ field: 'leaveTypes', message: 'يجب إضافة نوع إجازة واحد على الأقل' });
  } else {
    const leaveTypes = data.leaveTypes as LeaveTypeDefinition[];
    const types = new Set<string>();
    for (let i = 0; i < data.leaveTypes.length; i++) {
      const row = leaveTypes[i];
      const type = String(row.type || '').trim();
      const label = String(row.labelAr || '').trim();
      if (!type) errors.push({ field: `leaveTypes.${i}.type`, message: `نوع الإجازة في الصف ${i + 1} مطلوب` });
      if (!label) errors.push({ field: `leaveTypes.${i}.labelAr`, message: `اسم النوع في الصف ${i + 1} مطلوب` });
      if (row.defaultBalance < 0) errors.push({ field: `leaveTypes.${i}.defaultBalance`, message: `الرصيد السنوي في الصف ${i + 1} لا يمكن أن يكون سالباً` });
      if (row.maxConsecutiveDays < 0) errors.push({ field: `leaveTypes.${i}.maxConsecutiveDays`, message: `الحد الأقصى للأيام المتتالية في الصف ${i + 1} لا يمكن أن يكون سالباً` });
      if (row.maxCarryOverDays < 0) errors.push({ field: `leaveTypes.${i}.maxCarryOverDays`, message: `حد الترحيل في الصف ${i + 1} لا يمكن أن يكون سالباً` });
      if (row.deductPercent < 0 || row.deductPercent > 100) {
        errors.push({ field: `leaveTypes.${i}.deductPercent`, message: `نسبة الخصم في الصف ${i + 1} يجب أن تكون بين 0 و 100` });
      }
      if (type) {
        if (types.has(type)) {
          errors.push({ field: `leaveTypes.${i}.type`, message: `نوع الإجازة "${type}" مكرر` });
        } else {
          types.add(type);
        }
      }
    }
  }
  return errors;
}

function validateLoan(data: HRConfigMap['loan']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.maxLoanMultiplier < 0)
    errors.push({ field: 'maxLoanMultiplier', message: 'لا يمكن أن يكون سالباً' });
  if (data.maxInstallments < 1)
    errors.push({ field: 'maxInstallments', message: 'يجب أن يكون 1 على الأقل' });
  if (data.maxActiveLoans < 1)
    errors.push({ field: 'maxActiveLoans', message: 'يجب أن يكون 1 على الأقل' });
  if (data.minimumServiceMonths < 0)
    errors.push({ field: 'minimumServiceMonths', message: 'لا يمكن أن يكون سالباً' });
  return errors;
}

function validatePayroll(data: HRConfigMap['payroll']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.payDay < 1 || data.payDay > 31)
    errors.push({ field: 'payDay', message: 'يجب أن يكون بين 1 و 31' });
  if (data.socialSecurityRate < 0 || data.socialSecurityRate > 100)
    errors.push({ field: 'socialSecurityRate', message: 'يجب أن يكون بين 0% و 100%' });
  return errors;
}

function validateApproval(data: HRConfigMap['approval']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.autoApproveBelow < 0)
    errors.push({ field: 'autoApproveBelow', message: 'لا يمكن أن يكون سالباً' });
  if (data.escalationAfterDays < 1)
    errors.push({ field: 'escalationAfterDays', message: 'يجب أن يكون 1 على الأقل' });
  if (data.maxApprovalLevels < 1 || data.maxApprovalLevels > 10)
    errors.push({ field: 'maxApprovalLevels', message: 'يجب أن يكون بين 1 و 10' });
  return errors;
}

function validateTransport(data: HRConfigMap['transport']): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.defaultTransportAllowance < 0)
    errors.push({ field: 'defaultTransportAllowance', message: 'لا يمكن أن يكون سالباً' });
  if (data.zoneBasedTransport && data.zones.length === 0)
    errors.push({ field: 'zones', message: 'يجب إضافة منطقة واحدة على الأقل عند تفعيل النقل حسب المنطقة' });
  for (let i = 0; i < data.zones.length; i++) {
    if (!data.zones[i].name.trim())
      errors.push({ field: `zones.${i}.name`, message: `اسم المنطقة ${i + 1} مطلوب` });
    if (data.zones[i].amount < 0)
      errors.push({ field: `zones.${i}.amount`, message: `المبلغ في المنطقة ${i + 1} لا يمكن أن يكون سالباً` });
  }
  return errors;
}

const VALIDATORS: Record<HRConfigModuleName, (data: any) => ValidationError[]> = {
  general: validateGeneral,
  attendance: validateAttendance,
  overtime: validateOvertime,
  leave: validateLeave,
  loan: validateLoan,
  payroll: validatePayroll,
  approval: validateApproval,
  transport: validateTransport,
};

// ─── Shared Form Components ─────────────────────────────────────────────────

const FormField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, error, children, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-bold text-[var(--color-text)]">{label}</label>
    {children}
    {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
  </div>
);

const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}> = ({ value, onChange, min, max, step = 1, disabled }) => (
  <input
    type="number"
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium text-[var(--color-text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  />
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`
      relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
      transition-colors duration-200 ease-in-out focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed
      ${checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}
    `}
  >
    <span className={`
      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--color-card)] shadow-lg ring-0
      transition duration-200 ease-in-out
      ${checked ? '-translate-x-5' : 'translate-x-0'}
    `} />
  </button>
);

const SelectInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium text-[var(--color-text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

// ─── Day of Week Picker ─────────────────────────────────────────────────────

const DAY_LABELS: Record<DayOfWeek, string> = {
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  friday: 'الجمعة',
  saturday: 'السبت',
};

const ALL_DAYS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DayPicker: React.FC<{
  selected: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
  disabled?: boolean;
}> = ({ selected, onChange, disabled }) => (
  <div className="flex flex-wrap gap-2">
    {ALL_DAYS.map((day) => {
      const isSelected = selected.includes(day);
      return (
        <button
          key={day}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (isSelected) {
              onChange(selected.filter((d) => d !== day));
            } else {
              onChange([...selected, day]);
            }
          }}
          className={`
            px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSelected
              ? 'bg-primary text-white'
              : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'
            }
          `}
        >
          {DAY_LABELS[day]}
        </button>
      );
    })}
  </div>
);

// ─── Confirmation Dialog ────────────────────────────────────────────────────

const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', variant = 'primary', onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl border border-[var(--color-border)] p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm text-white transition-all ${
              variant === 'danger'
                ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                : 'bg-primary hover:bg-primary/90 shadow-primary/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab Form Renderers ─────────────────────────────────────────────────────

interface TabFormProps<K extends HRConfigModuleName> {
  config: HRConfigMap[K];
  onChange: (data: HRConfigMap[K]) => void;
  errors: ValidationError[];
  readOnly: boolean;
}

function getError(errors: ValidationError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

const GeneralForm: React.FC<TabFormProps<'general'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="أيام العمل في الأسبوع" error={getError(errors, 'workingDaysPerWeek')}>
      <NumberInput value={config.workingDaysPerWeek} onChange={(v) => onChange({ ...config, workingDaysPerWeek: v })} min={1} max={7} disabled={readOnly} />
    </FormField>
    <FormField label="ساعات العمل اليومية" error={getError(errors, 'workingHoursPerDay')}>
      <NumberInput value={config.workingHoursPerDay} onChange={(v) => onChange({ ...config, workingHoursPerDay: v })} min={1} max={24} disabled={readOnly} />
    </FormField>
    <div className="md:col-span-2">
      <FormField label="أيام الإجازة الأسبوعية">
        <DayPicker selected={config.weeklyOffDays} onChange={(days) => onChange({ ...config, weeklyOffDays: days })} disabled={readOnly} />
      </FormField>
    </div>
    <FormField label="الحد الأدنى للراحة بين الورديات (ساعات)" error={getError(errors, 'minimumRestHoursBetweenShifts')}>
      <NumberInput value={config.minimumRestHoursBetweenShifts} onChange={(v) => onChange({ ...config, minimumRestHoursBetweenShifts: v })} min={0} disabled={readOnly} />
    </FormField>
    <FormField label="العملة الافتراضية">
      <SelectInput value={config.defaultCurrency} onChange={(v) => onChange({ ...config, defaultCurrency: v })} disabled={readOnly}
        options={[
          { value: 'SAR', label: 'ريال سعودي (SAR)' },
          { value: 'AED', label: 'درهم إماراتي (AED)' },
          { value: 'EGP', label: 'جنيه مصري (EGP)' },
          { value: 'USD', label: 'دولار أمريكي (USD)' },
        ]}
      />
    </FormField>
    <FormField label="شهر بداية السنة المالية">
      <NumberInput value={config.fiscalYearStartMonth} onChange={(v) => onChange({ ...config, fiscalYearStartMonth: v })} min={1} max={12} disabled={readOnly} />
    </FormField>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">تفعيل الورديات المتعددة</span>
      <Toggle checked={config.useMultipleShifts} onChange={(v) => onChange({ ...config, useMultipleShifts: v })} disabled={readOnly} />
    </div>
  </div>
);

const AttendanceForm: React.FC<TabFormProps<'attendance'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="فترة السماح للتأخير (دقائق)" error={getError(errors, 'lateGraceMinutes')}>
      <NumberInput value={config.lateGraceMinutes} onChange={(v) => onChange({ ...config, lateGraceMinutes: v })} min={0} disabled={readOnly} />
    </FormField>
    <FormField label="تسجيل غياب تلقائي بعد (دقائق)" error={getError(errors, 'autoMarkAbsentAfterMinutes')} hint="0 يعطل الغياب التلقائي">
      <NumberInput value={config.autoMarkAbsentAfterMinutes} onChange={(v) => onChange({ ...config, autoMarkAbsentAfterMinutes: v })} min={0} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأدنى لساعات الحضور" error={getError(errors, 'minimumWorkHoursForPresent')}>
      <NumberInput value={config.minimumWorkHoursForPresent} onChange={(v) => onChange({ ...config, minimumWorkHoursForPresent: v })} min={0} max={24} step={0.5} disabled={readOnly} />
    </FormField>
    <div />
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">السماح بالإدخال اليدوي</span>
      <Toggle checked={config.allowManualEntry} onChange={(v) => onChange({ ...config, allowManualEntry: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">إلزام تسجيل الخروج</span>
      <Toggle checked={config.requireCheckOut} onChange={(v) => onChange({ ...config, requireCheckOut: v })} disabled={readOnly} />
    </div>
  </div>
);

const OvertimeForm: React.FC<TabFormProps<'overtime'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="مضاعف العمل الإضافي" error={getError(errors, 'overtimeMultiplier')} hint="مثال: 1.5 = 150%">
      <NumberInput value={config.overtimeMultiplier} onChange={(v) => onChange({ ...config, overtimeMultiplier: v })} min={1} step={0.25} disabled={readOnly} />
    </FormField>
    <FormField label="مضاعف نهاية الأسبوع" error={getError(errors, 'weekendMultiplier')}>
      <NumberInput value={config.weekendMultiplier} onChange={(v) => onChange({ ...config, weekendMultiplier: v })} min={1} step={0.25} disabled={readOnly} />
    </FormField>
    <FormField label="مضاعف الإجازات الرسمية" error={getError(errors, 'holidayMultiplier')}>
      <NumberInput value={config.holidayMultiplier} onChange={(v) => onChange({ ...config, holidayMultiplier: v })} min={1} step={0.25} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأقصى يومياً (ساعات)" error={getError(errors, 'maxOvertimeHoursPerDay')}>
      <NumberInput value={config.maxOvertimeHoursPerDay} onChange={(v) => onChange({ ...config, maxOvertimeHoursPerDay: v })} min={0} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأقصى شهرياً (ساعات)" error={getError(errors, 'maxOvertimeHoursPerMonth')}>
      <NumberInput value={config.maxOvertimeHoursPerMonth} onChange={(v) => onChange({ ...config, maxOvertimeHoursPerMonth: v })} min={0} disabled={readOnly} />
    </FormField>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">طلب موافقة مسبقة</span>
      <Toggle checked={config.requireApproval} onChange={(v) => onChange({ ...config, requireApproval: v })} disabled={readOnly} />
    </div>
  </div>
);

const LeaveForm: React.FC<TabFormProps<'leave'>> = ({ config, onChange, errors, readOnly }) => {
  const IMPACT_OPTIONS: { value: LeaveSalaryImpact; label: string }[] = [
    { value: 'full_paid', label: 'مدفوعة بالكامل' },
    { value: 'deduct_daily', label: 'خصم يومي من الراتب' },
    { value: 'deduct_percent', label: 'خصم نسبة مئوية' },
    { value: 'unpaid', label: 'بدون راتب (خصم كامل)' },
  ];

  const updateLeaveType = (index: number, patch: Partial<LeaveTypeDefinition>) => {
    const leaveTypes = [...config.leaveTypes];
    leaveTypes[index] = { ...leaveTypes[index], ...patch };
    onChange({ ...config, leaveTypes });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField label="الرصيد السنوي الافتراضي (أيام)" error={getError(errors, 'defaultAnnualBalance')}>
          <NumberInput value={config.defaultAnnualBalance} onChange={(v) => onChange({ ...config, defaultAnnualBalance: v })} min={0} disabled={readOnly} />
        </FormField>
        <FormField label="رصيد الإجازات المرضية (أيام)" error={getError(errors, 'defaultSickBalance')}>
          <NumberInput value={config.defaultSickBalance} onChange={(v) => onChange({ ...config, defaultSickBalance: v })} min={0} disabled={readOnly} />
        </FormField>
        <FormField label="رصيد الإجازات الطارئة (أيام)" error={getError(errors, 'defaultEmergencyBalance')}>
          <NumberInput value={config.defaultEmergencyBalance} onChange={(v) => onChange({ ...config, defaultEmergencyBalance: v })} min={0} disabled={readOnly} />
        </FormField>
        <FormField label="حد الترحيل (أيام)" error={getError(errors, 'carryOverLimit')} hint="أقصى عدد أيام يُرحّل للسنة التالية">
          <NumberInput value={config.carryOverLimit} onChange={(v) => onChange({ ...config, carryOverLimit: v })} min={0} disabled={readOnly} />
        </FormField>
        <FormField label="الحد الأقصى للإجازات المتتالية (أيام)" error={getError(errors, 'maxConsecutiveDays')}>
          <NumberInput value={config.maxConsecutiveDays} onChange={(v) => onChange({ ...config, maxConsecutiveDays: v })} min={0} disabled={readOnly} />
        </FormField>
        <FormField label="التقرير الطبي بعد (أيام)" error={getError(errors, 'sickDocumentThresholdDays')}>
          <NumberInput value={config.sickDocumentThresholdDays} onChange={(v) => onChange({ ...config, sickDocumentThresholdDays: v })} min={1} disabled={readOnly} />
        </FormField>
        <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
          <span className="text-sm font-bold text-[var(--color-text)]">السماح بالرصيد السالب</span>
          <Toggle checked={config.allowNegativeBalance} onChange={(v) => onChange({ ...config, allowNegativeBalance: v })} disabled={readOnly} />
        </div>
        <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
          <span className="text-sm font-bold text-[var(--color-text)]">التقرير الطبي إلزامي</span>
          <Toggle checked={config.requireDocumentForSick} onChange={(v) => onChange({ ...config, requireDocumentForSick: v })} disabled={readOnly} />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] px-4 py-3">
        <p className="text-xs text-amber-700 font-medium">
          تغيير تأثير الإجازة على الراتب سيؤثر على احتساب الرواتب القادمة فقط — لن يُعاد احتساب الأشهر المنتهية.
        </p>
      </div>

      {(config.leaveTypes || []).map((lt, idx) => (
        <Card key={lt.type}>
          <div className="flex items-center gap-3 mb-4">
            <span className="material-icons-round text-primary">beach_access</span>
            <h4 className="font-bold text-[var(--color-text)]">{lt.labelAr}</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                الرصيد السنوي (أيام)
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={lt.defaultBalance}
                disabled={readOnly}
                onChange={e => updateLeaveType(idx, { defaultBalance: Number(e.target.value) })}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)] focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none disabled:opacity-60"
              />
              {getError(errors, `leaveTypes.${idx}.defaultBalance`) && (
                <p className="text-xs text-rose-500 mt-1">{getError(errors, `leaveTypes.${idx}.defaultBalance`)}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                تأثير على الراتب
              </label>
              <select
                value={lt.salaryImpact}
                disabled={readOnly}
                onChange={e => updateLeaveType(idx, { salaryImpact: e.target.value as LeaveSalaryImpact })}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)] focus:border-primary outline-none disabled:opacity-60"
              >
                {IMPACT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {lt.salaryImpact === 'deduct_percent' && (
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  نسبة الخصم %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={lt.deductPercent}
                  disabled={readOnly}
                  onChange={e => updateLeaveType(idx, { deductPercent: Number(e.target.value) })}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)] focus:border-primary outline-none disabled:opacity-60"
                />
                {getError(errors, `leaveTypes.${idx}.deductPercent`) && (
                  <p className="text-xs text-rose-500 mt-1">{getError(errors, `leaveTypes.${idx}.deductPercent`)}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                أقصى أيام متتالية (0 = بلا حد)
              </label>
              <input
                type="number"
                min={0}
                value={lt.maxConsecutiveDays}
                disabled={readOnly}
                onChange={e => updateLeaveType(idx, { maxConsecutiveDays: Number(e.target.value) })}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)] focus:border-primary outline-none disabled:opacity-60"
              />
              {getError(errors, `leaveTypes.${idx}.maxConsecutiveDays`) && (
                <p className="text-xs text-rose-500 mt-1">{getError(errors, `leaveTypes.${idx}.maxConsecutiveDays`)}</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id={`approval-${lt.type}`}
                checked={lt.requiresApproval}
                disabled={readOnly}
                onChange={e => updateLeaveType(idx, { requiresApproval: e.target.checked })}
                className="w-4 h-4 accent-primary disabled:opacity-50"
              />
              <label htmlFor={`approval-${lt.type}`} className="text-sm font-medium text-[var(--color-text)]">
                يتطلب موافقة
              </label>
            </div>

            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id={`carryover-${lt.type}`}
                checked={lt.carryOverAllowed}
                disabled={readOnly}
                onChange={e => updateLeaveType(idx, { carryOverAllowed: e.target.checked })}
                className="w-4 h-4 accent-primary disabled:opacity-50"
              />
              <label htmlFor={`carryover-${lt.type}`} className="text-sm font-medium text-[var(--color-text)]">
                ترحيل الرصيد
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                حد ترحيل الرصيد (أيام)
              </label>
              <input
                type="number"
                min={0}
                value={lt.maxCarryOverDays}
                disabled={readOnly || !lt.carryOverAllowed}
                onChange={e => updateLeaveType(idx, { maxCarryOverDays: Number(e.target.value) })}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)] focus:border-primary outline-none disabled:opacity-60"
              />
              {getError(errors, `leaveTypes.${idx}.maxCarryOverDays`) && (
                <p className="text-xs text-rose-500 mt-1">{getError(errors, `leaveTypes.${idx}.maxCarryOverDays`)}</p>
              )}
            </div>
          </div>
        </Card>
      ))}

      {getError(errors, 'leaveTypes') && (
        <p className="text-xs text-rose-500 font-medium">{getError(errors, 'leaveTypes')}</p>
      )}
    </div>
  );
};

const LoanForm: React.FC<TabFormProps<'loan'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="الحد الأقصى للسلفة (مضاعف الراتب)" error={getError(errors, 'maxLoanMultiplier')} hint="مثال: 3 = ثلاثة أضعاف الراتب">
      <NumberInput value={config.maxLoanMultiplier} onChange={(v) => onChange({ ...config, maxLoanMultiplier: v })} min={0} step={0.5} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأقصى للأقساط" error={getError(errors, 'maxInstallments')}>
      <NumberInput value={config.maxInstallments} onChange={(v) => onChange({ ...config, maxInstallments: v })} min={1} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأقصى للسلف النشطة" error={getError(errors, 'maxActiveLoans')}>
      <NumberInput value={config.maxActiveLoans} onChange={(v) => onChange({ ...config, maxActiveLoans: v })} min={1} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأدنى لمدة الخدمة (أشهر)" error={getError(errors, 'minimumServiceMonths')}>
      <NumberInput value={config.minimumServiceMonths} onChange={(v) => onChange({ ...config, minimumServiceMonths: v })} min={0} disabled={readOnly} />
    </FormField>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">السماح بالسلفة أثناء التجربة</span>
      <Toggle checked={config.allowLoanDuringProbation} onChange={(v) => onChange({ ...config, allowLoanDuringProbation: v })} disabled={readOnly} />
    </div>
  </div>
);

const PayrollForm: React.FC<TabFormProps<'payroll'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="يوم صرف الرواتب" error={getError(errors, 'payDay')}>
      <NumberInput value={config.payDay} onChange={(v) => onChange({ ...config, payDay: v })} min={1} max={31} disabled={readOnly} />
    </FormField>
    <FormField label="طريقة التقريب">
      <SelectInput value={config.roundingMethod} onChange={(v) => onChange({ ...config, roundingMethod: v as any })} disabled={readOnly}
        options={[
          { value: 'none', label: 'بدون تقريب' },
          { value: 'nearest', label: 'لأقرب رقم' },
          { value: 'floor', label: 'تقريب لأسفل' },
          { value: 'ceil', label: 'تقريب لأعلى' },
        ]}
      />
    </FormField>
    <FormField label="نسبة التأمينات الاجتماعية (%)" error={getError(errors, 'socialSecurityRate')}>
      <NumberInput value={config.socialSecurityRate} onChange={(v) => onChange({ ...config, socialSecurityRate: v })} min={0} max={100} step={0.5} disabled={readOnly} />
    </FormField>
    <div />
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">السماح بالراتب السالب</span>
      <Toggle checked={config.allowNegativeSalary} onChange={(v) => onChange({ ...config, allowNegativeSalary: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">إغلاق الشهر تلقائياً</span>
      <Toggle checked={config.autoClosePayrollMonth} onChange={(v) => onChange({ ...config, autoClosePayrollMonth: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">تضمين النقل في الإجمالي</span>
      <Toggle checked={config.includeTransportInGross} onChange={(v) => onChange({ ...config, includeTransportInGross: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">تفعيل الضريبة</span>
      <Toggle checked={config.taxEnabled} onChange={(v) => onChange({ ...config, taxEnabled: v })} disabled={readOnly} />
    </div>
  </div>
);

const PayrollPreviewPanel: React.FC = () => {
  const sampleRows = [
    { name: 'أحمد محمد', base: 4200, gross: 4620, deductions: 180, net: 4440, status: 'مُعتمد' },
    { name: 'سعاد علي', base: 5100, gross: 5480, deductions: 260, net: 5220, status: 'مُعتمد' },
    { name: 'محمود حسين', base: 3900, gross: 4100, deductions: 90, net: 4010, status: 'مُعتمد' },
  ];

  const formatAmount = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-6 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <span className="material-icons-round text-primary">preview</span>
            معاينة شكل كشف المرتبات والسركي
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            هذه معاينة تصميم فقط من داخل إعدادات HR لتوضيح الشكل النهائي قبل الدخول لشاشة الرواتب.
          </p>
        </div>
      </div>

      <Card title="معاينة كشف المرتبات">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الموظف</th>
                <th className="erp-th">الأساسي</th>
                <th className="erp-th">المستحقات</th>
                <th className="erp-th">الخصومات</th>
                <th className="erp-th">الصافي</th>
                <th className="erp-th text-center">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row) => (
                <tr key={row.name} className="border-b border-[var(--color-border)]">
                  <td className="py-3 px-3 font-bold">{row.name}</td>
                  <td className="py-3 px-3 font-mono text-xs">{formatAmount(row.base)}</td>
                  <td className="py-3 px-3 font-mono text-xs text-emerald-600 font-bold">{formatAmount(row.gross)}</td>
                  <td className="py-3 px-3 font-mono text-xs text-rose-500 font-bold">{formatAmount(row.deductions)}</td>
                  <td className="py-3 px-3 font-mono text-xs text-primary font-bold">{formatAmount(row.net)}</td>
                  <td className="py-3 px-3 text-center">
                    <Badge variant="success">{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="معاينة الكشف (كشف راتب تجريبي)">
        <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/40 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
            <div>
              <p className="text-base font-black text-[var(--color-text)]">أحمد محمد</p>
              <p className="text-xs text-[var(--color-text-muted)]">كشف راتب — مارس 2026</p>
            </div>
            <Badge variant="success">مقفل</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-[var(--border-radius-base)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-xs text-[var(--color-text-muted)]">أيام العمل</p>
              <p className="text-lg font-black">26</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-xs text-[var(--color-text-muted)]">حضور</p>
              <p className="text-lg font-black text-emerald-600">25</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-xs text-[var(--color-text-muted)]">غياب</p>
              <p className="text-lg font-black text-rose-500">1</p>
            </div>
            <div className="rounded-[var(--border-radius-base)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 text-center">
              <p className="text-xs text-[var(--color-text-muted)]">تأخير</p>
              <p className="text-lg font-black text-amber-500">2</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-[var(--border-radius-base)] border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-sm font-bold text-emerald-700 mb-2">المستحقات</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span>الراتب الأساسي</span><span className="font-mono font-bold">4,200.00</span></div>
                <div className="flex items-center justify-between"><span>بدل إضافي</span><span className="font-mono font-bold">300.00</span></div>
                <div className="flex items-center justify-between"><span>بدلات</span><span className="font-mono font-bold">120.00</span></div>
              </div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50/70 p-3">
              <p className="text-sm font-bold text-rose-700 mb-2">الخصومات</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span>خصم غياب</span><span className="font-mono font-bold text-rose-600">120.00</span></div>
                <div className="flex items-center justify-between"><span>خصم تأخير</span><span className="font-mono font-bold text-rose-600">40.00</span></div>
                <div className="flex items-center justify-between"><span>قسط سلفة</span><span className="font-mono font-bold text-rose-600">20.00</span></div>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--border-radius-base)] bg-primary/10 border border-primary/20 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-primary">صافي الراتب</span>
            <span className="text-xl font-black text-primary font-mono">4,440.00</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

const ApprovalForm: React.FC<TabFormProps<'approval'>> = ({ config, onChange, errors, readOnly }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <FormField label="حد الموافقة التلقائية (المبلغ)" error={getError(errors, 'autoApproveBelow')} hint="0 يعطل الموافقة التلقائية">
      <NumberInput value={config.autoApproveBelow} onChange={(v) => onChange({ ...config, autoApproveBelow: v })} min={0} disabled={readOnly} />
    </FormField>
    <FormField label="التصعيد بعد (أيام)" error={getError(errors, 'escalationAfterDays')}>
      <NumberInput value={config.escalationAfterDays} onChange={(v) => onChange({ ...config, escalationAfterDays: v })} min={1} disabled={readOnly} />
    </FormField>
    <FormField label="الحد الأقصى لمستويات الموافقة" error={getError(errors, 'maxApprovalLevels')}>
      <NumberInput value={config.maxApprovalLevels} onChange={(v) => onChange({ ...config, maxApprovalLevels: v })} min={1} max={10} disabled={readOnly} />
    </FormField>
    <div />
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">إلزام موافقة المدير</span>
      <Toggle checked={config.requireManagerApproval} onChange={(v) => onChange({ ...config, requireManagerApproval: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">إشعار عند وجود طلبات معلقة</span>
      <Toggle checked={config.notifyOnPending} onChange={(v) => onChange({ ...config, notifyOnPending: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">HR المستوى الأخير دائماً</span>
      <Toggle checked={config.hrAlwaysFinalLevel ?? true} onChange={(v) => onChange({ ...config, hrAlwaysFinalLevel: v })} disabled={readOnly} />
    </div>
    <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
      <span className="text-sm font-bold text-[var(--color-text)]">السماح بالتفويض</span>
      <Toggle checked={config.allowDelegation ?? true} onChange={(v) => onChange({ ...config, allowDelegation: v })} disabled={readOnly} />
    </div>
  </div>
);

const TransportForm: React.FC<TabFormProps<'transport'>> = ({ config, onChange, errors, readOnly }) => {
  const addZone = () => {
    onChange({ ...config, zones: [...config.zones, { name: '', amount: 0 }] });
  };
  const removeZone = (index: number) => {
    onChange({ ...config, zones: config.zones.filter((_, i) => i !== index) });
  };
  const updateZone = (index: number, field: keyof TransportZone, value: string | number) => {
    const zones = [...config.zones];
    zones[index] = { ...zones[index], [field]: value };
    onChange({ ...config, zones });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField label="بدل النقل الافتراضي" error={getError(errors, 'defaultTransportAllowance')}>
          <NumberInput value={config.defaultTransportAllowance} onChange={(v) => onChange({ ...config, defaultTransportAllowance: v })} min={0} disabled={readOnly} />
        </FormField>
        <div />
        <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
          <span className="text-sm font-bold text-[var(--color-text)]">خصم النقل عند الغياب</span>
          <Toggle checked={config.deductOnAbsence} onChange={(v) => onChange({ ...config, deductOnAbsence: v })} disabled={readOnly} />
        </div>
        <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
          <span className="text-sm font-bold text-[var(--color-text)]">النقل حسب المنطقة</span>
          <Toggle checked={config.zoneBasedTransport} onChange={(v) => onChange({ ...config, zoneBasedTransport: v })} disabled={readOnly} />
        </div>
      </div>

      {config.zoneBasedTransport && (
        <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-[var(--color-text)]">مناطق النقل</h4>
            {!readOnly && (
              <Button variant="outline" onClick={addZone}>
                <span className="material-icons-round text-sm">add</span>
                إضافة منطقة
              </Button>
            )}
          </div>
          {config.zones.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">لا توجد مناطق مُعرّفة</p>
          )}
          {config.zones.map((zone, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={zone.name}
                  onChange={(e) => updateZone(i, 'name', e.target.value)}
                  placeholder="اسم المنطقة"
                  disabled={readOnly}
                  className="w-full px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>
              <div className="w-32">
                <NumberInput value={zone.amount} onChange={(v) => updateZone(i, 'amount', v)} min={0} disabled={readOnly} />
              </div>
              {!readOnly && (
                <button onClick={() => removeZone(i)} className="text-rose-400 hover:text-rose-600 transition-colors p-1">
                  <span className="material-icons-round text-lg">delete</span>
                </button>
              )}
            </div>
          ))}
          {getError(errors, 'zones') && (
            <p className="text-xs text-rose-500 font-medium">{getError(errors, 'zones')}</p>
          )}
        </div>
      )}
    </div>
  );
};

const TAB_FORMS: Record<HRConfigModuleName, React.FC<TabFormProps<any>>> = {
  general: GeneralForm,
  attendance: AttendanceForm,
  overtime: OvertimeForm,
  leave: LeaveForm,
  loan: LoanForm,
  payroll: PayrollForm,
  approval: ApprovalForm,
  transport: TransportForm,
};

// ─── Audit Log Viewer ───────────────────────────────────────────────────────

const AuditLogPanel: React.FC<{ module: HRConfigModuleName }> = ({ module }) => {
  const [logs, setLogs] = useState<FirestoreHRConfigAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hrConfigAuditService.getByModule(module, 20).then((result) => {
      if (!cancelled) {
        setLogs(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [module]);

  if (loading) return <LoadingSkeleton type="table" rows={3} />;
  if (logs.length === 0) return <p className="text-sm text-[var(--color-text-muted)] text-center py-4">لا توجد سجلات تغييرات</p>;

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50 text-sm">
          <span className="material-icons-round text-[var(--color-text-muted)] text-lg mt-0.5">
            {log.action === 'reset' ? 'restart_alt' : 'edit'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--color-text)]">{log.details}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
              <span>v{log.previousVersion} → v{log.newVersion}</span>
              <span>⬢</span>
              <span>{log.performedBy}</span>
              {log.timestamp?.toDate && (
                <>
                  <span>⬢</span>
                  <span>{log.timestamp.toDate().toLocaleDateString('ar-SA')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main HRSettings Page ───────────────────────────────────────────────────

export const HRSettings: React.FC = () => {
  const { can } = usePermission();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const canEdit = can('hrSettings.edit');
  const readOnly = !canEdit;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<HRConfigModuleName>('general');
  const [configs, setConfigs] = useState<HRConfigMap | null>(null);
  const [draft, setDraft] = useState<HRConfigMap | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [savingAttendanceIntegration, setSavingAttendanceIntegration] = useState(false);
  const [attendanceIntegrationDraft, setAttendanceIntegrationDraft] =
    useState<AttendanceIntegrationSettings>(() => ({
      ...DEFAULT_ATTENDANCE_INTEGRATION,
      ...systemSettings.attendanceIntegration,
    }));
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const performedBy = userDisplayName || userEmail || 'unknown';

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      await initializeConfigModules(performedBy);
      const allConfigs = await getAllConfigModules();
      setConfigs(allConfigs);
      setDraft(JSON.parse(JSON.stringify(allConfigs)));
    } catch (err) {
      console.error('Failed to load HR configs:', err);
      setToast({ message: 'فشل في تحميل الإعدادات', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [performedBy]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    setAttendanceIntegrationDraft({
      ...DEFAULT_ATTENDANCE_INTEGRATION,
      ...systemSettings.attendanceIntegration,
    });
  }, [systemSettings.attendanceIntegration]);

  const hasChanges = useMemo(() => {
    if (!configs || !draft) return false;
    return JSON.stringify(configs[activeTab]) !== JSON.stringify(draft[activeTab]);
  }, [configs, draft, activeTab]);

  const handleTabChange = useCallback((tab: HRConfigModuleName) => {
    setErrors([]);
    setActiveTab(tab);
    setShowAuditLog(false);
  }, []);

  const handleDraftChange = useCallback(<K extends HRConfigModuleName>(data: HRConfigMap[K]) => {
    setDraft((prev) => prev ? { ...prev, [activeTab]: data } : prev);
    setErrors([]);
  }, [activeTab]);

  const handleSave = useCallback(() => {
    if (!draft) return;
    const validator = VALIDATORS[activeTab];
    const validationErrors = validator(draft[activeTab]);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    setShowConfirmSave(true);
  }, [draft, activeTab]);

  const confirmSave = useCallback(async () => {
    if (!draft) return;
    setShowConfirmSave(false);
    setSaving(true);
    try {
      const { configVersion, updatedAt, updatedBy, ...data } = draft[activeTab] as any;
      const { newVersion } = await updateConfigModule(activeTab, data, performedBy);

      if (activeTab === 'approval') {
        await updateApprovalSettings({
          maxApprovalLevels: data.maxApprovalLevels,
          hrAlwaysFinalLevel: data.hrAlwaysFinalLevel ?? true,
          escalationDays: data.escalationAfterDays,
          allowDelegation: data.allowDelegation ?? true,
        });
      }
      setToast({ message: `تم حفظ الإعدادات بنجاح — الإصدار ${newVersion}`, type: 'success' });
      await loadConfigs();
    } catch (err) {
      console.error('Failed to save config:', err);
      setToast({ message: 'فشل في حفظ الإعدادات', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [draft, activeTab, performedBy, loadConfigs]);

  const handleReset = useCallback(() => {
    setShowConfirmReset(true);
  }, []);

  const confirmReset = useCallback(async () => {
    setShowConfirmReset(false);
    setSaving(true);
    try {
      const { newVersion } = await resetConfigModule(activeTab, performedBy);
      setToast({ message: `تم إعادة التعيين — الإصدار ${newVersion}`, type: 'success' });
      await loadConfigs();
    } catch (err) {
      console.error('Failed to reset config:', err);
      setToast({ message: 'فشل في إعادة التعيين', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [activeTab, performedBy, loadConfigs]);

  const handleDiscard = useCallback(() => {
    if (configs) {
      setDraft(JSON.parse(JSON.stringify(configs)));
      setErrors([]);
    }
  }, [configs]);

  const attendanceIntegrationHasChanges = useMemo(
    () =>
      JSON.stringify({
        ...DEFAULT_ATTENDANCE_INTEGRATION,
        ...systemSettings.attendanceIntegration,
      }) !== JSON.stringify(attendanceIntegrationDraft),
    [systemSettings.attendanceIntegration, attendanceIntegrationDraft],
  );

  const handleSaveAttendanceIntegration = useCallback(async () => {
    setSavingAttendanceIntegration(true);
    try {
      await updateSystemSettings({
        ...systemSettings,
        attendanceIntegration: attendanceIntegrationDraft,
      });
      setToast({ message: 'تم حفظ إعدادات تكامل الحضور', type: 'success' });
    } catch (error) {
      console.error('Failed to save attendance integration settings:', error);
      setToast({ message: 'فشل في حفظ إعدادات تكامل الحضور', type: 'error' });
    } finally {
      setSavingAttendanceIntegration(false);
    }
  }, [updateSystemSettings, systemSettings, attendanceIntegrationDraft]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-[var(--border-radius-lg)] flex items-center justify-center">
            <span className="material-icons-round text-primary text-2xl">tune</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات الموارد البشرية</h1>
            <p className="text-sm text-slate-400">مركز التحكم المتقدم</p>
          </div>
        </div>
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  if (!configs || !draft) {
    return (
      <div className="text-center py-16">
        <span className="material-icons-round text-4xl text-[var(--color-text-muted)] mb-4">error_outline</span>
        <p className="text-[var(--color-text-muted)]">فشل في تحميل الإعدادات</p>
        <Button variant="outline" onClick={loadConfigs} className="mt-4">إعادة المحاولة</Button>
      </div>
    );
  }

  const activeTabMeta = HR_CONFIG_TABS.find((t) => t.key === activeTab)!;
  const currentConfig = draft[activeTab];
  const FormComponent = TAB_FORMS[activeTab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-[var(--border-radius-lg)] flex items-center justify-center">
            <span className="material-icons-round text-primary text-2xl">tune</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات الموارد البشرية</h1>
            <p className="text-sm text-slate-400">مركز التحكم المتقدم — إدارة جميع إعدادات الموارد البشرية</p>
          </div>
        </div>
        {readOnly && (
          <Badge variant="warning">
            <span className="material-icons-round text-xs ml-1">lock</span>
            للقراءة فقط
          </Badge>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
        <div className="flex overflow-x-auto border-b border-[var(--color-border)]">
          {HR_CONFIG_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                flex items-center gap-2 px-5 py-3.5 text-sm font-bold whitespace-nowrap transition-all border-b-2 -mb-px
                ${activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] dark:hover:text-[var(--color-text-muted)]'
                }
              `}
            >
              <span className="material-icons-round text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Tab Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="material-icons-round text-primary">{activeTabMeta.icon}</span>
                {activeTabMeta.label}
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{activeTabMeta.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="info">v{(currentConfig as any).configVersion || 0}</Badge>
              <button
                onClick={() => setShowAuditLog(!showAuditLog)}
                className="text-[var(--color-text-muted)] hover:text-slate-600 dark:hover:text-[var(--color-text-muted)] transition-colors"
                title="سجل التغييرات"
              >
                <span className="material-icons-round text-xl">history</span>
              </button>
            </div>
          </div>

          {/* Audit Log Panel */}
          {showAuditLog && (
            <div className="mb-6 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <span className="material-icons-round text-[var(--color-text-muted)] text-lg">history</span>
                سجل التغييرات
              </h3>
              <AuditLogPanel module={activeTab} />
            </div>
          )}

          {/* Form */}
          <FormComponent
            config={currentConfig as any}
            onChange={handleDraftChange}
            errors={errors}
            readOnly={readOnly}
          />

          {activeTab === 'attendance' && (
            <div className="mt-6 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                  <span className="material-icons-round text-primary">folder_open</span>
                  تكامل الحضور (ZKTeco Excel)
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  إعدادات مسار المجلد المراقب الخاصة بخدمة Gateway المحلية للاستيراد التلقائي.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="مسار المجلد المراقب">
                  <input
                    type="text"
                    value={attendanceIntegrationDraft.watchFolderPath}
                    onChange={(e) =>
                      setAttendanceIntegrationDraft((prev) => ({ ...prev, watchFolderPath: e.target.value }))
                    }
                    disabled={readOnly}
                    placeholder="D:\\ZKTeco\\Exports"
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium text-[var(--color-text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </FormField>

                <FormField label="نمط الملفات">
                  <input
                    type="text"
                    value={attendanceIntegrationDraft.importFilePattern}
                    onChange={(e) =>
                      setAttendanceIntegrationDraft((prev) => ({ ...prev, importFilePattern: e.target.value }))
                    }
                    disabled={readOnly}
                    placeholder="*.xlsx,*.xls,*.csv"
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium text-[var(--color-text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </FormField>

                <FormField label="توقيت بداية الدوام">
                  <input
                    type="time"
                    value={attendanceIntegrationDraft.shiftStartTime}
                    onChange={(e) =>
                      setAttendanceIntegrationDraft((prev) => ({ ...prev, shiftStartTime: e.target.value }))
                    }
                    disabled={readOnly}
                    className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm font-medium text-[var(--color-text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </FormField>

                <FormField label="دقائق الدوام اليومية">
                  <NumberInput
                    value={attendanceIntegrationDraft.workingMinutesPerDay}
                    onChange={(value) =>
                      setAttendanceIntegrationDraft((prev) => ({
                        ...prev,
                        workingMinutesPerDay: Math.max(60, value || 0),
                      }))
                    }
                    min={60}
                    step={30}
                    disabled={readOnly}
                  />
                </FormField>

                <FormField label="سماحية التأخير (دقيقة)">
                  <NumberInput
                    value={attendanceIntegrationDraft.lateGraceMinutes}
                    onChange={(value) =>
                      setAttendanceIntegrationDraft((prev) => ({
                        ...prev,
                        lateGraceMinutes: Math.max(0, value || 0),
                      }))
                    }
                    min={0}
                    disabled={readOnly}
                  />
                </FormField>

                <FormField label="عتبة الإضافي (دقيقة)">
                  <NumberInput
                    value={attendanceIntegrationDraft.overtimeThresholdMinutes}
                    onChange={(value) =>
                      setAttendanceIntegrationDraft((prev) => ({
                        ...prev,
                        overtimeThresholdMinutes: Math.max(60, value || 0),
                      }))
                    }
                    min={60}
                    step={30}
                    disabled={readOnly}
                  />
                </FormField>
              </div>

              <div className="flex items-center justify-between p-4 rounded-[var(--border-radius-base)] bg-[#f8f9fa]/50">
                <span className="text-sm font-bold text-[var(--color-text)]">تفعيل مجلد المراقبة</span>
                <Toggle
                  checked={attendanceIntegrationDraft.watchFolderEnabled}
                  onChange={(value) =>
                    setAttendanceIntegrationDraft((prev) => ({ ...prev, watchFolderEnabled: value }))
                  }
                  disabled={readOnly}
                />
              </div>

              {!readOnly && (
                <div className="flex items-center justify-end">
                  <Button
                    onClick={handleSaveAttendanceIntegration}
                    disabled={!attendanceIntegrationHasChanges || savingAttendanceIntegration}
                  >
                    {savingAttendanceIntegration ? (
                      <>
                        <span className="material-icons-round animate-spin text-sm">refresh</span>
                        جاري حفظ تكامل الحضور...
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-sm">save</span>
                        حفظ إعدادات تكامل الحضور
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'payroll' && <PayrollPreviewPanel />}

          {/* Actions */}
          {!readOnly && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
              <button
                onClick={handleReset}
                className="text-sm font-medium text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
              >
                <span className="material-icons-round text-sm">restart_alt</span>
                إعادة تعيين للقيم الافتراضية
              </button>
              <div className="flex items-center gap-3">
                {hasChanges && (
                  <Button variant="outline" onClick={handleDiscard}>تجاهل التغييرات</Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                >
                  {saving ? (
                    <>
                      <span className="material-icons-round animate-spin text-sm">refresh</span>
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round text-sm">save</span>
                      حفظ التغييرات
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showConfirmSave}
        title="تأكيد حفظ الإعدادات"
        message={`هل أنت متأكد من حفظ التغييرات على إعدادات "${activeTabMeta.label}"؟ سيتم زيادة رقم الإصدار وتسجيل التغيير.`}
        confirmLabel="حفظ"
        onConfirm={confirmSave}
        onCancel={() => setShowConfirmSave(false)}
      />
      <ConfirmDialog
        open={showConfirmReset}
        title="تأكيد إعادة التعيين"
        message={`هل أنت متأكد من إعادة تعيين إعدادات "${activeTabMeta.label}" إلى القيم الافتراضية؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="إعادة تعيين"
        variant="danger"
        onConfirm={confirmReset}
        onCancel={() => setShowConfirmReset(false)}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 px-5 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold text-white flex items-center gap-2 animate-slide-up ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`}>
          <span className="material-icons-round text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
};

