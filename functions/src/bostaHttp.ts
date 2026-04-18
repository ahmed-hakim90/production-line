/**
 * Minimal Bosta REST client (api/v0) — mirrors official Node SDK URL/auth.
 * @see https://github.com/bostaapp/bosta-nodejs
 */

const DEFAULT_BASE = 'https://app.bosta.co';

/** Midnight calendar days — legacy; prefer `parseYmdRangeToDispatchDayLocalBounds` for online/Bosta. */
export function parseYmdRangeToLocalBounds(
  fromYmd: string,
  toYmd: string,
): { startMs: number; endMs: number } {
  const parseDay = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
    return { startMs: start.getTime(), endMs: end.getTime() };
  };
  const a = parseDay(fromYmd);
  const b = parseDay(toYmd);
  if (a.startMs <= b.startMs) return { startMs: a.startMs, endMs: b.endMs };
  return { startMs: b.startMs, endMs: a.endMs };
}

/**
 * يوم تشغيل محلي يبدأ `boundaryHour` (افتراضي ٨) — مطابق لـ `modules/online/utils/dateRange.ts` parseYmdRangeToDispatchDayLocalBounds.
 */
export function parseYmdRangeToDispatchDayLocalBounds(
  fromYmd: string,
  toYmd: string,
  boundaryHour: number = 8,
): { startMs: number; endMs: number } {
  const parseDayStart = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1, boundaryHour, 0, 0, 0);
  };
  let start = parseDayStart(fromYmd);
  let endDayStart = parseDayStart(toYmd);
  if (start.getTime() > endDayStart.getTime()) {
    const t = start;
    start = endDayStart;
    endDayStart = t;
  }
  const startMs = start.getTime();
  const endExclusive = new Date(endDayStart);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const endMs = endExclusive.getTime() - 1;
  return { startMs, endMs };
}

export type BostaDeliveryLike = Record<string, unknown>;

export function getBostaBaseUrl(): string {
  const raw = String(process.env.BOSTA_BASE_URL || '').trim();
  return raw.replace(/\/+$/, '') || DEFAULT_BASE;
}

/** Parse created timestamp from a delivery object (field names vary by API version). */
export function bostaDeliveryCreatedAtMs(d: BostaDeliveryLike): number | null {
  const candidates = [
    d.createdAt,
    d.creationTimestamp,
    d.created_at,
    d.timestamp,
    (d as { creationDate?: unknown }).creationDate,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === 'number' && Number.isFinite(c)) {
      return c > 1e12 ? c : c * 1000;
    }
    if (typeof c === 'string') {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return t;
    }
    if (typeof c === 'object' && c !== null && '_seconds' in (c as object)) {
      const sec = Number((c as { _seconds?: number })._seconds);
      if (Number.isFinite(sec)) return sec * 1000;
    }
  }
  return null;
}

/**
 * Best-effort state label for KPI / table.
 * Bosta غالبًا ترجع `state` ككائن { value / name / code } وليس string — بدون ذلك يظهر العمود «مزامنة» فقط بدون نص حالة.
 */
export function bostaDeliveryStateLabel(d: BostaDeliveryLike, depth = 0): string | null {
  if (!d || typeof d !== 'object' || depth > 6) return null;

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  const fromStateLike = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return str(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      return (
        str(o.value) ??
        str(o.name) ??
        str(o.label) ??
        str(o.enName) ??
        str(o.arName) ??
        str(o.description) ??
        (typeof o.code === 'number' || typeof o.code === 'string' ? String(o.code) : null)
      );
    }
    return null;
  };

  const directKeys = [
    'state',
    'State',
    'status',
    'Status',
    'maskedState',
    'deliveryState',
    'lastState',
    'currentState',
    'stateName',
    'statusName',
    'trackingState',
  ] as const;
  for (const k of directKeys) {
    const got = fromStateLike((d as Record<string, unknown>)[k]);
    if (got) return got;
  }

  const code = d.stateCode ?? d.statusCode;
  if (typeof code === 'number' || typeof code === 'string') return String(code);

  const wrapKeys = ['delivery', 'data', 'shipment', 'payload', 'result', 'message'] as const;
  for (const k of wrapKeys) {
    const v = (d as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = bostaDeliveryStateLabel(v as BostaDeliveryLike, depth + 1);
      if (inner) return inner;
    }
  }

  const timeline = (d as { timeline?: unknown }).timeline;
  if (Array.isArray(timeline) && timeline.length > 0) {
    const last = timeline[timeline.length - 1];
    if (last && typeof last === 'object') {
      const tlast = bostaDeliveryStateLabel(last as BostaDeliveryLike, depth + 1);
      if (tlast) return tlast;
    }
  }

  return null;
}

function normalizeListPayload(data: unknown): BostaDeliveryLike[] {
  if (Array.isArray(data)) return data as BostaDeliveryLike[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.deliveries)) return o.deliveries as BostaDeliveryLike[];
    if (Array.isArray(o.data)) return o.data as BostaDeliveryLike[];
    if (Array.isArray((o as { message?: unknown }).message)) {
      return (o as { message: BostaDeliveryLike[] }).message;
    }
  }
  return [];
}

