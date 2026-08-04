# ADR-005: Repair spare issues on inventory ledger

## Status

Accepted (partial rollout)

## Context

Repair branches already map to `maintenance_center` warehouses, and central → center replenishment posts to `stock_items`. Job-level consume/return still used the legacy `repair_spare_parts_stock` ledger via `sparePartsService.adjustStock`, so repair usage was not on the inventory source of truth.

## Decision

1. Job/center spare issues use collection `repair_spare_issues` with lifecycle draft → (submit → approve when required) → issue / return.
2. Mutations are Cloud Functions only; they post `stock_transactions` with `sourceModule` `repair_spare_issue` / `repair_spare_return`.
3. Catalog lines resolve to manufacturing `materials` (any active material), not consumable-only.
4. Warehouse must be `maintenance_center` (or legacy `RWH-*`).
5. Approval mode is tenant `planSettings.repairSpareIssueApprovalMode` (`direct` | `required`), snapshotted on each issue.
6. Primary UX entry is the repair module (`/repair/spare-issues` + job detail consume bridge).

## Consequences

- Job consume with linked `materialId` creates/issues an RSI document and appends `partsUsed` with `issueId`.
- Legacy parts without `materialId` still use the old repair stock ledger until catalog linking/backfill completes.
- Inter-center transfers and full stock migration from `repair_spare_parts_stock` remain follow-up work.
