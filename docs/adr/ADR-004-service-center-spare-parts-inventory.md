# ADR-004: Service-center spare parts on inventory ledger

**Status:** Accepted  
**Date:** 2026-08-04

## Context

After-sales service centers each have a spare-parts warehouse (today created as `RWH-*` with role `general`). Repair keeps a **parallel** stock ledger (`repair_spare_parts_stock` / `repair_parts_transactions`) without locations. Department consumables already show the right pattern: `stock_items` + locations + server-owned issue lifecycle with optional approval.

Operators need:

- Same component catalog as manufacturing materials (BOM components of products).
- Locations and balances in the inventory module.
- Issue/return tied to repair jobs with an **approval** cycle.
- Transfers between service-center warehouses.
- Day-to-day entry from the **repair** menu, scoped to the user’s bound warehouse/branch.

## Decision

1. **Single ledger:** Service-center spare stock lives in inventory (`stock_items`, location balances, `stock_transactions`). Repair jobs post OUT/IN via Cloud Functions — not via client `sparePartsService.adjustStock` for the primary path.
2. **Catalog:** Use manufacturing **materials / components** (`materials` with appropriate types), not a separate product-finished stock identity. Repair part catalog may remain as a thin branch overlay (SKU aliases, sell price) linked by `materialId`.
3. **Warehouse role:** Introduce `spare_parts` (Arabic: قطع غيار خدمة). Branch auto-created warehouses use this role. Bind users via existing `inventoryWarehouseId` and/or `repairBranchId` (must resolve to the same warehouse).
4. **Issue document:** New lifecycle (mirror department consumables): draft → submitted → approved/rejected → issued; return after issued. `sourceModule` e.g. `repair_spare_issue` / `repair_spare_return`. Approval mode tenant setting (direct vs required).
5. **Transfers:** Allowed between `spare_parts` warehouses using existing transfer request / approval flows with warehouse-scope checks.
6. **UX entry:** Primary screens under **الصيانة** (balances/add/issue/transfers scoped). Inventory list pages may show these warehouses when the user has inventory permissions, but operators work from repair.
7. **Migration:** One-time backfill from `repair_spare_parts_stock` → `stock_items` (default location if none). Freeze or dual-read briefly; then stop writing the parallel ledger for new mutations.

## Consequences

- Extends ADR-002: repair spare issue/return/transfer posts are server-owned.
- Repair sales invoice and job consumption must call the new CF path (or shared core) against `stock_items`.
- Soft reservations (`RepairPartReservation`) must check inventory available qty (and optionally location).
- Reports/KPIs that read `repair_spare_parts_stock` need updating.
- Dual-ledger period needs a clear cutover flag and tenant checklist.

## Rejected

- One UI page per service-center warehouse.
- Keeping `repair_spare_parts_stock` as source of truth with locations bolted on.
- UI-only stock deduction from repair jobs.
- Treating spare parts as finished-good product stock instead of component materials.

## Implementation slices (ordered)

1. Model: `WarehouseRole` += `spare_parts`; branch create uses it; sync user warehouse ↔ branch.
2. Scope: repair pages resolve allowed warehouse(s) from branch bind + `inventoryWarehouseId`.
3. CF: repair spare issue lifecycle (create/submit/approve/reject/issue/return) posting to inventory.
4. UI under repair: stock view (by location), add stock, issue docs, link from job detail.
5. Wire job consume/return + sales invoice to CF; disable client ledger writes.
6. Enable inter-center transfers for `spare_parts` warehouses.
7. Backfill migration + docs (`migrations-backfills.md`, menu, permissions).
