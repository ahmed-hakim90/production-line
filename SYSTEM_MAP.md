# SYSTEM_MAP — Production Line ERP

**Identity:** Arabic (RTL) multi-tenant factory ERP **ForgeOps** — production, inventory, repair, HR, costing.  
**Last updated:** 2026-08-17 (product brand: ForgeOps)

## Product shape — Module Apps + Domain-Driven

Hakimo is **one platform**, but each module must feel like its own **app** (home, KPIs, lists, quick actions, mobile chrome), while modules talk through **domain contracts** — not UI spaghetti.

| Layer | Rule |
|-------|------|
| **UX App** | Each MOD has its own home (`DomainHomeShell` / `ModuleOpsPageShell`), persona bottom bar where needed, and module-local navigation. Same **Hakimo Flow** design language everywhere. |
| **Activity packs** | `tenants.activityPacks`: `manufacturing` \| `repair`. Missing/empty → **both** (Production never breaks). Gates menu groups + Roles catalog groups. Platform always on: dashboards, HR, customers, accounting, system. |
| **Permission engine** | Flat Firestore keys + matrix catalog (`utils/permissionCatalog.ts`): per page/resource → **عرض / إضافة / تعديل / حذف** + named actions. UI: Roles modal matrix. Runtime pilots: `useResourcePermission` on products, quality.workers, inventory/warehouses, customers, catalog.categories, lines/lineStatus, roles/users, materials. Server still exact-key authoritative. Module KPI boards use dedicated keys (`productionDashboard.view`, `hrDashboard.view`, `factoryDashboard.view`, `repair.dashboard.view`) — not operational `plans.view` / `reports.view`. |
| **Domain ownership** | One module owns its aggregates, statuses, and write paths (e.g. Repair owns jobs; Inventory owns stock movements; Production owns plans/reports). |
| **Cross-module talk** | Prefer: typed services / application use-cases / shared domain libs — **not** importing another module’s pages or UI state. Reads may use shared query services; writes stay in the owning module (or Cloud Functions when authoritative). |
| **Platform core** | Auth, tenant, permissions, theme/tokens, shells, print engine (`PrintEngineProvider` — single print host), notifications — shared only as platform, never as business rules of another MOD. |

Examples of correct integration:

- Production report → Inventory **production issue** (inventory owns stock out)
- Repair spare request → Inventory **replenishment / RSI** (inventory owns warehouse stock; repair owns job demand)
- Production totals → Accounting **monthly cost** (costs owns valuation; production supplies quantities)
- Customer master ↔ Repair jobs (customers own master; repair links `customerId`)

Anti-patterns: page-to-page coupling, duplicating stock logic inside repair UI, trusting client totals across modules.

## Core / runtime

- Vite + React SPA → Firebase Auth, Firestore, Cloud Functions, Storage/FCM
- Tenant-scoped routes under `/t/:tenantSlug/...`
- Shared permissions (`utils/permissions.ts`), menu (`config/menu.config.ts`), inventory warehouse scope
- Visual language: **Hakimo Flow** — tokens in `src/index.css` / `DEFAULT_THEME`; runtime apply via `applyAppTheme` (`core/ui-engine/theme/tenantTheme.ts`); shells `DomainHomeShell` + `ModuleOpsPageShell`; doc `docs/HAKIMO_FLOW.md`
- **UI theme vs print:** `systemSettings.theme` drives on-screen CSS vars (`applyAppTheme`); product UI is guarded by `npm run arch:check:theme-tokens` (blocks hex + slate/gray + semantic Tailwind palettes mapped to success/warning/danger/primary/secondary; sidebar colorful + charts use `--chart-*` via `core/ui-engine/theme/chartColors.ts`). `systemSettings.printTemplate` drives paper / WhatsApp PNG plus per-document field visibility / custom lines / print font (full registry: production/worker/missing/supervisor/BOM, repair invoice/payment/spare/treasury/receipt/card/delivery, stock transfer/receipt/issue/item/supplies/department consumable/replenishment, accounting, quality, payslip, routing, catalog product detail). **Runtime print** goes through one host: `PrintEngineProvider` in `App.tsx` (`useManagedPrint` / `printDocument`). Preview: `/settings/reports` + `/dev/image-export`. Auth/splash branding panel uses **fixed ForgeOps blue** (`PRODUCT_BRAND.splashHex` / `--splash-brand`) — never tenant primary. Print/WhatsApp soft accents derive from `printTemplate.primaryColor` with UI theme fallback via `resolvePrintAccentHex`. Theme-preset color pickers still use literal hex by design.

