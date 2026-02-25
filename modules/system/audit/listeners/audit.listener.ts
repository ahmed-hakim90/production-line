import { auth } from '../../../auth/services/firebase';
import { useAppStore } from '../../../../store/useAppStore';
import { eventBus, SystemEvents, type SystemEventBasePayload, type SystemEventName } from '../../../../shared/events';
import { auditService } from '../services/audit.service';

type AuditEventMapping = {
  description: string;
  module: string;
  action: string;
  entityType: string;
};

const AUDIT_MAPPING: Record<SystemEventName, AuditEventMapping> = {
  [SystemEvents.PRODUCTION_STARTED]: {
    description: 'Production batch started',
    module: 'production',
    action: 'start',
    entityType: 'production_batch',
  },
  [SystemEvents.PRODUCTION_CLOSED]: {
    description: 'Production batch closed',
    module: 'production',
    action: 'close',
    entityType: 'production_batch',
  },
  [SystemEvents.QC_APPROVED]: {
    description: 'QC approved batch',
    module: 'quality',
    action: 'approve',
    entityType: 'quality_inspection',
  },
  [SystemEvents.QC_REJECTED]: {
    description: 'QC rejected batch',
    module: 'quality',
    action: 'reject',
    entityType: 'quality_inspection',
  },
  [SystemEvents.WORK_ORDER_CREATED]: {
    description: 'Work order created',
    module: 'production',
    action: 'create',
    entityType: 'work_order',
  },
  [SystemEvents.USER_ACTION]: {
    description: 'User action',
    module: 'system',
    action: 'action',
    entityType: 'user_action',
  },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const resolveActor = (payload: SystemEventBasePayload): { userId: string; userName: string } => {
  const payloadUserId = asString(payload.actor?.userId);
  const payloadUserName = asString(payload.actor?.userName);
  if (payloadUserId) {
    return {
      userId: payloadUserId,
      userName: payloadUserName ?? 'Unknown User',
    };
  }

  const state = useAppStore.getState();
  const stateUserId = asString(state.uid);
  const stateUserName = asString(state.userDisplayName) ?? asString(state.userEmail);
  if (stateUserId) {
    return {
      userId: stateUserId,
      userName: stateUserName ?? 'Unknown User',
    };
  }

  const authUserId = asString(auth?.currentUser?.uid);
  const authUserName = asString(auth?.currentUser?.displayName) ?? asString(auth?.currentUser?.email);
  return {
    userId: authUserId ?? 'system',
    userName: authUserName ?? 'System',
  };
};

const handleAuditEvent = async (
  eventName: SystemEventName,
  payload: SystemEventBasePayload,
): Promise<void> => {
  const mapped = AUDIT_MAPPING[eventName];
  const metadata = asRecord(payload.metadata);
  const { userId, userName } = resolveActor(payload);
  const entityId =
    asString(payload.entityId) ??
    asString(payload.batchId) ??
    asString(metadata.entityId) ??
    asString(metadata.batchId) ??
    'unknown';
  const batchId =
    asString(payload.batchId) ??
    asString(metadata.batchId) ??
    (payload.entityType === 'production_batch' ? entityId : undefined);

  await auditService.createAuditLog({
    event: eventName,
    module: asString(payload.module) ?? mapped.module,
    action: asString((payload as { action?: unknown }).action) ?? mapped.action,
    entityType: asString(payload.entityType) ?? mapped.entityType,
    entityId,
    description: asString(payload.description) ?? mapped.description,
    performedBy: userId,
    userName,
    metadata,
    batchId,
  });
};

export const registerAuditListener = (): (() => void) => {
  const unsubs = Object.values(SystemEvents).map((eventName) =>
    eventBus.on(eventName, (payload) => {
      // Fire and forget: never block emitters or business workflows.
      void handleAuditEvent(eventName, payload).catch((error) => {
        console.error(`[audit.listener] failed to process "${eventName}":`, error);
      });
    }),
  );

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
};
