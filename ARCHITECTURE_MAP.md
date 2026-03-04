# Architecture Map (Canonical Paths)

This document defines the canonical architecture for the app and the allowed dependency flow.

## Dependency Flow

`UI (pages/components) -> usecases/store -> services -> Firebase`

Rules:

- Pages/components do not call Firebase directly.
- Business rules live in usecases/store, not in rendering layer.
- Services perform IO and persistence access only.

---

## Top-Level Layers

- `core/`
  - auth, permission model, cross-cutting app policies.
- `shared/` and `src/shared/`
  - reusable UI primitives, shared hooks/events/helpers.
- `modules/`
  - domain features and feature-local services/usecases/pages.
- `functions/`
  - Firebase Functions/runtime scripts.

---

## Canonical Domain Ownership

## Production

- Pages: `modules/production/pages/*`
- Components: `modules/production/components/*`
- Services (canonical):
  - `modules/production/services/reportService.ts`
  - `modules/production/services/workOrderService.ts`
  - `modules/production/services/productionPlanService.ts`
  - `modules/production/services/lineService.ts`
  - `modules/production/services/lineStatusService.ts`
  - `modules/production/services/lineProductConfigService.ts`
  - `modules/production/services/productService.ts`
  - `modules/production/services/productMaterialService.ts`
  - `modules/production/services/storageService.ts`
  - `modules/production/services/scanEventService.ts`
  - `modules/production/services/monthlyProductionCostService.ts`

## Inventory

- Pages: `modules/inventory/pages/*`
- Services (canonical):
  - `modules/inventory/services/stockService.ts`
  - `modules/inventory/services/transferApprovalService.ts`
  - `modules/inventory/services/rawMaterialService.ts`
  - `modules/inventory/services/warehouseService.ts`

## HR

- Pages: `modules/hr/pages/*`
- Services (canonical):
  - `modules/hr/employeeService.ts`
  - `modules/hr/attendanceService.ts`
  - `modules/hr/leaveService.ts`
  - `modules/hr/loanService.ts`
  - `modules/hr/vehicleService.ts`
  - `modules/hr/employeeFinancialsService.ts`

## System

- Pages: `modules/system/pages/*`
- Services (canonical):
  - `modules/system/services/systemSettingsService.ts`
  - `modules/system/services/roleService.ts`
  - `modules/system/services/activityLogService.ts`

## Quality

- Pages: `modules/quality/pages/*`
- Services (canonical):
  - `modules/quality/services/qualityInspectionService.ts`
  - `modules/quality/services/qualityNotificationService.ts`
  - `modules/quality/services/qualityPrintService.ts`
  - `modules/quality/services/qualitySettingsService.ts`
  - `modules/quality/services/qualityWorkersService.ts`

## Costs

- Pages: `modules/costs/pages/*`
- Services (canonical):
  - `modules/costs/services/costCenterService.ts`
  - `modules/costs/services/costCenterValueService.ts`
  - `modules/costs/services/costAllocationService.ts`
  - `modules/costs/services/laborSettingsService.ts`
  - `modules/costs/services/monthlyProductionCostService.ts`

## Dashboards

- Pages: `modules/dashboards/pages/*`
- Services (canonical):
  - `modules/dashboards/services/adminService.ts`

---

## Legacy Paths (Non-Canonical)

The root `services/*` directory contains old/duplicated services and is considered legacy for migrated domains.

Status policy:

- Existing usage is tolerated temporarily.
- New imports from legacy paths are blocked by `check-legacy-imports`.
- Migrate usages to canonical module services, then delete legacy files.

---

## File Size/Complexity Hotspots (Next Refactor Targets)

- `modules/system/pages/Settings.tsx`
- `store/useAppStore.ts`
- `modules/production/pages/Reports.tsx`

These must be split by domain concern in upcoming phases.

---

## Change Control

Before introducing a new service:

1. Place it under the owning module (`modules/<domain>/services`).
2. Add entry here if it becomes a domain boundary.
3. Avoid creating new root `services/*` files unless cross-domain and approved.