## Modules (MOD)

| ID | Name | Category |
|----|------|----------|
| MOD / 01 | Dashboards | Ops overview |
| MOD / 02 | Production | Plans, lines, reports, routing, packaging |
| MOD / 03 | Manufacturing / Catalog | Materials, product BOM, categories |
| MOD / 04 | Inventory | Warehouses, balances, transfers, production issues |
| MOD / 05 | Repair | Jobs, custody, spare parts, RSI vouchers, treasury; manufacturer warranty (full/partial per product) |
| MOD / 06 | Customers | Customer master + repair links |
| MOD / 07 | HR | Employees, attendance, payroll, approvals |
| MOD / 08 | Accounting / Costs | Journals, valuation, monthly production cost |
| MOD / 09 | Quality | IPQC, final inspection, CAPA |
| MOD / 10 | System | Users, roles, settings, import/export |

## Primary path

1. **Catalog** — manufactured products (`isManufactured`) + materials/BOM  
2. **Production plan / report** → **production issue** (prepare by location → approve → issue → print)  
3. Stock moves supplies → floor → WIP → finished  
4. **Repair** (parallel): receive (per-product `inWarranty`) → **desk assign or QR claim** (`/repair/jobs/:jobId/claim` → workspace; unassigned `received` advances to `diagnosing` / جاري الفحص; QR claim is tenant-scoped for any `repair.jobs.technician`, not limited to branch `technicianIds`) → technician saves diagnosis → `diagnosed` / تم الفحص → part/service → billable: `estimate_ready` → customer approval → repair/parts; **full manufacturer warranty (all lines, customer cost 0): skip customer pricing approval** → repair/parts (`approvalStatus: not_required`) → ready → deliver. Desk (reception/edit) may **reassign / فك الإسناد** when the tech is unavailable; unassign on diagnosing without diagnosis rolls back to `received`. Closed/terminal QR reopen is view-only when already assigned to that tech. Status roles configured in repair settings. Manufacturer warranty: all lines → full `WAR-…` close without collect; mixed → bill non-warranty only + `warrantyAllowances` on deliver (mixed still needs customer approval on the billable share)

5. **Center replenishment** (parallel): center request → central approve/prepare/responsible → center receive (stock in on receive only)

## Counts (honest)

- Roles: built-in factory + repair roles (admin, factory_manager, materials_warehouse, repair_technician, …)
- Product modules: ~10 above
- Integrations: Firebase (live); Vercel web hosting (live); no separate API server

## Roles (who acts where)

| Role focus | Typical entry |
|------------|----------------|
| Factory / production | Plans, reports, production issues |
| Materials warehouse | Raw/decomposed control, production issues |
| Spare-parts central | Home `/` → warehouse workspace; mobile bar (لوحتي / التموين / الأرصدة / المراكز); queue `/inventory/spare-parts-replenishment` |
| Inventory admin | `/inventory/warehouses` hub (role/branch filters) |
| Repair center / reception | Home `/` → repair ops; mobile bar (لوحتي / طلب جديد / الطلبات / التحصيل) |
| Repair admin / مدير الصيانة | Home `/` → repair admin; mobile bar (لوحتي / الطلبات / التحصيل / الأداء) |
| Repair technician | Home `/` → technician portal (mobile cards); mobile bar (لوحتي / طلباتي); job workspace steps: تشخيص → قطع → إنهاء |
| Customer portal | `/portal/:tenantSlug` after PIN login; public chrome `PublicCustomerSurfaceShell` (not staff sidebar); bottom bar (طلباتي / طلب جديد / التحديثات / ملفي). Staff create PIN on customer card and copy PIN + portal link (`?code=` prefills login; PIN never in URL). |

