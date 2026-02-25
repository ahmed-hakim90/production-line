export const SystemEvents = {
  PRODUCTION_STARTED: 'production.started',
  PRODUCTION_CLOSED: 'production.closed',
  QC_APPROVED: 'qc.approved',
  QC_REJECTED: 'qc.rejected',
  WORK_ORDER_CREATED: 'work-order.created',
  USER_ACTION: 'user.action',
} as const;

export type SystemEventName = (typeof SystemEvents)[keyof typeof SystemEvents];

export interface EventActor {
  userId?: string;
  userName?: string;
}

export interface SystemEventBasePayload {
  module?: string;
  entityType?: string;
  entityId?: string;
  batchId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  actor?: EventActor;
}

export interface ProductionStartedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_batch' | 'work_order' | 'production_plan';
  action?: 'start';
}

export interface ProductionClosedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'production_batch' | 'work_order' | 'production_plan';
  action?: 'close';
}

export interface QcApprovedPayload extends SystemEventBasePayload {
  module?: 'quality';
  entityType?: 'quality_inspection' | 'work_order';
  action?: 'approve';
}

export interface QcRejectedPayload extends SystemEventBasePayload {
  module?: 'quality';
  entityType?: 'quality_inspection' | 'work_order';
  action?: 'reject';
}

export interface WorkOrderCreatedPayload extends SystemEventBasePayload {
  module?: 'production';
  entityType?: 'work_order';
  action?: 'create';
  workOrderNumber?: string;
}

export interface UserActionPayload extends SystemEventBasePayload {
  module?: string;
  action?: string;
}

export interface SystemEventPayloadMap {
  [SystemEvents.PRODUCTION_STARTED]: ProductionStartedPayload;
  [SystemEvents.PRODUCTION_CLOSED]: ProductionClosedPayload;
  [SystemEvents.QC_APPROVED]: QcApprovedPayload;
  [SystemEvents.QC_REJECTED]: QcRejectedPayload;
  [SystemEvents.WORK_ORDER_CREATED]: WorkOrderCreatedPayload;
  [SystemEvents.USER_ACTION]: UserActionPayload;
}
