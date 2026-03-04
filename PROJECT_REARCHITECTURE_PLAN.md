# Project Rearchitecture Plan (Full Roadmap)

## Objective

Rebuild project structure and engineering workflow in controlled phases to:

- reduce technical debt and duplicate code paths,
- enforce clear architectural boundaries,
- improve delivery speed and code quality,
- preserve production stability during migration.

---

## Current Pain Points (Observed)

- Duplicate service layers (`services/*` and `modules/*/services/*`) with mixed import usage.
- Large monolithic files with mixed concerns:
  - `store/useAppStore.ts`
  - `modules/system/pages/Settings.tsx`
  - `modules/production/pages/Reports.tsx`
- Business rules scattered across page/store/service layers.
- Inconsistent error contracts (sometimes string, sometimes `Error`, sometimes fallback).
- Limited guardrails to prevent reintroducing legacy patterns.
- High regression risk due to broad coupling across modules.

---

## Target Architecture

### Domain-first structure

For each module/domain:

- `modules/<domain>/pages`
- `modules/<domain>/components`
- `modules/<domain>/services` (I/O and Firestore access only)
- `modules/<domain>/usecases` (business rules)
- `modules/<domain>/store` (domain state orchestration)
- `modules/<domain>/types`
- `modules/<domain>/utils`

### Shared/core boundaries

- `core/`: auth, permissions, feature flags, app policies.
- `shared/`: reusable UI, hooks, events, primitives.
- `modules/`: feature/domain-specific code only.

### Rule of flow

`UI -> UseCase/Store -> Service -> Firebase`

No direct Firebase/Firestore access from UI components/pages.

---

## Migration Strategy (No Big-Bang Rewrite)

Use a phased rollout with backward compatibility until each area is verified.

- Keep app functional at every phase.
- Migrate in slices (by feature), not all at once.
- Deprecate old paths first, remove only after proof of zero usage.

---

## Phases

## Phase 0 - Foundation and Governance

### Goal
Create migration guardrails and define source-of-truth ownership.

### Scope
- Add architecture map and ownership docs.
- Define canonical paths per domain/service.
- Introduce deprecation policy for legacy files/imports.
- Add lint rules to block new imports from deprecated paths.

### Deliverables
- `ARCHITECTURE_MAP.md`
- `DEPRECATION_MAP.md`
- `MIGRATION_DECISIONS_LOG.md`
- ESLint/path rules for import boundaries.

### Exit Criteria
- Every core service has a canonical location.
- New code cannot be added to deprecated layers.

---

## Phase 1 - Settings Module Refactor (High ROI)

### Goal
Break down settings monolith into maintainable units without changing behavior.

### Scope
- Split `modules/system/pages/Settings.tsx` into tab-level components:
  - `GeneralTab`
  - `QuickActionsTab`
  - `DashboardWidgetsTab`
  - `AlertRulesTab`
  - `KpiThresholdsTab`
  - `PrintTemplateTab`
  - `ExportImportTab`
  - `BackupTab`
- Add `useSettingsDraft` hook for draft/save/reset/dirty state.
- Add unsaved-changes guard before tab switch/leave.
- Add consistent validation before save.

### Deliverables
- New settings folder structure and extracted tab components.
- Shared settings draft hook.
- Stable save messages and section-level failure feedback.

### Exit Criteria
- Same functionality as current settings.
- File complexity significantly reduced.
- No regression in tab visibility or save flows.

---

## Phase 2 - Service Layer Unification

### Goal
Eliminate duplicate service paths and enforce one service source-of-truth.

### Scope
- Migrate imports from `services/*` legacy paths to canonical module services.
- Keep temporary re-export adapters where required.
- Remove dead/duplicate services after usage reaches zero.

### Deliverables
- Import migration PRs by domain.
- Legacy service usage dashboard (counts by file).
- Final cleanup of deprecated service files.

### Exit Criteria
- Zero runtime imports to deprecated services.
- Canonical service structure fully adopted.

