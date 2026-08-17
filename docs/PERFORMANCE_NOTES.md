# Performance Notes

## Phase 4 quick wins (done)

- Home dashboards: `HomeDashboardRouter` lazy-loads each portal shell (`Admin` / `Factory` / `Employee` / generic) so only the active portal chunk loads.
- Global modals: `ModalHost` uses a per-modal `React.lazy` registry (still always mounted for managed-modal registration).
- Report lists: `reportService.getByDateRange` / `getAll` cap pagination at `REPORT_LIST_MAX_PAGES` (10).
- Operational decision snapshot: tenant-scoped cache key + TTL early-return + `pageDataCache` in-flight dedupe across dashboard mounts.
- Presence: `presenceService.subscribeAll` / `subscribeOnline` use `tenantQuery`; heartbeats stamp `tenantId`.

## Fast production saves (done — ADR-009)

Contract for production plans, work orders, and reports:

- Await durable write only; upsert local lists; return to UI; background notify/reconcile/cost.
- Report create: `queueReportCreate` + `modules/production/lib/reportSaveFeedback.ts`.
- `fetchProductionPlans` does not N+1 `getByProduct`; uses cached reports for `planReports`.
- Guards: `tests/fast-production-saves.test.ts`, `tests/save-response-speed-guards.test.ts`.
- Decision record: `docs/adr/ADR-009-fast-production-saves.md`.

## Deferred: useAppStore bootstrap split

**Not done in this pass** (too risky mid-dirty worktree).

`store/useAppStore.ts` still owns a large auth→`initializeApp` bootstrap that loads many collections up front. A future pass should:

1. Keep auth + tenant context + permissions as the critical path.
2. Split remaining master-data / operational subscriptions into lazy post-shell loaders (route- or module-gated).
3. Preserve single-flight / cache invalidation on logout (existing `resetStoreFetchCaches` + `invalidatePageDataCache`).
4. Add regression coverage for cold login → home ready, and tenant switch / logout cache clears.

Do not rewrite bootstrap casually; treat it as a dedicated change with typed load phases and rollback.
