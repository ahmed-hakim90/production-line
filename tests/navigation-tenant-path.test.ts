/**
 * Navigation / tenant-path smoke tests for Phase 2 white-screen hardening helpers.
 * Run: npx --yes tsx tests/navigation-tenant-path.test.ts
 */
import { describe, expect, it } from './assertHarness.ts';
import {
  isDynamicImportLoadFailure,
  resolvePreferredTenantHomePath,
  resolvePreferredTenantSlug,
} from '../lib/navigationRecovery.ts';
import { tenantHomePath, tenantSlugFromPathname, withTenantPath } from '../lib/tenantPaths.ts';

describe('resolvePreferredTenantSlug', () => {
  it('prefers last visited slug over env default', () => {
    expect(
      resolvePreferredTenantSlug({
        lastVisitedSlug: 'acme-co',
        envDefaultSlug: 'sokany-eg',
      }),
    ).toBe('acme-co');
  });

  it('falls back to env default when last visited is empty', () => {
    expect(
      resolvePreferredTenantSlug({
        lastVisitedSlug: null,
        envDefaultSlug: 'demo-tenant',
      }),
    ).toBe('demo-tenant');
  });

  it('trims whitespace from last visited slug', () => {
    expect(
      resolvePreferredTenantSlug({
        lastVisitedSlug: '  north-plant  ',
        envDefaultSlug: 'sokany-eg',
      }),
    ).toBe('north-plant');
  });
});

describe('resolvePreferredTenantHomePath', () => {
  it('builds tenant home from preferred slug', () => {
    expect(
      resolvePreferredTenantHomePath({
        lastVisitedSlug: 'acme-co',
        envDefaultSlug: 'sokany-eg',
      }),
    ).toBe('/t/acme-co/');
  });

  it('matches tenantHomePath helper', () => {
    const slug = resolvePreferredTenantSlug({
      lastVisitedSlug: 'plant-b',
      envDefaultSlug: 'ignored',
    });
    expect(resolvePreferredTenantHomePath({ lastVisitedSlug: 'plant-b', envDefaultSlug: 'ignored' })).toBe(
      tenantHomePath(slug),
    );
  });
});

describe('tenantSlugFromPathname / withTenantPath', () => {
  it('extracts slug from tenant pathname', () => {
    expect(tenantSlugFromPathname('/t/acme-co/products')).toBe('acme-co');
    expect(tenantSlugFromPathname('/products')).toBeUndefined();
  });

  it('prefixes logical paths with tenant slug', () => {
    expect(withTenantPath('acme-co', '/materials')).toBe('/t/acme-co/materials');
    expect(withTenantPath('acme-co', '/')).toBe('/t/acme-co/');
  });
});

describe('isDynamicImportLoadFailure', () => {
  it('detects common dynamic import failure strings', () => {
    expect(isDynamicImportLoadFailure('Failed to fetch dynamically imported module')).toBeTruthy();
    expect(isDynamicImportLoadFailure('error loading dynamically imported module')).toBeTruthy();
    expect(isDynamicImportLoadFailure(new Error('Importing a module script failed.'))).toBeTruthy();
    expect(isDynamicImportLoadFailure(new Error('Failed to load module script'))).toBeTruthy();
    expect(
      isDynamicImportLoadFailure(new Error('Expected a JavaScript module script but the server responded with a MIME type of text/html')),
    ).toBeTruthy();
    expect(isDynamicImportLoadFailure(new Error('Loading chunk 12 failed'))).toBeTruthy();
  });

  it('ignores unrelated errors', () => {
    expect(isDynamicImportLoadFailure('NetworkError when attempting to fetch resource.')).toBeFalsy();
    expect(isDynamicImportLoadFailure(new Error('permission denied'))).toBeFalsy();
    expect(isDynamicImportLoadFailure(null)).toBeFalsy();
    expect(isDynamicImportLoadFailure(undefined)).toBeFalsy();
  });
});

console.log('navigation-tenant-path.test.ts: ok');
