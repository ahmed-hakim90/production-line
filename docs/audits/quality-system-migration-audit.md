# Quality System Migration Audit

**Status:** implementation is in the repository as of 2026-10-28. The old quality screens are retired in code. Live Firestore rules, indexes, and Storage rules are not deployed, so new quality writes stay blocked until that reviewed deploy. Checklist: `docs/audits/quality-system-implementation-checklist.md`.  
**Date:** 2026-10-28

## Final product decision (overrides the “add beside the old module” recommendation)

- Replace the old Hakim quality screens. Do not keep final inspection, IPQC, rework, or CAPA as a second operational module.
- Transfer AQL pallets, hourly samples, line sample pulls, scrap, and second-sort handover. Do not build the empty incoming placeholder.
- Do not import demo seed rows, demo users, or a missing `quality_system.db`. Historical import stays a separate operation.
- Pilot tenant slug: `sokany-eg`, resolved at runtime from the tenant record. Do not hardcode a Firestore id.
- Products, lines, employees, work orders, and production-report quantities stay Hakim masters.
- `home` / `seria` are quality sector tags on quality records, not HR departments and not product categories. Hakim has no Seria master.
- Pallet quantity is the inspection lot size used for AQL. Daily produced quantity is read from `production_reports.quantityProduced` for the same date, line, and product. Quality does not store a second production total.
- Authorization is Hakim Auth plus permission keys enforced in Firestore and Storage. The standalone role header is not reproduced.
- Old quality collections stay readable and are not deleted. Client writes to the retired inspection model are denied after the new rules are deployed. Deploy of rules and indexes is a separate reviewed operation.
- Work-order close still honors `closeRequiresQualityApproval`. A close is allowed when the legacy `qualityStatus` is `approved` or `not_required`, or when every pallet linked to that work order is completed and accepted.  
**Source:** [sokany-quality/Quality-System](https://github.com/sokany-quality/Quality-System) `main` (created 2026-10-24, JavaScript, ~964 KB).  
**Destination:** Hakim Production (`Factory-erp-production-management` 4.0.128) at this repository.  
**Approval required before any implementation.**

The two systems are not the same quality product. The standalone app is an Arabic factory floor system for AQL pallet inspection, hourly and line sample pulls, scrap, and a second-sort handover. Hakim already has a quality module for work-order final inspection, IPQC, defects, rework, and CAPA. Integrating the standalone system means adding that factory workflow and linking it to Hakim identity and production masters. It does not mean deleting Hakim’s current quality records on day one.

---

## 1. Repository and technology comparison

| | Standalone Quality System | Hakim Production |
|---|---|---|
| Path | GitHub `sokany-quality/Quality-System`. Not present as a sibling checkout under `~/Developer`. | `/Users/hakimo/Developer/production-line` |
| Runtime | Node.js with built-in `node:sqlite` (`DatabaseSync`). Express 5.2.1, `cors`. One script: `node server.js` on port 3000. | Vite + React 19 SPA. Firebase Auth, Firestore, Cloud Functions (Node 22), Storage/FCM. No local API server. |
| Language | JavaScript, no TypeScript, no bundler. | TypeScript. Zustand, React Router 7, TanStack Query, Tailwind 3, sonner. |
| Entry | `server.js` serves `public/` and `/api/*`. UI is one page: `public/index.html` + `public/js/app.js` (~5,988 lines) + `public/js/exports.js` + `public/css/styles.css`. | `index.html` → `App.tsx`. Quality routes from `modules/quality/routes/index.ts`. |
| Database | SQLite file `quality_system.db` next to the app. Created on first start. `*.db` is gitignored. **The GitHub repo contains schema and seed data only, not factory history.** | Firestore collections, `firestore.rules`, `firestore.indexes.json`. Tenant field `tenantId`. |
| Auth | No login session. A user dropdown sends `x-user-id`, `x-user-name`, and `x-user-role`. If headers are missing, the server assumes user id `1` and role `admin`. Passwords are stored in plaintext. | Firebase Auth. Roles and flat permission keys in `utils/permissions.ts`. Rules check tenant membership for quality collections. |
| UI stack | Tailwind from CDN, Chart.js + datalabels, Font Awesome 6, Cairo, SheetJS 0.18.5, html2canvas. Brand color `#c8102e`. RTL. | Hakimo Flow tokens, Material-style icons in the menu, shared shells (`ModuleOpsPageShell`), print engine, lucide-react. RTL Arabic. |
| Tests | `test_system.js` covers AQL lookup, accept/reject math, pallet lifecycle, and the daily summary. It writes then deletes a test pallet. | `npm run test:all` / `ci`. Quality is covered indirectly (print registry, navigation). No AQL suite. |
| External services | Google Fonts, jsDelivr, cdnjs. No Firebase. | Firebase (live), Vercel hosting. |

Standalone layout: sticky header, collapsible sidebar, tab panes in one document (no URL routes). At ≤767px the sidebar collapses to icons. Print CSS hides chrome and uses the Maghraby letterhead image `public/images/el-maghraby-letterhead.png`.

Three top-level “systems” share one page:

- **نظام الجودة** — implemented.
- **نظام الهوالك** — implemented (hourly scrap, scrap without periods, second-sort handover).
- **نظام الوارد** — a titled empty dashboard. No tables, no API.

---

## 2. Quality feature inventory

### Quality screens (`public/index.html` tabs)

| Tab | What the operator does |
|---|---|
| لوحة التحكم | KPIs, daily/product/defect charts, Pareto, heatmap, line/product comparison. Filters by month, date, line, product, defect. |
| استلام وفحص البلتات | Two stages: receive pallet, then inspect. Statuses: في انتظار الفحص / جاري الفحص / تم الفحص. Decision: مقبول / مرفوض / قيد الفحص. Modes: auto AQL, manual accept, manual reject. |
| استلام عينات بالساعة | Hourly sample slots (default 08:00–16:00), samples, defects, daily line production entry, slot admin. |
| سحب عينات للخطوط | Pull date, line, product, station, slot, inspector, optional second inspector and sample split. Complete later with defects and pallet accept/reject. Station and slot admin. Line stopped / no-sample reason per period. |
| ملخص الخطوط حسب سحب العينات | Problems by line, then one table per hour. Excel, print, PNG, dense screenshot mode. |
| الإنتاج والمفحوص والانتظار | Received vs inspected vs waiting quantities by product. |
| ملخص الجودة حسب الخط | Line quality totals. |
| مخطط الجودة والتحليل | Flowchart analytics. |
| جدول خطط الفحص AQL | Editable ISO 2859-1 Level II ranges (batch min/max, sample size, Ac, Re). |
| خطوط التجميع | Create, edit, archive, restore. Archive hides the line from new picks and keeps history. |
| الأجهزة والمنتجات | Product master owned by this app. |
| مراقبو الجودة والتكليفات | Inspector master plus daily assignment (date, shift, task type, optional line). |
| التقارير والتصدير | Report preview, Excel, CSV, letterhead print. |
| البحث المتقدم والفلاتر | Saved filters. |
| إعدادات النظام | Rejection reasons, supervisors, users. |
| سجل العمليات والتدقيق | `audit_logs`. |

Department switcher filters home appliances (`home`), seria (`seria`), or the whole factory (`all`). It is a string on lines, products, pallets, and reasons. It is not a Hakim tenant.

### Scrap screens

- Dashboard grouped by cause, product, and line.
- Hourly scrap report using the approved hour slots. Causes and products come from the shared quality lists. A product or reason can be created from this screen.
- Scrap report without periods: line, product, quantity, reason.
- Second-sort handover: one model, problem text, one or more photos, discount percent, quantity, approval. Reopen and edit. Font scale 80–150%. Print A5 landscape with letterhead and two signature areas. Photos are resized JPEGs stored as base64 inside `item_json`.

### Incoming

Placeholder only. Do not treat it as a workflow to migrate.

### Validation that must be preserved

- AQL lookup by pallet quantity. Example from the app and tests: quantity 120 → sample 20, accept limit 2, reject limit 3.
- Auto decision: defects ≤ Ac → مقبول; defects ≥ Re → مرفوض. A single defect inside Ac does not reject the pallet.
- Manual override is supervisor-only in the API (`override-decision`).
- Pallet unique per line, pallet number, and date.
- Inspector assignment unique per date, shift, and inspector.
- Line sample: sample count > 0; additional samples cannot exceed the pull; additional inspector is optional.
- Line archive is soft-delete. Station delete hides the station from new pulls and keeps old pulls.
- Second inspector sample count is subtracted from the primary inspector’s share. The pull total stays unchanged.

### What Hakim quality already does (do not confuse with the source)

Routes under `/quality/*` in `modules/quality/routes/index.ts`:

| Route | Screen | Permission |
|---|---|---|
| `/quality/workers` | Quality workers | `quality.workers.view` |
| `/quality/final-inspection` | Final inspection on a work order | `quality.finalInspection.view` / `.inspect` |
| `/quality/ipqc` | In-process inspection | `quality.ipqc.view` / `.inspect` |
| `/quality/rework` | Rework orders | `quality.rework.view` / `.manage` |
| `/quality/capa` | CAPA | `quality.capa.view` / `.manage` |
| `/quality/reports` | Work-order quality report | `quality.reports.view` |
| `/quality/settings` | Templates, sampling frequency, rework policy, print text | `quality.settings.view` / `.manage` |

Hakim inspections point at `workOrderId`, `lineId`, `productId`, and often a serial barcode. Statuses are `pending | passed | failed | rework | approved | rejected`. There is no pallet, no AQL table, and no hourly sample pull.

---

## 3. Source-to-target database mapping

**Live row counts are unknown.** The repository does not contain `quality_system.db`. Historical counts, checkpoints, and reconciliation can be produced only after the factory file is copied from the machine that runs `تشغيل_النظام.bat`. Seed rows in `db/schema.js` are demo data (sample products, lines, pallets, and users). They must not be loaded into Hakim as factory records.

Stable source key for every migrated row: `legacySqliteId` plus `legacyTable`. New Firestore ids stay Hakim-generated. The SQLite integer is stored so a second run can upsert instead of duplicate.

### Do not copy these tables

| Source | Why |
|---|---|
| `users`, `roles` | Hakim identity. Passwords are plaintext and must not move. |
| `products` | Hakim `products` is the master. Match on `code`, then on normalized `name`. Store `legacySqliteId` only in a crosswalk, not as a second product. |
| `production_lines` | Hakim `production_lines` is the master. Match on line number/code, then name. Archive flag maps to line status, not a new line. |
| `line_products` | Hakim already links a line’s current product and plans/work orders. Use only as a hint when matching. |
| `supervisors` | Match name to Hakim supervisors/employees. Unmatched names stay as text on the historical row until an admin links them. |
| `shifts` | Prefer existing HR `shifts` when start/end match. Unmatched shifts become quality settings references, not a second HR shift master. |
| `custom_fields` | Table exists. The UI never reads it. Skip unless a live database shows rows. |
| Incoming | No schema. |

### Map onto existing Hakim collections

| Source | Target | Notes |
|---|---|---|
| `rejection_reasons` | `quality_reason_catalog` | `code`, Arabic label, category, `isActive`, `department` (`home` / `seria`). Dedup by `code`. |
| `quality_inspectors` | `employees` when phone/code/name matches; otherwise a quality worker profile | Do not create login users. `quality_workers_assignments` can hold `qualityRole: inspector` and `legacySqliteId`. |
| `inspector_assignments` | `quality_workers_assignments` or a dated assignment doc | Date + shift + task type + optional `lineId`. Task types (`على خط`, معمل, غياب, إجازة, تدريب) are an enum, not employees. |
| `audit_logs` | `activity_logs` | Actor becomes the mapped Hakim user when the crosswalk exists; otherwise store `legacyUserName`. |

### New quality collections (AQL domain)

These are new aggregates. They must not be written into `quality_inspections`, which already means a work-order unit inspection.

| Source | Proposed collection | Relationship |
|---|---|---|
| `aql_sampling_plans` | `quality_aql_plans` | Tenant settings. Fields: `batchMin`, `batchMax`, `sampleSize`, `acceptLimit`, `rejectLimit`, `aqlLevel`, `isActive`. |
| `pallets` | `quality_pallets` | `productId`, `lineId`, optional `workOrderId`, `shiftId`, `date`, `palletNumber`, quantities, AQL snapshot, status, decision, mode, inspector employee id, timestamps. Unique: tenant + line + pallet number + date. |
| `pallet_rejection_items` | `quality_pallet_defects` | `palletId`, `reasonId`, `count`, `notes`. |
| `hourly_sample_slots`, `line_sample_slots` | `quality_sample_slots` | One slot list (`kind: hourly \| line`), times, order, active flag. |
| `hourly_samples` + `hourly_sample_defects` | `quality_hourly_samples` + `quality_hourly_sample_defects` | Linked product, line, slot, shift, inspector. |
| `inspection_stations` | `quality_inspection_stations` | Name, default inspector, active. Soft-hide on delete. |
| `line_sample_pulls` + `line_sample_pull_defects` | `quality_line_sample_pulls` + `quality_line_sample_defects` | Status `pending` / completed, `palletRejected`, sample split. |
| `line_sample_period_statuses` | `quality_line_period_statuses` | Unique date + slot + line. `isStopped`, `noSampleReason`. |
| `daily_line_production` | **Do not create a second production total.** | Link the pallet/sample day to `work_orders` / `production_reports` when date + line + product match. Keep the SQLite quantity only as `legacyProducedQty` on an import batch if no work order exists. |
| `saved_filters` | Browser favorites already used by Hakim lists | Skip server migration unless the live DB has filters operators still need. |
| `scrap_reports` | `quality_scrap_reports` | `reportDate`, `reportType` (`hourly` \| `manual`), line, causes/periods/items, supervisors, recommendation. |
| `second_sort_handover_reports` | `quality_second_sort_reports` | Structured fields, not one JSON blob. Photos move to Storage. Firestore stores `storagePath` only. |

Every new document carries `tenantId`, `legacyTable`, `legacySqliteId`, `createdAt`, `updatedAt`, and `source: 'quality-system-sqlite'` for migrated rows.

### Work-order link rule

The source has no work order. After product and line are matched:

1. If exactly one open Hakim work order exists for that product, line, and date, set `workOrderId`.
2. If several match, leave `workOrderId` empty and list the row on the reconciliation report.
3. Never invent a work order to make the link succeed.

### Dedup, checkpoints, reconciliation

1. Freeze a copy of `quality_system.db`. Do not delete or vacuum the source.
2. Write count report: one row per source table (`rows`, `active`, `archived`, min/max id, min/max date).
3. Build crosswalks: product code, line number, employee, shift, reason code, user.
4. Dry-run upsert into a non-production tenant or emulator. Idempotency key: `tenantId + legacyTable + legacySqliteId`.
5. Second count report: source vs target, plus unmatched products, lines, inspectors, and ambiguous work orders.
6. Checksums: sum of pallet quantities, sum of defect counts, count of rejected pallets, count of completed line pulls.
7. Promote only after those totals match. Source file stays intact.

`custom_fields_json` on pallets is copied as an opaque map if non-empty. It is not a schema.

---

## 4. User and permission mapping

### Source roles (`roles.permissions` JSON)

| Code | Arabic name | Permissions in seed |
|---|---|---|
| `admin` | مدير النظام | `all` |
| `supervisor` | مشرف الجودة | view, inspect, manage lines/products/assignments/pallets, export |
| `inspector` | مراقب الجودة | view, inspect, manage pallets |
| `viewer` | قراءة فقط | view |

There is no real login. Any caller can send `x-user-role: admin`. Several scrap and saved-filter routes do not call `requirePermission` at all. Bootstrap returns every user. This model is not reused.

### Hakim today

UI keys in `utils/permissions.ts` and `config/menu.config.ts`. Legacy fallbacks: `quality.view`, `quality.inspect`, `quality.manageWorkers`, `quality.approve`, `quality.print`.

Firestore does **not** check those keys for quality. `quality_*` collections sit in `pl_isErpBusinessCollection`. Any signed-in member of the tenant can read, create, update, and delete them (`firestore.rules` around the generic business match). Hiding a button is not authorization. New AQL writes must check permission keys in rules, and the same gap should be closed for the existing quality collections in the same change.

### Proposed keys

Reuse the role document and matrix. Add keys; do not grant `all` or admin.

| Operation | Proposed key | Seed role that receives it |
|---|---|---|
| Open the quality module | existing `quality.view` plus screen `.view` keys | viewer, inspector, supervisor, admin |
| View reports and dashboards | `quality.reports.view` | viewer and above |
| Receive a pallet and record an inspection or sample | `quality.pallets.inspect`, `quality.samples.inspect` | inspector, supervisor |
| Edit an open inspection | same inspect keys, only while status is not completed | inspector, supervisor |
| Record defects | included in inspect keys | inspector, supervisor |
| Approve, reject, or manual AQL override | `quality.pallets.override` | supervisor |
| Reopen or correct a completed pallet or pull | `quality.records.reopen` | supervisor |
| AQL plans, reasons, stations, slots | `quality.settings.manage` | supervisor |
| Export and print | `quality.reports.export` and existing `quality.print` | supervisor |
| Scrap reports and second-sort handover | `quality.scrap.view`, `quality.scrap.manage` | supervisor for manage; viewer for view if approved |
| Change who has these keys | existing role-admin permission (`roles` / users). No new “quality superuser” | tenant admin only |

Existing final inspection, IPQC, rework, and CAPA keys stay. They govern the current work-order flow.

Server enforcement: Firestore rules for each new collection, plus the use case rejecting the command when the caller lacks the key. UI `can()` only hides actions.

Inspector people are employees or quality worker profiles. They are not a second user table.

---

## 5. Dependency and removal analysis for the current Hakim quality module

The current module is referenced outside `modules/quality/`. It cannot be deleted as part of the first release.

| Consumer | Why it breaks if the module disappears |
|---|---|
| `App.tsx` | Registers `QUALITY_ROUTES`. |
| `lib/routeSkeletonRegistry.ts` | Same route list for skeletons. |
| `config/menu.config.ts` | Sidebar group `quality`. |
| `utils/dashboardConfig.ts` | Quick actions to final inspection, IPQC, reports. |
| `utils/permissions.ts` | Permission union, catalog group, legacy fallbacks. |
| `store/useAppStore.ts` | Loads `qualitySettingsService`. |
| `modules/production/pages/Reports.tsx` | Quality report link when `quality.reports.view`. |
| `modules/production/pages/WorkOrderScanner.tsx` | Reads quality settings. |
| `modules/system/components/settings/PrintEngineDocumentPreview.tsx` | Renders `QualityReportPrint`. |
| `utils/print/printDocumentRegistry.ts` | `qualityReport` document type. |
| `modules/dashboards/components/OperationalDecisionQueue.tsx` | Quality decision queue. |
| `modules/dashboards/hooks/useHomeModuleCharts.ts` | Quality chart gate. |
| `modules/dashboards/lib/decisionMetrics.ts` | Quality rate math. |
| `firestore.rules` | Eight quality collections in the business list. |
| `services/backupService.ts` | Backup set includes quality collections. |
| `functions/src/tenantFootprintCollections.ts` and `functions/src/scripts/backfillTenantId.ts` | Tenant footprint. |
| `tests/print-engine-host.test.ts`, `tests/print-document-config.test.ts` | Print host paths. |
| Work order document | `qualityStatus`, `qualitySummary`, `qualityReportCode`, `qualityApprovedBy`, `qualityApprovedAt`. |

`createQualityInspection` is used by final inspection and IPQC. Other quality writes go page → `qualityInspectionService` → Firestore. Services do not currently stamp `tenantId` on the document even though the use case reads the tenant for events. That gap stays in scope when rules are tightened, so existing saves do not start failing closed.

No `quality_*` composite indexes exist in `firestore.indexes.json`. Current screens query by work order. New date/line/product lists will need indexes before production use.

---

## 6. Proposed target architecture

Keep Hakim’s boundary:

**Page → use case → service → Firestore.**  
Shared products, lines, work orders, and employees stay in the Zustand store and their owning services. Quality pages read them. Quality pages do not create product or line masters.

Do not mount `app.js` inside React, and do not iframe the Express app. Copy the visual behavior into React screens under a scoped class (`.qms-shell`) that loads Cairo, the crimson tokens, the letterhead, and the table/print rules from `public/css/styles.css`. The rest of Hakim keeps Hakimo Flow. Chart.js is already avoided in Hakim (`recharts` is the app chart library). Dashboards should be rebuilt with `recharts` unless a side-by-side check shows a chart that cannot be matched. SheetJS and html2canvas already exist in Hakim.

Suggested placement:

- `modules/quality/qms/pages/*` — pallet, samples, AQL, summaries, scrap, second sort.
- `modules/quality/qms/usecases/*` — receive pallet, inspect pallet, complete pull, override decision, reopen.
- `modules/quality/qms/services/*` — Firestore only.
- `modules/quality/domain/aql.ts` — pure `lookupPlan` and `calculateDecision`, ported from `db/index.js` and covered by a unit test copied from `test_system.js` cases.
- Menu children added beside the current quality entries, each with its own permission.

`daily_line_production` is not a new source of truth for factory output. Production reports and work orders remain the production quantity. The quality screen can display them and, only when no match exists, show the legacy imported quantity as historical quality context.

Photos and the letterhead: letterhead is a static asset under the quality module. Second-sort photos go to Storage with a generated name, size and type checks, and a short-lived read path. Base64 blobs do not go into Firestore documents.

---

## 7. Phased implementation checklist

Each phase is shippable only after its tests pass. No phase deletes the current quality routes.

1. **Domain port** — AQL lookup and decision as pure functions plus tests. No UI.
2. **Permissions and rules** — add keys, matrix labels, and Firestore checks for new collections. Include tenant and permission tests (signed out, wrong tenant, missing key).
3. **Read models** — services for plans, pallets, pulls, reasons, stations, slots. Indexes for tenant + date + line.
4. **Pallet workflow UI** — receive, start, complete, override, print. Link product and line pickers to Hakim records (`SearchableSelect` with code).
5. **Line samples, hourly samples, dashboards, exports.**
6. **Scrap and second-sort**, including Storage for photos.
7. **Importer** — dry-run against a provided `quality_system.db`, crosswalk, reconciliation report. No source deletes.
8. **Navigation** — show new items by permission. Keep current final/IPQC/rework/CAPA/reports until you approve retirement or a combined menu.
9. **Cutover** — feature flag default off, then on for the pilot tenant. Old Express app stays available until reconciliation is signed off.
10. **Retire** — only after dependency grep is clean for any route you choose to remove. Incoming placeholder is not built.

---

## 8. Testing and rollback

### Tests before cutover

- Unit: AQL boundaries (2–8, 91–150, 120, above max, zero), auto accept, auto reject, manual accept, manual reject.
- Unit: additional-inspector sample split and validation.
- Rules: unauthenticated, cross-tenant, viewer cannot write, inspector cannot override, supervisor can override.
- Import: idempotent second run does not duplicate; unmatched product is reported and skipped; demo seed is excluded when a `sourceDatabaseId` flag says so.
- UI smoke: receive pallet → waiting → in progress → complete with one defect under Ac → accepted; complete with defects at Re → rejected; print; export.
- Regression: production report save, work order scan, current final inspection, inventory issue. Those flows must behave as they do today.

### Rollback

- Flag `qualityQmsEnabled` (tenant setting, default false) hides new menu and routes.
- Imported docs carry `migrationBatchId`. Rollback deletes only documents with that batch id in the pilot tenant. It does not delete `products`, `production_lines`, `work_orders`, or pre-existing `quality_inspections`.
- Security rules for new collections can deny writes while leaving reads, so operators can still see history during a rollback.
- The SQLite file is never the rollback target for deletes. It remains the source copy.
- Current `/quality/*` routes stay deployed for the whole pilot.

---

## 9. Exact files expected to change

No file in this list has been edited for the migration. This audit document is the only file added.

**New**

- `modules/quality/domain/aql.ts`
- `modules/quality/qms/**` pages, use cases, services, collections
- `tests/quality-aql.test.ts`
- `tests/quality-qms-rules` cases inside the existing rules test
- `scripts/import-quality-system-sqlite.mjs` (dry-run first)
- `docs/adr/quality-qms-integration.md` when implementation starts

**Update**

- `config/menu.config.ts` — new children under `quality`
- `utils/permissions.ts` — keys, catalog labels, fallbacks
- `utils/dashboardConfig.ts` — only if you want dashboard shortcuts
- `modules/quality/routes/index.ts`
- `modules/quality/collections.ts`
- `firestore.rules` — permission checks for current and new quality collections
- `firestore.rules.template` / composed rules via `scripts/compose-firestore-rules.mjs` (follow the existing compose path; do not hand-diverge)
- `firestore.indexes.json` — tenant + date + line, tenant + status
- `services/backupService.ts`
- `functions/src/tenantFootprintCollections.ts`
- `functions/src/scripts/backfillTenantId.ts`
- `SYSTEM_MAP.md` — quality module description after the workflow exists
- `modules/quality/QUALITY_MODULE_CHECKLIST.md`

**Leave in place until a later approved removal**

- `modules/quality/pages/FinalInspection.tsx`, `IPQC.tsx`, `ReworkOrders.tsx`, `CAPA.tsx`, `QualityReports.tsx`, `QualityWorkers.tsx`, `QualitySettings.tsx`
- Production report and scanner call sites listed in section 5

**Do not copy into Hakim**

- `server.js`, `db/index.js` SQL, `public/js/app.js` as the runtime, Express, `node:sqlite`, seed users, CDN Tailwind script tag

---

## 10. Unresolved questions requiring approval

1. **Menu outcome.** Add the factory AQL screens next to final inspection / IPQC / CAPA, or replace those screens? Recommendation: add first. The current screens are tied to work orders and production reports.
2. **Scrap and second-sort.** They live in the same standalone app. Should both enter Hakim with quality, or only pallet and sample inspection?
3. **Incoming.** Confirm it stays out. The screen has no data model.
4. **Live database.** Where is the factory `quality_system.db`, and should seed/demo rows be excluded? Without that file there is nothing historical to migrate.
5. **Product and line match.** Is product `code` in SQLite the same code as Hakim `products.code`? Is line number the same as Hakim `production_lines.code`? A sample crosswalk from you avoids a bad automatic name match.
6. **Seria vs home.** Are these Hakim departments, product categories, or a quality-only filter?
7. **Production quantities.** Confirm quality must not store its own daily produced total when a work order or production report already exists.
8. **Visual language.** Keep the standalone crimson / Cairo / letterhead layout inside the quality module, while the rest of Hakim stays Hakimo Flow? Recommendation: yes, scoped to `.qms-shell`.
9. **Who receives override and reopen.** Is “مشرف الجودة” a current Hakim role, or should those keys be assigned manually on the roles screen?
10. **Pilot tenant.** Which company slug is the first import target?
11. **Tighten existing quality rules.** Closing the current “any tenant member can write quality documents” gap may block a user who relies on that accident. Approve doing it in the same release, with a rules test.

---

## Security notes from discovery (not fixed)

- Standalone authorization is a client-supplied role header, defaulting to admin.
- Seed and create-user paths store plaintext passwords. Those values were not copied into this report and must not be migrated.
- CORS is open. Scrap write APIs are unauthenticated relative to the role helper.
- Hakim quality collections are tenant-scoped and are not yet permission-key scoped.
- Second-sort images as base64 would exceed safe Firestore document size if copied as-is. Storage is the target.
