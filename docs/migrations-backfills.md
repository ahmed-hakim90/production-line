# Migrations and backfills

Canonical English. Prefer dry-run first. Use Admin credentials only on trusted machines.

## Tenant singleton settings

Script: `scripts/backfill-tenant-singleton-settings.ts`

Copies legacy shared docs into tenant-scoped IDs:

| Collection | From | To |
|------------|------|-----|
| `hr_settings` | `global` | `{tenantId}` |
| `labor_settings` | `default` | `{tenantId}` |
| `approval_settings` | `global` | `{tenantId}` |
| `hr_config_modules` | `{module}` | `{tenantId}__{module}` |

```bash
npx tsx scripts/backfill-tenant-singleton-settings.ts --dry-run
npx tsx scripts/backfill-tenant-singleton-settings.ts --apply --tenant <tenantId>
```

Requires `GOOGLE_APPLICATION_CREDENTIALS` or application default credentials with Admin access. Skips targets that already exist; stamps `tenantId` on copy.

See [security-tenancy.md](./security-tenancy.md) and [adr/ADR-001-tenant-scoped-settings.md](./adr/ADR-001-tenant-scoped-settings.md).

## Production floor cutover (Inventory V2)

Script: `scripts/backfill-production-floor-cutover.mjs` (documentation + dry-run scaffold; does **not** invent floor stock from legacy OUT-only issues).

Safe policy:

1. Configure `productionFloorWarehouseId` (distinct from decomposed / WIP / staging).
2. Close or finish open `production_issue_orders` on the legacy OUT path.
3. Physical count of components on the floor.
4. Post opening adjustment / stock count approval into the floor warehouse via inventory UI.
5. Enable packaging handover receipt settings as required; disable auto-transfer-to-finished if that is the V2 policy.

```bash
node scripts/backfill-production-floor-cutover.mjs --dry-run
```

New path: issues TRANSFER decomposed → floor; reports consume from floor via Functions; finished flow may create `production_handover` for packaging receipt.

## Report snapshots

When migrating report mutation ownership or replaying history, preserve audit fields on `production_reports`:

| Field | Meaning |
|-------|---------|
| `operationPathSnapshot` | Entry path used for the original create |
| `lastOperationPathSnapshot` | Most recent mutation entry path |
| `productNameSnapshot` / `productCodeSnapshot` | Catalog labels at save time |
| `workOrderCostPostedSnapshot` / `productionPlanCostPostedSnapshot` | Cost already posted to aggregates |

Do not strip these in imports/backfills. Path snapshots are informational; authorization remains rules + Functions + operation-path checks on the live mutation pipeline (Decision 008).

## Other Functions backfills

Compile then run (from `functions/package.json`):

```bash
npm --prefix functions run backfill:tenantId:dry
npm --prefix functions run backfill:tenantId:apply
npm --prefix functions run backfill:dashboardStats:dry
npm --prefix functions run backfill:supervisorAssignments:dry
```

Source of truth: `functions/src/scripts/*` → build to `functions/lib/scripts/*`.
