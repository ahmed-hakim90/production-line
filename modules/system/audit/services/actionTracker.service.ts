import { eventBus, SystemEvents, type EventActor, type OperationStatus, type OperationStatusPayload } from '../../../../shared/events';

type OperationEntityType = 'work_order' | 'production_report' | 'quality_inspection' | 'operation' | string;

export interface OperationContext {
  correlationId: string;
  module: string;
  operation: string;
  action: string;
  entityType: OperationEntityType;
  entityId?: string;
  batchId?: string;
  actor?: EventActor;
  metadata?: Record<string, unknown>;
  description?: string;
  startedAtIso: string;
  startedAtMs: number;
}

interface StartOperationInput {
  module: string;
  operation: string;
  action?: string;
  entityType: OperationEntityType;
  entityId?: string;
  batchId?: string;
  actor?: EventActor;
  metadata?: Record<string, unknown>;
  description?: string;
  correlationId?: string;
}

interface FinishOperationInput {
  metadata?: Record<string, unknown>;
  description?: string;
}

interface FailOperationInput extends FinishOperationInput {
  error: unknown;
  errorCode?: string;
}

const buildCorrelationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown_error';
  }
};

const toErrorCode = (error: unknown, override?: string): string | undefined => {
  if (override) return override;
  if (error && typeof error === 'object') {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode.trim().length > 0) return maybeCode;
  }
  return undefined;
};

const emitOperationStatus = (
  context: OperationContext,
  status: OperationStatus,
  input: {
    endedAtIso?: string;
    durationMs?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    description?: string;
  } = {},
): void => {
  const payload: OperationStatusPayload = {
    module: context.module,
    action: context.action,
    entityType: context.entityType,
    entityId: context.entityId,
    batchId: context.batchId,
    actor: context.actor,
    metadata: {
      ...(context.metadata ?? {}),
      ...(input.metadata ?? {}),
    },
    description: input.description ?? context.description ?? `${context.operation} ${status}`,
    correlationId: context.correlationId,
    operation: context.operation,
    status,
    startedAt: context.startedAtIso,
    endedAt: input.endedAtIso,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  };

  eventBus.emit(SystemEvents.OPERATION_STATUS, payload);
};

export const actionTrackerService = {
  startOperation(input: StartOperationInput): OperationContext {
    const startedAtMs = Date.now();
    const context: OperationContext = {
      correlationId: input.correlationId ?? buildCorrelationId(),
      module: input.module,
      operation: input.operation,
      action: input.action ?? input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      batchId: input.batchId,
      actor: input.actor,
      metadata: input.metadata ?? {},
      description: input.description,
      startedAtIso: new Date(startedAtMs).toISOString(),
      startedAtMs,
    };

    emitOperationStatus(context, 'started');
    return context;
  },

  succeedOperation(context: OperationContext, input: FinishOperationInput = {}): void {
    const endedAtMs = Date.now();
    emitOperationStatus(context, 'succeeded', {
      endedAtIso: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - context.startedAtMs),
      metadata: input.metadata,
      description: input.description,
    });
  },

  failOperation(context: OperationContext, input: FailOperationInput): void {
    const endedAtMs = Date.now();
    emitOperationStatus(context, 'failed', {
      endedAtIso: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - context.startedAtMs),
      metadata: input.metadata,
      description: input.description,
      errorCode: toErrorCode(input.error, input.errorCode),
      errorMessage: toErrorMessage(input.error),
    });
  },
};
