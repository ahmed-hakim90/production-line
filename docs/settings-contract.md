# Settings contract

Canonical English. Source of truth for merge behavior and operation paths.

## Document location

- Collection: `system_settings`
- Document ID: **current tenant id** (`system_settings/{tenantId}`)
- Client service: `modules/system/services/systemSettingsService.ts`
- Store loads merge through `resolveSystemSettings` before publishing to UI state

## `resolveSystemSettings`

File: `modules/system/lib/resolveSystemSettings.ts`

Behavior:

- Deep-merge partial / null Firestore data onto `DEFAULT_SYSTEM_SETTINGS` / `DEFAULT_PLAN_SETTINGS` (`utils/dashboardConfig.ts`)
- Nested objects that must not lose default keys on load/save:
  - `planSettings` (including `inventoryRouting`, `reportBehavior`)
  - `attendanceIntegration`
  - `repairSettings` (incl. treasury)
  - `productionWorkerSettings`
  - `operationPaths` (via `resolveOperationPathSettings`)

Tests: `tests/system-settings-contract.test.ts`, `tests/operation-path-settings.test.ts`.

Always resolve before rendering settings UI or evaluating path flags. Do not assume raw Firestore docs contain every nested key.

## Operation paths (client today)

Registry: `modules/system/lib/operationPathSettings.ts`

- Stored at `system_settings/{tenantId}.operationPaths`
- Missing operation / path → **enabled** (backward compatible)
- Production report groups (first migrated registry): create, update, delete, shift, reconcile — each with named UI/application paths (`reports_page`, `quick_action`, `global_import`, …)
- Enforcement:
  - Hide / disable UI entry points when disabled
  - **Also** check inside shared store mutations (`createReport` / `updateReport` / `deleteReport` / reconcile) so stale clients cannot bypass flags
- Snapshots on reports: `operationPathSnapshot`, `lastOperationPathSnapshot` (audit only; not authorization)

Decision 008 (`MIGRATION_DECISIONS_LOG.md`).

### Future server enforcement

Path flags are operational controls. Firestore authorization remains the security boundary today. A future Functions/rules check should re-read `system_settings/{tenantId}.operationPaths` for privileged mutations — do not treat client-only hiding as final.

## Inventory routing parity

- Canonical routing fields live under `planSettings.inventoryRouting` (resolved with plan settings).
- Client helpers: `modules/inventory/lib/inventoryRoutingResolver.ts`, `recommendedInventoryRouting.ts`, `syncPlanSettingsWarehouseRouting.ts`
- Server production issue / report inventory callables must resolve the same warehouse roles (decomposed, production floor, finished, etc.) — keep client and Functions aligned when changing role meanings
- UI: `modules/system/components/settings/InventoryRoutingSettingsSection.tsx`

Changing a warehouse role or routing id without updating both client resolvers and Functions posting logic will desync floor/WIP/finished stock.

## Related

- Settings draft hook: `modules/system/hooks/useSettingsDraft.ts` (uses `resolveSystemSettings`)
- [ADR-001](./adr/ADR-001-tenant-scoped-settings.md)
- [ARCHITECTURE/overview.md](./ARCHITECTURE/overview.md)
