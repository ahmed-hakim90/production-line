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
import type { LineWorkerAssignment, LineWorkerLaborRole, ProductionWorker } from '../../../types';
import { DEFAULT_LINE_WORKER_LABOR_ROLE } from '../utils/lineWorkerLaborRoles';
import { resolveEffectiveLineAssignmentsForDate } from '../utils/effectiveLineAssignments';
import { productionLineWorkerAssignmentService } from './productionLineWorkerAssignmentService';
import { productionWorkerService } from './productionWorkerService';

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

function buildPermanentDailyOverlay(
  lineId: string,
  date: string,
  workersById: Map<string, ProductionWorker>,
  permanentRows: Awaited<ReturnType<typeof productionLineWorkerAssignmentService.getActiveByLineAndDate>>,
  dailyRows: LineWorkerAssignment[],
): LineWorkerAssignment[] {
  const dailyByEmployeeId = new Map(
    dailyRows
      .filter((row) => row.lineId === lineId && row.employeeId)
      .map((row) => [row.employeeId, row]),
  );

  return permanentRows
    .map((row): LineWorkerAssignment | null => {
      const worker = workersById.get(row.workerId);
      if (!worker || worker.isActive === false) return null;
      const employeeId = String(worker.employeeId || row.workerId).trim();
      const daily = dailyByEmployeeId.get(employeeId);

      return {
        id: daily?.id,
        lineId: row.lineId,
        employeeId,
        employeeCode: String(daily?.employeeCode || worker.code || '').trim(),
        employeeName: String(daily?.employeeName || worker.name || employeeId).trim(),
        date,
        laborRole: daily?.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
        isPresent: daily?.isPresent ?? true,
        assignedAt: daily?.assignedAt,
        assignedBy: daily?.assignedBy,
      } satisfies LineWorkerAssignment;
    })
    .filter((row): row is LineWorkerAssignment => Boolean(row));
}

export const lineAssignmentService = {
  async getByLineAndDate(lineId: string, date: string): Promise<LineWorkerAssignment[]> {
    if (!isConfigured) return [];
    try {
      const exact = await getExactByLineAndDate(lineId, date);
      const permanent = await productionLineWorkerAssignmentService.getActiveByLineAndDate(lineId, date);
      if (permanent.length > 0) {
        const workers = await productionWorkerService.getAll();
        return buildPermanentDailyOverlay(
          lineId,
          date,
          new Map(workers.map((worker) => [String(worker.id || ''), worker])),
          permanent,
          exact,
        );
      }

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

  async getEffectiveByDate(date: string, lineIds: string[]): Promise<LineWorkerAssignment[]> {
    if (!isConfigured || !date) return [];
    const normalizedLineIds = Array.from(new Set(lineIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (normalizedLineIds.length === 0) return this.getByDate(date);

    try {
      const [daily, workers] = await Promise.all([
        this.getByDate(date),
        productionWorkerService.getAll(),
      ]);
      const workersById = new Map(workers.map((worker) => [String(worker.id || ''), worker]));
      const effective: LineWorkerAssignment[] = [];
      const linesWithoutPermanent: string[] = [];

      for (const lineId of normalizedLineIds) {
        const permanent = await productionLineWorkerAssignmentService.getActiveByLineAndDate(lineId, date);
        if (permanent.length > 0) {
          effective.push(...buildPermanentDailyOverlay(lineId, date, workersById, permanent, daily));
        } else {
          linesWithoutPermanent.push(lineId);
        }
      }

      if (effective.length > 0) {
        return effective;
      }

      const legacyDaily = daily.filter((row) => normalizedLineIds.includes(String(row.lineId || '').trim()));
      if (legacyDaily.length > 0) return legacyDaily;

      const legacyInherited = await Promise.all(
        linesWithoutPermanent.map((lineId) => this.getByLineAndDate(lineId, date)),
      );
      return legacyInherited.flat();
    } catch (error) {
      console.error('lineAssignmentService.getEffectiveByDate error:', error);
      throw error;
    }
  },

  async create(data: Omit<LineWorkerAssignment, 'id' | 'assignedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const existingAssignments = await getExactByLineAndDate(data.lineId, data.date);
      const existingAssignment = existingAssignments.find((assignment) => assignment.employeeId === data.employeeId);
      if (existingAssignment) return existingAssignment.id || null;

      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        laborRole: data.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
        isPresent: data.isPresent ?? true,
        tenantId: getCurrentTenantId(),
        assignedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('lineAssignmentService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<Pick<LineWorkerAssignment, 'laborRole' | 'isPresent'>>): Promise<void> {
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

  async updatePresence(id: string, isPresent: boolean): Promise<void> {
    return this.update(id, { isPresent });
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
          isPresent: a.isPresent ?? true,
          date: targetDate,
          tenantId: getCurrentTenantId(),
          assignedAt: serverTimestamp(),
          assignedBy: assignedBy || '',
        };
        await addDoc(collection(db, COLLECTION), copiedAssignment);
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
