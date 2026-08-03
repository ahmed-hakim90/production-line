# Production reports — next usecase extractions (docs only)

Status: **documentation backlog**. Do not mass-extract in this phase.

Thin persist already exists: `createProductionReport` (save + `REPORT_CREATED` event). Full side-effects (inventory, plan/WO reconcile, operation-path enforcement, cache) still live in `store/useAppStore.ts`.

## Current exports (`index.ts`)

| Export | Scope today |
|--------|-------------|
| `createProductionReport` | Persist report + emit event; callers own inventory / cache |
| `createProductionIssueRequest` | Production issue request create |
| `updateWorkOrderStatus` / `reopenCompletedWorkOrder` | Work-order status transitions |

## Candidates to move next (from `Reports.tsx` + `useAppStore`)

Extract **shared mutation pipelines** (not page-only helpers). Keep Decision 008 entry-path context (`path` / operation keys).

| Priority | Store / UI operation | Suggested usecase name | Notes |
|----------|----------------------|------------------------|-------|
| 1 | `createReport` | `createProductionReportWithEffects` (or expand existing) | Paths: reports page, global modal, plan, supervisor, quick action, import, WO completion, component waste. Enforce `production.report.create` + path flags; inventory posting; plan/WO link; snapshots. |
| 2 | `updateReport` | `updateProductionReport` | Paths: reports page, shift close, import update, attendance sync, cost snapshot. |
| 3 | `deleteReport` | `deleteProductionReport` | Paths: single + bulk delete; reverse inventory / reconcile linked WO. |
| 4 | Import create/update batch | `importProductionReports` | Today: `Reports.tsx` + global import modal → `createReport` / `updateReport` with import paths. |
| 5 | `reconcileWorkOrderFromReports` (+ plan reconcile helpers) | `reconcileWorkOrderFromReports` / `reconcilePlanFromReports` | Paths: reports tools + work-orders page; do not trust path-specific quantity increments. |

## Snapshots to preserve on extract

- `operationPathSnapshot` — original create entry path
- `lastOperationPathSnapshot` — latest mutation path
- Catalog snapshots (`productNameSnapshot`, `productCodeSnapshot`, cost posted snapshots)

## Enforcement already in place

- Operation path flags: `modules/system/lib/operationPathSettings.ts` + store mutation checks
- Pages/modals must not write Firestore directly (`npm run arch:check:legacy-imports`)

## Out of scope for this note

Mass-moving `Reports.tsx` UI, rewriting import parsers, or changing Cloud Function inventory callables.
