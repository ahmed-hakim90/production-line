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

The two new pages are entry gateways as well as direct general vouchers. Specialized operations never use the general posting callable:

- Production issue previews the active product BOM for the selected work order and calculated quantity, then deep-links to the existing production-issue page. Allocation, shortage checks, approval, and posting remain owned by the existing production issue engine.
- Packaging issue opens the existing packaging control workflow.
- Center spare-parts issue/receipt opens the existing replenishment workflow, preserving preparation, responsible approval, central approval, and center receipt.
- Production output opens the existing production-report entry workflow, preserving injection/finished-output semantics, quality, scrap, labor, and report inventory posting.

This gateway rule prevents duplicate stock mutations and keeps every specialized document as the source of truth.

## Consequences

The new pages supply purpose/reason-based traceability without changing legacy records. Old transactions remain readable exactly as before. Deployment requires both Functions and Firestore rules; the UI must not be released alone because voucher creation is server-owned.
