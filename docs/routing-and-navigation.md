# Routing and navigation

Canonical English.

## Tenant URL shape

- Pattern: `/t/:tenantSlug/...` helpers in `lib/tenantPaths.ts` (`tenantHomePath`, `tenantSlugFromPathname`, `defaultTenantSlug`).
- Last-visited slug: `lib/lastTenantSlugStorage.ts`; preferred home: `lib/navigationRecovery.ts` → `resolvePreferredTenantHomePath()`.
- Root `/` (`RootEntryOrLanding` in `App.tsx`): if a last-visited slug exists → tenant home; otherwise public marketing `LandingPage` (`modules/auth/pages/LandingPage.tsx`).
- `App.tsx` gates tenant access: non–super-admin users must match `userProfile.tenantId` to the route tenant.

Module routes are declared in `modules/*/routes/index.ts` and composed in `App.tsx` with `ProtectedRoute` permission keys. Menu: `config/menu.config.ts` (also filtered by operation-path enablement where registered).

## `RouteErrorBoundary`

File: `components/RouteErrorBoundary.tsx`

- Wraps route subtrees in `App.tsx` (keyed by `location.pathname` where remount-on-navigate is desired).
- Catches render errors → Arabic recovery UI (retry / go home).
- Does **not** expose stack traces to operators; logs `[RouteErrorBoundary]` to the console.
- Home href: prop `homeHref`, else slug from pathname, else `resolvePreferredTenantHomePath()`.

## Chunk / dynamic import recovery

- Detector: `isDynamicImportLoadFailure` in `lib/navigationRecovery.ts` (stale deploy / SW cache / failed module script).
- UI: `components/DynamicImportRecoveryScreen.tsx`.
- `App.tsx` sets recovery state when a dynamic import failure is detected and shows the recovery screen instead of a white page.

After a hosting deploy, operators with an old tab may hit chunk mismatches — recovery instructs a hard reload / clear stale SW as implemented in that screen.

## Smoke checks

- Navigate within a tenant; force a child render error in a wrapped route → boundary, not blank page.
- Preferred home works with and without last-visited slug.
- Cross-tenant URL as a normal tenant user is rejected.

Tests touching paths: `tests/navigation-tenant-path.test.ts`, `tests/logout-tenant-context.test.ts`.
