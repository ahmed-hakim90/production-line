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
