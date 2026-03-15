import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { SupervisorLineAssignment, SupervisorLineAssignmentReason } from '../../../types';

const COLLECTION = 'supervisor_line_assignments';

const normalizeDate = (value: string): string => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD.');
  }
  return raw;
};

const addDays = (dateYmd: string, days: number): string => {
  const date = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateYmd;
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const isActiveForDate = (item: SupervisorLineAssignment, date: string): boolean => {
  if (item.isActive === false) return false;
  const from = String(item.effectiveFrom || '');
  const to = String(item.effectiveTo || '');
  if (!from || from > date) return false;
  if (to && to < from) return false;
  if (to && to < date) return false;
  return true;
};

export const supervisorLineAssignmentService = {
  async getAll(): Promise<SupervisorLineAssignment[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupervisorLineAssignment));
  },

  async getByLine(lineId: string): Promise<SupervisorLineAssignment[]> {
    if (!isConfigured || !lineId) return [];
    const q = query(collection(db, COLLECTION), where('lineId', '==', lineId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupervisorLineAssignment));
    rows.sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
    return rows;
  },

  async getActiveByDate(date: string): Promise<SupervisorLineAssignment[]> {
    if (!isConfigured) return [];
    const normalizedDate = normalizeDate(date);
    const q = query(collection(db, COLLECTION), where('effectiveFrom', '<=', normalizedDate));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupervisorLineAssignment));
    const active = rows.filter((item) => isActiveForDate(item, normalizedDate));
    const dedupByLine = new Map<string, SupervisorLineAssignment>();
    for (const item of active) {
      const lineId = String(item.lineId || '').trim();
      if (!lineId) continue;
      const prev = dedupByLine.get(lineId);
      if (!prev) {
        dedupByLine.set(lineId, item);
        continue;
      }
      if (String(item.effectiveFrom || '') > String(prev.effectiveFrom || '')) {
        dedupByLine.set(lineId, item);
      }
    }
    return Array.from(dedupByLine.values());
  },

  async getCurrentByLine(lineId: string, date: string): Promise<SupervisorLineAssignment | null> {
    const rows = await this.getByLine(lineId);
    const normalizedDate = normalizeDate(date);
    const active = rows.filter((item) => isActiveForDate(item, normalizedDate));
    if (active.length === 0) return null;
    active.sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
    return active[0];
  },

  async assignOrReassign(input: {
    lineId: string;
    supervisorId: string;
    effectiveFrom: string;
    changedBy?: string;
    lineName?: string;
    supervisorName?: string;
    reason?: SupervisorLineAssignmentReason;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const lineId = String(input.lineId || '').trim();
    const supervisorId = String(input.supervisorId || '').trim();
    if (!lineId || !supervisorId) {
      throw new Error('يجب تحديد الخط والمشرف.');
    }
    const effectiveFrom = normalizeDate(input.effectiveFrom);

    const lineRows = await this.getByLine(lineId);
    const activeOnDate = lineRows.find((row) => isActiveForDate(row, effectiveFrom));
    if (activeOnDate?.supervisorId === supervisorId) return activeOnDate.id || null;

    const toClose = lineRows.filter((row) => row.isActive !== false);
    const closeAt = addDays(effectiveFrom, -1);
    for (const row of toClose) {
      if (!row.id) continue;
      await updateDoc(doc(db, COLLECTION, row.id), {
        isActive: false,
        effectiveTo: closeAt,
        changedBy: input.changedBy || '',
        changedAt: serverTimestamp(),
        reason: input.reason || 'reassign',
      });
    }

    const ref = await addDoc(collection(db, COLLECTION), {
      lineId,
      supervisorId,
      effectiveFrom,
      isActive: true,
      lineName: String(input.lineName || '').trim(),
      supervisorName: String(input.supervisorName || '').trim(),
      changedBy: input.changedBy || '',
      changedAt: serverTimestamp(),
      reason: input.reason || (activeOnDate ? 'reassign' : 'assign'),
    });
    return ref.id;
  },

  async removeAssignment(lineId: string, effectiveFrom: string, changedBy?: string): Promise<void> {
    if (!isConfigured) return;
    const normalizedDate = normalizeDate(effectiveFrom);
    const current = await this.getCurrentByLine(lineId, normalizedDate);
    if (!current?.id) return;
    await updateDoc(doc(db, COLLECTION, current.id), {
      isActive: false,
      effectiveTo: addDays(normalizedDate, -1),
      changedBy: changedBy || '',
      changedAt: serverTimestamp(),
      reason: 'remove',
    });
  },

  async getHistoryByLine(lineId: string): Promise<SupervisorLineAssignment[]> {
    return this.getByLine(lineId);
  },
};
