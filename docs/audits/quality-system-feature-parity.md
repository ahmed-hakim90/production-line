# Quality system feature parity

Compared on 2026-10-28. Source evidence is `sokany-quality/Quality-System` (`db/schema.js`, `db/index.js`, `server.js`, `public/index.html`, `public/js/app.js`). Hakim evidence is `modules/quality`.

The isolated copy was started again on port 3010 after a seed-order fix. `runMigrations` had inserted seria lines at numbers 1–3 before `seedInitialData` inserted home lines 1–4, which violated `production_lines.line_number`. Seria seeding now runs after the home seed. A fresh disposable database contains home lines 1–4 and seria lines 5–7. The unique constraint was kept. That database was not imported into Hakim.

Statuses used below: Implemented and locally tested; Deployed and live-verified; Blocked pending access or deployment; Not yet implemented. Rows that still say “verified” refer to the earlier `sokany-eg` read-back, not to a new deployment.

| Source capability | Source evidence | Hakim | Status |
|---|---|---|---|
| AQL Level II lookup and Ac/Re decision, including the gap between Ac and Re | `lookupAqlPlan`, `calculateAqlDecision` | `domain/aql.ts`, pallet complete | Implemented and verified. Live lot 70 resolved to sample 13, accept 1, reject 2, decision مقبول. |
| Pallet receive, start, complete, unique line/number/date | `POST /api/pallets/receive`, `PATCH /status`, `POST /:id/inspect` | `/quality/pallets` | Implemented and verified. One pallet was saved on `sokany-eg` and read back after reload. |
| Defect lines must sum to rejected quantity | pallet inspect validation | `qualityPalletService.complete` | Implemented and verified. One `FIN-SCRATCH` line with count 1 matches rejected quantity 1. |
| Manual accept/reject with reason; reopen | `override-decision` is supervisor-only | override and reopen permissions | Implemented but not verified in production. |
| Stations: name, required default inspector, unique active name, soft hide | `inspection_stations`, `createInspectionStation` | Settings list, save, hide, and inspector edit | Implemented but not verified in production. |
| Defect master: unique code, Arabic name, category, sector, active flag | `rejection_reasons` | Settings search, add, edit, stop | Implemented and verified for use of the existing active code `FIN-SCRATCH`. Deactivation of a live code was not repeated. The emulator covers historical readability after deactivation. |
| Defect selection on pallets, hourly samples, and line pulls | rejection item tables | active reason picker on those screens | Implemented and verified on the pallet. Hourly samples and line pulls were not saved in production. |
| Hourly and line slots, standard 08:00–16:00 until custom rows exist | `hourly_sample_slots`, `line_sample_slots` | Settings period form plus `listSlots` | Implemented but not verified in production. |
| Line pull, extra inspector split, stopped period | `line_sample_pulls`, period status | `/quality/line-samples` | Implemented but not verified in production. |
| Home / seria as a quality filter, not an HR department | `department` text on lines, products, reasons, pallets | sector tag and record sector | Implemented and verified for this pallet. Sector is `home`. |
| Scrap report with catalog reason, product, quantity, and cause share | `scrap_reports.items_json`, analysis table | `/quality/scrap` | Implemented but not verified in production. |
| Second-sort paper, photos, font 80–150%, signatures | `SecondSortHandoverModule` | `/quality/second-sort`, Storage | Implemented and verified for one handover and one photo. Anonymous Storage access returned 403. |
| Production quantity | `daily_line_production` | `production_reports.quantityProduced` | Implemented and verified as a separate flowchart figure. The pallet lot was not added to it. |
| Saved pallet filters | `saved_filters`, `SearchModule`, type `pallets` only | `/quality/pallets` | Implemented and verified. `جاهزية 28-10 خط 1` survived reload and is stored on the pallet tenant. |
| Custom fields | `custom_fields`, `pallets.custom_fields_json` | none | Intentionally excluded. Schema only. No route, service, or screen reads or writes them. |
| Flowchart analytics | `getFlowchartMetrics`, flowchart tab | `/quality/flowchart` | Implemented and verified for 2026-10-28. Pallet lot 70, inspected 13, defects 1, one accepted pallet. Reported production stays separate from the pallet lot. |
| Products, lines, shifts, employees | source CRUD and seed | existing Hakim masters | Intentionally excluded. |
| Source users, roles, and header auth | `x-user-role`, default admin | Hakim Auth and permission keys | Intentionally excluded as a second login system. Quality operation keys stay on the existing role screen. |
| Incoming quality | empty dashboard | none | Intentionally excluded. |
| Demo seed rows | `seedInitialData` | none | Intentionally excluded. |
| Work-order close gate | not in the source | `closeWorkOrder` and the client close restriction | Deployed to `sokany-production` on 2026-10-28: callable, both production-report handlers, Firestore rules, and Hosting bundle `index-hZFYG3Ga.js`. Policy stayed off. `WO-2026-0001` was not closed. A live authenticated denial of a direct status write was not performed. |
| Live persistence of new collections | deployed Firestore rules | `sokany-production` rules, indexes, and Storage rules | Implemented and verified for the pallet, its defect, the saved filter, settings policy, and one photo. |
| Cross-tenant denial on the pilot documents | tenant-scoped rules | emulator suite | Blocked pending a second-tenant session. Anonymous reads returned 403. The emulator is not the live test. |
| Pallet AQL print | source inspection sheet | `/quality/pallets` through the shared print engine | Implemented and tested. A4 from the tenant template. |
| Second-sort sheet | A5 landscape, letterhead, signatures, photos | `/quality/second-sort` | Implemented and tested. Page size, subtitle, and shell are A5 landscape, 210×148 mm. |
| Quality report and defect summary | report filters and separate quantities | `/quality/reports` | Implemented and tested. Production, lot, sample, defects, and scrap stay separate. |
| Flowchart print | `getFlowchartMetrics` ranking | `/quality/flowchart` | Implemented and tested. The existing ranking is printed. Production and lot stay separate. |
| Hourly sample print | saved hourly rows and their defect lines | `/quality/hourly-samples` | Implemented but visually unverified. No hourly rows exist for 2026-10-28, so the button stayed disabled. There is no work-order field on the sample. |
| Line-pull print | saved pulls, defects, and stopped periods | `/quality/line-samples` | Implemented but visually unverified. No pulls exist for 2026-10-28. There is no work-order field on the pull. |
| Scrap print | scrap rows and cause share | `/quality/scrap` | Implemented but visually unverified. No scrap rows exist for 2026-10-28. The reason code is read from the defect catalog, not stored on the scrap row. |

