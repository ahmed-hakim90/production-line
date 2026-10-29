import { useEffect, useState } from 'react';
import { selectableInspectors, type StaffEmployeeRef } from '../domain/staff';
import type { QualityStaffAssignment } from '../model';
import { activeTenantId, qualityUserMessage } from '../services/qualityGateway';
import { qualityStaffService } from '../services/qualityStaffService';

export function inspectorOptions(
  employees: Array<{ id?: string; name: string; code?: string; userId?: string }>,
  assignments: QualityStaffAssignment[],
  scope: { stationId?: string; lineId?: string; stationIsNew?: boolean },
): Array<{ value: string; label: string }> {
  let tenantId = '';
  try {
    tenantId = activeTenantId();
  } catch {
    return [];
  }
  const refs: StaffEmployeeRef[] = employees.flatMap((employee) => (
    employee.id ? [{ id: employee.id, tenantId, name: employee.name, isActive: true, userId: employee.userId }] : []
  ));
  return selectableInspectors(refs, assignments, { tenantId, ...scope }).map((employee) => ({
    value: employee.id,
    label: employees.find((item) => item.id === employee.id)?.code
      ? `${employee.name} (${employees.find((item) => item.id === employee.id)?.code})`
      : employee.name,
  }));
}

export function useQualityAssignments(): { assignments: QualityStaffAssignment[]; error: string } {
  const [assignments, setAssignments] = useState<QualityStaffAssignment[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    qualityStaffService.list()
      .then((rows) => { if (!cancelled) setAssignments(rows); })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(qualityUserMessage(loadError, 'تعذر تحميل تعيينات الجودة'));
      });
    return () => { cancelled = true; };
  }, []);

  return { assignments, error };
}
