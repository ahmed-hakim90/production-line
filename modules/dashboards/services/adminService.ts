import {
  collection,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { FirestoreUser, FirestoreRole, ActivityLog } from '../../../types';

export interface SystemUsers {
  total: number;
  active: number;
  disabled: number;
}

export const adminService = {
  async getSystemUsers(): Promise<SystemUsers> {
    if (!isConfigured) return { total: 0, active: 0, disabled: 0 };
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map((d) => d.data() as FirestoreUser);
      return {
        total: users.length,
        active: users.filter((u) => u.isActive).length,
        disabled: users.filter((u) => !u.isActive).length,
      };
    } catch (error) {
      console.error('adminService.getSystemUsers error:', error);
      return { total: 0, active: 0, disabled: 0 };
    }
  },

  async getRolesDistribution(): Promise<{ roleName: string; color: string; count: number }[]> {
    if (!isConfigured) return [];
    try {
      const [rolesSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'users')),
      ]);
      const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRole));
      const users = usersSnap.docs.map((d) => d.data() as FirestoreUser);

      return roles.map((role) => ({
        roleName: role.name,
        color: role.color,
        count: users.filter((u) => u.roleId === role.id).length,
      }));
    } catch (error) {
      console.error('adminService.getRolesDistribution error:', error);
      return [];
    }
  },

  async getRecentActivity(count: number = 10): Promise<ActivityLog[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        firestoreLimit(count),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
    } catch (error) {
      console.error('adminService.getRecentActivity error:', error);
      return [];
    }
  },
};
