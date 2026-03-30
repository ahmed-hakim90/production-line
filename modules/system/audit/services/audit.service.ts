import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  QueryConstraint,
  serverTimestamp,
  writeBatch,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../../auth/services/firebase';
import { getCurrentTenantIdOrNull } from '../../../../lib/currentTenant';
import { tenantQuery } from '../../../../lib/tenantFirestore';
import type { AuditRecord, CreateAuditLogInput } from '../types/audit.types';
import { SystemEvents } from '../../../../shared/events';

const AUDIT_COLLECTION = 'audit_logs';

export interface OperationEventsFilters {
  module?: string;
  operation?: string;
  status?: 'started' | 'succeeded' | 'failed';
  performedBy?: string;
  startDateIso?: string;
  endDateIso?: string;
  maxResults?: number;
}

const MAX_OPERATION_EVENTS_LIMIT = 300;
const DEFAULT_OPERATION_EVENTS_LIMIT = 120;

const sanitizeLimit = (input?: number): number => {
  if (!Number.isFinite(input)) return DEFAULT_OPERATION_EVENTS_LIMIT;
  const normalized = Math.trunc(Number(input));
  if (normalized <= 0) return DEFAULT_OPERATION_EVENTS_LIMIT;
  return Math.min(normalized, MAX_OPERATION_EVENTS_LIMIT);
};

const auditPayload = (
  input: CreateAuditLogInput,
  tenantId: string,
): Omit<AuditRecord, 'id' | 'timestamp'> & { timestamp: ReturnType<typeof serverTimestamp> } => ({
  tenantId,
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
  correlationId: input.correlationId ?? null,
  operation: input.operation ?? null,
  status: input.status ?? null,
  startedAt: input.startedAt ?? null,
  endedAt: input.endedAt ?? null,
  durationMs: input.durationMs ?? null,
  errorCode: input.errorCode ?? null,
  errorMessage: input.errorMessage ?? null,
  timestamp: serverTimestamp(),
});

export const auditService = {
  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    if (!isConfigured) return;
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return;
    await addDoc(collection(db, AUDIT_COLLECTION), {
      ...auditPayload(input, tenantId),
    } satisfies Omit<AuditRecord, 'id' | 'timestamp'> & { timestamp: any });
  },

  async createAuditLogsBatch(inputs: CreateAuditLogInput[]): Promise<void> {
    if (!isConfigured || inputs.length === 0) return;
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return;
    const batch = writeBatch(db);
    inputs.forEach((input) => {
      const ref = doc(collection(db, AUDIT_COLLECTION));
      batch.set(ref, {
        ...auditPayload(input, tenantId),
      } satisfies Omit<AuditRecord, 'id' | 'timestamp'> & { timestamp: any });
    });
    await batch.commit();
  },

  async getEntityTimeline(
    entityType: string,
    entityId: string,
    maxResults: number = 100,
  ): Promise<AuditRecord[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    const q = tenantQuery(
      db,
      AUDIT_COLLECTION,
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
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    const q = tenantQuery(
      db,
      AUDIT_COLLECTION,
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
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    const q = tenantQuery(
      db,
      AUDIT_COLLECTION,
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

  async getOperationEvents(filters: OperationEventsFilters = {}): Promise<AuditRecord[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantIdOrNull();
    if (!tenantId) return [];
    const constraints: QueryConstraint[] = [
      where('event', '==', SystemEvents.OPERATION_STATUS),
    ];

    if (filters.module) constraints.push(where('module', '==', filters.module));
    if (filters.operation) constraints.push(where('operation', '==', filters.operation));
    if (filters.status) constraints.push(where('status', '==', filters.status));
    if (filters.performedBy) constraints.push(where('performedBy', '==', filters.performedBy));

    if (filters.startDateIso) {
      const startDate = new Date(filters.startDateIso);
      if (!Number.isNaN(startDate.getTime())) {
        constraints.push(where('timestamp', '>=', startDate));
      }
    }

    if (filters.endDateIso) {
      const endDate = new Date(filters.endDateIso);
      if (!Number.isNaN(endDate.getTime())) {
        constraints.push(where('timestamp', '<=', endDate));
      }
    }

    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(firestoreLimit(sanitizeLimit(filters.maxResults)));

    try {
      const q = tenantQuery(db, AUDIT_COLLECTION, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as AuditRecord));
    } catch (error) {
      console.error('auditService.getOperationEvents error:', error);
      return [];
    }
  },
};