## Repair / spare stock permission keys (workflow)

- `sparePartsReplenishment.view|create|approve|prepare|responsibleApprove|receive|cancel|reject`
- `repairSpareIssues.view|create|approve|issue|print|cancel|reject`

## Integrations

| System | Status |
|--------|--------|
| Firebase Auth / Firestore / Functions | Live |
| Vercel (Vite SPA hosting) | Live — `https://production-line.vercel.app` |
| Firestore emulator | Rules tests only |
| FCM / Storage | Live where configured |

## Key routes / entry points

| Flow | Path |
|------|------|
| Public landing (no last tenant) | `/` → `LandingPage` |
| Resume last tenant (PWA start) | `/` → `/t/{lastSlug}/` (manifest rewritten to tenant while in-app) |
| Register company | `/register-company` |
| Tenant login gateway | `/login` |
| Production home board (KPIs + charts) | `/production` (`productionDashboard.view` / factory / admin) |
| Supervisor analysis home (level 2) | `/` (الرئيسية) — also `/supervisor`; not a production sidebar item |
| Warehouses hub (filters, no sidebar spam) | `/inventory/warehouses` |
| Shelf locations | `/inventory/locations` |
| Production issue | `/inventory/production-issues` |
| Production floor stock | `/production/floor` (`inventory.view`; legacy `/inventory/production-floor` redirects) |
| Department consumable issues (print before/after issue) | `/inventory/department-consumables` |
| Catalog home board (KPIs + readiness) | `/catalog` |
| Products (factory tag filter) | `/products` |
| Repair job detail / assign | `/repair/jobs/:jobId` |
| Technician QR claim → workspace | `/repair/jobs/:jobId/claim` |
| Technician workspace | `/repair/jobs/:jobId/workspace` |
| Custody + unrepairable (tabs) | `/repair/custody-stock` (`?stockType=unrepairable`) |
| Legacy unrepairable | `/repair/unrepairable-stock` → redirect |
| Spare parts center | `/repair/parts` |
| Center replenishment follow-up (master–detail + receive badge) | `/repair/parts-replenishment` |
| Spare issue vouchers (list + detail like production issue) | `/repair/spare-issues` |
| Central spare replenishment (master–detail + pending badge) | `/inventory/spare-parts-replenishment` |
| HQ center stock / recall | `/inventory/spare-parts-center-stock`, `/inventory/spare-parts-recall` |
| Ops decision queue (includes repair replenishment / RSI) | Dashboard `OperationalDecisionQueue` (admin/factory compact) |
| Repair ops / admin / tech home | `/repair`, `/repair/technician` |
| Technician team performance | `/repair/technician-kpis` |
| Inventory analysis home | `/inventory` |
| Accounting home (DomainHomeShell) | `/accounting` |
| Monthly production cost (under Accounting) | `/accounting/monthly-costs` |
| Cost centers + allocation | `/accounting/cost-centers` |
| Assets / depreciation | `/accounting/assets`, `/accounting/depreciation-report` |
| Legacy cost URLs | `/monthly-costs`, `/cost-centers`, `/costs/*` → redirect to `/accounting/*` |
| HR home (DomainHomeShell) | `/hr/dashboard` |
| Customers KPI board (ModuleOpsPageShell) | `/customers/kpi` — **لوحة العملاء**: أعلى/أقل حجم شغل، أعلى مديونية، أكثر ترددًا في الصيانة + قائمة المتابعة |
| Customer portal (public chrome, PIN) | `/portal/:tenantSlug` (`?code=` prefills customer code) |
| Public repair track | `/track/:tenantSlug` |
| Public estimate approval | `/track/:tenantSlug/approve` |
| Quality reports board (ModuleOpsPageShell) | `/quality/reports` |
| Shared ops list chrome | `ModuleOpsPageShell` / `DomainHomeShell` in `modules/dashboards/components` |