## Station facts

`inspection_stations` has `name`, `default_inspector_id`, and `is_active`. Create requires a non-empty name and an active inspector. An active station name cannot repeat. Delete sets `is_active = 0`. Stations are chosen on a line sample pull. They are not tied to a line, product, shift, or inspection type.

## Defect-code facts

`rejection_reasons` has unique `code`, `name`, `category` defaulting to `عام`, `is_active`, and optional `department` (`home`, `seria`, or null for both). Quick-add generates a `DEF-Q-` code and reuses an active reason with the same name. There is no English description and no severity. Pallet, hourly, and line-sample defects store `reason_id` plus count and notes. Scrap items store the reason name. Hakim keeps the code and stops the reason instead of deleting the document. Settings can edit the Arabic name, category, and sector. Stopped codes remain visible in settings and disappear from new pickers.

## Saved filters, custom fields, and the flowchart

Saved filters in the source are pallet search bookmarks. The saved criteria are `date_from`, `date_to`, `line_id`, `product_id`, and `status`. The live search can also use pallet number, shift, and decision, but those three are not written by `saveCurrentFilter`. `created_by` stores the header user id. The list is not filtered by user because the source application is one company. Hakim keeps the same criteria, scopes the documents to the tenant, and allows delete by the creator or by `quality.records.delete`.

Custom fields were not implemented because the source never implemented them beyond the table and the unused pallet JSON column.

