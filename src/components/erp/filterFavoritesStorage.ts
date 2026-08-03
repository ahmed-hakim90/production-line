export type FilterFavoriteSnapshot = {
  search: string;
  period?: string;
  values: Record<string, string>;
  visibleKeys: string[];
};

export type FilterFavorite = {
  id: string;
  name: string;
  /** When true, applied automatically on page load (one pinned favorite per page). */
  pinned: boolean;
  createdAt: number;
  snapshot: FilterFavoriteSnapshot;
};

const STORAGE_PREFIX = 'erp.filterFavorites.v1:';
const MAX_FAVORITES_PER_PAGE = 20;

function storageKey(pageId: string): string {
  return `${STORAGE_PREFIX}${pageId}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isFavorite(value: unknown): value is FilterFavorite {
  if (!value || typeof value !== 'object') return false;
  const item = value as FilterFavorite;
  return (
    typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.pinned === 'boolean'
    && typeof item.createdAt === 'number'
    && item.snapshot != null
    && typeof item.snapshot === 'object'
    && typeof item.snapshot.search === 'string'
    && item.snapshot.values != null
    && typeof item.snapshot.values === 'object'
    && Array.isArray(item.snapshot.visibleKeys)
  );
}

export function loadFavorites(pageId: string): FilterFavorite[] {
  if (!pageId || !canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(pageId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavorite).slice(0, MAX_FAVORITES_PER_PAGE);
  } catch {
    return [];
  }
}

export function saveFavorites(pageId: string, favorites: FilterFavorite[]): void {
  if (!pageId || !canUseStorage()) return;
  try {
    const trimmed = favorites.slice(0, MAX_FAVORITES_PER_PAGE);
    window.localStorage.setItem(storageKey(pageId), JSON.stringify(trimmed));
  } catch {
    // localStorage may be full or unavailable
  }
}

export function upsertFavorite(
  pageId: string,
  favorite: FilterFavorite,
  options?: { pinExclusive?: boolean },
): FilterFavorite[] {
  const existing = loadFavorites(pageId);
  let next = existing.filter((item) => item.id !== favorite.id);

  if (options?.pinExclusive !== false && favorite.pinned) {
    next = next.map((item) => ({ ...item, pinned: false }));
  }

  next = [favorite, ...next].slice(0, MAX_FAVORITES_PER_PAGE);
  // Pinned first, then newest
  next.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  saveFavorites(pageId, next);
  return next;
}

export function deleteFavorite(pageId: string, favoriteId: string): FilterFavorite[] {
  const next = loadFavorites(pageId).filter((item) => item.id !== favoriteId);
  saveFavorites(pageId, next);
  return next;
}

export function setFavoritePinned(
  pageId: string,
  favoriteId: string,
  pinned: boolean,
): FilterFavorite[] {
  const existing = loadFavorites(pageId);
  const next = existing.map((item) => ({
    ...item,
    pinned: item.id === favoriteId ? pinned : (pinned ? false : item.pinned),
  }));
  next.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  saveFavorites(pageId, next);
  return next;
}

export function getPinnedFavorite(pageId: string): FilterFavorite | null {
  return loadFavorites(pageId).find((item) => item.pinned) ?? null;
}

export function createFavoriteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
