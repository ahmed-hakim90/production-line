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

## Foundation helpers (automated)

- [ ] `npx --yes tsx tests/foundation-harden.test.ts` — tenant stamp overwrites client `tenantId`; cross-tenant `assertSameTenant` rejects; transfer/org usecases fail without tenant.
- [ ] `npm run arch:check:legacy-imports` — no Firestore write APIs in module pages or `components/modal-manager/**`.
- [ ] Role create/update/delete go through `modules/system/usecases` (emits audit events).
- [ ] Organization modal + store transfer create/reject go through usecases (not direct Firestore / service mutate from UI).

## Hardening P0 (2026-08-03)

- [ ] Tenant admin with `users.manage` cannot set `isSuperAdmin: true` (rules test covers this).
- [ ] Restore for tenant A does not delete/alter tenant B docs (`full_reset` tenant-scoped; client `full_reset` blocked).
- [ ] User with only `inventory.view` cannot write `stock_transactions` / `stock_items`.
- [ ] After backfill, `hr_settings/{tenantId}`, `labor_settings/{tenantId}`, `approval_settings/{tenantId}`, `hr_config_modules/{tenantId}__*` exist per company.
- [ ] Storage uploads use `company/{tenantId}/{module}/...` for new files.
- [ ] `npm run test:rules` passes including privilege-escalation and stock-permission cases.
- [ ] `npm run test:all` + `npm run typecheck` + `npm run typecheck:functions` pass before deploy.
