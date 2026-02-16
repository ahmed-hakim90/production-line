/**
 * Activity Log Service — Read/Write for "activity_logs" collection
 * Tracks user actions (report creation, edits, etc.)
 * Uses limited queries to avoid loading all logs at once.
 */
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { ActivityLog } from '../types';

const COLLECTION = 'activity_logs';

export const activityLogService = {
  /**
   * Fetch the most recent activity logs (across all users).
   * Default limit 100 — enough to extract "latest per user" client-side
   * without loading the entire collection.
   */
  async getRecent(maxResults: number = 100): Promise<ActivityLog[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        orderBy('timestamp', 'desc'),
        firestoreLimit(maxResults)
      );
      const snap = await getDocs(q);
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ActivityLog)
      );
    } catch (error) {
      console.error('activityLogService.getRecent error:', error);
      return [];
    }
  },

  /**
   * Create a new activity log entry.
   * Uses serverTimestamp() for consistent ordering.
   */
  async create(
    data: Omit<ActivityLog, 'id' | 'timestamp'>
  ): Promise<void> {
    if (!isConfigured) return;
    try {
      await addDoc(collection(db, COLLECTION), {
        ...data,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('activityLogService.create error:', error);
    }
  },
};
