# ADR-009: Fast production saves (write-first, background side effects)

## Status

Accepted for the production module (plans, work orders, production reports).

## Context

Operator daily saves (work order, production plan, production report) felt slow because the UI awaited post-write work: full list reloads (`fetchWorkOrders` / `fetchProductionPlans` with `force: true`), report-range scans, N+1 linking, notifications, and cost/inventory reconcile.

The durable Firestore write (or the report fast callable) is cheap. Blocking the Save button on reconcile made the whole ERP feel laggy.

## Decision

For production daily mutations:

1. Validate permission + operation path synchronously in the store.
2. Await only the durable write (or queue an optimistic report create via `queueReportCreate`).
3. Upsert or remove the row in local Zustand lists immediately. Do **not** `await fetch*(…, { force: true })` before returning to the UI.
4. Run notify / reconcile / cost / avg-production / material-requirements inside `void (async () => { … })`.
5. Operation feedback uses `showAppToast` only (see `modules/production/lib/reportSaveFeedback.ts` for report copy).

Report **create** entry points must use `queueReportCreate` (QuickAction, Reports page, GlobalCreateReportModal, supervisor quick dialog).

Report **update**: return after successful `reportService.update` + local upsert; background reconcile/cost/avg.

Report **delete**: await inventory reverse + aggregate cost reverse (fail closed), then delete doc, remove local row, return; background WO/plan reconcile and avg sync.

`fetchProductionPlans` loads plans/follow-ups only and rebuilds `planReports` from cached reports — no N+1 `getByProduct` on list load.

## Rejected alternatives

- New Cloud Functions / Cloud Tasks for work-order or plan create — unnecessary for this latency class; reuse report `processingState` pattern only where inventory/cost already run server-side.
- Optimistic fake work-order numbers — numbering stays a real query (moved inside `createWorkOrder`) until a server sequence exists.
- Backgrounding inventory reverse on delete before the row disappears — rejected for consistency; reverse must succeed before the UI treats the delete as done.

## Consequences

- UI feels instant after durable write; background work can still load the network briefly.
- Optimistic report rows can show `جارٍ الحفظ` / `فشل الحفظ` with retry (`retryQueuedReportCreate`).
- Source guards in `tests/fast-production-saves.test.ts` and `tests/save-response-speed-guards.test.ts` prevent regression.
- Repair, inventory, HR, and store bootstrap remain out of this ADR; apply the same contract in later passes.

## Later (out of scope here)

- Repair job create/workspace saves, inventory vouchers, HR mutations.
- Splitting `useAppStore` bootstrap (see `docs/PERFORMANCE_NOTES.md`).
