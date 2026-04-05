/** Display Firestore Timestamp / serverTimestamp / ISO-ish values in the UI. */
export function formatRoutingFirestoreInstant(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const s = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(s)) {
      return new Date(s * 1000).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
    }
  }
  const d = new Date(value as string | number);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}
