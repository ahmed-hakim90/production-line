# Hakimo Flow — Design System

Modern Manufacturing ERP visual language for Hakimo Production Line.

**RTL native · Mobile-first · Card-based · Dashboard-driven · Domain module apps**

## Tokens (defaults)

| Token | Value |
|-------|--------|
| Primary | `#4F46E5` / hover `#4338CA` |
| Success | `#059669` |
| Warning | `#D97706` |
| Danger | `#DC2626` |
| Canvas | `#F7F9FC` |
| Card | `#FFFFFF` |
| Border | `#E5E7EB` |
| Font | IBM Plex Sans Arabic |
| Radius xl (cards) | ~22px |
| Shadow | `0 4px 20px rgba(15,23,42,0.05)` |

Defined in `src/index.css` `:root` and `DEFAULT_THEME` (`utils/dashboardConfig.ts`). Runtime merge via `themeEngine`.

## Shells

- **Domain homes:** `DomainHomeShell` — KPI hero → period chips → panels → secondary actions
- **Ops lists:** `ModuleOpsPageShell` — same chrome without huge secondary panel
- **Panels:** `OpsDashPanel` with module `accent`
- **Action strip:** page CTAs go in shell `actions` (separate toolbar row). Compact pill buttons via `.ops-dash-toolbar__actions`. Use `OpsMoreActionsMenu` when overflow > ~4 secondary actions. Segmented toggles use `.ops-toolbar-seg`.
- **Modals:** mount via `ManagedModalPortal` / `#erp-modal-root` (or Radix `getRootPortalContainer`). Never put `z-index` on `.ops-dash-toolbar` / `.ops-dash-domain-body` — it traps page-local fixed overlays under the toolbar border.
- **Content width:** AppLayout applies theme `contentMaxWidth` (+ optional `pageLayoutOverrides`). Authenticated pages must use `w-full min-w-0` — do not nest `max-w-6xl mx-auto` (or similar) on `ModuleOpsPageShell` / detail pages. Keep hard max-width only for modals, public portals, or intentional phone-operator flows (e.g. routing execution).

## Module apps

Each product module feels like its own app; packs (`lib/activityPacks.ts`) gate manufacturing / repair. Permissions matrix: `utils/permissionCatalog.ts` + page guards via `useResourcePermission` (pilots: products, quality.workers, inventory/warehouses, customers, catalog.categories, lines, roles, materials).

## Do

- Large KPI numbers, short labels above, meta below
- Soft cards, minimal borders
- Semantic status colors (running / waiting / failed)
- Mobile cards + desktop tables for lists

## Don’t

- Dense traditional ERP chrome on home boards
- Heavy multi-layer shadows / purple glow spam
- Copy a marketing mock 1:1 — apply the philosophy to Hakimo domains
