import type { CreateAuditLogInput } from '../types/audit.types';
import { auditService } from './audit.service';

interface QueuedAuditLog {
  id: string;
  createdAtMs: number;
  attemptCount: number;
  payload: CreateAuditLogInput;
}

const STORAGE_KEY = 'audit.logs.queue.v1';
const MAX_QUEUE_SIZE = 2000;
const DEFAULT_FLUSH_INTERVAL_MS = 20_000;
const FLUSH_BATCH_SIZE = 120;
const MAX_ATTEMPTS = 12;
const MAX_ITEM_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const canUseLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

const buildId = (): string =>
  `aq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const readQueue = (): QueuedAuditLog[] => {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedAuditLog[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item &&
      typeof item.id === 'string' &&
      item.payload &&
      typeof item.payload === 'object',
    );
  } catch {
    return [];
  }
};

const writeQueue = (queue: QueuedAuditLog[]): void => {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[auditQueue] failed to persist queue:', error);
  }
};

const pruneQueue = (queue: QueuedAuditLog[]): QueuedAuditLog[] => {
  const now = Date.now();
  const freshEnough = queue.filter(
    (item) =>
      item &&
      typeof item.createdAtMs === 'number' &&
      now - item.createdAtMs <= MAX_ITEM_AGE_MS &&
      item.attemptCount <= MAX_ATTEMPTS,
  );
  if (freshEnough.length <= MAX_QUEUE_SIZE) return freshEnough;
  return freshEnough.slice(freshEnough.length - MAX_QUEUE_SIZE);
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

let isFlushing = false;
let flushTimerId: ReturnType<typeof setInterval> | null = null;
let stopAutoFlush: (() => void) | null = null;

const flushInternal = async (): Promise<number> => {
  const currentQueue = pruneQueue(readQueue());
  writeQueue(currentQueue);
  if (currentQueue.length === 0) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  let queue = [...currentQueue];
  let sentCount = 0;
  const batches = chunk(queue, FLUSH_BATCH_SIZE);

  for (const batch of batches) {
    const payloads = batch.map((item) => item.payload);
    try {
      await auditService.createAuditLogsBatch(payloads);
      const sentIds = new Set(batch.map((item) => item.id));
      queue = queue.filter((item) => !sentIds.has(item.id));
      sentCount += batch.length;
      writeQueue(queue);
    } catch (error) {
      const failedIds = new Set(batch.map((item) => item.id));
      queue = queue.map((item) =>
        failedIds.has(item.id) ? { ...item, attemptCount: item.attemptCount + 1 } : item,
      );
      writeQueue(queue);
      console.error('[auditQueue] flush batch failed:', error);
      break;
    }
  }

  return sentCount;
};

export const auditQueueService = {
  enqueue(payload: CreateAuditLogInput): void {
    const queue = pruneQueue(readQueue());
    const next = [
      ...queue,
      {
        id: buildId(),
        createdAtMs: Date.now(),
        attemptCount: 0,
        payload,
      } satisfies QueuedAuditLog,
    ];

    writeQueue(pruneQueue(next));
  },

  async flushNow(): Promise<number> {
    if (isFlushing) return 0;
    isFlushing = true;
    try {
      return await flushInternal();
    } finally {
      isFlushing = false;
    }
  },

  startAutoFlush(intervalMs: number = DEFAULT_FLUSH_INTERVAL_MS): () => void {
    if (stopAutoFlush) return stopAutoFlush;

    const runFlush = () => {
      void this.flushNow();
    };

    flushTimerId = setInterval(runFlush, Math.max(5_000, intervalMs));

    const onOnline = () => runFlush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') runFlush();
      if (document.visibilityState === 'hidden') {
        void this.flushNow();
      }
    };
    const onPageHide = () => {
      void this.flushNow();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    runFlush();

    stopAutoFlush = () => {
      if (flushTimerId) {
        clearInterval(flushTimerId);
        flushTimerId = null;
      }
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      stopAutoFlush = null;
    };

    return stopAutoFlush;
  },
};
