# Architecture overview

Canonical English. Product UI is Arabic RTL.

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 19, TypeScript, Vite 6, Tailwind |
| State | Zustand (`store/useAppStore.ts`) + TanStack Query where used |
| Routing | React Router (`App.tsx` mounts module route tables) |
| Backend | Firebase Auth, Firestore, Storage, Cloud Functions (Node 20) |
| Permissions | Dynamic RBAC in Firestore; UI gates are UX-only |

App version is tracked in root `package.json` (see also root `README.md`).

## Module map

Feature code lives under `modules/<domain>/` (pages, services, usecases, routes, types as needed):

| Module | Domain |
|--------|--------|
| `auth` | Login, setup, pending, Firebase client |
| `production` | Products, lines, plans, reports, work orders, shifts |
| `manufacturing` | Materials, BOM, material categories |
| `inventory` | Warehouses, stock, transfers, production floor, department consumables |
| `hr` | Employees, attendance, leave, loans, payroll, approvals, org |
| `costs` | Cost centers, labor settings, assets, monthly costs |
| `quality` | Inspections / CAPA / quality reports |
| `repair` | Repair jobs / branches / treasury |
| `system` | Roles, users, activity log, system settings |
| `dashboards` | Admin / factory / employee portals |
| `catalog`, `customers`, `operations`, `reports`, `super-admin`, `shared` | Supporting domains |

Cross-cutting: `components/`, `shared/`, `services/` (legacy / shared), `lib/`, `config/menu.config.ts`.

Layering rules: [dependency-rules.md](./dependency-rules.md).

## Tenancy

- Business documents carry `tenantId`.
- URL space: `/t/:tenantSlug/...` (`lib/tenantPaths.ts`).
- Settings doc: `system_settings/{tenantId}`.
- Singleton HR/cost settings migrate to tenant doc IDs — see [../security-tenancy.md](../security-tenancy.md) and [../adr/ADR-001-tenant-scoped-settings.md](../adr/ADR-001-tenant-scoped-settings.md).
- Storage preferred path: `company/{tenantId}/{module}/...` (`storage.rules`).
- Super-admin (`users.isSuperAdmin`) is platform-scoped; client cannot set the flag (rules lock).

## Settings

- Load/merge via `resolveSystemSettings` (`modules/system/lib/resolveSystemSettings.ts`).
- Operation entry paths: `system_settings/{tenantId}.operationPaths` (Decision 008).
- Inventory warehouse routing lives under `planSettings.inventoryRouting` (and related UI in system settings).

Details: [../settings-contract.md](../settings-contract.md).

## Inventory V2 (pointers)

Not a separate package — inventory module + Cloud Functions:

| Concern | Where to look |
|---------|----------------|
| Production floor warehouse role | `warehouseRole: 'production_floor'`, page `/inventory/production-floor` |
| Issue stock → floor | Callable `issueProductionIssueStock` (`functions/src/productionIssueStock.ts`) |
| Report BOM consume from floor | `applyProductionReportInventory` / reverse (`functions/src/productionReportInventory.ts`) |
| Packaging handover receipt | `confirmProductionHandoverReceipt` (`functions/src/productionHandover.ts`) |
| Department consumable issues | Callables in `functions/src/departmentConsumableIssues.ts` (re-exported from `index.ts`) |
| Routing resolver | `modules/inventory/lib/inventoryRoutingResolver.ts`, `recommendedInventoryRouting.ts` |
| Cutover notes | `scripts/backfill-production-floor-cutover.mjs`, [../migrations-backfills.md](../migrations-backfills.md) |

Client stock ledger writes also require inventory ERP permissions in `firestore.rules` (not active-user-only).

## Functions source of truth

Edit `functions/src/**/*.ts` only; build to `functions/lib`. See [../adr/ADR-003-functions-src-is-source-of-truth.md](../adr/ADR-003-functions-src-is-source-of-truth.md).
