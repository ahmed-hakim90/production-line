import { totalLinePullSampleCount } from './samples';
import type { QualityDefectLine, QualityLinePull } from '../model';

export interface DailyInspectionGroup {
  key: string;
  name: string;
  pulls: number;
  samples: number;
  accepted: number;
  rejected: number;
  pending: number;
  defects: number;
  defectDetails: Array<{ key: string; label: string; count: number }>;
}

export interface DailyInspectionSummary {
  byInspector: DailyInspectionGroup[];
  byStation: DailyInspectionGroup[];
  byLine: DailyInspectionGroup[];
  totals: Omit<DailyInspectionGroup, 'key' | 'name' | 'defectDetails'>;
}

interface InspectorAssignment {
  id: string;
  name: string;
  samples: number;
}

function defectTotal(defects: QualityDefectLine[]): number {
  return defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
}

function addToGroup(
  groups: Map<string, DailyInspectionGroup>,
  key: string,
  name: string,
  row: QualityLinePull,
  samples: number,
  defects: number,
  defectDetails: QualityDefectLine[],
): void {
  const group = groups.get(key) || {
    key,
    name,
    pulls: 0,
    samples: 0,
    accepted: 0,
    rejected: 0,
    pending: 0,
    defects: 0,
    defectDetails: [],
  };
  group.pulls += 1;
  group.samples += samples;
  group.defects += defects;
  if (row.status !== 'completed') group.pending += 1;
  else if (row.palletRejected) group.rejected += 1;
  else group.accepted += 1;

  const details = new Map(group.defectDetails.map((item) => [item.key, item]));
  defectDetails.forEach((defect) => {
    const defectKey = defect.reasonId || defect.reasonLabel;
    const current = details.get(defectKey) || { key: defectKey, label: defect.reasonLabel, count: 0 };
    current.count += Number(defect.count || 0);
    details.set(defectKey, current);
  });
  group.defectDetails = [...details.values()].sort((a, b) => b.count - a.count);
  groups.set(key, group);
}

function sortedGroups(groups: Map<string, DailyInspectionGroup>): DailyInspectionGroup[] {
  return [...groups.values()].sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name, 'ar', { numeric: true }));
}

function inspectorAssignments(row: QualityLinePull): InspectorAssignment[] {
  const additional = row.additionalInspectors?.length
    ? row.additionalInspectors
    : row.additionalInspectorEmployeeId
      ? [{
        employeeId: row.additionalInspectorEmployeeId,
        employeeName: row.additionalInspectorName || '',
        sampleCount: row.additionalSampleCount || 0,
      }]
      : [];
  const additionalSamples = additional.reduce((sum, inspector) => sum + Number(inspector.sampleCount || 0), 0);
  const primarySamples = row.additionalInspectors?.length
    ? Math.max(0, Number(row.sampleCount || 0) - additionalSamples)
    : row.sampleCountSemantics === 'base_plus_additional'
      ? Number(row.sampleCount || 0)
      : Math.max(0, totalLinePullSampleCount(row) - additionalSamples);
  return [
    { id: row.inspectorEmployeeId, name: row.inspectorName, samples: primarySamples },
    ...additional.map((inspector) => ({
      id: inspector.employeeId,
      name: inspector.employeeName,
      samples: Number(inspector.sampleCount || 0),
    })),
  ].filter((inspector) => inspector.id || inspector.name);
}

export function buildDailyInspectionSummary(rows: QualityLinePull[]): DailyInspectionSummary {
  const byInspector = new Map<string, DailyInspectionGroup>();
  const byStation = new Map<string, DailyInspectionGroup>();
  const byLine = new Map<string, DailyInspectionGroup>();

  rows.forEach((row) => {
    const defects = row.defects || [];
    const rowDefectTotal = Number(row.defectCount || 0);
    const samples = totalLinePullSampleCount(row);
    addToGroup(byLine, row.lineId || row.lineName, row.lineName || 'خط غير محدد', row, samples, rowDefectTotal, defects);
    addToGroup(byStation, row.stationId || row.stationName, row.stationName || 'محطة غير محددة', row, samples, rowDefectTotal, defects);

    const assignments = inspectorAssignments(row);
    const primary = assignments[0];
    assignments.filter((inspector) => inspector.samples > 0).forEach((inspector) => {
      const inspectorDefects = defects.filter((defect) => {
        const hasInspector = Boolean(defect.inspectorEmployeeId || defect.inspectorName);
        if (!hasInspector) return inspector.id === primary?.id && inspector.name === primary?.name;
        return (defect.inspectorEmployeeId && defect.inspectorEmployeeId === inspector.id)
          || (defect.inspectorName && defect.inspectorName === inspector.name);
      });
      const explicitDefectTotal = defectTotal(defects);
      const unassignedDefects = Math.max(0, rowDefectTotal - explicitDefectTotal);
      const isPrimary = inspector.id === primary?.id && inspector.name === primary?.name;
      addToGroup(
        byInspector,
        inspector.id || inspector.name,
        inspector.name || 'مراقب غير محدد',
        row,
        inspector.samples,
        defectTotal(inspectorDefects) + (isPrimary ? unassignedDefects : 0),
        inspectorDefects,
      );
    });
  });

  const total = rows.reduce((summary, row) => {
    summary.pulls += 1;
    summary.samples += totalLinePullSampleCount(row);
    summary.defects += Number(row.defectCount || 0);
    if (row.status !== 'completed') summary.pending += 1;
    else if (row.palletRejected) summary.rejected += 1;
    else summary.accepted += 1;
    return summary;
  }, { pulls: 0, samples: 0, accepted: 0, rejected: 0, pending: 0, defects: 0 });

  return {
    byInspector: sortedGroups(byInspector),
    byStation: sortedGroups(byStation),
    byLine: sortedGroups(byLine),
    totals: total,
  };
}
