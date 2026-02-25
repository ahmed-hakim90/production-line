import {
  addDoc,
  collection,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../../auth/services/firebase';
import type { AuditRecord, CreateAuditLogInput } from '../types/audit.types';

const AUDIT_COLLECTION = 'audit_logs';

export const auditService = {
  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    if (!isConfigured) return;
    await addDoc(collection(db, AUDIT_COLLECTION), {
      event: input.event,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      description: input.description,
      module: input.module,
      performedBy: input.performedBy,
      userName: input.userName,
      metadata: input.metadata ?? {},
      batchId: input.batchId ?? null,
      timestamp: serverTimestamp(),
    } satisfies Omit<AuditRecord, 'id' | 'timestamp'> & { timestamp: any });
  },

  async getEntityTimeline(
    entityType: string,
    entityId: string,
    maxResults: number = 100,
  ): Promise<AuditRecord[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, AUDIT_COLLECTION),
      where('entityType', '==', entityType),
      where('entityId', '==', entityId),
      orderBy('timestamp', 'desc'),
      firestoreLimit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as AuditRecord));
  },

  async getUserActivity(
    userId: string,
    maxResults: number = 100,
  ): Promise<AuditRecord[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, AUDIT_COLLECTION),
      where('performedBy', '==', userId),
      orderBy('timestamp', 'desc'),
      firestoreLimit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as AuditRecord));
  },

  async getBatchTimeline(batchId: string, maxResults: number = 200): Promise<AuditRecord[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, AUDIT_COLLECTION),
      where('batchId', '==', batchId),
      orderBy('timestamp', 'asc'),
      firestoreLimit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as AuditRecord));
  },
};
