# ADR-008: Manufacturer warranty settlement without revenue

## Status

Accepted — 2026-08-05

## Context

Repair intake can mark a product `inWarranty` (manufacturer warranty / free repair for the customer). Historically this only zeroed UI `finalCost` and print labels. Payment `computeBreakdown` still billed catalog services and part sale prices, and prepare/deliver rejected `grossAmount <= 0`. Parts issue already posts COGS (`Dr partsCogs / Cr partsInventory`).

Operators asked for:

1. Service + parts free for the customer (workshop absorbs cost).
2. No revenue recognition (not a 100% discount contra-revenue path).
3. Close/deliver path for warranty jobs.

## Decision

- Any `jobProducts[].inWarranty` makes the whole job manufacturer warranty (`warrantyScope = manufacturer`). Mixed paid/warranty lines in one job are out of scope.
- `prepareAuthorization` creates `settlementType: 'warranty'` with all money fields = 0, status `paid`, authorization prefix `WAR-…`. Manual discounts are rejected.
- `collectPayment` rejects warranty settlements.
- `deliver` allows zero gross for warranty, sets `financialState: warranty_settled`, emits `job.delivered_warranty`, and **does not** create a `repair_delivery` revenue journal.
- Inventory COGS on spare issue remains the only accounting effect for warranty parts. Issue usage rows store `unitCostSnapshot` / `totalCostSnapshot` for the warranty parts KPI.
- Dashboard «تكلفة قطع تحت ضمان» sums purchase cost snapshots, never sale `unitCost`.

## Consequences

- Warranty jobs close without treasury income or service/parts revenue.
- Workshop warranty duration (`job.warranty` 3/6 months) stays separate and is cleared to `none` while manufacturer warranty is active.
- Legacy zero-gross auths without `settlementType: warranty` remain invalid for collect/deliver.
- Manufacturer claim / warranty-expense GL account is deferred.

## Rejected alternatives

- Auto 100% discount on full catalog gross (mislabels warranty as discount and recognizes revenue then contra).
- Dedicated `warrantyExpense` account instead of existing `partsCogs` (extra chart setup; COGS on issue already reflects absorption).
