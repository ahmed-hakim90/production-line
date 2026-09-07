# ADR-011: General stock issue voucher

## Context

The materials warehouse may issue manufacturing materials, packaging, lubricants, spare parts, samples, waste, and department consumables. Existing specialized production, department-consumable, repair, and transfer workflows must remain unchanged.

## Decision

Add isolated `/inventory/general-issues` and `/inventory/general-receipts` workflows backed by server-owned callables.

- `movementType` remains `OUT`; business intent is stored separately as `purpose` / `issuePurpose`.
- Production and packaging purposes require a tenant-owned work order.
- Maintenance, lubricant, department, and other purposes require a destination snapshot.
- Every posted line creates a normal `stock_transactions` row with `sourceModule: manual_movement` and `sourceId` pointing to the voucher.
- Aggregate and location balances are validated and decremented atomically. Negative stock and partial posting are rejected.
- Existing production issue, consumable issue, repair issue, and manual movement routes are not redirected or migrated.
- The callable rechecks tenant, permission, assigned warehouse, work order, balance, quantity, duplicate-line, and item-type constraints.

The matching general receipt workflow:

- Supports purchase, production output, issue return, opening balance, department return, maintenance return, and other receipt reasons.
- Reads from the item catalog, not only current balances, so the first receipt can create an item's warehouse and location balance.
- Requires a tenant-owned work order for production output.
- Requires the original general issue for issue returns, stores cumulative returned quantities on it, and rejects over-return.
- Creates ordinary `IN` ledger rows and updates aggregate/location balances atomically.

## Unified gateway behavior

The two new pages are entry gateways as well as direct general vouchers. Specialized operations normally retain their owning engine; the production-material issue is the deliberate exception described below:

- Production-material issue may post directly from the general issue page. It can select the complete BOM or one optional step from the product's current production routing, include unassigned/common BOM lines, issue in batches, and retain work-order/product/line/stage snapshots. The legacy production-issue route remains available during parity validation.
- Packaging issue embeds the existing packaging-control engine.
- Center spare-parts issue/receipt embeds the existing replenishment engine, preserving preparation, responsible approval, central approval, and center receipt.
- Production output embeds the existing production-report entry engine and prefills the selected work order, preserving injection/finished-output semantics, quality, scrap, labor, and report inventory posting.

This gateway rule prevents duplicate stock mutations and keeps every specialized document as the source of truth.

## Generic warehouse scope and optional production stages

- General issue/receipt pages use a warehouse scope that has no warehouse-role or configured-routing fallback. `inventoryWarehouseId` remains compatible; optional `inventoryWarehouseIds` supplies a multi-warehouse scope. Super-admin access remains tenant-bound.
- Warehouse type continues to control only specialized flows and never the availability of the two general pages.
- A BOM line may snapshot `consumptionStageId` and `consumptionStageName` from the existing active production routing. Both are optional; an unassigned line is common to the product.
- Routing changes never delete a BOM association. A missing step is displayed as stale and must be explicitly rebound.
- Posted production issues calculate prior issue quantities from posted vouchers only. Drafts have no stock effect, and voided vouchers are excluded; over-BOM issue is a visible warning in the first release, not a posting blocker.

Embedding is a migration bridge, not permission to duplicate the stock mutation logic. The final unified presentation should expose the engine's workflow content without rendering a second page shell inside the general voucher shell.

## Voucher lifecycle

- Direct general issue and receipt vouchers may be saved as `draft`. A draft stores the header and line snapshots but creates no ledger entry and changes no aggregate or location balance.
- Final posting creates the stock effect atomically and marks the selected draft `converted`. The draft-status check is performed inside the same transaction so one draft cannot be posted twice.
- A posted voucher remains immutable. Users with the delete/reversal permission may void it only through a server-owned reversal with a required reason.
- Voiding appends linked opposite ledger entries and marks the original voucher `voided`; it never deletes or rewrites the original ledger rows.
- An issue with linked returns cannot be voided until those receipts are reversed. Reversing an issue-return receipt also reduces the returned quantity recorded on the original issue.
- Draft, posted, and voided vouchers can use the shared print presentation, with their status shown on the printed document.

## Legacy movement form retirement gate

`StockMovementForm` remains available until all of the following are implemented and verified in production:

1. The general issue page covers every legacy `OUT` item and warehouse scenario, including products, raw materials/components, spare-parts contexts, locations, units/cartons, validation, drafts, and purpose snapshots.
2. The general receipt page covers every legacy `IN` scenario, including first receipt from catalog, products, raw materials/components, spare-parts contexts, locations, units/cartons, source data, validation, and drafts/import entry points.
3. Posted general issue and receipt vouchers have printable documents using the shared print engine.
4. Posted general issue and receipt vouchers support server-owned void/reversal. Reversal must be atomic, append linked opposite ledger entries, restore/decrement aggregate and location balances, prevent negative stock, be idempotent, and preserve the original voucher and audit trail.
5. `TRANSFER` and same-warehouse location transfer are moved to an explicit supported transfer journey, including multi-line entry, approvals, printing/sharing, carton conversion, and existing operation-path controls.
6. Every inbound link currently targeting `/inventory/movements` is migrated by movement type: `IN` to general receipts, `OUT` to general issues, and `TRANSFER`/`ADJUSTMENT` to their retained destination.
7. Targeted parity tests and rendered RTL QA pass, followed by a production observation period with no blocked warehouse journey.

Until the gate is complete, do not remove the route, component export, menu/link targets, or operation-path compatibility for `StockMovementForm`.

## Consequences

The new pages supply purpose/reason-based traceability without changing legacy records. Old transactions remain readable exactly as before. Deployment requires both Functions and Firestore rules; the UI must not be released alone because voucher creation is server-owned.
