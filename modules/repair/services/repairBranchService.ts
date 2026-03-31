import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import {
  REPAIR_BRANCHES_COL,
  REPAIR_TECHNICIAN_ASSIGNMENTS_COL,
} from '../collections';
import type { RepairBranch, RepairTechnicianAssignment } from '../types';

const toIso = () => new Date().toISOString();

export const repairBranchService = {
  // ─── Branches ───────────────────────────────────────────────────────────────

  async getAll(): Promise<RepairBranch[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, REPAIR_BRANCHES_COL), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairBranch));
  },

  async getById(id: string): Promise<RepairBranch | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, REPAIR_BRANCHES_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as RepairBranch) : null;
  },

  subscribe(callback: (branches: RepairBranch[]) => void): () => void {
    if (!isConfigured) return () => {};
    const q = query(collection(db, REPAIR_BRANCHES_COL), orderBy('name'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairBranch)));
    });
  },

  async create(data: Omit<RepairBranch, 'id' | 'createdAt'>, createdBy: string): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const ref = await addDoc(collection(db, REPAIR_BRANCHES_COL), {
      ...data,
      createdBy,
      createdAt: toIso(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<RepairBranch>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, REPAIR_BRANCHES_COL, id), { ...data, updatedAt: toIso() });
  },

  // ─── Technician Assignments ──────────────────────────────────────────────────

  async getTechnicianAssignment(technicianId: string): Promise<RepairTechnicianAssignment | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, REPAIR_TECHNICIAN_ASSIGNMENTS_COL, technicianId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as RepairTechnicianAssignment) : null;
  },

  async getAllAssignments(): Promise<RepairTechnicianAssignment[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(collection(db, REPAIR_TECHNICIAN_ASSIGNMENTS_COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairTechnicianAssignment));
  },

  async setTechnicianBranches(
    technicianId: string,
    technicianName: string,
    branchIds: string[],
  ): Promise<void> {
    if (!isConfigured) return;
    await setDoc(doc(db, REPAIR_TECHNICIAN_ASSIGNMENTS_COL, technicianId), {
      technicianId,
      technicianName,
      branchIds,
      updatedAt: toIso(),
    });
  },

  async removeAssignment(technicianId: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, REPAIR_TECHNICIAN_ASSIGNMENTS_COL, technicianId));
  },

  /** Returns branch IDs accessible by a given technician */
  async getBranchIdsForTechnician(technicianId: string): Promise<string[]> {
    const assignment = await this.getTechnicianAssignment(technicianId);
    return assignment?.branchIds ?? [];
  },
};
