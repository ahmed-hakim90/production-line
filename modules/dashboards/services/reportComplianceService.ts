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
  assignedSupervisorsCount: number;
  submittedCount: number;
  missingCount: number;
  unassignedCount: number;
  submitted: CompliancePerson[];
  missing: CompliancePerson[];
  unassigned: CompliancePerson[];
}

function toName(raw: Partial<FirestoreEmployee> | undefined, fallbackId: string): string {
  return String(raw?.name || '').trim() || fallbackId;
}

function toLineName(lineId: string, lineById: Map<string, string>): string {
  return lineById.get(lineId) || lineId || '—';
}

export const reportComplianceService = {
  async getTodaySnapshot(
    employees: FirestoreEmployee[],
    lines: Array<{ id?: string; name: string }>,
  ): Promise<ReportComplianceSnapshot> {
    const operationalDate = getOperationalDateString(8);
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

    const [todayAssignments, todayReports] = await Promise.all([
      lineAssignmentService.getByDate(operationalDate),
      reportService.getByDateRange(operationalDate, operationalDate),
    ]);

    const assignedMap = new Map<string, CompliancePerson>();
    for (const assignment of todayAssignments) {
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
      todayReports
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
    const unassigned: CompliancePerson[] = supervisors
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
      operationalDate,
      assignedSupervisorsCount: assignedMap.size,
      submittedCount: submitted.length,
      missingCount: missing.length,
      unassignedCount: unassigned.length,
      submitted,
      missing,
      unassigned,
    };
  },
};
