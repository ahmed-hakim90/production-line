import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { WorkOrderLiveSummary, WorkOrderScanEvent, WorkOrderScanSession } from '../types';

const COLLECTION = 'scan_events';
const SERIAL_SCAN_COOLDOWN_MS = 1200;
const serialCooldown = new Map<string, number>();

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
  const workers = new Set(
    sessions
      .map((s) => s.employeeId)
      .filter((id): id is string => !!id && id.trim().length > 0),
  );
  const avgCycleSeconds = completed.length > 0
    ? Math.round(completed.reduce((acc, s) => acc + (s.cycleSeconds || 0), 0) / completed.length)
    : 0;
  const lastScanAt = sessions.length > 0
    ? sessions
        .map((s) => (s.outAt ? s.outAt : s.inAt))
        .sort((a, b) => toMillis(b) - toMillis(a))[0]
    : undefined;

  return {
    completedUnits: completed.length,
    inProgressUnits: active.length,
    activeWorkers: workers.size,
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
    if (!isConfigured) return { action: 'OUT', eventId: null, sessionId: payload.sessionId, cycleSeconds: payload.cycleSeconds };
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

    const inAtMs = toMillis(lastEvent.timestamp);
    const cycleSeconds = Math.max(1, Math.floor((Date.now() - inAtMs) / 1000));
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
};

