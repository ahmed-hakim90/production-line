import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isConfigured as firebaseConfigured,
  listBostaDeliveriesForRangeCallable,
  type BostaApiDeliveryRow,
} from '../../auth/services/firebase';

/** Bump refetchNonce or dispatch this on `window` to refetch the Bosta API list without changing the date range. */
export const ONLINE_DISPATCH_BOSTA_INVALIDATE_EVENT = 'online-dispatch-bosta-invalidate';

const DEBOUNCE_MS = 220;

/** أقل فترة مسموحة بين طلبات تلقائية حتى لا نضغط على بوسطة/الدوال. */
const MIN_POLL_INTERVAL_MS = 15_000;

export type UseBostaDeliveriesForRangeOptions = {
  /** When true, do not call the API (parent supplies the same data, e.g. OnlineDashboard). */
  skip?: boolean;
  /**
   * إعادة جلب قائمة بوسطة (API) تلقائيًا كل N ms — يحدّث عمود حالة الـ API في الجدول.
   * لا يعمل والتاب مخفي. الحد الأدنى ١٥ ثانية.
   */
  pollIntervalMs?: number;
};

/**
 * Fetches Bosta deliveries created in the local YMD range (debounced). Same semantics as KPI count.
 * @param refetchNonce Increment to force a refetch (e.g. after a successful warehouse/post scan).
 */
export function useBostaDeliveriesForRange(
  rangeFrom: string,
  rangeTo: string,
  refetchNonce = 0,
  options?: UseBostaDeliveriesForRangeOptions,
): {
  items: BostaApiDeliveryRow[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
} {
  const { t } = useTranslation();
  const [items, setItems] = useState<BostaApiDeliveryRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const skip = options?.skip === true;
  const pollMs = options?.pollIntervalMs;

  useEffect(() => {
    if (skip || !pollMs || pollMs < MIN_POLL_INTERVAL_MS) return;
    const interval = Math.max(MIN_POLL_INTERVAL_MS, pollMs);
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setPollTick((n) => n + 1);
    }, interval);
    return () => window.clearInterval(id);
  }, [skip, pollMs]);

  useEffect(() => {
    if (skip) {
      setItems([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    if (!firebaseConfigured) {
      setItems([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listBostaDeliveriesForRangeCallable({ rangeFrom, rangeTo })
        .then((r) => {
          if (!cancelled) {
            setItems(r.items);
            setTruncated(r.truncated);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setItems([]);
            setTruncated(false);
            setError(e instanceof Error ? e.message : t('onlineDispatchDashboard.bostaListLoadError'));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rangeFrom, rangeTo, refetchNonce, pollTick, skip, t]);

  return { items, truncated, loading, error };
}
