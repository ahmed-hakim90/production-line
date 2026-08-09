# SYSTEM_MAP — Production Line ERP

**Identity:** Arabic (RTL) multi-tenant factory ERP — production, inventory, repair, HR, costing.  
**Last updated:** 2026-08-09

## Core / runtime

- Vite + React SPA → Firebase Auth, Firestore, Cloud Functions, Storage/FCM
- Tenant-scoped routes under `/t/:tenantSlug/...`
- Shared permissions (`utils/permissions.ts`), menu (`config/menu.config.ts`), inventory warehouse scope

## Modules (MOD)

| ID | Name | Category |
|----|------|----------|
| MOD / 01 | Dashboards | Ops overview |
| MOD / 02 | Production | Plans, lines, reports, routing, packaging |
| MOD / 03 | Manufacturing / Catalog | Materials, product BOM, categories |
| MOD / 04 | Inventory | Warehouses, balances, transfers, production issues |
| MOD / 05 | Repair | Jobs, custody, spare parts, RSI vouchers, treasury |
| MOD / 06 | Customers | Customer master + repair links |
| MOD / 07 | HR | Employees, attendance, payroll, approvals |
| MOD / 08 | Accounting / Costs | Journals, valuation, monthly production cost |
| MOD / 09 | Quality | IPQC, final inspection, CAPA |
| MOD / 10 | System | Users, roles, settings, import/export |

## Primary path

1. **Catalog** — manufactured products (`isManufactured`) + materials/BOM  
2. **Production plan / report** → **production issue** (prepare by location → approve → issue → print)  
3. Stock moves supplies → floor → WIP → finished  
4. **Repair** (parallel): receive → diagnose (auto status) → part/service → estimate → customer approval → repair/parts → ready → deliver; status roles configured in repair settings  

5. **Center replenishment** (parallel): center request → central approve/prepare/responsible → center receive (stock in on receive only)

## Counts (honest)

- Roles: built-in factory + repair roles (admin, factory_manager, materials_warehouse, repair_technician, …)
- Product modules: ~10 above
- Integrations: Firebase (live); no separate API server

## Roles (who acts where)

| Role focus | Typical entry |
|------------|----------------|
| Factory / production | Plans, reports, production issues |
| Materials warehouse | Raw/decomposed control, production issues |
| Spare-parts central | `/inventory/spare-parts-replenishment` (approve/prepare; menu badge) |
| Inventory admin | `/inventory/warehouses` hub (role/branch filters) |
| Repair center / reception | Home `/` → repair ops; mobile repair bottom bar (طلب جديد); replenishment / custody |
| Repair admin / centers manager | Home `/` → repair admin; mobile repair bottom bar (طلبات / تموين / أداء) |
| Repair technician | Home `/` → technician portal; mobile bar (لوحتي / طلباتي) |

## Repair / spare stock permission keys (workflow)

- `sparePartsReplenishment.view|create|approve|prepare|responsibleApprove|receive|cancel|reject`
- `repairSpareIssues.view|create|approve|issue|print|cancel|reject`

## Integrations

| System | Status |
|--------|--------|
| Firebase Auth / Firestore / Functions | Live |
| Firestore emulator | Rules tests only |
| FCM / Storage | Live where configured |

## Key routes / entry points

| Flow | Path |
|------|------|
| Warehouses hub (filters, no sidebar spam) | `/inventory/warehouses` |
| Shelf locations | `/inventory/locations` |
| Production issue | `/inventory/production-issues` |
| Products (factory tag filter) | `/products` |
| Custody + unrepairable (tabs) | `/repair/custody-stock` (`?stockType=unrepairable`) |
| Legacy unrepairable | `/repair/unrepairable-stock` → redirect |
| Spare parts center | `/repair/parts` |
| Center replenishment follow-up (master–detail + receive badge) | `/repair/parts-replenishment` |
| Spare issue vouchers (list + detail like production issue) | `/repair/spare-issues` |
| Central spare replenishment (master–detail + pending badge) | `/inventory/spare-parts-replenishment` |
| HQ center stock / recall | `/inventory/spare-parts-center-stock`, `/inventory/spare-parts-recall` |
| Ops decision queue (includes repair replenishment / RSI) | Dashboard `OperationalDecisionQueue` |
