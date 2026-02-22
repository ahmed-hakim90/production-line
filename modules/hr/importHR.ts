/**
 * HR Excel Import — parse .xlsx/.xls files into departments, positions & employees.
 *
 * Supports a single workbook with up to 3 sheets:
 *   1. "الأقسام"   → departments
 *   2. "المناصب"   → job positions
 *   3. "الموظفين"  → employees
 *
 * If only one sheet exists it is treated as the employees sheet.
 */
import * as XLSX from 'xlsx';
import type { FirestoreEmployee, EmploymentType } from '../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../types';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift, JobLevel } from './types';
import { JOB_LEVEL_LABELS } from './types';

// ─── Parsed Row Types ────────────────────────────────────────────────────────

export interface ParsedDepartmentRow {
  rowIndex: number;
  name: string;
  code: string;
  errors: string[];
}

export interface ParsedPositionRow {
  rowIndex: number;
  title: string;
  departmentName: string;
  departmentId: string;
  level: JobLevel;
  errors: string[];
}

export interface ParsedEmployeeRow {
  rowIndex: number;
  name: string;
  code: string;
  departmentName: string;
  departmentId: string;
  positionTitle: string;
  positionId: string;
  level: JobLevel;
  employmentType: EmploymentType;
  baseSalary: number;
  hourlyRate: number;
  shiftName: string;
  shiftId: string;
  email: string;
  isActive: boolean;
  hasSystemAccess: boolean;
  errors: string[];
  /** Set when employee already exists — holds Firestore doc id */
  existingId?: string;
  /** Which fields in the Excel row actually have a value (non-empty) */
  providedFields: string[];
}

export interface HRImportResult {
  departments: { rows: ParsedDepartmentRow[]; valid: number; errors: number };
  positions: { rows: ParsedPositionRow[]; valid: number; errors: number };
  employees: { rows: ParsedEmployeeRow[]; valid: number; errors: number; updates: number };
}

export interface HRLookups {
  departments: FirestoreDepartment[];
  positions: FirestoreJobPosition[];
  shifts: FirestoreShift[];
  employees: FirestoreEmployee[];
}

// ─── Header Maps ─────────────────────────────────────────────────────────────

const DEPT_HEADERS: Record<string, string> = {
  'الاسم': 'name', 'اسم القسم': 'name', 'القسم': 'name',
  'الرمز': 'code', 'رمز القسم': 'code', 'الكود': 'code',
};

const POS_HEADERS: Record<string, string> = {
  'المنصب': 'title', 'اسم المنصب': 'title', 'الوظيفة': 'title', 'المسمى الوظيفي': 'title',
  'القسم': 'departmentName', 'اسم القسم': 'departmentName',
  'المستوى': 'level',
};

const EMP_HEADERS: Record<string, string> = {
  'الاسم': 'name', 'اسم الموظف': 'name',
  'الرمز': 'code', 'رمز الموظف': 'code', 'الكود': 'code',
  'القسم': 'departmentName', 'اسم القسم': 'departmentName',
  'المنصب': 'positionTitle', 'المسمى الوظيفي': 'positionTitle', 'الوظيفة': 'positionTitle',
  'المستوى': 'level',
  'نوع التوظيف': 'employmentType', 'نوع العمل': 'employmentType',
  'الراتب الأساسي': 'baseSalary', 'الراتب': 'baseSalary',
  'أجر الساعة': 'hourlyRate', 'سعر الساعة': 'hourlyRate',
  'الوردية': 'shiftName', 'اسم الوردية': 'shiftName',
  'البريد الإلكتروني': 'email', 'الإيميل': 'email', 'ايميل': 'email', 'البريد': 'email',
  'الحالة': 'isActive', 'حالة': 'isActive',
  'صلاحية النظام': 'hasSystemAccess', 'صلاحية': 'hasSystemAccess',
};

const SHEET_ALIASES: Record<string, 'departments' | 'positions' | 'employees'> = {
  'الأقسام': 'departments', 'الاقسام': 'departments', 'أقسام': 'departments', 'اقسام': 'departments', 'departments': 'departments',
  'المناصب': 'positions', 'مناصب': 'positions', 'الوظائف': 'positions', 'وظائف': 'positions', 'positions': 'positions',
  'الموظفين': 'employees', 'موظفين': 'employees', 'الموظفون': 'employees', 'employees': 'employees',
};

