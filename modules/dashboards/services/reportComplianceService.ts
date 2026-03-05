import type { FirestoreEmployee } from '../../../types';
import { getOperationalDateString } from '../../../utils/calculations';
import { reportService } from '../../production/services/reportService';
import { lineAssignmentService } from '../../production/services/lineAssignmentService';

type CompliancePerson = {
  employeeId: string;
  name: string;
  lineNames: string[];
};

export interface ReportComplianceSnapshot {
  operationalDate: string;
  isFactoryHoliday: boolean;
  holidayReason: string | null;
  assignedSupervisorsCount: number;
  submittedCount: number;
  missingCount: number;
  unassignedCount: number;
  submitted: CompliancePerson[];
  missing: CompliancePerson[];
  unassigned: CompliancePerson[];
}

export interface ReportComplianceOptions {
  scope?: 'assigned_only' | 'all_active';
  lateSubmissionGraceDays?: number;
}

function toName(raw: Partial<FirestoreEmployee> | undefined, fallbackId: string): string {
  return String(raw?.name || '').trim() || fallbackId;
}

function toLineName(lineId: string, lineById: Map<string, string>): string {
  return lineById.get(lineId) || lineId || '—';
}

function isFriday(dateYmd: string): boolean {
  const parsed = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getDay() === 5;
}

function addDays(dateYmd: string, days: number): string {
  const parsed = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateYmd;
  parsed.setDate(parsed.getDate() + days);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const reportComplianceService = {
  async getSnapshotForDate(
    operationalDate: string,
    employees: FirestoreEmployee[],
    lines: Array<{ id?: string; name: string }>,
    options?: ReportComplianceOptions,
  ): Promise<ReportComplianceSnapshot> {
    const dateValue = String(operationalDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      throw new Error('Invalid operational date');
    }

    if (isFriday(dateValue)) {
      return {
        operationalDate: dateValue,
        isFactoryHoliday: true,
        holidayReason: 'إجازة المصنع (يوم الجمعة)',
        assignedSupervisorsCount: 0,
        submittedCount: 0,
        missingCount: 0,
        unassignedCount: 0,
        submitted: [],
        missing: [],
        unassigned: [],
      };
    }

    const supervisors = (employees || []).filter(
      (employee) => employee.level === 2 && employee.isActive !== false,
    );
    const supervisorById = new Map(
      supervisors
        .filter((employee) => Boolean(employee.id))
        .map((employee) => [String(employee.id), employee]),
    );
    const lineById = new Map(
      (lines || [])
        .filter((line) => Boolean(line.id))
        .map((line) => [String(line.id), line.name]),
    );

    const graceDays = Math.max(0, Math.floor(Number(options?.lateSubmissionGraceDays ?? 1)));
    const reportsEndDate = addDays(dateValue, graceDays);

    const [dayAssignments, dayReports] = await Promise.all([
      lineAssignmentService.getByDate(dateValue),
      reportService.getByDateRange(dateValue, reportsEndDate),
    ]);
    const scope = options?.scope ?? 'assigned_only';

    const assignedMap = new Map<string, CompliancePerson>();
    if (scope === 'all_active') {
      for (const supervisor of supervisors) {
        const supervisorId = String(supervisor.id || '').trim();
        if (!supervisorId) continue;
        assignedMap.set(supervisorId, {
          employeeId: supervisorId,
          name: toName(supervisor, supervisorId),
          lineNames: [],
        });
      }
    }

    for (const assignment of dayAssignments) {
      const employeeId = String(assignment.employeeId || '').trim();
      if (!employeeId) continue;
      if (!supervisorById.has(employeeId)) continue;

      const prev = assignedMap.get(employeeId) || {
        employeeId,
        name: toName(supervisorById.get(employeeId), employeeId),
        lineNames: [],
      };
      const lineName = toLineName(String(assignment.lineId || ''), lineById);
      if (lineName && !prev.lineNames.includes(lineName)) prev.lineNames.push(lineName);
      assignedMap.set(employeeId, prev);
    }

    const reportedSupervisorIds = new Set(
      dayReports
        .map((report) => String(report.employeeId || '').trim())
        .filter((employeeId) => supervisorById.has(employeeId)),
    );

    const submitted: CompliancePerson[] = [];
    const missing: CompliancePerson[] = [];
    for (const person of assignedMap.values()) {
      if (reportedSupervisorIds.has(person.employeeId)) submitted.push(person);
      else missing.push(person);
    }

    const assignedIds = new Set(Array.from(assignedMap.keys()));
    const unassigned: CompliancePerson[] = scope === 'all_active'
      ? []
      : supervisors
        .filter((employee) => employee.id && !assignedIds.has(String(employee.id)))
        .map((employee) => ({
          employeeId: String(employee.id),
          name: toName(employee, String(employee.id)),
          lineNames: [],
        }));

    const byName = (a: CompliancePerson, b: CompliancePerson) => a.name.localeCompare(b.name, 'ar');
    submitted.sort(byName);
    missing.sort(byName);
    unassigned.sort(byName);

    return {
      operationalDate: dateValue,
      isFactoryHoliday: false,
      holidayReason: null,
      assignedSupervisorsCount: assignedMap.size,
      submittedCount: submitted.length,
      missingCount: missing.length,
      unassignedCount: unassigned.length,
      submitted,
      missing,
      unassigned,
    };
  },

  async getTodaySnapshot(
    employees: FirestoreEmployee[],
    lines: Array<{ id?: string; name: string }>,
  ): Promise<ReportComplianceSnapshot> {
    const operationalDate = getOperationalDateString(8);
    return this.getSnapshotForDate(operationalDate, employees, lines);
  },
};
