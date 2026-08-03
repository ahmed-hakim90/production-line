# Migration Decisions Log

## 2026-03-04 - Phase 0 Kickoff

### Decision 001 - Canonical service ownership

- Adopt module-owned services as canonical for domain logic:
  - `modules/production/services/*`
  - `modules/inventory/services/*`
  - `modules/costs/services/*`
  - `modules/system/services/*`
  - `modules/dashboards/services/*`

Legacy root services in `services/*` are deprecated for migrated domains.

Reason:

- Reduce duplicate implementation paths.
- Keep ownership and domain boundaries explicit.

---

### Decision 002 - Legacy import guard introduced

- Added script: `scripts/check-legacy-imports.mjs`
- Added npm command: `npm run arch:check:legacy-imports`

This check blocks known deprecated imports and provides a migration baseline.

---

### Decision 003 - Baseline offender snapshot

Current known legacy-import offenders reported by guard:

- `components/modal-manager/modals/GlobalCreateWorkOrderModal.tsx`
- `modules/auth/pages/Setup.tsx`
- `modules/costs/pages/MonthlyProductionCosts.tsx`
- `modules/dashboards/pages/AdminDashboard.tsx`
- `modules/hr/pages/Employees.tsx`
- `modules/production/pages/LineDetails.tsx`
- `modules/production/pages/ProductDetails.tsx`
- `modules/production/pages/ProductionPlans.tsx`
- `modules/production/pages/Products.tsx`
- `modules/production/pages/WorkOrders.tsx`
- `modules/production/pages/WorkOrderScanner.tsx`
- `modules/system/pages/ActivityLog.tsx`
- `store/useAppStore.ts`

Notes:

- This baseline is expected at kickoff.
- Each migration PR should reduce this list.

---

### Decision 004 - Migration execution rule

- Do not remove legacy service files immediately.
- Migrate imports first.
- Delete legacy file only after usage reaches zero and smoke tests pass.

---

## 2026-07-29 - Foundation Harden (Firebase, same repo)

### Decision 005 - Usecase + event-bus foundation (no Supabase / no new repo)

- Stay on Firebase; evolve in place per `PROJECT_REARCHITECTURE_PLAN.md`.
- Introduce `shared/usecases` result contract and first-wave domain usecases:
  - production / inventory / system (wired on critical write paths)
  - manufacturing / quality / hr / repair / costs reference usecases
- Expand typed `SystemEvents` for report/issue/stock/transfer/role/leave/repair/cost mutations; audit listener maps all events.
- `scripts/check-legacy-imports.mjs` blocks Firestore write APIs in `modules/*/pages/**` and `components/modal-manager/**` with an empty allowlist (HR pages + GlobalOrganizationModal migrated to services/usecases).
- Store transfer create/reject paths go through inventory usecases (reads may still use services).
- Portal home selection centralized in `modules/dashboards/lib/portalHome.ts`.

Reason:

- Enforce UI → usecase → service → Firebase without a big-bang rewrite.
- Keep security boundary on Firestore rules + Functions; UI permissions remain UX-only.

---

## 2026-08-01 - Category-scoped manufacturing material codes

### Decision 006 - Generate material codes from a category prefix

- Add an optional, tenant-unique short `code` to `material_categories` (2–8 Latin letters or digits).
- Operator-created/edited categories require the code; legacy migration may keep uncoded categories until an operator assigns one.
- New materials created without a manual code require a coded category and reserve `{CATEGORY_CODE}-{sequence}` atomically.
- Keep existing material codes stable when a category code changes; only later materials use the new prefix.
- Preserve explicit material codes for imports and migrated records.

Reason:

- Make material codes recognizable to factory operators while preventing duplicate numbers during concurrent creates.
- Keep the change backward-compatible with existing materials and legacy category migration.

Rejected:

- Deriving prefixes from Arabic category names because transliteration is unstable.
- Generating by material type because it loses the operational category context.

Compatibility:

- Existing categories without a code remain readable but cannot auto-generate new material codes until updated.

## 2026-08-03 - Department consumable issues

### Decision 007 - Final department consumption with server-side posting

- Treat department consumable issue as final OUT from any active warehouse to an HR department (not a per-department warehouse transfer).
- Keep stock identity as `itemType: material` for `Material.type = consumable` to avoid split balances.
- Snapshot company approval mode (`direct` | `required`) on each issue document at create time.
- Post issue/return stock movements only through authenticated Cloud Functions with tenant + permission checks; client writes to `department_consumable_issues` are denied.
- Monthly report aggregates ledger rows by department/item/unit using cost snapshots, subtracting returns.

Reason:

- Operators need monthly department consumption without inventing parallel inventory.
- Server posting prevents forged department/cost fields on the ledger.

Rejected:

- Transfer-into department warehouse (adds custody complexity without requested benefit).
- Client-only stock deduction for this feature (insufficient authorization for department reporting).

Compatibility:

- Existing supplies receipt, production issue, and manual movements remain unchanged.
- New source modules appear in stock transaction filters.

---

## 2026-08-03 - Unified operation entry paths

### Decision 008 - One mutation pipeline with tenant-scoped entry-path flags

- Store operation/path controls in `system_settings/{tenantId}.operationPaths`.
- Keep missing operation and path values enabled for backward compatibility.
- Require every production-report UI entry point to identify its path when calling the shared store mutation.
- Enforce disabled paths inside the mutation as well as hiding their UI entry points.
- Route report import updates and work-order completion reports through the same report update/create pipeline.
- Reconcile plan and work-order quantities from linked reports instead of trusting path-specific quantity increments.
- Snapshot the create and latest mutation entry path on each report for audit diagnostics.

Reason:

- Direct reports, quick entry, imports, shift close, and work-order close previously reached different side-effect chains.
- A shared pipeline prevents one path from skipping plan/work-order progress, inventory posting, validation, cache refresh, or audit metadata.

Rejected:

- UI-only feature flags, because hidden buttons do not stop stale clients or alternate application entry points.
- Independent per-page side-effect switches, because they preserve the original drift between report paths.

Compatibility:

- Existing tenants keep all paths enabled until an administrator explicitly disables one.
- Firestore authorization remains the security boundary; path flags are operational controls and are also checked in the shared client mutation.
- Production-report paths are the first migrated registry group; additional domains must register only when their mutation paths are routed through a shared use case.

---

## 2026-08-03 - Hardening P0 controls

### Decision 009 - Hardening P0 (privilege, restore, stock, singleton settings)

- Lock `users.isSuperAdmin` so clients cannot create or update the field (Admin SDK / trusted scripts only).
- Scope tenant backup restore (`importTenantBackup` / `full_reset`) to a single `tenantId` — never project-wide clears.
- Require inventory ERP permissions (plus warehouse scope) for `stock_*` ledger writes in Firestore rules; keep high-risk production/department posts on Cloud Functions.
- Move singleton settings to tenant document ids (`hr_settings/{tenantId}`, `labor_settings/{tenantId}`, `approval_settings/{tenantId}`, `hr_config_modules/{tenantId}__{module}`) with dual-read + `scripts/backfill-tenant-singleton-settings.ts`.

Reason:

- Close privilege escalation, cross-tenant wipe, and under-permissioned stock mutation gaps called out in the 2026-08-03 baseline hardening report.

Compatibility:

- Legacy shared settings docs remain readable until backfill; storage prefers `company/{tenantId}/...` with legacy path read-only.
- Developer docs index under `docs/README.md`; ADRs 001–003 record settings tenancy, server-owned stock, and Functions `src` as source of truth.
