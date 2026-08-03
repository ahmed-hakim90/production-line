# Security & tenancy (P0 controls)

Canonical English. UI permission checks are **not** the security boundary.

## 1. `isSuperAdmin` lock

- Field: `users/{uid}.isSuperAdmin`.
- **Clients cannot create or update this field.** Firestore rules require create payloads to omit it or set `false`, and updates must not include `isSuperAdmin` in `affectedKeys()` (Admin SDK / trusted scripts only).
- Callables that require platform power use `assertSuperAdmin` (e.g. tenant backup import/export, cascade delete).
- Tenant `users.manage` must not escalate to super-admin (covered in `tests/firestore.rules.test.mjs`).

## 2. Tenant-scoped restore

- Callable: `importTenantBackup` (`functions/src/index.ts` → `tenantImportRestore.ts`).
- Clears and writes are scoped to a single `tenantId` (argument and/or `backup.metadata.tenantId`; mismatch rejected).
- Modes: `merge` | `replace` | `full_reset` — `full_reset` / `replace` clear **tenant-filtered** collections/groups, not the whole project.
- Requires authenticated **super-admin**.

Related: `exportTenantBackup`, `getTenantFirestoreFootprint`, `adminDeleteTenantCascade`.

## 3. Stock permissions

`stock_items`, `stock_location_balances`, and `stock_transactions` writes require:

- Active user + warehouse scope helpers, **and**
- ERP inventory permissions such as:
  - `inventory.transactions.create` / `edit` / `delete`
  - `inventory.items.manage`
  - `inventory.counts.manage`
  - (transactions create also allows production-issue / disassembly permissions where applicable)

Reads remain warehouse-scoped for active users (plus super-admin). Do not treat “signed in + warehouse bind” as sufficient for ledger mutation.

High-risk production / department stock posts go through **Cloud Functions** (server auth + tenant checks). See [adr/ADR-002-server-owned-stock-mutations.md](./adr/ADR-002-server-owned-stock-mutations.md).

## 4. Singleton settings document keys

Avoid shared global IDs across tenants. Target keys:

| Collection | Tenant doc ID | Legacy (dual-read / backfill source) |
|------------|---------------|--------------------------------------|
| `system_settings` | `{tenantId}` | — |
| `hr_settings` | `{tenantId}` | `global` |
| `labor_settings` | `{tenantId}` | `default` |
| `approval_settings` | `{tenantId}` | `global` |
| `hr_config_modules` | `{tenantId}__{module}` | `{module}` |

Backfill: `scripts/backfill-tenant-singleton-settings.ts` (dry-run by default; `--apply --tenant <id>`).

Client helpers: `modules/hr/collections.ts` and `laborSettingsService` already prefer tenant doc ids with legacy dual-read. `modules/hr/approval/collections.ts` still resolves `approval_settings/global` for the approval engine — treat tenant-id docs + backfill as the hardening target until that import path is switched.

ADR: [adr/ADR-001-tenant-scoped-settings.md](./adr/ADR-001-tenant-scoped-settings.md).

## 5. Storage tenant paths

Preferred:

```text
company/{tenantId}/{module}/{documentId}/{fileName}
```

Rules: active user, `tenantId` must match caller’s `users.tenantId`, module allowlist, 15 MiB write cap (`storage.rules`).

Legacy `company/{module}/...` remains readable for migration; **writes denied**.

## 6. TenantId backfill script

Functions script (compile first):

```bash
npm --prefix functions run backfill:tenantId:dry
npm --prefix functions run backfill:tenantId:apply
```

Source: `functions/src/scripts/backfillTenantId.ts` → built `functions/lib/scripts/backfillTenantId.js`.

Legacy docs without `tenantId` may still match `sameTenantOrLegacyRead()` until backfill + rule tighten — see checklist in [TENANT_ISOLATION_CHECKLIST.md](./TENANT_ISOLATION_CHECKLIST.md).

## Related gates

- `npm run arch:check:legacy-imports` — no Firestore writes from pages/modals
- `npm run test:rules` — rules unit tests via emulator
- Decision 009 in `MIGRATION_DECISIONS_LOG.md`
