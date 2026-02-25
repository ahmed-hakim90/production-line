import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { WorkOrderLiveSummary, WorkOrderPauseWindow, WorkOrderScanEvent, WorkOrderScanSession } from '../../../types';

const COLLECTION = 'scan_events';
const SERIAL_SCAN_COOLDOWN_MS = 1200;
const serialCooldown = new Map<string, number>();
const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseHmToMinutes = (value?: string): number | null => {
  if (!value) return null;
  const [h, m] = value.split(':');
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return (hh * 60) + mm;
};

const startOfDayMs = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const buildBreakIntervals = (
  fromMs: number,
  toMs: number,
  breakStartTime?: string,
  breakEndTime?: string,
): Array<{ start: number; end: number }> => {
  const from = Math.min(fromMs, toMs);
  const to = Math.max(fromMs, toMs);
  const startMinutes = parseHmToMinutes(breakStartTime || DEFAULT_BREAK_START);
  const endMinutes = parseHmToMinutes(breakEndTime || DEFAULT_BREAK_END);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const oneDayMs = 24 * 60 * 60 * 1000;
  const firstDay = startOfDayMs(from);
  const lastDay = startOfDayMs(to);
  const intervals: Array<{ start: number; end: number }> = [];

  for (let day = firstDay; day <= lastDay; day += oneDayMs) {
    const start = day + (startMinutes * 60 * 1000);
    const end = day + (endMinutes * 60 * 1000);
    if (end > from && start < to) intervals.push({ start, end });
  }
  return intervals;
};

const normalizePauseIntervals = (
  pauseWindows: WorkOrderPauseWindow[] | undefined,
  fallbackEndMs: number,
): Array<{ start: number; end: number }> => {
  if (!pauseWindows || pauseWindows.length === 0) return [];
  return pauseWindows
    .map((w) => ({ start: toMillis(w.startAt), end: toMillis(w.endAt) || fallbackEndMs }))
    .filter((w) => w.start > 0 && w.end > w.start);
};

const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = merged[merged.length - 1];
    if (current.start <= prev.end) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
};

const overlapMs = (
  fromMs: number,
  toMs: number,
  intervals: Array<{ start: number; end: number }>,
) => {
  const from = Math.min(fromMs, toMs);
  const to = Math.max(fromMs, toMs);
  const merged = mergeIntervals(intervals);
  let total = 0;
  for (const interval of merged) {
    const start = Math.max(from, interval.start);
    const end = Math.min(to, interval.end);
    if (end > start) total += (end - start);
  }
  return total;
};

const computeEffectiveCycleSeconds = (params: {
  inAt: any;
  outAtMs: number;
  breakStartTime?: string;
  breakEndTime?: string;
  pauseWindows?: WorkOrderPauseWindow[];
  minSeconds?: number;
}) => {
  const inAtMs = toMillis(params.inAt);
  if (!inAtMs || params.outAtMs <= inAtMs) return params.minSeconds ?? 0;
  const elapsedMs = params.outAtMs - inAtMs;

  const breakIntervals = buildBreakIntervals(
    inAtMs,
    params.outAtMs,
    params.breakStartTime,
    params.breakEndTime,
  );
  const manualIntervals = normalizePauseIntervals(params.pauseWindows, params.outAtMs);
  const pausedMs = overlapMs(inAtMs, params.outAtMs, [...breakIntervals, ...manualIntervals]);
  const effectiveMs = Math.max(0, elapsedMs - pausedMs);
  const seconds = Math.floor(effectiveMs / 1000);
  const minSeconds = params.minSeconds ?? 0;
  return Math.max(minSeconds, seconds);
};

const sortByTimestampAsc = (events: WorkOrderScanEvent[]) =>
  [...events].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));