---

## Phase 3 - Production Reports Hardening

### Goal
Centralize critical report business rules and stabilize all report entry paths.

### Scope
- Consolidate report rules in usecases:
  - duplicate prevention,
  - approval behavior,
  - stock side effects.
- Keep UI pre-checks as UX hints, enforce in backend/service as source of truth.
- Standardize duplicate/error messaging across:
  - Reports page,
  - Quick Action,
  - Global Create Report modal,
  - import flows.

### Deliverables
- `report` usecase layer.
- Unified error contract and display helpers.
- End-to-end consistency for create/update/delete report flows.

### Exit Criteria
- No duplicate report creation under race conditions.
- Consistent user-facing error behavior across all entry points.

---

## Phase 4 - Store Decomposition

### Goal
Replace oversized global store with composable domain stores/selectors.

### Scope
- Split `useAppStore` responsibilities by domain:
  - production store
  - inventory store
  - HR store
  - system store
- Keep bridge selectors for backward compatibility during migration.
- Move domain logic from store to usecases where appropriate.

### Deliverables
- Domain store modules and selector layer.
- Reduced global store coupling.

### Exit Criteria
- Core flows use domain stores.
- Global store becomes thin orchestration layer or legacy wrapper.

---

## Phase 5 - UI Standardization and Design System Alignment

### Goal
Reduce UI inconsistency and duplicated component logic.

### Scope
- Standardize forms, table actions, confirmation dialogs, save/error banners.
- Replace repeated UI blocks with shared components.
- Align pages to shared UI primitives in `src/shared/ui`.

### Deliverables
- Reusable form/feedback patterns.
- Common modal action patterns.
- Reduced duplicated UI code across modules.

### Exit Criteria
- Core CRUD pages use standardized components.
- UX behavior is consistent across modules.

---

## Phase 6 - Quality, Testing, and Observability

### Goal
Create confidence for ongoing refactors and faster release cycles.

### Scope
- Add E2E smoke tests for critical paths:
  - auth + permissions
  - settings persistence
  - production report create/update/delete
  - inventory approvals
- Add integration tests for usecases.
- Add runtime audit logging for sensitive settings changes.

### Deliverables
- CI gates for lint + type + critical E2E.
- Test matrix and failure triage guide.
- Settings audit trail.

### Exit Criteria
- Refactor changes are protected by automated checks.
- Regression detection is fast and actionable.

---

## Phase 7 - Final Cleanup and Decommission

### Goal
Retire temporary bridges and close migration debt.

### Scope
- Remove deprecated adapters/files.
- Finalize docs and onboarding guides.
- Confirm architecture compliance.

### Deliverables
- Clean codebase with no legacy shims.
- Updated architecture and contributor docs.

### Exit Criteria
- No deprecated path usage.
- Team can onboard and deliver within new architecture standards.

---

## Cross-Phase Standards

- No direct Firestore usage in pages/components.
- Error contract must be normalized before UI rendering.
- Keep behavior parity unless explicitly approved as product change.
- Use feature toggles for risky behavior changes.
- Maintain backward compatibility until phase completion per slice.

---

## Suggested Execution Order (Practical)

1. Phase 0 (governance)  
2. Phase 1 (Settings split)  
3. Phase 2 (service unification)  
4. Phase 3 (report usecases + hardening)  
5. Phase 4 (store decomposition)  
6. Phase 5 (UI standardization)  
7. Phase 6 (tests + observability)  
8. Phase 7 (final cleanup)

---

## Milestone Template (per phase)

For each phase, track:

- Owner:
- Start date:
- Target date:
- Risk level:
- Dependencies:
- PR list:
- Test evidence:
- Rollback plan:
- Sign-off:

---

## Immediate Next Action

Start with **Phase 0** by creating:

- `ARCHITECTURE_MAP.md`
- `DEPRECATION_MAP.md`
- ESLint/path import boundary rules

Then begin **Phase 1** extraction of settings tabs with no behavior change.
