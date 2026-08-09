import { purgeServiceWorkersAndCaches } from './clientCachePurge';

const SW_RELOAD_PARAM = '_sw_reload';

export type HardClientReloadTargetInput = {
  /** Absolute or root-relative path, optionally with search/hash. */
  path?: string;
  /** Defaults to current location when available. */
  currentHref?: string;
  /** Cache-bust timestamp. */
  now?: number | string;
  origin?: string;
};

/**
 * Build the post-purge navigation URL.
 * Keeps the user on the page they were opening (SPA rewrites serve index.html).
 * Falls back to `/` only when no safe path is available.
 */
export function buildHardClientReloadHref(input: HardClientReloadTargetInput = {}): string {
  const origin =
    (input.origin || (typeof window !== 'undefined' ? window.location.origin : '') || 'http://localhost').replace(
      /\/$/,
      '',
    );
  const fallbackBase = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

  let raw =
    (input.path || '').trim() ||
    (input.currentHref
      ? (() => {
          try {
            const u = new URL(input.currentHref, origin);
            return `${u.pathname}${u.search}${u.hash}`;
          } catch {
            return '';
          }
        })()
      : '') ||
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '') ||
    fallbackBase ||
    '/';

  if (!raw.startsWith('/') && !/^https?:\/\//i.test(raw)) {
    raw = `/${raw}`;
  }

  const url = new URL(raw, origin);
  url.searchParams.delete(SW_RELOAD_PARAM);
  url.searchParams.set(SW_RELOAD_PARAM, String(input.now ?? Date.now()));
  return url.href;
}

/**
 * Unregisters service workers, clears Cache Storage, then reloads the app.
 * Uses `location.replace` (not `reload`) so the document request is a normal navigation
 * after SW removal — safer on hosts that briefly mis-resolve client routes.
 *
 * Preserves the current path so a failed lazy chunk does not dump the user on home.
 */
export async function hardClientReload(options?: { path?: string }): Promise<void> {
  await purgeServiceWorkersAndCaches();

  const href = buildHardClientReloadHref({
    path: options?.path,
    currentHref: typeof window !== 'undefined' ? window.location.href : undefined,
  });
  window.location.replace(href);
}
