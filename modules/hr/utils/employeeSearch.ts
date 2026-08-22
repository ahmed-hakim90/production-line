import type { FirestoreEmployee } from '@/types';
import { matchesFirestoreSearch, normalizeFirestoreSearch } from '@/lib/firestoreSearch';

export function matchesEmployeeSearch(employee: FirestoreEmployee, query: unknown): boolean {
  const normalized = normalizeFirestoreSearch(query);
  if (!normalized) return true;
  return [employee.name, employee.code, employee.phone, employee.email]
    .some((value) => matchesFirestoreSearch(value, normalized));
}

/**
 * Confirms the complete phrase locally and supplements indexed results from the
 * already-loaded employee cache. The cache path keeps legacy documents that do
 * not have searchPrefixes searchable until the backfill is applied.
 */
export function mergeEmployeeSearchResults(
  indexedRows: readonly FirestoreEmployee[],
  cachedRows: readonly FirestoreEmployee[],
  query: unknown,
): FirestoreEmployee[] {
  const normalized = normalizeFirestoreSearch(query);
  if (!normalized) return [...indexedRows];

  const merged = new Map<string, FirestoreEmployee>();
  for (const employee of [...indexedRows, ...cachedRows]) {
    if (!matchesEmployeeSearch(employee, normalized)) continue;
    const key = String(employee.id || '').trim();
    if (key) merged.set(key, employee);
  }
  return Array.from(merged.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar'),
  );
}
