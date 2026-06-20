import type { FirestoreRole, FirestoreUser } from '../types';

const APP_SESSION_CACHE_VERSION = 1;
const APP_SESSION_CACHE_PREFIX = `erp.appSession.v${APP_SESSION_CACHE_VERSION}`;
const APP_SESSION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type CachedAppSession = {
  uid: string;
  userEmail: string;
  userDisplayName: string;
  userProfile: FirestoreUser;
  role: FirestoreRole;
  tenantCompanyName?: string;
  cachedAt: number;
};

const cacheKeyForUid = (uid: string) => `${APP_SESSION_CACHE_PREFIX}.${uid}`;

export const readCachedAppSession = (uid: string): CachedAppSession | null => {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.localStorage.getItem(cacheKeyForUid(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAppSession;
    if (!parsed || parsed.uid !== uid || !parsed.userProfile || !parsed.role) return null;
    if (Date.now() - Number(parsed.cachedAt || 0) > APP_SESSION_CACHE_TTL_MS) {
      window.localStorage.removeItem(cacheKeyForUid(uid));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeCachedAppSession = (session: Omit<CachedAppSession, 'cachedAt'>) => {
  if (typeof window === 'undefined' || !session.uid) return;
  try {
    window.localStorage.setItem(
      cacheKeyForUid(session.uid),
      JSON.stringify({ ...session, cachedAt: Date.now() }),
    );
  } catch {
    // localStorage may be unavailable; cache is only a startup optimization.
  }
};

export const clearCachedAppSession = (uid?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (uid) {
      window.localStorage.removeItem(cacheKeyForUid(uid));
      return;
    }
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${APP_SESSION_CACHE_PREFIX}.`))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
};