// ─── Reverse label lookups ───────────────────────────────────────────────────

const EMPLOYMENT_LABEL_TO_KEY: Record<string, EmploymentType> = {};
for (const [k, v] of Object.entries(EMPLOYMENT_TYPE_LABELS)) {
  EMPLOYMENT_LABEL_TO_KEY[v.trim()] = k as EmploymentType;
}

const LEVEL_LABEL_TO_KEY: Record<string, JobLevel> = {};
for (const [k, v] of Object.entries(JOB_LEVEL_LABELS)) {
  LEVEL_LABEL_TO_KEY[v.trim()] = Number(k) as JobLevel;
  LEVEL_LABEL_TO_KEY[k] = Number(k) as JobLevel;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function matchName<T extends { name?: string; title?: string }>(
  items: T[],
  name: string,
): T | undefined {
  const n = name.trim().toLowerCase();
  return items.find(
    (i) => (i.name ?? (i as any).title ?? '').trim().toLowerCase() === n,
  );
}

function buildHeaderMap(
  rawHeaders: string[],
  map: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of rawHeaders) {
    const mapped = map[norm(h)];
    if (mapped) result[h] = mapped;
  }
  return result;
}

function getValue(
  row: Record<string, any>,
  rawHeaders: string[],
  headerMap: Record<string, string>,
  field: string,
): any {
  const key = rawHeaders.find((h) => headerMap[h] === field);
  return key != null ? row[key] : undefined;
}

// ─── Sheet Parsers ───────────────────────────────────────────────────────────

function parseDepartmentSheet(
  jsonRows: Record<string, any>[],
  existing: FirestoreDepartment[],
): ParsedDepartmentRow[] {
  if (jsonRows.length === 0) return [];
  const rawHeaders = Object.keys(jsonRows[0]);
  const hMap = buildHeaderMap(rawHeaders, DEPT_HEADERS);

  const seen = new Set<string>();

  return jsonRows.map((row, idx) => {
    const errors: string[] = [];
    const name = String(getValue(row, rawHeaders, hMap, 'name') ?? '').trim();
    const code = String(getValue(row, rawHeaders, hMap, 'code') ?? '').trim() || name.substring(0, 3).toUpperCase();

    if (!name) errors.push('اسم القسم مطلوب');
    if (name && existing.some((d) => d.name.trim().toLowerCase() === name.toLowerCase()))
      errors.push(`القسم "${name}" موجود بالفعل`);
    if (name && seen.has(name.toLowerCase()))
      errors.push(`القسم "${name}" مكرر في الملف`);
    if (name) seen.add(name.toLowerCase());

    return { rowIndex: idx + 2, name, code, errors };
  });
}

function parsePositionSheet(
  jsonRows: Record<string, any>[],
  existingPositions: FirestoreJobPosition[],
  allDepartments: FirestoreDepartment[],
  newDepartmentNames: string[],
): ParsedPositionRow[] {
  if (jsonRows.length === 0) return [];
  const rawHeaders = Object.keys(jsonRows[0]);
  const hMap = buildHeaderMap(rawHeaders, POS_HEADERS);

  const seen = new Set<string>();
  const combinedDepts = [
    ...allDepartments,
    ...newDepartmentNames.map((n) => ({ name: n } as FirestoreDepartment)),
  ];

  return jsonRows.map((row, idx) => {
    const errors: string[] = [];
    const title = String(getValue(row, rawHeaders, hMap, 'title') ?? '').trim();
    const departmentName = String(getValue(row, rawHeaders, hMap, 'departmentName') ?? '').trim();
    const levelRaw = String(getValue(row, rawHeaders, hMap, 'level') ?? '1').trim();
    const level: JobLevel = LEVEL_LABEL_TO_KEY[levelRaw] ?? ((Number(levelRaw) as JobLevel) || 1);

    if (!title) errors.push('اسم المنصب مطلوب');

    const dept = departmentName ? matchName(combinedDepts, departmentName) : undefined;
    if (departmentName && !dept) errors.push(`القسم "${departmentName}" غير موجود`);

    if (title && existingPositions.some((p) => p.title.trim().toLowerCase() === title.toLowerCase()))
      errors.push(`المنصب "${title}" موجود بالفعل`);
    const key = `${title}|${departmentName}`.toLowerCase();
    if (title && seen.has(key)) errors.push(`المنصب "${title}" مكرر في الملف`);
    if (title) seen.add(key);

    return {
      rowIndex: idx + 2,
      title,
      departmentName,
      departmentId: (dept as FirestoreDepartment)?.id ?? '',
      level: ([1, 2, 3, 4].includes(level) ? level : 1) as JobLevel,
      errors,
    };
  });
}

