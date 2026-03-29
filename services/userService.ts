/**
 * User Service — CRUD for "users" collection
 * Stores user profile (email, displayName, roleId, isActive) per authenticated user.
 */
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { FirestoreUser } from '../types';

const COLLECTION = 'users';

export const userService = {
  async get(uid: string): Promise<FirestoreUser | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, uid));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreUser;
    } catch (error) {
      console.error('userService.get error:', error);
      throw error;
    }
  },

  /** Fetch all user documents (admin only) */
  async getAll(): Promise<FirestoreUser[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreUser));
    } catch (error) {
      console.error('userService.getAll error:', error);
      throw error;
    }
  },

  /** Create or overwrite a user document (uses uid as doc id) */
  async set(uid: string, data: Omit<FirestoreUser, 'id'>): Promise<void> {
    if (!isConfigured) return;
    try {
      await setDoc(doc(db, COLLECTION, uid), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('userService.set error:', error);
      throw error;
    }
  },

  async updateRoleId(uid: string, roleId: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, uid), { roleId });
    } catch (error) {
      console.error('userService.updateRoleId error:', error);
      throw error;
    }
  },

  /** Update any user fields */
  async update(uid: string, data: Partial<Omit<FirestoreUser, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, uid), data as Record<string, any>);
    } catch (error) {
      console.error('userService.update error:', error);
      throw error;
    }
  },

  /** Remove deprecated minimized-modal workspace prefs (one-time migration helper). */
  async clearModalWorkspacePreference(uid: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, uid), {
        'uiPreferences.modalWorkspace': deleteField(),
      });
    } catch (error) {
      console.warn('userService.clearModalWorkspacePreference:', error);
    }
  },

  /** Toggle active/inactive status */
  async toggleActive(uid: string, isActive: boolean): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, uid), { isActive });
    } catch (error) {
      console.error('userService.toggleActive error:', error);
      throw error;
    }
  },

  /** Delete a user document */
  async delete(uid: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, uid));
    } catch (error) {
      console.error('userService.delete error:', error);
      throw error;
    }
  },
};
