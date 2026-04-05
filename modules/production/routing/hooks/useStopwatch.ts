import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Stopwatch: accumulated time + optional running segment (performance.now).
 * `elapsedSeconds` updates ~4fps while running for UI; capture with `stopAndCaptureSeconds` before persist.
 */
export function useStopwatch() {
  const accumulatedMsRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [tick, setTick] = useState(0);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const elapsedMs = useMemo(() => {
    let ms = accumulatedMsRef.current;
    if (runningSinceRef.current != null) {
      ms += performance.now() - runningSinceRef.current;
    }
    return ms;
  }, [tick]);

  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => bump(), 250);
    return () => window.clearInterval(id);
  }, [isRunning, bump]);

  const startOrResume = useCallback(() => {
    if (runningSinceRef.current != null) return;
    runningSinceRef.current = performance.now();
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (runningSinceRef.current == null) return;
    accumulatedMsRef.current += performance.now() - runningSinceRef.current;
    runningSinceRef.current = null;
    setIsRunning(false);
    bump();
  }, [bump]);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    runningSinceRef.current = null;
    setIsRunning(false);
    bump();
  }, [bump]);

  const syncFromSeconds = useCallback(
    (seconds: number) => {
      accumulatedMsRef.current = Math.max(0, Math.floor(seconds)) * 1000;
      runningSinceRef.current = null;
      setIsRunning(false);
      bump();
    },
    [bump],
  );

  /** Pause if running; return whole seconds (same value shown in UI). */
  const stopAndCaptureSeconds = useCallback(() => {
    if (runningSinceRef.current != null) {
      accumulatedMsRef.current += performance.now() - runningSinceRef.current;
      runningSinceRef.current = null;
    }
    setIsRunning(false);
    const s = Math.max(0, Math.floor(accumulatedMsRef.current / 1000));
    bump();
    return s;
  }, [bump]);

  return {
    elapsedSeconds,
    isRunning,
    startOrResume,
    pause,
    reset,
    syncFromSeconds,
    stopAndCaptureSeconds,
  };
}