async function bostaFetchJson(
  apiKey: string,
  path: string,
  init?: RequestInit & {
    query?: Record<string, string | number | undefined>;
    allow404?: boolean;
  },
): Promise<unknown> {
  const base = getBostaBaseUrl();
  const url = new URL(`${base}/api/v0/${path.replace(/^\//, '')}`);
  const allow404 = init?.allow404 === true;
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const { query: _q, allow404: _a, ...restInit } = init || {};
  const res = await fetch(url.toString(), {
    ...restInit,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'X-Requested-By': 'pro-tech-erp-functions',
      ...(restInit.headers || {}),
    },
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`بوسطة: استجابة غير JSON (${res.status})`);
  }
  if (res.status === 404 && allow404) {
    return null;
  }
  if (!res.ok) {
    const msg =
      parsed &&
      typeof parsed === 'object' &&
      'message' in parsed &&
      typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : `HTTP ${res.status}`;
    throw new Error(`بوسطة: ${msg}`);
  }
  if (parsed && typeof parsed === 'object' && 'success' in parsed && (parsed as { success?: boolean }).success === false) {
    const fail = parsed as { message?: unknown };
    const msg = typeof fail.message === 'string' ? fail.message : 'طلب بوسطة فشل';
    throw new Error(`بوسطة: ${msg}`);
  }
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return (parsed as { data: unknown }).data;
  }
  if (parsed && typeof parsed === 'object' && 'message' in parsed && !('data' in parsed)) {
    return (parsed as { message: unknown }).message;
  }
  return parsed;
}

/** رقم التتبع من كائن التوصيل (تختلف أسماء الحقول بين إصدارات API). */
export function bostaTrackingNumberFromDelivery(d: BostaDeliveryLike): string | null {
  const raw =
    (d as { trackingNumber?: unknown }).trackingNumber ??
    (d as { TrackingNumber?: unknown }).TrackingNumber ??
    (d as { tracking?: unknown }).tracking ??
    (d as { _id?: unknown })._id;
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length >= 6 && s.length <= 15) return s;
  const loose = String(raw ?? '').trim();
  if (/^\d{6,15}$/.test(loose)) return loose;
  return null;
}

export type BostaDeliveryListItem = {
  trackingNumber: string;
  createdAtMs: number;
  stateLabel: string | null;
};

/**
 * Lists deliveries whose creation time falls in [startMs, endMs] (inclusive).
 * Stops when `maxItems` reached (`truncated: true`) or API pages exhausted.
 */
export async function listBostaDeliveriesCreatedInRange(
  apiKey: string,
  startMs: number,
  endMs: number,
  opts?: { pageSize?: number; maxPages?: number; maxItems?: number },
): Promise<{ items: BostaDeliveryListItem[]; truncated: boolean }> {
  const pageSize = Math.min(200, Math.max(10, opts?.pageSize ?? 50));
  const maxPages = Math.min(500, Math.max(1, opts?.maxPages ?? 200));
  const maxItems = Math.min(5000, Math.max(1, opts?.maxItems ?? 2000));
  const items: BostaDeliveryListItem[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    if (items.length >= maxItems) {
      truncated = true;
      break;
    }
    const data = await bostaFetchJson(apiKey, 'deliveries', {
      method: 'GET',
      query: { page, limit: pageSize },
    });
    const list = normalizeListPayload(data);
    if (list.length === 0) break;
    for (const raw of list) {
      if (items.length >= maxItems) {
        truncated = true;
        break;
      }
      const d = raw as BostaDeliveryLike;
      const t = bostaDeliveryCreatedAtMs(d);
      if (t == null || t < startMs || t > endMs) continue;
      const tn = bostaTrackingNumberFromDelivery(d);
      if (!tn || seen.has(tn)) continue;
      seen.add(tn);
      items.push({
        trackingNumber: tn,
        createdAtMs: t,
        stateLabel: bostaDeliveryStateLabel(d),
      });
    }
    if (truncated) break;
    if (list.length < pageSize) break;
  }

  items.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return { items, truncated };
}

/**
 * Count deliveries whose creation time falls in [startMs, endMs] (inclusive).
 * Paginates until the page is shorter than limit or maxPages reached.
 */
export async function countBostaDeliveriesCreatedInRange(
  apiKey: string,
  startMs: number,
  endMs: number,
  opts?: { pageSize?: number; maxPages?: number },
): Promise<number> {
  const pageSize = Math.min(200, Math.max(10, opts?.pageSize ?? 50));
  const maxPages = Math.min(500, Math.max(1, opts?.maxPages ?? 200));
  let count = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await bostaFetchJson(apiKey, 'deliveries', {
      method: 'GET',
      query: { page, limit: pageSize },
    });
    const list = normalizeListPayload(data);
    if (list.length === 0) break;
    for (const d of list) {
      const t = bostaDeliveryCreatedAtMs(d);
      if (t != null && t >= startMs && t <= endMs) count += 1;
    }
    if (list.length < pageSize) break;
  }
  return count;
}

export async function bostaGetDeliveryByTracking(
  apiKey: string,
  trackingNumber: string,
): Promise<BostaDeliveryLike | null> {
  const tn = String(trackingNumber || '').trim();
  if (!tn) return null;
  const data = await bostaFetchJson(apiKey, `deliveries/${encodeURIComponent(tn)}`, {
    method: 'GET',
    allow404: true,
  });
  let merged: BostaDeliveryLike | null =
    data && typeof data === 'object' ? (data as BostaDeliveryLike) : null;
  /** Official SDK also exposes `deliveries/:id/tracking` — merge if main payload has no state. */
  if (merged && !bostaDeliveryStateLabel(merged)) {
    const track = await bostaFetchJson(apiKey, `deliveries/${encodeURIComponent(tn)}/tracking`, {
      method: 'GET',
      allow404: true,
    });
    if (track && typeof track === 'object') {
      merged = { ...merged, ...(track as BostaDeliveryLike) };
    }
  }
  return merged;
}
