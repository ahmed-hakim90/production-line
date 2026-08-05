# ADR-007: Full manufacturing cost with provisional and actual revisions

## Status

Accepted and introduced behind backward-compatible report snapshots.

## Context

The legacy production report cost is a conversion cost: labor, supervisor, and allocated indirect centers. Product materials are joined later in product-cost UI, depreciation is only present when monthly depreciation rows exist, and finished-stock movements are quantity-first rather than cost-layer-first.

Factory-wide expenses such as electricity and rent are not known exactly when a daily report is created. Rewriting historical report cost silently when those invoices arrive would make audit and inventory reconciliation unreliable.

## Decision

Every production report keeps two distinct results during migration:

- `unitCostSnapshot`: legacy conversion unit cost, unchanged for compatibility.
- `fullManufacturingUnitCostSnapshot`: full manufacturing unit cost.

Full cost is versioned and has an explicit status:

- `provisional`: at least one source is estimated or scheduled.
- `actual`: all included sources are actual.

Cost sources are immutable snapshot lines with a stable `sourceKey`. A retry with the same source key and identical values is idempotent; conflicting values are rejected.

The V1 full-cost formula is:

```text
materials + packaging + direct labor + factory overhead + depreciation
```

Actual costed stock issues replace BOM estimates by item. A BOM estimate is never journalized as actual material consumption.

## Cost center isolation

Cost centers have two explicit dimensions:

- `costObjectScope`: production, repair, shared, or none.
- `postingMode`: direct assignment, driver allocation, or collect only.

Only active indirect centers with `driver_allocation` and scope `production` or `shared` can enter the production allocation engine. Legacy centers without the new fields remain compatible unless their accounting category explicitly identifies another module.

## Period values

Monthly center values store:

- provisional amount used by live reports;
- actual amount after invoice/payroll approval;
- status, revision, and source reference.

Depreciation uses the posted monthly depreciation row when available. Before posting, active assets contribute scheduled monthly depreciation and keep the report provisional.

## Accounting model

Production postings use these control accounts:

- raw materials inventory;
- work in progress;
- finished goods;
- actual industrial labor and overhead;
- absorbed overhead;
- manufacturing variance.

Journal lines carry cost center and cost-object dimensions. Every future automatic production journal must use a source/revision idempotency key. BOM estimates must not create inventory credits.

## Migration

1. Preserve all closed-period legacy snapshots.
2. Classify existing centers; missing fields mean legacy production behavior.
3. Run old conversion cost and new full cost in parallel.
4. Explain differences by material, packaging, depreciation, and source quality.
5. Start authoritative postings at the first day of an open accounting period.
6. Bring current inventory into the valuation subledger with an approved opening layer instead of inventing historical movements.
7. Close each period by comparing actual pool cost with absorbed cost and posting a documented variance/revaluation.

## Remaining server cutover

The first release deliberately keeps automatic accounting journals disabled until production stock issues carry an authoritative valuation snapshot. The next cutover moves calculation and inventory/accounting posting into a callable server workflow and uses an outbox/idempotent retry state. Until then, report UI identifies the result as provisional and exposes failures instead of silently ignoring them.
