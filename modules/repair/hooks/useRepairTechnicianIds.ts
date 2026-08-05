import { useEffect, useMemo, useState } from 'react';
import { employeeService } from '../../hr/employeeService';
import type { FirestoreUserWithRepair } from '../types';
import { resolveRepairTechnicianIds } from '../utils/repairAccessContext';

/**
 * Auth uid + linked employee id for technician job lists.
 * Falls back to employees.userId lookup when store.currentEmployee is missing
 * (e.g. technician role without a full employees bootstrap).
 */
export function useRepairTechnicianIds(
  userProfile: FirestoreUserWithRepair | null | undefined,
  currentEmployeeId?: string | null,
): string[] {
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string>(
    () => String(currentEmployeeId || '').trim(),
  );

  useEffect(() => {
    const fromStore = String(currentEmployeeId || '').trim();
    if (fromStore) {
      setLinkedEmployeeId(fromStore);
      return;
    }
    const uid = String(userProfile?.id || '').trim();
    if (!uid) {
      setLinkedEmployeeId('');
      return;
    }
    let cancelled = false;
    void employeeService
      .getByUserId(uid)
      .then((employee) => {
        if (cancelled) return;
        setLinkedEmployeeId(String(employee?.id || '').trim());
      })
      .catch(() => {
        if (!cancelled) setLinkedEmployeeId('');
      });
    return () => {
      cancelled = true;
    };
  }, [currentEmployeeId, userProfile?.id]);

  return useMemo(
    () => resolveRepairTechnicianIds(userProfile, linkedEmployeeId || currentEmployeeId),
    [userProfile, linkedEmployeeId, currentEmployeeId],
  );
}
