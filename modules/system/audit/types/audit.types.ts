export interface AuditMetadata {
  [key: string]: unknown;
}

export interface AuditRecord {
  id?: string;
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
}
