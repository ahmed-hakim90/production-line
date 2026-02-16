/**
 * User Service — CRUD for "users" collection
 * Stores roleId reference per authenticated user.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
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

  /** Create or overwrite a user document (uses uid as doc id) */
  async set(uid: string, data: Omit<FirestoreUser, 'id'>): Promise<void> {
    if (!isConfigured) return;
    try {
      await setDoc(doc(db, COLLECTION, uid), data);
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
};
