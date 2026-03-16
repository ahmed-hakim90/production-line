import { doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { employeesRef, HR_COLLECTIONS, shiftsRef } from './collections';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreShift } from './types';

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export const shiftService = {
  async getAll(): Promise<FirestoreShift[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(shiftsRef());
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift));
  },

  async updateShiftRules(
    shiftId: string,
    payload: Pick<
      FirestoreShift,
      'startTime' | 'endTime' | 'latestCheckInTime' | 'firstCheckOutTime' | 'lateGraceMinutes' | 'breakMinutes' | 'crossesMidnight' | 'isActive'
    >,
  ): Promise<void> {
    if (!isConfigured || !shiftId) return;
    await updateDoc(doc(db, HR_COLLECTIONS.SHIFTS, shiftId), payload);
  },

  async assignEmployeesByCodes(shiftId: string, rawCodes: string[]): Promise<{ matched: number; updated: number; missing: string[] }> {
    if (!isConfigured || !shiftId || rawCodes.length === 0) {
      return { matched: 0, updated: 0, missing: [] };
    }
    const codeSet = new Set(rawCodes.map(normalizeCode).filter(Boolean));
    if (codeSet.size === 0) {
      return { matched: 0, updated: 0, missing: [] };
    }

    const employeesSnap = await getDocs(employeesRef());
    const allEmployees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployee));

    const byCode = new Map<string, FirestoreEmployee>();
    allEmployees.forEach((employee) => {
      if (!employee.id) return;
      const code = normalizeCode(String(employee.code || ''));
      const acNo = normalizeCode(String(employee.acNo || ''));
      if (code) byCode.set(code, employee);
      if (acNo) byCode.set(acNo, employee);
    });

    const missing: string[] = [];
    const matchedIds = new Set<string>();
    codeSet.forEach((code) => {
      const employee = byCode.get(code);
      if (!employee?.id) {
        missing.push(code);
        return;
      }
      matchedIds.add(employee.id);
    });

    const matched = matchedIds.size;
    if (matched === 0) {
      return { matched: 0, updated: 0, missing };
    }

    const batch = writeBatch(db);
    matchedIds.forEach((id) => {
      batch.update(doc(db, HR_COLLECTIONS.EMPLOYEES, id), { shiftId });
    });
    await batch.commit();

    return { matched, updated: matched, missing };
  },
};