function parseEmployeeSheet(
  jsonRows: Record<string, any>[],
  lookups: HRLookups,
  newDepartmentNames: string[],
  newPositionTitles: string[],
): ParsedEmployeeRow[] {
  if (jsonRows.length === 0) return [];
  const rawHeaders = Object.keys(jsonRows[0]);
  const hMap = buildHeaderMap(rawHeaders, EMP_HEADERS);

  const combinedDepts = [
    ...lookups.departments,
    ...newDepartmentNames.map((n) => ({ name: n } as FirestoreDepartment)),
  ];
  const combinedPositions = [
    ...lookups.positions,
    ...newPositionTitles.map((t) => ({ title: t } as FirestoreJobPosition)),
  ];

  const seen = new Set<string>();

  return jsonRows.map((row, idx) => {
    const errors: string[] = [];
    const name = String(getValue(row, rawHeaders, hMap, 'name') ?? '').trim();
    const code = String(getValue(row, rawHeaders, hMap, 'code') ?? '').trim();
    const departmentName = String(getValue(row, rawHeaders, hMap, 'departmentName') ?? '').trim();
    const positionTitle = String(getValue(row, rawHeaders, hMap, 'positionTitle') ?? '').trim();
    const levelRaw = String(getValue(row, rawHeaders, hMap, 'level') ?? '').trim();
    const level: JobLevel = levelRaw
      ? (LEVEL_LABEL_TO_KEY[levelRaw] ?? ((Number(levelRaw) as JobLevel) || 1))
      : 1;

    const empTypeRaw = String(getValue(row, rawHeaders, hMap, 'employmentType') ?? '').trim();
    const employmentType: EmploymentType =
      EMPLOYMENT_LABEL_TO_KEY[empTypeRaw] ??
      (Object.keys(EMPLOYMENT_TYPE_LABELS).includes(empTypeRaw) ? empTypeRaw as EmploymentType : 'full_time');

    const baseSalaryRaw = getValue(row, rawHeaders, hMap, 'baseSalary');
    const baseSalary = Number(baseSalaryRaw) || 0;
    const hourlyRateRaw = getValue(row, rawHeaders, hMap, 'hourlyRate');
    const hourlyRate = Number(hourlyRateRaw) || 0;
    const shiftName = String(getValue(row, rawHeaders, hMap, 'shiftName') ?? '').trim();
    const emailRaw = String(getValue(row, rawHeaders, hMap, 'email') ?? '').trim();
    const isActiveRaw = String(getValue(row, rawHeaders, hMap, 'isActive') ?? '').trim();
    const hasSystemAccessRaw = String(getValue(row, rawHeaders, hMap, 'hasSystemAccess') ?? '').trim();

    const parseBool = (val: string, defaultVal: boolean): boolean => {
      if (!val) return defaultVal;
      const lower = val.toLowerCase();
      return ['نعم', 'نشط', 'true', '1', 'yes', 'active'].includes(lower);
    };

    const email = emailRaw;
    const isActive = parseBool(isActiveRaw, true);
    const hasSystemAccess = parseBool(hasSystemAccessRaw, false);

    const providedFields: string[] = [];
    if (name) providedFields.push('name');
    if (code) providedFields.push('code');
    if (departmentName) providedFields.push('departmentName');
    if (positionTitle) providedFields.push('positionTitle');
    if (levelRaw) providedFields.push('level');
    if (empTypeRaw) providedFields.push('employmentType');
    if (baseSalaryRaw !== '' && baseSalaryRaw != null && !isNaN(Number(baseSalaryRaw))) providedFields.push('baseSalary');
    if (hourlyRateRaw !== '' && hourlyRateRaw != null && !isNaN(Number(hourlyRateRaw))) providedFields.push('hourlyRate');
    if (shiftName) providedFields.push('shiftName');
    if (emailRaw) providedFields.push('email');
    if (isActiveRaw) providedFields.push('isActive');
    if (hasSystemAccessRaw) providedFields.push('hasSystemAccess');

    if (!name && !code) errors.push('اسم الموظف أو الكود مطلوب');

    // Match existing employee by code first, then by name
    let existingEmp: FirestoreEmployee | undefined;
    if (code) {
      existingEmp = lookups.employees.find((e) => (e.code ?? '').trim().toLowerCase() === code.toLowerCase());
    }
    if (!existingEmp && name) {
      existingEmp = lookups.employees.find((e) => e.name.trim().toLowerCase() === name.toLowerCase());
    }

    if (name && seen.has(name.toLowerCase()))
      errors.push(`الموظف "${name}" مكرر في الملف`);
    if (name) seen.add(name.toLowerCase());

    const dept = departmentName ? matchName(combinedDepts, departmentName) : undefined;
    if (departmentName && !dept) errors.push(`القسم "${departmentName}" غير موجود`);

    const pos = positionTitle ? matchName(combinedPositions, positionTitle) : undefined;
    if (positionTitle && !pos) errors.push(`المنصب "${positionTitle}" غير موجود`);

    const shift = shiftName ? matchName(lookups.shifts.map((s) => ({ ...s, name: s.name })), shiftName) : undefined;
    if (shiftName && !shift) errors.push(`الوردية "${shiftName}" غير موجودة`);

    return {
      rowIndex: idx + 2,
      name,
      code,
      departmentName,
      departmentId: (dept as FirestoreDepartment)?.id ?? '',
      positionTitle,
      positionId: (pos as FirestoreJobPosition)?.id ?? '',
      level: ([1, 2, 3, 4].includes(level) ? level : 1) as JobLevel,
      employmentType,
      baseSalary,
      hourlyRate,
      shiftName,
      shiftId: (shift as FirestoreShift)?.id ?? '',
      email,
      isActive,
      hasSystemAccess,
      errors,
      existingId: existingEmp?.id,
      providedFields,
    };
  });
}

