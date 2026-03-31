export interface AuditMetadata {
  [key: string]: unknown;
}

export interface AuditRecord {
  id?: string;
  /** Scoped to tenant; required for Firestore rules after multi-tenant migration. */
  tenantId?: string;
  event: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  module: string;
  performedBy: string;
  userName: string;
  timestamp: any;
  metadata: AuditMetadata;
  batchId?: string;
  correlationId?: string;
  operation?: string;
  status?: 'started' | 'succeeded' | 'failed';
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface CreateAuditLogInput {
  event: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  module: string;
  performedBy: string;
  userName: string;
  metadata?: AuditMetadata;
  batchId?: string;
  correlationId?: string;
  operation?: string;
  status?: 'started' | 'succeeded' | 'failed';
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}