The flowchart is a metrics report. It is not an inspection decision tree. Its stages are production units, inspected samples, defects, and pallet decisions. Line rank uses defect rate. Hakim does not add pallet lot quantity to reported production.

## Pilot evidence

On 2026-10-28, after rules deployed to `sokany-production`, the signed-in `sokany-eg` session saved and read back pallet `MNa4ceoo4E4tdxm8p3xY__ZZQi5TszicVndajKG9pX__2026-10-28__1`: lot 70, sample 13, accept 1, reject 2, status `تم الفحص`, decision `مقبول`, defect `FIN-SCRATCH` count 1. Filter `جاهزية 28-10 خط 1` and one second-sort photo were also read back on the same tenant. Anonymous Firestore and Storage reads returned 403. A second tenant login was not available. The close policy was left off and the work order was not closed.

## Final status

Implemented and locally tested before the 2026-10-28 deploy: the trusted close decision, the client refusal to write `completed`, the rules restriction, and the quality print actions in the table above. The pallet, second-sort, quality-report, and flowchart sheets were read from the print iframe. Hourly, line-pull, and scrap sheets were not rendered because those days have no rows.

Deployed the same day: `closeWorkOrder`, `processProductionReportOnCreate`, `processProductionReportOnRetry`, Firestore rules ruleset `2215d864-2daf-46e0-9eef-8fcc8c57403b`, and Hosting. On 2026-10-29 the public site still served `index-hZFYG3Ga.js`, which contains `closeWorkOrder`. A signed-out call returned 401. The signed-in `sokany-eg` dev session called the deployed function with a nonexistent id and received the missing-order denial; no document was written. The policy checkbox stayed unchecked. Direct `completed`, notes, pause, report-handler invocation, tenant membership, `workOrders.edit`, and a second-tenant read remain blocked. The close bypass is not fully verified in production.

Blocked: a second-tenant read of the pallet, filter, settings, and photo; hourly samples, line pulls, scrap, override, and reopen, because those actions would write production records. See the checklist section “Controlled deployment — 2026-10-28”.

Print actions are recorded in the implementation checklist. A print button needs `quality.print` and the screen’s view permission. `quality.print` alone does not grant Firestore reads. Rules use it only when creating a print log. Close permission is `workOrders.edit`.

Page breaks and overflow on a multi-page sheet were not seen. The inspected pallet, second-sort, report, and flowchart sheets fit one page. Hourly samples, line pulls, and scrap had no rows on 2026-10-28, so those filled sheets were not rendered.

## Quality staff

Implemented and locally tested on 2026-10-28. `/quality/staff` assigns an existing employee, an optional existing user, and optional station or line limits. Responsibility labels and suggested permission lists were removed. The assignment does not grant permissions; those keys stay in Hakim role administration. New pallet, hourly, line-pull, and station saves require an active eligible assignment and store the employee-master name. Override and reopen keep the stored inspector and stamp the signed-in user. A stored `responsibility` field, if an older document has one, is ignored. Rules now reject a direct pallet, hourly, or line-pull write that names an inspector without an active same-tenant assignment, including line and station limits and the employee-master name. Override and reopen keep the historical inspector. The composed rules, including staff assignment checks and the work-order close denial, were released on 2026-10-28 together with `closeWorkOrder`. No assignment was created on `sokany-eg`. The emulator passed, including allowed writes. Some denied writes still hit the 1,000-expression ceiling and fail closed. `closeRequiresQualityApproval` stayed off.

Gaps left open: there is no approval step separate from AQL completion and override; dated inspector task types from the source are not a roster; saved-filter create has no separate permission key; `workOrders.edit` stays on the work-order role.

Next action: the product has no non-operational work order, and there is no staging project. Do not create one in `sokany-production`. Before the blocked checks can run, provide a non-super-admin user without `workOrders.edit`, a signed-in user from another tenant, written approval for one existing order other than `WO-2026-0001` whose stored hours are 0, and a local emulator run for the report triggers. Leave `closeRequiresQualityApproval` off.
