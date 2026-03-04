# Deprecation Map (Legacy -> Canonical)

This document tracks legacy imports and their canonical replacements.

## Policy

- Do not add new imports from deprecated paths.
- Migrate existing usages incrementally.
- Remove deprecated files only when usage count reaches zero.

---

## Service Migration Table

| Legacy Path | Canonical Path | Status |
|---|---|---|
| `services/reportService.ts` | `modules/production/services/reportService.ts` | deprecated |
| `services/workOrderService.ts` | `modules/production/services/workOrderService.ts` | deprecated |
| `services/productionPlanService.ts` | `modules/production/services/productionPlanService.ts` | deprecated |
| `services/lineService.ts` | `modules/production/services/lineService.ts` | deprecated |
| `services/lineStatusService.ts` | `modules/production/services/lineStatusService.ts` | deprecated |
| `services/lineProductConfigService.ts` | `modules/production/services/lineProductConfigService.ts` | deprecated |
| `services/productService.ts` | `modules/production/services/productService.ts` | deprecated |
| `services/productMaterialService.ts` | `modules/production/services/productMaterialService.ts` | deprecated |
| `services/storageService.ts` | `modules/production/services/storageService.ts` | deprecated |
| `services/scanEventService.ts` | `modules/production/services/scanEventService.ts` | deprecated |
| `services/monthlyProductionCostService.ts` | `modules/production/services/monthlyProductionCostService.ts` | deprecated |
| `services/costCenterService.ts` | `modules/costs/services/costCenterService.ts` | deprecated |
| `services/costCenterValueService.ts` | `modules/costs/services/costCenterValueService.ts` | deprecated |
| `services/costAllocationService.ts` | `modules/costs/services/costAllocationService.ts` | deprecated |
| `services/laborSettingsService.ts` | `modules/costs/services/laborSettingsService.ts` | deprecated |
| `services/systemSettingsService.ts` | `modules/system/services/systemSettingsService.ts` | deprecated |
| `services/roleService.ts` | `modules/system/services/roleService.ts` | deprecated |
| `services/activityLogService.ts` | `modules/system/services/activityLogService.ts` | deprecated |
| `services/adminService.ts` | `modules/dashboards/services/adminService.ts` | deprecated |

Notes:

- Some root services are still valid cross-domain utilities (not deprecated by this table):
  - `services/firebase.ts`
  - `services/userService.ts`
  - `services/backupService.ts`
  - `services/notificationService.ts`
  - `services/dashboardStatsService.ts`
  - `services/imageCompression.ts`

---

## Duplicate/Overlapping File Watchlist

These paths require explicit ownership decisions:

- `modules/production/services/monthlyProductionCostService.ts`
- `modules/costs/services/monthlyProductionCostService.ts`

Action:

- Keep one domain owner.
- Replace references to non-owner file.
- Delete the duplicate file after migration.

---

## Migration Checklist (Per File)

For each migrated import:

1. Replace legacy import with canonical import.
2. Run local lint/typecheck.
3. Verify affected runtime flow manually.
4. Mark migration item in PR notes.

---

## Progress Tracking Template

| Legacy file | Current usage count | Target count | Owner | ETA |
|---|---:|---:|---|---|
| `services/reportService.ts` | TBD | 0 | Production | TBD |
| `services/workOrderService.ts` | TBD | 0 | Production | TBD |
| `services/productionPlanService.ts` | TBD | 0 | Production | TBD |
| `services/lineService.ts` | TBD | 0 | Production | TBD |
| `services/systemSettingsService.ts` | TBD | 0 | System | TBD |
| `services/adminService.ts` | TBD | 0 | Dashboards | TBD |
