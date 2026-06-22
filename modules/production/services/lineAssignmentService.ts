import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { LineWorkerAssignment, LineWorkerLaborRole } from '../../../types';
import { DEFAULT_LINE_WORKER_LABOR_ROLE } from '../utils/lineWorkerLaborRoles';
import { resolveEffectiveLineAssignmentsForDate } from '../utils/effectiveLineAssignments';
import { lineAssignmentWorkerBridge } from './lineAssignmentWorkerBridge';

const COLLECTION = 'line_worker_assignments';

const eqTenant = () => where('tenantId', '==', getCurrentTenantId());

async function getExactByLineAndDate(lineId: string, date: string): Promise<LineWorkerAssignment[]> {
  const q = query(
    collection(db, COLLECTION),
    eqTenant(),
    where('lineId', '==', lineId),
    where('date', '==', date),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LineWorkerAssignment));
}

export const lineAssignmentService = {
  async getByLineAndDate(lineId: string, date: string): Promise<LineWorkerAssignment[]> {
    if (!isConfigured) return [];
    try {
      const exact = await getExactByLineAndDate(lineId, date);
      if (exact.length > 0) return exact;

      const sourceDate = await this.getLatestSourceDateBefore(date, lineId);
      if (!sourceDate) return [];

      const inherited = await getExactByLineAndDate(lineId, sourceDate);
      return resolveEffectiveLineAssignmentsForDate(exact, inherited, date);
    } catch (error) {
      console.error('lineAssignmentService.getByLineAndDate error:', error);
      throw error;
    }
  },

  async getByDate(date: string): Promise<LineWorkerAssignment[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), eqTenant(), where('date', '==', date));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LineWorkerAssignment));
    } catch (error) {
      console.error('lineAssignmentService.getByDate error:', error);
      throw error;
    }
  },

  async create(data: Omit<LineWorkerAssignment, 'id' | 'assignedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        laborRole: data.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
        tenantId: getCurrentTenantId(),
        assignedAt: serverTimestamp(),
      });
      void lineAssignmentWorkerBridge.syncFromLineAssignment(data).catch(() => {});
      return ref.id;
    } catch (error) {
      console.error('lineAssignmentService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<Pick<LineWorkerAssignment, 'laborRole'>>): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('lineAssignmentService.update error:', error);
      throw error;
    }
  },

  async updateLaborRole(id: string, laborRole: LineWorkerLaborRole): Promise<void> {
    return this.update(id, { laborRole });
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('lineAssignmentService.delete error:', error);
      throw error;
    }
  },

  async deleteByLineAndDate(lineId: string, date: string): Promise<void> {
    if (!isConfigured) return;
    try {
      const assignments = await getExactByLineAndDate(lineId, date);
      for (const a of assignments) {
        if (a.id) await deleteDoc(doc(db, COLLECTION, a.id));
      }
    } catch (error) {
      console.error('lineAssignmentService.deleteByLineAndDate error:', error);
      throw error;
    }
  },

  async copyFromDate(
    sourceDate: string,
    targetDate: string,
    lineId?: string,
    assignedBy?: string,
    activeEmployeeIds?: Set<string>,
    employeeDirectory?: Map<string, { name?: string; code?: string }>,
  ): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const sourceAssignments = lineId
        ? await getExactByLineAndDate(lineId, sourceDate)
        : await this.getByDate(sourceDate);

      const existingToday = lineId
        ? await getExactByLineAndDate(lineId, targetDate)
        : await this.getByDate(targetDate);

      const existingKeys = new Set(existingToday.map((a) => `${a.lineId}_${a.employeeId}`));

      let count = 0;
      for (const a of sourceAssignments) {
        const key = `${a.lineId}_${a.employeeId}`;
        if (existingKeys.has(key)) continue;
        if (activeEmployeeIds && !activeEmployeeIds.has(a.employeeId)) continue;

        const copiedAssignment = {
          lineId: a.lineId,
          employeeId: a.employeeId,
          employeeCode: String(a.employeeCode || employeeDirectory?.get(a.employeeId)?.code || '').trim(),
          employeeName: String(a.employeeName || employeeDirectory?.get(a.employeeId)?.name || '').trim(),
          laborRole: a.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
          date: targetDate,
          tenantId: getCurrentTenantId(),
          assignedAt: serverTimestamp(),
          assignedBy: assignedBy || '',
        };
        await addDoc(collection(db, COLLECTION), copiedAssignment);
        void lineAssignmentWorkerBridge.syncFromLineAssignment(copiedAssignment).catch(() => {});
        count++;
      }
      return count;
    } catch (error) {
      console.error('lineAssignmentService.copyFromDate error:', error);
      throw error;
    }
  },

  async getLatestSourceDateBefore(targetDate: string, lineId?: string): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      // For line-specific copy, use a simple line query to avoid requiring a composite index.
      if (lineId) {
        const q = query(collection(db, COLLECTION), eqTenant(), where('lineId', '==', lineId));
        const snap = await getDocs(q);
        let latest: string | null = null;
        snap.docs.forEach((d) => {
          const date = (d.data() as Partial<LineWorkerAssignment>).date;
          if (!date || date >= targetDate) return;
          if (!latest || date > latest) latest = date;
        });
        return latest;
      }

      const q = query(
        collection(db, COLLECTION),
        eqTenant(),
        where('date', '<', targetDate),
        orderBy('date', 'desc'),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const date = (snap.docs[0].data() as Partial<LineWorkerAssignment>).date;
      return date || null;
    } catch (error) {
      console.error('lineAssignmentService.getLatestSourceDateBefore error:', error);
      throw error;
    }
  },
};
