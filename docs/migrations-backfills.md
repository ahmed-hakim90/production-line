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

## Repair built-in roles (reception / technician)

Script: `scripts/seed-repair-builtin-roles.mjs`

Upserts branch-isolated roles for every active tenant (or `--tenant`):

| roleKey | Name | Purpose |
|---------|------|---------|
| `repair_reception` | استقبال صيانة | Intake + delivery; no workshop / no cross-center admin |
| `repair_technician` | فني صيانة | Assigned jobs + workshop parts; no create-intake / no cross-center admin |

```bash
npm run seed:repair-roles
npm run seed:repair-roles -- --apply
npm run seed:repair-roles -- --tenant <tenantId> --apply
```

Uses Firebase CLI login (REST admin). After seeding, bind each user to one repair center in **إدارة المستخدمين → مركز / فرع الصيانة المرتبط** (`users.repairBranchId` + `repairBranchIds`). Firestore rules already enforce branch scope on `repair_jobs`.

Center warehouse operators may instead be bound via **مخزن المخزون** (`users.inventoryWarehouseId` → the center’s `maintenance_center` warehouse). Saving that bind also syncs `repairBranchIds` when a repair branch points at the same warehouse. Rules also resolve warehouse bind for branch-scoped reads.

Technician assignment stores **employee id** on `repair_branches.technicianIds`. Assign/remove also dual-writes the linked Auth `userId` so `pl_isTechnicianAssignedToBranch` matches. Job `technicianId` prefers Auth uid (service + UI). Opening a job detail with edit rights auto-rewrites legacy employee-only `technicianId` to the linked uid. For older branch rows that only have employee ids: re-assign the technician once, or set `repairBranchIds` / warehouse bind on the user.

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

## Customers master (CRM)

Import existing customer codes via UI:

1. Menu → العملاء → استيراد العملاء
2. Download Excel template
3. Upsert by business code (`CST-…` / `TRD-…` or your existing codes)

Link historical repair jobs that lack `customerId`:

1. Menu → العملاء → ربط طلبات الصيانة (`/customers/repair-link`)
2. Scan → preview matches by unique phone digits (≥7)
3. Apply links (unique match only; no auto-create; ambiguous phones skipped)

Collections: `customers`, `customer_activities`. See [adr/ADR-004-customers-master-data.md](./adr/ADR-004-customers-master-data.md).

## Repair company-wide material sale price

Sale/usage price for repair is stored once on manufacturing `materials.defaultSalePrice` (not per branch). UI: `/repair/parts-pricing` (`repair.pricing.manage`).

**One-time backfill from legacy branch catalog**

On the pricing page, use **ترحيل أسعار الفروع**:

- For each active material with `defaultSalePrice` empty/0
- Take the **max** positive `repair_spare_parts.defaultSalePrice` among parts linked via `materialId` / `rawMaterialId`
- Write that value onto the material (does **not** overwrite an existing material price)

Pure planner: `modules/repair/lib/repairMaterialSalePriceBackfill.ts`
ADR: [adr/ADR-005-repair-spare-issues-on-inventory.md](./adr/ADR-005-repair-spare-issues-on-inventory.md)

Deploy updated Cloud Functions (`repairSpareIssues`, `requestRepairJobSparePart`) so job issue/pending-supply snapshots use Material price.

## Other Functions backfills

Compile then run (from `functions/package.json`):

```bash
npm --prefix functions run backfill:tenantId:dry
npm --prefix functions run backfill:tenantId:apply
npm --prefix functions run backfill:dashboardStats:dry
npm --prefix functions run backfill:supervisorAssignments:dry
```

Source of truth: `functions/src/scripts/*` → build to `functions/lib/scripts/*`.
