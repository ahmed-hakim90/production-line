import { auth } from '../../../auth/services/firebase';
import { useAppStore } from '../../../../store/useAppStore';
import { eventBus, SystemEvents, type SystemEventBasePayload, type SystemEventName } from '../../../../shared/events';
import { auditQueueService } from '../services/auditQueue.service';

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
  [SystemEvents.OPERATION_STATUS]: {
    description: 'Operation status updated',
    module: 'system',
    action: 'track',
    entityType: 'operation',
  },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

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

type BufferedOperationStart = {
  payload: SystemEventBasePayload;
  bufferedAtMs: number;
};

type PendingUserAction = {
  eventName: SystemEventName;
  payload: SystemEventBasePayload;
  timerId: ReturnType<typeof setTimeout>;
};

const OPERATION_BUFFER_TTL_MS = 60 * 60 * 1000;
const operationStartBuffer = new Map<string, BufferedOperationStart>();
const USER_ACTION_DEDUP_WINDOW_MS = 2000;
const pendingUserActions = new Map<string, PendingUserAction>();

const mergePayloadMetadata = (
  startPayload: SystemEventBasePayload,
  endPayload: SystemEventBasePayload,
): Record<string, unknown> => {
  const startMetadata = asRecord(startPayload.metadata);
  const endMetadata = asRecord(endPayload.metadata);
  return {
    ...startMetadata,
    ...endMetadata,
  };
};

const pruneOperationStartBuffer = (): void => {
  const cutoff = Date.now() - OPERATION_BUFFER_TTL_MS;
  operationStartBuffer.forEach((entry, key) => {
    if (entry.bufferedAtMs < cutoff) {
      operationStartBuffer.delete(key);
    }
  });
};

const buildEventFingerprint = (
  eventName: SystemEventName,
  payload: SystemEventBasePayload,
  performedBy: string,
): string => {
  const mapped = AUDIT_MAPPING[eventName];
  const metadata = asRecord(payload.metadata);
  const moduleName = asString(payload.module) ?? mapped.module;
  const action = asString((payload as { action?: unknown }).action) ?? mapped.action;
  const entityType = asString(payload.entityType) ?? mapped.entityType;
  const entityId =
    asString(payload.entityId) ??
    asString(payload.batchId) ??
    asString(metadata.entityId) ??
    asString(metadata.batchId) ??
    'unknown';
  return [moduleName, action, entityType, entityId, performedBy].join('|');
};

const mergeUserActionIntoOperationPayload = (
  operationPayload: SystemEventBasePayload,
  userActionPayload: SystemEventBasePayload,
): SystemEventBasePayload => ({
  ...userActionPayload,
  ...operationPayload,
  metadata: {
    ...asRecord(userActionPayload.metadata),
    ...asRecord(operationPayload.metadata),
  },
  description: asString(operationPayload.description) ?? asString(userActionPayload.description),
  status: operationPayload.status,
  correlationId: asString(operationPayload.correlationId) ?? asString(userActionPayload.correlationId),
  operation: asString(operationPayload.operation) ?? asString(userActionPayload.operation),
  startedAt: asString(operationPayload.startedAt) ?? asString(userActionPayload.startedAt),
  endedAt: asString(operationPayload.endedAt) ?? asString(userActionPayload.endedAt),
  durationMs: asNumber(operationPayload.durationMs) ?? asNumber(userActionPayload.durationMs),
  errorCode: asString(operationPayload.errorCode) ?? asString(userActionPayload.errorCode),
  errorMessage: asString(operationPayload.errorMessage) ?? asString(userActionPayload.errorMessage),
});

const mergePendingEventIntoOperationPayload = (
  operationPayload: SystemEventBasePayload,
  pendingPayload: SystemEventBasePayload,
): SystemEventBasePayload =>
  mergeUserActionIntoOperationPayload(operationPayload, pendingPayload);

