import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PRODUCT_BRAND } from '@/lib/productBrand';
import { tenantSlugFromPathname, tenantHomePath } from '@/lib/tenantPaths';
import { getLastVisitedTenantSlug, setLastVisitedTenantSlug } from '@/lib/lastTenantSlugStorage';

const THEME_COLOR = '#8f2424';

/** Blob manifests resolve relative paths against `blob:` — always use absolute http(s) URLs. */
function absoluteUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return new URL(path, `${origin}/`).href;
}

function buildManifest(startPath: string): Record<string, unknown> {
  const icon192 = absoluteUrl('/icons/forgeops-app-icon-192.png');
  const icon512 = absoluteUrl('/icons/forgeops-app-icon-512.png');
  return {
    name: PRODUCT_BRAND.name,
    short_name: PRODUCT_BRAND.name,
    description: 'Factory operations platform — production, inventory, repair, and HR',
    theme_color: THEME_COLOR,
    background_color: '#f8fafc',
    display: 'standalone',
    scope: absoluteUrl('/'),
    start_url: absoluteUrl(startPath),
    lang: 'ar',
    orientation: 'any',
    icons: [
      {
        src: icon192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

/**
 * While the operator is inside `/t/{slug}/…`, rewrite the web manifest so
 * "Add to Home Screen" opens the company home — not the marketing landing.
 * Also remembers the slug early (before tenant gate finishes loading).
 */
export function TenantPwaManifestSync() {
  const location = useLocation();
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const pathSlug = tenantSlugFromPathname(location.pathname);
    if (pathSlug) {
      setLastVisitedTenantSlug(pathSlug);
    }

    const slug = pathSlug || getLastVisitedTenantSlug();
    const startPath = slug ? tenantHomePath(slug) : '/';
    const manifest = buildManifest(startPath);
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const nextUrl = URL.createObjectURL(blob);

    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = nextUrl;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    blobUrlRef.current = nextUrl;

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return null;
}
