import { eventBus, SystemEvents } from '../../../../shared/events';

const CLICK_DEDUP_WINDOW_MS = 1500;
const SESSION_STORAGE_KEY = 'system.audit.session_id';

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const buildCorrelationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getRoute = (): string => {
  const path = `${window.location.pathname}${window.location.search}`;
  return path || '/';
};

const deriveModule = (route: string): string => {
  if (!route || route === '/') return 'dashboard';
  const first = route.split('?')[0].split('/').filter(Boolean)[0];
  return first || 'dashboard';
};

const sanitizeText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, 120);

const getElementLabel = (element: HTMLElement): string => {
  const fromData = element.getAttribute('data-modal-key') || element.getAttribute('aria-label');
  if (fromData) return sanitizeText(fromData);
  const fromText = sanitizeText(element.innerText || element.textContent || '');
  if (fromText) return fromText;
  const name = element.getAttribute('name');
  if (name) return sanitizeText(name);
  const id = element.getAttribute('id');
  if (id) return `#${sanitizeText(id)}`;
  return sanitizeText(element.tagName.toLowerCase());
};

type TrackerState = {
  running: boolean;
  uid: string;
  userName: string;
  sessionId: string;
  startedAtIso: string;
  clickFingerprintAtMs: Map<string, number>;
  unsubs: Array<() => void>;
};

const state: TrackerState = {
  running: false,
  uid: '',
  userName: '',
  sessionId: '',
  startedAtIso: '',
  clickFingerprintAtMs: new Map<string, number>(),
  unsubs: [],
};

const emitUserAction = (
  action: string,
  description: string,
  payload: {
    module?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): void => {
  if (!state.running || !state.uid) return;
  const nowIso = new Date().toISOString();
  const correlationId = buildCorrelationId();
  eventBus.emit(SystemEvents.USER_ACTION, {
    module: payload.module ?? 'system',
    action,
    entityType: payload.entityType ?? 'user_session',
    entityId: payload.entityId ?? state.uid,
    description,
    actor: {
      userId: state.uid,
      userName: state.userName,
    },
    metadata: {
      sessionId: state.sessionId,
      sessionStartedAt: state.startedAtIso,
      ...payload.metadata,
    },
  });
  eventBus.emit(SystemEvents.OPERATION_STATUS, {
    module: payload.module ?? 'system',
    action,
    entityType: payload.entityType ?? 'user_session',
    entityId: payload.entityId ?? state.uid,
    description,
    actor: {
      userId: state.uid,
      userName: state.userName,
    },
    metadata: {
      sessionId: state.sessionId,
      sessionStartedAt: state.startedAtIso,
      ...payload.metadata,
    },
    correlationId,
    operation: action,
    status: 'succeeded',
    startedAt: nowIso,
    endedAt: nowIso,
    durationMs: 0,
  });
};

const startDomTracking = (): Array<() => void> => {
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const clickable = target.closest('button, a, [role="button"], [data-modal-key], input[type="submit"]') as HTMLElement | null;
    if (!clickable) return;
    const route = getRoute();
    const label = getElementLabel(clickable);
    if (!label) return;
    const fingerprint = `${route}|${clickable.tagName}|${label}`;
    const now = Date.now();
    const lastAt = state.clickFingerprintAtMs.get(fingerprint) || 0;
    if (now - lastAt < CLICK_DEDUP_WINDOW_MS) return;
    state.clickFingerprintAtMs.set(fingerprint, now);

    emitUserAction('click', `Clicked "${label}"`, {
      module: deriveModule(route),
      entityType: 'ui_interaction',
      entityId: route,
      metadata: {
        route,
        label,
        tagName: clickable.tagName.toLowerCase(),
      },
    });
  };

  document.addEventListener('click', onClick, true);

  return [() => document.removeEventListener('click', onClick, true)];
};

export const sessionTrackerService = {
  /** Called when the SPA route changes (React Router history), for audit trail. */
  onAppRouteChange(route: string): void {
    if (!state.running) return;
    emitUserAction('navigate', `Navigation to ${route}`, {
      module: deriveModule(route),
      entityType: 'route',
      entityId: route,
      metadata: { route },
    });
  },

  start(params: { uid: string; userName?: string }): void {
    const nextName = params.userName || params.uid;

    if (state.running && state.uid === params.uid) {
      state.userName = nextName;
      return;
    }

    if (state.running && state.uid !== params.uid) {
      this.stop('switch_user');
    }

    const existingSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const sessionId = existingSessionId || buildSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);

    state.running = true;
    state.uid = params.uid;
    state.userName = nextName;
    state.sessionId = sessionId;
    state.startedAtIso = new Date().toISOString();
    state.clickFingerprintAtMs.clear();
    state.unsubs = startDomTracking();

    const route = getRoute();
    emitUserAction('session.login', 'User session started', {
      module: 'system',
      entityType: 'user_session',
      entityId: params.uid,
      metadata: { route },
    });
  },

  stop(reason: string = 'session.end'): void {
    if (!state.running) return;

    const route = getRoute();
    emitUserAction('session.logout', 'User session ended', {
      module: 'system',
      entityType: 'user_session',
      entityId: state.uid,
      metadata: {
        route,
        reason,
      },
    });

    state.unsubs.forEach((unsub) => unsub());
    state.unsubs = [];
    state.running = false;
    state.uid = '';
    state.userName = '';
    state.sessionId = '';
    state.startedAtIso = '';
    state.clickFingerprintAtMs.clear();
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  },
};
