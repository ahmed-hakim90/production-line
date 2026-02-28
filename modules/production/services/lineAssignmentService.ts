import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { LineWorkerAssignment } from '../../../types';

const COLLECTION = 'line_worker_assignments';

export const lineAssignmentService = {
  async getByLineAndDate(lineId: string, date: string): Promise<LineWorkerAssignment[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId), where('date', '==', date));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LineWorkerAssignment));
    } catch (error) {
      console.error('lineAssignmentService.getByLineAndDate error:', error);
      throw error;
    }
  },

  async getByDate(date: string): Promise<LineWorkerAssignment[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('date', '==', date));
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
        assignedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('lineAssignmentService.create error:', error);
      throw error;
    }
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
      const assignments = await this.getByLineAndDate(lineId, date);
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
  ): Promise<number> {
    if (!isConfigured) return 0;
    try {
      const sourceAssignments = lineId
        ? await this.getByLineAndDate(lineId, sourceDate)
        : await this.getByDate(sourceDate);

      const existingToday = lineId
        ? await this.getByLineAndDate(lineId, targetDate)
        : await this.getByDate(targetDate);

      const existingKeys = new Set(existingToday.map((a) => `${a.lineId}_${a.employeeId}`));

      let count = 0;
      for (const a of sourceAssignments) {
        const key = `${a.lineId}_${a.employeeId}`;
        if (existingKeys.has(key)) continue;
        if (activeEmployeeIds && !activeEmployeeIds.has(a.employeeId)) continue;

        await addDoc(collection(db, COLLECTION), {
          lineId: a.lineId,
          employeeId: a.employeeId,
          employeeCode: a.employeeCode,
          employeeName: a.employeeName,
          date: targetDate,
          assignedAt: serverTimestamp(),
          assignedBy: assignedBy || '',
        });
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
        const q = query(collection(db, COLLECTION), where('lineId', '==', lineId));
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
