# ADR-009: Material master workspace boundaries

## Status

Accepted — 2026-09-08.

## Decision

`/manufacturing/materials` owns material identity, classification, procurement metadata, BOM relationships, readiness indicators, and repair-price eligibility. Inventory remains the source of truth for balances, locations, and movements. Repair consumes company-wide prices from the material master and does not own them.

The catalog may derive `MaterialCatalogRow` values for presentation, but must not persist balance or health summaries into material documents. Balance summaries are read in batches and detailed inventory history is loaded only from the material file or item card.

Permissions remain separated: `materials.*` for master data, `bom.*` for BOM, `inventory.view` for stock context, and `repair.pricing.manage` for repair prices.

## Consequences

- The material list can expose incomplete records without duplicating operational data.
- The material file links to `/inventory/item-card` for the complete stock ledger.
- Deactivation is the default safe lifecycle action; deletion is blocked when current stock or a material-owned BOM exists.