const sessionsFromEvents = (events: WorkOrderScanEvent[]): WorkOrderScanSession[] => {
  const map = new Map<string, WorkOrderScanSession>();
  for (const evt of sortByTimestampAsc(events)) {
    const existing = map.get(evt.sessionId);
    if (evt.action === 'IN') {
      map.set(evt.sessionId, {
        sessionId: evt.sessionId,
        serialBarcode: evt.serialBarcode,
        workOrderId: evt.workOrderId,
        lineId: evt.lineId,
        productId: evt.productId,
        employeeId: evt.employeeId,
        inAt: evt.timestamp,
        status: 'open',
      });
      continue;
    }
    if (evt.action === 'OUT' && existing) {
      map.set(evt.sessionId, {
        ...existing,
        outAt: evt.timestamp,
        cycleSeconds: evt.cycleSeconds,
        status: 'closed',
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => toMillis(b.inAt) - toMillis(a.inAt));
};

const summaryFromSessions = (sessions: WorkOrderScanSession[]): WorkOrderLiveSummary => {
  const completed = sessions.filter((s) => s.status === 'closed' && !!s.outAt);
  const active = sessions.filter((s) => s.status === 'open');
  const workersWithIds = new Set(
    sessions.map((s) => s.employeeId).filter((id): id is string => !!id && id.trim().length > 0),
  );
  const activeWorkers = workersWithIds.size > 0 ? workersWithIds.size : active.length;
  const avgCycleSeconds =
    completed.length > 0
      ? Math.round(completed.reduce((acc, s) => acc + (s.cycleSeconds || 0), 0) / completed.length)
      : 0;
  const lastScanAt =
    sessions.length > 0
      ? sessions
          .map((s) => (s.outAt ? s.outAt : s.inAt))
          .sort((a, b) => toMillis(b) - toMillis(a))[0]
      : null;

  return {
    completedUnits: completed.length,
    inProgressUnits: active.length,
    activeWorkers,
    avgCycleSeconds,
    lastScanAt,
  };
};

export interface WorkOrderScanSummaryResult {
  summary: WorkOrderLiveSummary;
  sessions: WorkOrderScanSession[];
  openSessions: WorkOrderScanSession[];
}

export interface ToggleScanResult {
  action: 'IN' | 'OUT';
  eventId: string | null;
  sessionId: string;
  cycleSeconds?: number;
}

export const scanEventService = {
  async getByWorkOrder(workOrderId: string): Promise<WorkOrderScanEvent[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), where('workOrderId', '==', workOrderId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderScanEvent));
  },

  async getByWorkOrderAndSerial(workOrderId: string, serialBarcode: string): Promise<WorkOrderScanEvent[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, COLLECTION),
      where('workOrderId', '==', workOrderId),
      where('serialBarcode', '==', serialBarcode),
      limit(100),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderScanEvent));
  },

  async scanIn(payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
  }): Promise<ToggleScanResult> {
    if (!isConfigured) return { action: 'IN', eventId: null, sessionId: '' };
    const now = new Date();
    const sessionId = `${payload.workOrderId}_${payload.serialBarcode}_${now.getTime()}`;
    const docData: Record<string, any> = {
      workOrderId: payload.workOrderId,
      lineId: payload.lineId,
      productId: payload.productId,
      serialBarcode: payload.serialBarcode,
      action: 'IN',
      sessionId,
      scanDate: toISODate(now),
      timestamp: serverTimestamp(),
    };
    if (payload.employeeId) docData.employeeId = payload.employeeId;
    const ref = await addDoc(collection(db, COLLECTION), docData);
    return { action: 'IN', eventId: ref.id, sessionId };
  },

  async scanOut(payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
    sessionId: string;
    cycleSeconds: number;
  }): Promise<ToggleScanResult> {
    if (!isConfigured) {
      return { action: 'OUT', eventId: null, sessionId: payload.sessionId, cycleSeconds: payload.cycleSeconds };
    }
    const now = new Date();
    const docData: Record<string, any> = {
      workOrderId: payload.workOrderId,
      lineId: payload.lineId,
      productId: payload.productId,
      serialBarcode: payload.serialBarcode,
      action: 'OUT',
      sessionId: payload.sessionId,
      cycleSeconds: payload.cycleSeconds,
      scanDate: toISODate(now),
      timestamp: serverTimestamp(),
    };
    if (payload.employeeId) docData.employeeId = payload.employeeId;
    const ref = await addDoc(collection(db, COLLECTION), docData);
    return { action: 'OUT', eventId: ref.id, sessionId: payload.sessionId, cycleSeconds: payload.cycleSeconds };
  },

  async toggleScan(payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
    timingConfig?: {
      breakStartTime?: string;
      breakEndTime?: string;
      pauseWindows?: WorkOrderPauseWindow[];
    };
  }): Promise<ToggleScanResult> {
    const serial = payload.serialBarcode.trim();
    if (!serial) throw new Error('Serial barcode is required');

    const nowMs = Date.now();
    const lockKey = `${payload.workOrderId}__${serial}`;
    const last = serialCooldown.get(lockKey) ?? 0;
    if (nowMs - last < SERIAL_SCAN_COOLDOWN_MS) {
      throw new Error('تم تجاهل المسح المتكرر السريع لنفس الباركود');
    }
    serialCooldown.set(lockKey, nowMs);

    const events = await this.getByWorkOrderAndSerial(payload.workOrderId, serial);
    const sorted = sortByTimestampAsc(events);
    const lastEvent = sorted[sorted.length - 1];

    if (!lastEvent || lastEvent.action === 'OUT') {
      return this.scanIn({ ...payload, serialBarcode: serial });
    }

    const cycleSeconds = computeEffectiveCycleSeconds({
      inAt: lastEvent.timestamp,
      outAtMs: Date.now(),
      breakStartTime: payload.timingConfig?.breakStartTime,
      breakEndTime: payload.timingConfig?.breakEndTime,
      pauseWindows: payload.timingConfig?.pauseWindows,
      minSeconds: 1,
    });
    return this.scanOut({
      ...payload,
      serialBarcode: serial,
      sessionId: lastEvent.sessionId,
      cycleSeconds,
    });
  },

  async buildWorkOrderSummary(workOrderId: string): Promise<WorkOrderScanSummaryResult> {
    const events = await this.getByWorkOrder(workOrderId);
    const sessions = sessionsFromEvents(events);
    const summary = summaryFromSessions(sessions);
    const openSessions = sessions.filter((s) => s.status === 'open');
    return { summary, sessions, openSessions };
  },

  async deleteSession(workOrderId: string, sessionId: string): Promise<void> {
    if (!isConfigured) return;
    const events = await this.getByWorkOrder(workOrderId);
    const related = events.filter((e) => e.sessionId === sessionId && e.id);
    await Promise.all(related.map((e) => deleteDoc(doc(db, COLLECTION, e.id!))));
  },

  subscribeByWorkOrder(workOrderId: string, onData: (events: WorkOrderScanEvent[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(collection(db, COLLECTION), where('workOrderId', '==', workOrderId));
    return onSnapshot(q, (snap) => {
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderScanEvent));
      onData(events);
    });
  },

  subscribeLiveToday(todayStr: string, onData: (events: WorkOrderScanEvent[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(collection(db, COLLECTION), where('scanDate', '==', todayStr));
    return onSnapshot(q, (snap) => {
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderScanEvent));
      onData(events);
    });
  },

  sessionsFromEvents,
  summaryFromSessions,
  computeEffectiveCycleSeconds,
};