const persistAuditEvent = async (
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
  const correlationId = asString(payload.correlationId) ?? asString(metadata.correlationId);
  const operation = asString(payload.operation) ?? asString(metadata.operation);
  const status = asString(payload.status) ?? asString(metadata.status);
  const startedAt = asString(payload.startedAt) ?? asString(metadata.startedAt);
  const endedAt = asString(payload.endedAt) ?? asString(metadata.endedAt);
  const durationMs = asNumber(payload.durationMs) ?? asNumber(metadata.durationMs);
  const errorCode = asString(payload.errorCode) ?? asString(metadata.errorCode);
  const errorMessage = asString(payload.errorMessage) ?? asString(metadata.errorMessage);

  auditQueueService.enqueue({
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
    correlationId,
    operation,
    status: status === 'started' || status === 'succeeded' || status === 'failed' ? status : undefined,
    startedAt,
    endedAt,
    durationMs,
    errorCode,
    errorMessage,
  });
};

const handleAuditEvent = async (
  eventName: SystemEventName,
  payload: SystemEventBasePayload,
): Promise<void> => {
  if (eventName !== SystemEvents.OPERATION_STATUS) {
    const { userId } = resolveActor(payload);
    const key = buildEventFingerprint(eventName, payload, userId);
    const existing = pendingUserActions.get(key);
    if (existing) {
      clearTimeout(existing.timerId);
    }
    const timerId = setTimeout(() => {
      const pending = pendingUserActions.get(key);
      if (!pending) return;
      pendingUserActions.delete(key);
      void persistAuditEvent(pending.eventName, pending.payload).catch((error) => {
        console.error('[audit.listener] failed to flush buffered event:', error);
      });
    }, USER_ACTION_DEDUP_WINDOW_MS);

    pendingUserActions.set(key, { eventName, payload, timerId });
    return;
  }

  if (eventName === SystemEvents.OPERATION_STATUS) {
    pruneOperationStartBuffer();
    const correlationId = asString(payload.correlationId);
    if (payload.status === 'started' && correlationId) {
      operationStartBuffer.set(correlationId, {
        payload: {
          ...payload,
          metadata: asRecord(payload.metadata),
        },
        bufferedAtMs: Date.now(),
      });
      // Persist started records so open/in-progress operations remain visible.
      await persistAuditEvent(eventName, payload);
      return;
    }

    if ((payload.status === 'succeeded' || payload.status === 'failed') && correlationId) {
      const started = operationStartBuffer.get(correlationId);
      if (started) {
        operationStartBuffer.delete(correlationId);
        payload = {
          ...started.payload,
          ...payload,
          metadata: mergePayloadMetadata(started.payload, payload),
          status: payload.status,
          endedAt: asString(payload.endedAt) ?? asString(started.payload.endedAt),
          errorCode: asString(payload.errorCode) ?? asString(started.payload.errorCode),
          errorMessage: asString(payload.errorMessage) ?? asString(started.payload.errorMessage),
          durationMs: asNumber(payload.durationMs) ?? asNumber(started.payload.durationMs),
        };
      }

      const { userId } = resolveActor(payload);
      for (const pendingEventName of Object.values(SystemEvents)) {
        if (pendingEventName === SystemEvents.OPERATION_STATUS) continue;
        const pendingKey = buildEventFingerprint(pendingEventName, payload, userId);
        const pending = pendingUserActions.get(pendingKey);
        if (!pending) continue;
        clearTimeout(pending.timerId);
        pendingUserActions.delete(pendingKey);
        payload = mergePendingEventIntoOperationPayload(payload, pending.payload);
        break;
      }
    }
  }
  await persistAuditEvent(eventName, payload);
};

export const registerAuditListener = (): (() => void) => {
  const stopAutoFlush = auditQueueService.startAutoFlush();
  const unsubs = Object.values(SystemEvents).map((eventName) =>
    eventBus.on(eventName, (payload) => {
      // Fire and forget: never block emitters or business workflows.
      void handleAuditEvent(eventName, payload).catch((error) => {
        console.error(`[audit.listener] failed to process "${eventName}":`, error);
      });
    }),
  );

  return () => {
    stopAutoFlush();
    void auditQueueService.flushNow();
    pendingUserActions.forEach((entry) => {
      clearTimeout(entry.timerId);
    });
    pendingUserActions.clear();
    operationStartBuffer.clear();
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
};
