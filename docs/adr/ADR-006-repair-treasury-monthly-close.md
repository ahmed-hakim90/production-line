# ADR-006: Repair treasury monthly close

## Status

Accepted

## Context

Repair treasury already supports daily session open/close and a monthly report. Operators needed a period lock so closed months cannot accept new sessions or cash movements (including sales-invoice treasury posts), without introducing a company-wide single lock that would block other branches.

## Decision

1. Add collection `repair_treasury_month_closes` scoped by `tenantId` + `branchId` + `month` (`YYYY-MM`).
2. Deterministic document id: `${tenantId}_${branchId}_${month}`.
3. Close requires zero open daily sessions in that month for the branch; reopen requires `repair.treasury.manage` and a non-empty reason.
4. Client service guards (`openSession` / `addEntry` / `closeSession`) refuse writes when the operation month is closed.
5. No new permission key — reuse `repair.treasury.view` / `repair.treasury.manage`.
6. Snapshot of branch monthly totals is stored at close time for audit display only (report remains live for open months).

## Consequences

- Monthly report UI can close/reopen per branch (or batch-close when “all branches” is selected).
- Daily treasury screen disables mutations for the current month when closed.
- Firestore rules allow create/update of month-close docs with manage + branch scope; delete denied.
- Read rules must allow `get` when the close doc is missing (`resource == null`); otherwise non–branch-admins get `permission-denied` on every open month and the monthly report breaks.
- Client `getMonthClose` treats permission-denied as “no close row” so undeployed rules do not blank the whole report.
- Carry-forward opening balance to the next month remains out of scope.
