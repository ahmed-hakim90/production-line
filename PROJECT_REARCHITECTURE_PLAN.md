# Project Rearchitecture Plan (Full Roadmap)

## Objective

Rebuild project structure and engineering workflow in controlled phases to:

- reduce technical debt and duplicate code paths,
- enforce clear architectural boundaries,
- improve delivery speed and code quality,
- preserve production stability during migration.

## Execution Status (Live)

- Phase 0: **started and active**
  - Added architecture/deprecation/decision docs.
  - Added legacy-import guard script and npm command.
  - Migrated first wave of legacy imports to canonical module services.
- Phase 1: **started**
  - Added unsaved-changes guard in Settings tab navigation and before unload.
  - Added unsaved-change indicators on tabs.
  - Began extracting `Settings.tsx` into reusable components:
    - `GeneralSettingsHeader`
    - `GeneralBrandingSection`
- Phase 2+: **pending**
  - Planned and sequenced, implementation continues in incremental waves.

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

---

## Detailed Work Packages

## Phase 0 Work Packages

- P0-WP1: Lock architecture references
  - Keep `ARCHITECTURE_MAP.md` updated on each migration PR.
- P0-WP2: Maintain deprecation mapping
  - Keep `DEPRECATION_MAP.md` aligned with import migrations.
- P0-WP3: CI architecture guard
  - Add `npm run arch:check:legacy-imports` to CI pipeline.
- P0-WP4: Decision trail discipline
  - Record each architectural decision in `MIGRATION_DECISIONS_LOG.md`.

## Phase 1 Work Packages

- P1-WP1: Split `Settings.tsx` by section components.
- P1-WP2: Introduce `useSettingsDraft` abstraction.
- P1-WP3: Validate all settings payloads before save.
- P1-WP4: Add user-facing unsaved-changes indicators and tab-level dirty markers.
- P1-WP5: Preserve exact behavior parity (no product logic changes).

## Phase 2 Work Packages

- P2-WP1: Remove all legacy `services/*` imports from runtime paths.
- P2-WP2: Add temporary adapters only when migration cannot be completed in one slice.
- P2-WP3: Remove adapter files once usage reaches zero.

## Phase 3 Work Packages

- P3-WP1: Centralize report creation/update/delete business rules in usecases.
- P3-WP2: Standardize duplicate and conflict error contracts.
- P3-WP3: Ensure all entry paths use same usecase contract:
  - Reports page
  - Quick Action
  - Global modal
  - Import flows

## Phase 4 Work Packages

- P4-WP1: Split global store into domain stores.
- P4-WP2: Add selectors as compatibility bridge.
- P4-WP3: Move heavy business logic out of store into usecases.

## Phase 5 Work Packages

- P5-WP1: Build reusable form sections and save/error feedback components.
- P5-WP2: Standardize confirmation modal patterns.
- P5-WP3: Remove repeated table/action code blocks.

## Phase 6 Work Packages

- P6-WP1: Add E2E smoke suite for critical flows.
- P6-WP2: Add integration tests for usecases.
- P6-WP3: Add CI quality gates and failure triage workflow.
- P6-WP4: Add settings change audit tracking.

## Phase 7 Work Packages

- P7-WP1: Remove all temporary migration bridges.
- P7-WP2: Final architecture compliance pass.
- P7-WP3: Update onboarding and engineering docs.

---

## Sprint Cadence Plan (Proposed)

## Sprint 1 (1-2 weeks)

- Finish Phase 0 governance and CI enforcement.
- Continue Phase 1 extraction:
  - complete `General` and `Print` sections split.
- Target outcome:
  - settings file reduced materially in complexity.

## Sprint 2

- Complete remaining Settings tab extraction.
- Introduce `useSettingsDraft` and save validation layer.
- Target outcome:
  - feature parity and cleaner ownership boundaries.

## Sprint 3

- Execute Phase 2 service unification remaining slices.
- Remove deprecated runtime imports fully.
- Target outcome:
  - single source of truth per service domain.

## Sprint 4

- Start Phase 3 report usecase hardening.
- Unify report error contracts and all entry points.
- Target outcome:
  - deterministic behavior and no duplicate inconsistencies.

## Sprint 5-6

- Begin store decomposition (Phase 4).
- Introduce domain stores and compatibility selectors.

## Sprint 7+

- UI standardization, tests, observability, and final cleanup.

---

## Metrics and Success Criteria

Track these metrics weekly:

- M1: Legacy import violations count (target: 0 sustained).
- M2: `Settings.tsx` line count and complexity trend (target: down each sprint).
- M3: Number of shared reusable components replacing duplicated blocks.
- M4: E2E pass rate on critical flows.
- M5: Regression incidents per release.
- M6: Lead time for change on settings/report features.

---

## Risk Register

- R1: Hidden coupling in monolithic files.
  - Mitigation: slice-by-slice extraction, runtime smoke checks each PR.
- R2: Behavior regression during service migration.
  - Mitigation: contract tests + staged rollout + rollback-ready PRs.
- R3: Team reintroducing deprecated imports.
  - Mitigation: architecture guard in CI + code review checklist.
- R4: Scope creep during refactor.
  - Mitigation: behavior parity rule for refactor PRs.

---

## Release and Rollback Strategy

- Use small PRs with one architectural objective each.
- For each merged slice:
  - run `arch:check:legacy-imports`
  - run typecheck/lint
  - execute smoke flow list
- Rollback protocol:
  - revert only last migration slice PR when regression appears.
  - log root cause in decision log before retry.

---

## PR Template (Refactor Slices)

Each refactor PR must include:

- Scope:
- Architectural objective:
- Files moved/updated:
- Behavior parity statement:
- Test evidence:
- Migration impact:
- Rollback notes:

---

## Definition of Done (Per Phase)

A phase is considered done only when:

- Deliverables are completed.
- Exit criteria are verified with evidence.
- Regression checks are green.
- Docs are updated.
- Decision log is updated.

---

## Operating Rules During Migration

- No silent behavior changes in refactor-only PRs.
- No new feature code in deprecated folders.
- Prefer moving code without rewriting unless required for safety.
- Keep user-facing Arabic messages consistent across migrated paths.

---

## Current Next Steps (Updated)

1. Continue Phase 1 extraction of remaining Settings sections:
   - Theme
   - System behavior
   - Dashboard display
   - Alert toggles
2. Introduce `useSettingsDraft` abstraction.
3. Add CI integration for `arch:check:legacy-imports`.
4. Start Phase 3 usecase hardening plan for production reports after Settings split stabilizes.
