/** Firestore / Auth transport codes that often appear after a dropped connection. */
export function isTransientFirestoreError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  const text = `${code} ${message}`;
  return (
    text.includes('unavailable')
    || text.includes('deadline-exceeded')
    || text.includes('unauthenticated')
    || text.includes('permission-denied')
    || text.includes('cancelled')
    || text.includes('aborted')
    || text.includes('network')
    || text.includes('failed to fetch')
    || text.includes('err_connection')
    || text.includes('err_internet')
    || text.includes('err_network')
    || text.includes('err_quic')
    || text.includes('offline')
  );
}

export function shouldCoalesceNetworkRecovery(
  lastRecoveredAt: number,
  now: number,
  minIntervalMs = 4000,
): boolean {
  return lastRecoveredAt > 0 && now - lastRecoveredAt < minIntervalMs;
}
