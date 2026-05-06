import { useCallback, useEffect, useState } from 'react';

type UseAutoEntityCodeOptions = {
  /** When false, hook does not load preview */
  enabled: boolean;
  isEditMode: boolean;
  initialCode?: string;
  /** Fetches the next display code (not reserved). */
  peek: () => Promise<string>;
};

/**
 * Manages an auto-generated business code with optional lock for manual override.
 * Preview is best-effort; the authoritative code is assigned on save in the service layer.
 */
export function useAutoEntityCode({
  enabled,
  isEditMode,
  initialCode,
  peek,
}: UseAutoEntityCodeOptions) {
  const [code, setCode] = useState('');
  const [locked, setLocked] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (isEditMode) {
      setCode((initialCode ?? '').trim());
      setLocked(true);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void peek()
      .then((c) => {
        if (!cancelled) setCode(c);
      })
      .catch(() => {
        if (!cancelled) setCode('');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setLocked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, isEditMode, initialCode, peek]);

  const refreshPreview = useCallback(async () => {
    if (isEditMode) return;
    setIsLoading(true);
    try {
      const c = await peek();
      setCode(c);
      setLocked(true);
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, [isEditMode, peek]);

  const toggleLock = useCallback(() => {
    setLocked((v) => !v);
  }, []);

  return {
    code,
    setCode,
    locked,
    setLocked,
    toggleLock,
    refreshPreview,
    isLoading,
  };
}
