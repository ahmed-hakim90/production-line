import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/Toast';

const DRAFT_VERSION = 1;

export type UseLocalFormDraftOptions<T> = {
  /** Stable business key, e.g. `repair:newJob`. */
  formKey: string;
  tenantId?: string | null;
  userId?: string | null;
  /** Current form value to persist. */
  value: T;
  /** When false, skip restore and writes (e.g. call-center prefill wins). */
  enabled?: boolean;
  /** Treat value as empty → remove storage instead of writing. */
  isEmpty?: (value: T) => boolean;
  debounceMs?: number;
  /** Apply a restored draft once after mount. */
  onRestore?: (value: T) => void;
  /** Show restore toast (default true). */
  showRestoreToast?: boolean;
  restoreToastMessage?: string;
};

export type UseLocalFormDraftResult = {
  restored: boolean;
  hasDraft: boolean;
  clearDraft: () => void;
};

const buildStorageKey = (formKey: string, tenantId?: string | null, userId?: string | null): string =>
  `formDraft.v${DRAFT_VERSION}.${formKey}.${tenantId || 'tenant'}.${userId || 'user'}`;

const readStored = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return parsed == null ? null : parsed;
  } catch {
    return null;
  }
};

const writeStored = <T,>(key: string, value: T | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — never block form entry.
  }
};

const defaultIsEmpty = <T,>(value: T): boolean => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((entry) => {
      if (entry == null) return true;
      if (typeof entry === 'string') return entry.trim() === '';
      if (Array.isArray(entry)) return entry.length === 0;
      return false;
    });
  }
  return false;
};

/**
 * Persist operator form input in localStorage and restore after refresh.
 * Scoped by tenant + user. Never treat drafts as authorization or server truth.
 */
export function useLocalFormDraft<T>(options: UseLocalFormDraftOptions<T>): UseLocalFormDraftResult {
  const {
    formKey,
    tenantId,
    userId,
    value,
    enabled = true,
    isEmpty = defaultIsEmpty,
    debounceMs = 400,
    onRestore,
    showRestoreToast = true,
    restoreToastMessage = 'تم استعادة آخر مسودة محلية',
  } = options;

  const storageKey = buildStorageKey(formKey, tenantId, userId);
  const [restored, setRestored] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  const restoredKeyRef = useRef<string | null>(null);
  const didToastRef = useRef(false);
  const skipNextWriteRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const valueRef = useRef(value);
  valueRef.current = value;

  const clearDraft = useCallback(() => {
    writeStored(storageKey, null);
    setHasDraft(false);
    skipNextWriteRef.current = true;
  }, [storageKey]);

  // Restore once per enable cycle for the current storage key.
  useEffect(() => {
    if (!enabled) {
      // Allow a fresh restore the next time this form becomes enabled (e.g. modal re-open).
      if (restoredKeyRef.current === storageKey) {
        restoredKeyRef.current = null;
      }
      setRestored(false);
      return;
    }
    if (restoredKeyRef.current === storageKey) return;

    const stored = readStored<T>(storageKey);
    restoredKeyRef.current = storageKey;

    if (stored != null && !isEmptyRef.current(stored)) {
      skipNextWriteRef.current = true;
      onRestoreRef.current?.(stored);
      setRestored(true);
      setHasDraft(true);
      if (showRestoreToast && !didToastRef.current) {
        didToastRef.current = true;
        toast.info(restoreToastMessage, { duration: 5000 });
      }
      return;
    }

    setRestored(false);
    setHasDraft(false);
  }, [enabled, storageKey, showRestoreToast, restoreToastMessage]);

  // Debounced persist — compare serialized content so parent inline objects do not thrash.
  const valueSerialized = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (!enabled) return;
    if (restoredKeyRef.current !== storageKey) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const current = valueRef.current;
      if (isEmptyRef.current(current)) {
        writeStored(storageKey, null);
        setHasDraft(false);
        return;
      }
      writeStored(storageKey, current);
      setHasDraft(true);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [enabled, storageKey, valueSerialized, debounceMs]);

  // Reset toast flag when tenant/user/form changes.
  useEffect(() => {
    didToastRef.current = false;
  }, [storageKey]);

  return { restored, hasDraft, clearDraft };
}
