import type { QueryDocumentSnapshot } from 'firebase/firestore';

export type FirestoreCursor = QueryDocumentSnapshot;

export interface CursorListRequest<TFilters extends Record<string, unknown> = Record<string, never>> {
  pageSize: 20 | 50;
  cursor: FirestoreCursor | null;
  search?: string;
  filters: TFilters;
  sort: { field: string; direction: 'asc' | 'desc' };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: FirestoreCursor | null;
  hasNext: boolean;
}
