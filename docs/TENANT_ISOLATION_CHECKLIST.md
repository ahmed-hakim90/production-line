# Tenant isolation — manual verification checklist

Use a **new tenant / company** with **no seed data** (or a fresh test tenant) after deploying Firestore indexes (`firebase deploy --only firestore:indexes`).

## Work orders

- [ ] `/work-orders` (realtime table): empty list or only this tenant’s orders; no rows from other companies.
- [ ] Load more: still scoped to current tenant only.

## Inventory

- [ ] **Warehouses**: list shows only warehouses created under this tenant.
- [ ] **Stock balances**: no balances from another tenant; new tenant shows empty or only local movements.
- [ ] **Stock movements / transfers**: history and pending approvals are tenant-scoped; reference numbers (`INV-*`) do not collide across tenants in a way that shows foreign data.

## Costs

- [ ] **Assets / depreciation**: lists empty or tenant-only; monthly depreciation job writes include `tenantId`.
- [ ] **Cost centers / values / allocations**: only this tenant’s configuration.
- [ ] **Monthly production costs / cost health**: `monthly_production_costs` queries return only rows for `tenantId`; no cross-tenant monthly rows.

## Sessions / audit

- [ ] **Operations monitor / sessions** (`audit_logs`): events are filtered by tenant (existing `auditService` behavior); no other tenant’s session IDs.

## Rules & indexes

- [ ] Deploy Firestore rules and indexes after release.
- [ ] If a query fails with “requires an index”, use the link in the browser console to create the composite index, or add it to `firestore.indexes.json` and redeploy.

## Legacy data

Documents **without** `tenantId` may still be readable under `sameTenantOrLegacyRead()` until a backfill completes. After backfill, plan to tighten rules per comment in `firestore.rules`.
