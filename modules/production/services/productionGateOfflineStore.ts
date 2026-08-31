import type { GateActionResult, GateEmployeePreview } from './productionGateService';

export type GateQueueStatus = 'pending' | 'syncing' | 'failed';

export interface CachedGateEmployee extends GateEmployeePreview {
  cachedAt: string;
}

export interface QueuedGateEvent {
  eventId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  expectedAction: 'exit' | 'entry';
  occurredAt: string;
  status: GateQueueStatus;
  attempts: number;
  error?: string;
  result?: GateActionResult;
}

interface GateOfflineState {
  employees: Record<string, CachedGateEmployee>;
  queue: QueuedGateEvent[];
  updatedAt: string;
}

const VERSION = 1;
const EMPTY: GateOfflineState = { employees: {}, queue: [], updatedAt: '' };
const keyFor = (scope: string) => `forgeops:production-gate:${VERSION}:${scope || 'unknown'}`;

const read = (scope: string): GateOfflineState => {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const value = JSON.parse(window.localStorage.getItem(keyFor(scope)) || 'null') as GateOfflineState | null;
    if (!value || !value.employees || !Array.isArray(value.queue)) return { ...EMPTY };
    return value;
  } catch {
    return { ...EMPTY };
  }
};

const write = (scope: string, state: GateOfflineState) => {
  window.localStorage.setItem(keyFor(scope), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
};

export const productionGateOfflineStore = {
  snapshot(scope: string) { return read(scope); },

  replaceEmployees(scope: string, employees: GateEmployeePreview[]) {
    const state = read(scope);
    const cachedAt = new Date().toISOString();
    state.employees = Object.fromEntries(employees.map((employee) => [employee.employeeCode, { ...employee, cachedAt }]));
    write(scope, state);
    return state;
  },

  cacheEmployee(scope: string, employee: GateEmployeePreview) {
    const state = read(scope);
    state.employees[employee.employeeCode] = { ...employee, cachedAt: new Date().toISOString() };
    write(scope, state);
  },

  preview(scope: string, employeeCode: string): CachedGateEmployee | null {
    const state = read(scope);
    const base = state.employees[employeeCode] || null;
    if (!base) return null;
    const pending = state.queue
      .filter((event) => event.employeeId === base.employeeId && event.status !== 'failed')
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const nextAction = pending.length ? (pending[pending.length - 1].expectedAction === 'exit' ? 'entry' : 'exit') : base.nextAction;
    return { ...base, nextAction, currentStatus: nextAction === 'entry' ? 'outside' : 'inside' };
  },

  enqueue(scope: string, employee: CachedGateEmployee, occurredAt = new Date().toISOString()): QueuedGateEvent {
    const state = read(scope);
    const event: QueuedGateEvent = {
      eventId: crypto.randomUUID(), employeeId: employee.employeeId, employeeCode: employee.employeeCode,
      employeeName: employee.employeeName, expectedAction: employee.nextAction, occurredAt,
      status: 'pending', attempts: 0,
    };
    state.queue.push(event);
    write(scope, state);
    return event;
  },

  update(scope: string, eventId: string, patch: Partial<QueuedGateEvent>) {
    const state = read(scope);
    state.queue = state.queue.map((event) => event.eventId === eventId ? { ...event, ...patch } : event);
    write(scope, state);
  },

  remove(scope: string, eventId: string) {
    const state = read(scope);
    state.queue = state.queue.filter((event) => event.eventId !== eventId);
    write(scope, state);
  },

  retry(scope: string, eventId: string) {
    this.update(scope, eventId, { status: 'pending', error: undefined });
  },
};
