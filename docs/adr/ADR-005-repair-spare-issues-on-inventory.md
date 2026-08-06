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
7. Center operators stay inside `/repair/*`: spare issues, branch parts warehouse (open jobs table + create/receive replenishment). Inventory replenishment page is for central warehouse staff.
8. Repair UI shows company-wide sale prices from manufacturing materials only: `defaultSalePrice` (consumer), `traderSalePrice` (wholesale), and `purchaseCost`. Prices are managed on `/manufacturing/materials` via `repair.pricing.manage` + callable `updateRepairPartsPricing` (audit). Branch `repair_spare_parts.defaultSalePrice` is not a price source and is no longer written.
9. `repairSpareIssues.*` permissions alias from `repair.parts.*` / `repair.view` only (not inventory transaction/transfer keys). Firestore `repair_branches` read accepts `repairSpareIssues.view|create`.

## Consequences

- Job consume with linked `materialId` creates/issues an RSI document and appends `partsUsed` with `issueId`.
- After issue/return, Cloud Functions also sync quantity to `repair_spare_parts_stock` so center inventory UI matches inventory SoT (receive already synced on replenishment).
- Center inventory table: +/- is stocktake only; sale price is read-only from the material master; part delete is not exposed in the table UI.
- Availability for spare-part request/replenishment uses `stock_items.quantity - reservedQty`. Central stock is reserved on replenishment approve and consumed on receive; center stock may be reserved for `ready_to_issue` lines until issued/cancelled.
- Center replenishment create/receive tracking lives under `/repair/parts-replenishment` (modal create from `/repair/parts`).
- Legacy parts without `materialId` still use the old repair stock ledger until catalog linking/backfill completes.
- Inter-center transfers and full stock migration from `repair_spare_parts_stock` remain follow-up work.
- Center replenishment create may omit `fromWarehouseId`; the callable resolves the tenant `spare_parts_central` warehouse.

## Amendment: Job picker → center deduct or open-basket replenishment

Technicians may select any active manufacturing material from a repair job (not only the branch spare catalog).

1. Server resolves availability from center warehouse vs `spare_parts_central` balances.
2. If center stock covers qty → create/issue RSI and append `partsUsed` with `fulfillmentStatus: issued`.
3. Otherwise append `partsUsed` with `fulfillmentStatus: pending_supply` and upsert an **open basket** SPR (`openBasket: true`, status `submitted`) for the same `toWarehouseId`, merging lines/`demandLinks` across jobs until approve.
4. On SPR receive: mark linked usages `ready_to_issue`, then attempt auto RSI issue; failures leave `ready_to_issue` for manual `issuePendingRepairPartUsage`.
5. Admin replenishment UI surfaces pending (not received), received duration, and stockout demands (`availabilityAtRequest: none`).
