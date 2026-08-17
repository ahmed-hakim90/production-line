# ADR-008: Manufacturer warranty settlement (full and partial)

## Status

Accepted — 2026-08-05  
Superseded in part — 2026-08-09 (partial / mixed jobs + warranty allowances)

## Context

Repair intake can mark each product `inWarranty` (manufacturer warranty / free repair for the customer). Historically this only zeroed UI `finalCost` and print labels. Payment `computeBreakdown` still billed catalog services and part sale prices, and prepare/deliver rejected `grossAmount <= 0`. Parts issue already posts COGS (`Dr partsCogs / Cr partsInventory`).

Operators asked for:

1. Service + parts free for the customer on warranty-covered products (workshop absorbs cost).
2. Mixed jobs: some products under manufacturer warranty, others billable on the same receipt.
3. A clear customer-facing account breakdown (receipt, payment print, public approval).
4. Close/deliver path for full-warranty jobs without treasury collection.

## Decision

### Scope derivation

- Per-line flag: `jobProducts[].inWarranty`.
- Derived `warrantyScope`:
  - `none` — no warranty lines
  - `manufacturer` — every product line is in warranty (full job)
  - `partial` — mixed billable + warranty lines
- Parts attributed to a warranty product (`productItemId` / `itemId`) are not billed to the customer.

### Full manufacturer warranty (`warrantyScope = manufacturer`)

- `prepareAuthorization` creates `settlementType: 'warranty'` with money fields = 0, status `paid`, authorization prefix `WAR-…`. Manual discounts are rejected.
- Customer pricing approval is **not required**. After diagnosis + service/part the job advances to `in_repair` (or `awaiting_parts`), with `approvalStatus: not_required`. Sending the public approval link is rejected. Mixed/partial jobs still require customer approval on the billable share.
- `collectPayment` rejects warranty settlements.
- `deliver` allows zero gross, sets `financialState: warranty_settled`, emits `job.delivered_warranty`.
- Journal type: `repair_warranty_delivery` with covered amounts posted via `warrantyAllowances` (contra-revenue) so GL reflects absorbed warranty service/parts without customer cash.

### Partial manufacturer warranty (`warrantyScope = partial`)

- Customer pays only non-warranty services and parts.
- Warranty-covered lines are free on the customer receipt / public approval / payment print.
- `deliver` after collection uses journal type `repair_partial_warranty_delivery` and posts warranty-covered gross through `warrantyAllowances`.
- Standard collect/deliver rules apply to the billable net.

### Shared rules

- Inventory COGS on spare issue remains the stock accounting effect for issued parts. Issue usage rows store `unitCostSnapshot` / `totalCostSnapshot` for the warranty parts KPI.
- Dashboard «تكلفة قطع تحت ضمان» sums purchase cost snapshots, never sale `unitCost`.
- Workshop warranty duration (`job.warranty` 3/6 months) stays separate and is cleared to `none` while manufacturer warranty settlement is active on the job.
- Legacy zero-gross auths without `settlementType: warranty` remain invalid for full-warranty collect/deliver.
- Dedicated manufacturer-claim / warranty-expense GL account remains deferred; `warrantyAllowances` is the configured contra-revenue account (auto-provisioned on the branch chart when missing).

## Consequences

- Full-warranty jobs close without treasury income; partial jobs collect only the billable share.
- Account detail for the customer must show per-product warranty labels and billable vs warranty amounts.
- Public approval must zero warranty products and warranty-attributed parts before presenting `estimatedTotal`.
- Documentation and `functions/lib` must stay in sync with `functions/src` after warranty logic changes.

## Rejected alternatives

- Treating any single `inWarranty` line as full-job warranty (blocks mixed intake).
- Auto 100% discount on full catalog gross without `settlementType` / scope (mislabels warranty as a generic discount).
- Dedicated `warrantyExpense` account instead of COGS on issue + `warrantyAllowances` on delivery (extra chart setup; current path reuses existing spare COGS + one contra-revenue account).
