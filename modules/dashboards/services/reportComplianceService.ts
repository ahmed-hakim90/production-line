import type { FirestoreEmployee } from '../../../types';
import { getOperationalDateString } from '../../../utils/calculations';
import { reportService } from '../../production/services/reportService';
import { supervisorLineAssignmentService } from '../../production/services/supervisorLineAssignmentService';

type CompliancePerson = {
  employeeId: string;
  name: string;
  lineNames: string[];
  expectedReports: number;
  submittedReports: number;
};

export interface ReportComplianceSnapshot {
  operationalDate: string;
  isFactoryHoliday: boolean;
  holidayReason: string | null;
  assignedSupervisorsCount: number;
  expectedReportsCount: number;
  submittedReportsCount: number;
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
        expectedReportsCount: 0,
        submittedReportsCount: 0,
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
      supervisorLineAssignmentService.getActiveByDate(dateValue),
      reportService.getByDateRange(dateValue, reportsEndDate),
    ]);
    const scope = options?.scope ?? 'assigned_only';

    const assignedMap = new Map<string, CompliancePerson & { lineIds: Set<string> }>();
    if (scope === 'all_active') {
      for (const supervisor of supervisors) {
        const supervisorId = String(supervisor.id || '').trim();
        if (!supervisorId) continue;
        assignedMap.set(supervisorId, {
          employeeId: supervisorId,
          name: toName(supervisor, supervisorId),
          lineNames: [],
          lineIds: new Set<string>(),
          expectedReports: 0,
          submittedReports: 0,
        });
      }
    }

    for (const assignment of dayAssignments) {
      const employeeId = String(assignment.supervisorId || '').trim();
      if (!employeeId) continue;
      if (!supervisorById.has(employeeId)) continue;
      const lineId = String(assignment.lineId || '').trim();
      if (!lineId) continue;

      const prev = assignedMap.get(employeeId) || {
        employeeId,
        name: toName(supervisorById.get(employeeId), employeeId),
        lineNames: [],
        lineIds: new Set<string>(),
        expectedReports: 0,
        submittedReports: 0,
      };
      const lineName = toLineName(lineId, lineById);
      if (lineName && !prev.lineNames.includes(lineName)) prev.lineNames.push(lineName);
      prev.lineIds.add(lineId);
      prev.expectedReports = prev.lineIds.size;
      assignedMap.set(employeeId, prev);
    }

    const reportedSupervisorIds = new Set(
      dayReports
        .map((report) => String(report.employeeId || '').trim())
        .filter((employeeId) => supervisorById.has(employeeId)),
    );
    const reportedPairs = new Set(
      dayReports
        .map((report) => `${String(report.employeeId || '').trim()}__${String(report.lineId || '').trim()}`)
        .filter((pair) => {
          const [employeeId, lineId] = pair.split('__');
          return Boolean(employeeId) && Boolean(lineId) && supervisorById.has(employeeId);
        }),
    );

    const submitted: CompliancePerson[] = [];
    const missing: CompliancePerson[] = [];
    for (const person of assignedMap.values()) {
      const expectedReports = person.lineIds.size;
      if (expectedReports === 0) {
        const row: CompliancePerson = {
          employeeId: person.employeeId,
          name: person.name,
          lineNames: person.lineNames,
          expectedReports: 0,
          submittedReports: reportedSupervisorIds.has(person.employeeId) ? 1 : 0,
        };
        if (row.submittedReports > 0) submitted.push(row);
        else missing.push(row);
        continue;
      }
      let submittedReports = 0;
      person.lineIds.forEach((lineId) => {
        if (reportedPairs.has(`${person.employeeId}__${lineId}`)) submittedReports += 1;
      });
      const row: CompliancePerson = {
        employeeId: person.employeeId,
        name: person.name,
        lineNames: person.lineNames,
        expectedReports,
        submittedReports,
      };
      if (submittedReports >= expectedReports) submitted.push(row);
      else missing.push(row);
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
          expectedReports: 0,
          submittedReports: 0,
        }));

    const byName = (a: CompliancePerson, b: CompliancePerson) => a.name.localeCompare(b.name, 'ar');
    submitted.sort(byName);
    missing.sort(byName);
    unassigned.sort(byName);
    const expectedReportsCount = Array.from(assignedMap.values()).reduce((sum, person) => sum + person.lineIds.size, 0);
    const submittedReportsCount = [...submitted, ...missing].reduce((sum, person) => sum + (person.submittedReports || 0), 0);

    return {
      operationalDate: dateValue,
      isFactoryHoliday: false,
      holidayReason: null,
      assignedSupervisorsCount: assignedMap.size,
      expectedReportsCount,
      submittedReportsCount,
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