// ─── Main Parse Function ─────────────────────────────────────────────────────

export function parseHRExcel(
  file: File,
  lookups: HRLookups,
): Promise<HRImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });

        const classified: Record<string, string> = {};
        for (const sn of wb.SheetNames) {
          const alias = SHEET_ALIASES[norm(sn).toLowerCase()] ?? SHEET_ALIASES[norm(sn)];
          if (alias) classified[alias] = sn;
        }

        // Single-sheet fallback: treat as employees
        if (wb.SheetNames.length === 1 && !classified['employees']) {
          classified['employees'] = wb.SheetNames[0];
        }

        const toJson = (sheetName?: string) => {
          if (!sheetName || !wb.Sheets[sheetName]) return [];
          return XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: '' });
        };

        // 1. Departments
        const deptRows = parseDepartmentSheet(toJson(classified['departments']), lookups.departments);
        const newDeptNames = deptRows.filter((r) => r.errors.length === 0).map((r) => r.name);

        // 2. Positions
        const posRows = parsePositionSheet(
          toJson(classified['positions']),
          lookups.positions,
          lookups.departments,
          newDeptNames,
        );
        const newPosTitles = posRows.filter((r) => r.errors.length === 0).map((r) => r.title);

        // 3. Employees
        const empRows = parseEmployeeSheet(
          toJson(classified['employees']),
          lookups,
          newDeptNames,
          newPosTitles,
        );

        const stats = (rows: { errors: string[] }[]) => ({
          valid: rows.filter((r) => r.errors.length === 0).length,
          errors: rows.filter((r) => r.errors.length > 0).length,
        });

        const empStats = stats(empRows);
        const updateCount = empRows.filter((r) => r.errors.length === 0 && r.existingId).length;

        resolve({
          departments: { rows: deptRows, ...stats(deptRows) },
          positions: { rows: posRows, ...stats(posRows) },
          employees: { rows: empRows, ...empStats, updates: updateCount },
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsArrayBuffer(file);
  });
}
