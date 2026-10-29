# Quality system implementation checklist

Pilot tenant slug: `sokany-eg` (resolved from the tenant store, never a guessed document id).

Source behavior lives in `sokany-quality/Quality-System`. This checklist is the source-feature to target-feature map.

Statuses: Implemented and locally tested; Deployed and live-verified; Blocked pending access or deployment; Not yet implemented. Older rows that say “verified” mean the live `sokany-eg` read-back already recorded below. They are not a new production deployment.

| Source feature | Target | Status |
|---|---|---|
| AQL Level II lookup and accept/reject math | `modules/quality/domain/aql.ts` | Implemented and verified. Unit test covers 120 → 20 / Ac 2 / Re 3. The live pallet of 70 used sample 13, accept 1, reject 2, and decision مقبول. |
| Pallet receive, start, complete | `qualityPalletService` + `/quality/pallets` | Implemented and verified. One `sokany-eg` pallet was saved and read back after reload. |
| Manual AQL override with reason | override permission + audit | Implemented but not verified in production. |
| Reopen completed pallet or pull with reason | reopen permission + audit | Implemented but not verified in production. |
| Pallet unique per line, number, and date | deterministic document id | Implemented and verified. The saved id is tenant, line, date, and pallet number 1. |
| Defect lines on a pallet | `quality_pallets/{id}/defects` | Implemented and verified. `FIN-SCRATCH` count 1 was read back with the completed pallet. |
| Hourly slots and hourly samples | `/quality/hourly-samples` | Implemented but not verified in production. |
| Line sample pulls, stations, second inspector split | `/quality/line-samples` | Implemented but not verified in production. |
| Period stopped / no-sample reason | `quality_line_period_statuses` | Implemented but not verified in production. |
| Daily received / inspected / waiting vs production reports | `/quality/summaries` | Implemented but not verified in production. Production quantity is read from `production_reports`. |
| Defect-rate flowchart | `/quality/flowchart` | Implemented and verified for 2026-10-28. The page returned lot 70, inspected 13, defects 1, rate 7.69%, and 1 accepted / 0 rejected, with no permission error. Reported production is shown separately. |
| Saved pallet filters | `/quality/pallets` | Implemented and verified. Filter `جاهزية 28-10 خط 1` reloaded with the same tenant as the pallet. |
| Custom field definitions | none | Intentionally excluded. The source has `custom_fields` and `pallets.custom_fields_json` in the schema only. No API, service, or screen uses them. |
| Scrap rows and cause share | `/quality/scrap` | Implemented but not verified in production. Each Hakim row is one item with a defect-code reason and a calculated share. |
| Second-sort handover, photos in Storage, font scale, signatures | `/quality/second-sort` | Implemented and verified for one handover. Quantity 1, one photo, path `company/{tenantId}/quality/...`. Anonymous Storage and Firestore reads returned 403. |
| Excel export and print | Shared print engine on the quality screens | Print actions are listed in the print-completion section. Excel export on `/quality/reports` is present and was not downloaded. |
| Stations, inspectors, defect codes, categories, sectors, slots, AQL, release policy | `/quality/settings` | Implemented and verified for the settings read and the close policy. The policy was turned on only for the service check and restored to off. Station hiding and defect-code deactivation were not repeated on live documents. |
| Home / Seria filter | quality sector tag, not a product category or HR department | Implemented and verified for this pallet. Sector stored as `home`. |
| Inspector identity | Hakim employees | Implemented and verified for the completed pallet. New inspections now require an active quality assignment and store the employee-master name. Historical names are not rewritten. |
| Shift | HR `shifts` for the active tenant | Implemented and verified. The pallet uses `وردية صباحية`. |
| Incoming dashboard | Not transferred | Intentionally excluded. The source screen has no inspection workflow. |
| Demo products, pallets, users | Not transferred | Intentionally excluded. |
| SQLite history import | Separate operation when a real factory `quality_system.db` is provided | Blocked. No factory database was provided, and the disposable demo database must not be imported. |
| Old final / IPQC / rework / CAPA screens | Retired; old routes redirect | Implemented and verified for the route redirect. Historical Firestore documents were not deleted. Retired-collection writes are denied by the deployed rules and by the emulator suite. |
| Work-order close quality gate | Callable `closeWorkOrder` plus rules that reject a client transition to `completed` | Deployed to `sokany-production` on 2026-10-28. The callable, report handlers, rules, and Hosting bundle are live. An authenticated production close or direct-status write was not attempted, so the bypass is not yet proven by a live mutation. The policy remains off. |
| Production report quality link | `/quality/reports?workOrderId=` | Implemented but not verified in production. The dated report without that query shows the saved pallet. |
| Dashboard waiting pallets | Admin and factory-manager alerts | Implemented but not verified in production. |
| Firestore and Storage rules | Fragment, indexes, and storage rules | Implemented and verified for the exercised paths. Deployed to `sokany-production`. Anonymous reads of the pallet and photo returned 403. A second tenant session was not available. |
| Live cross-tenant denial | second signed-in tenant | Blocked pending access. No existing second-tenant session was available. Emulator denial is not this live test. |

## Operational gate on 2026-10-28

Target project: `sokany-production`. There is no separate staging project. `.firebaserc`, `firebase use`, and `VITE_FIREBASE_PROJECT_ID` match. Pilot slug `sokany-eg` resolves to tenant `MNa4ceoo4E4tdxm8p3xY`.

Deployment command that completed:

`npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project sokany-production --non-interactive`

Firestore rules, Firestore indexes for database `(default)`, and Storage rules were released. Hosting and Cloud Functions were not deployed. Rollback of rules is the previous ruleset in the Firebase console. Historical quality documents were not deleted.

Emulator ports: quality security suite on Firestore `127.0.0.1:8096` and Storage `127.0.0.1:9198` (`npm run test:quality-security`, exit 0). Existing rules suite on Firestore `8097` because `8080` was already in use and was not stopped (exit 0). `npm run typecheck`, `npm run typecheck:functions`, AQL, rules-contract, print-engine, and tenant-lifecycle tests passed before deploy.

### Live `sokany-eg` evidence

Signed-in user: Hakimo, system administrator. HR shift used: `وردية صباحية`. No demo rows were seeded.

- Pallet `MNa4ceoo4E4tdxm8p3xY__ZZQi5TszicVndajKG9pX__2026-10-28__1`.
- Tenant `MNa4ceoo4E4tdxm8p3xY`, date `2026-10-28`, line `خط انتاج ١`, product `050828` (`SK-7077N`), work order `WO-2026-0001` (`I6o18V9NtDekH7LCPXiq`, in progress, 70 produced of 15,000).
- Lot quantity 70. This is the inspection lot, equal to the quantity already produced on that order. It was not posted as a new production report.
- After completion: status `تم الفحص`, decision `مقبول`, inspected 13, rejected 1, defect `FIN-SCRATCH` / `خدش في التشطيب` count 1, inspector `سما منصور على حسن موسى`.
- The pallet page and `/quality/reports` both showed that row after reload.
- Filter `جاهزية 28-10 خط 1` is stored on the same tenant and was visible after reload.
- Second-sort handover for the same product, quantity 1, one photo under `company/{tenantId}/quality/...`. Anonymous Firestore read of the pallet and anonymous Storage read of the object returned 403.
- Close policy was off before the check. With the policy off, close is allowed. With the policy on and the pallet still waiting, close is denied. With the policy on after acceptance, close is allowed. The policy was set back to off. The work order was not closed.
- Flowchart for 2026-10-28 returned the pallet metrics above and no permission error. It also showed reported production of 13,063 for that date, separate from the pallet lot.

### Final verification — 2026-10-28, after the close-bypass change

No Cloud Function, Hosting, rules, index, or Storage deployment was made for this change. `closeRequiresQualityApproval` was not turned on. `WO-2026-0001` was not closed. No hourly sample, line pull, scrap row, override, or reopen was written.

#### 1. Implemented and locally tested

- `closeWorkOrder` authenticates the caller, loads the user and role, requires `workOrders.edit` unless the user is a super admin, and reads quality settings and pallets for the work order’s tenant.
- Policy off or a missing settings document allows close. Policy on with a waiting pallet denies close. Policy on with an accepted pallet allows close. A non-boolean policy value, a failed pallet read, a missing permission, a cancelled order, zero hours, or an open scan session denies operator close.
- `quantity_reached` completes only when the stored produced quantity meets the stored target. It does not trust a client quantity and does not require hours or open-session clearance. The report background job uses the same decision and still writes `producedQuantity` when quality withholds completion.
- Client `workOrderService.update`, `updateStatus`, and `updateCompletionFromScans` refuse a transition to `completed`. The scanner, work-order page, and employee dashboard still call `updateWorkOrder`, which now calls the function for that transition.
- Rules deny creating a work order already `completed` and deny changing `status` to `completed`. Updates that keep `completed`, or that change notes or set `paused`, stay allowed. Reopen to `in_progress` stays a client update.
- Decision tests: `npx --yes tsx tests/work-order-close.test.ts` passed. App and functions typechecks passed. `npm run test:quality-security` passed on Firestore `8096` and Storage `9198`, including the direct close denial and the allowed notes/paused updates. Rules-contract test passed.
- The print notes in this subsection described the sheets before the print-completion section. Use that later section for the current templates, paper sizes, and what was inspected.

#### 2. Deployed and live-verified

Only the earlier rules, indexes, and Storage release is live. The pallet, filter, accepted inspection, defect line, flowchart, settings read, and second-sort photo read-back above remain the live evidence. Anonymous Firestore and Storage reads returned 403. The close policy is off.

The close function, the new client, the background quality decision, and the rules that block a direct close are not live.

#### 3. Blocked pending access or deployment

Live cross-tenant denial is blocked. Do not create a tenant, user, or quality document for the test. An operator with an existing account whose `users/{uid}.tenantId` is not `MNa4ceoo4E4tdxm8p3xY` must sign in and attempt:

- `quality_pallets/MNa4ceoo4E4tdxm8p3xY__ZZQi5TszicVndajKG9pX__2026-10-28__1` get, and a query `tenantId == MNa4ceoo4E4tdxm8p3xY`.
- `quality_saved_filters` get for `جاهزية 28-10 خط 1`, and the same tenant query.
- `quality_settings/MNa4ceoo4E4tdxm8p3xY` get.
- Storage object under `company/MNa4ceoo4E4tdxm8p3xY/quality/`.
- `closeWorkOrder` with work order `I6o18V9NtDekH7LCPXiq` after that function is deployed.

Each read and the close must be permission-denied. The current Hakimo session is the pilot tenant and is not this test. The emulator result is not a substitute.

Hourly samples, line sample pulls, scrap entry, quality override, and inspection reopen were not run. Running them would create or change production quality records. Station hiding, defect-code deactivation, and the disposable SQLite import were also left undone.

The 2026-10-28 controlled deploy completed. See “Controlled deployment — 2026-10-28”. Indexes and Storage rules were not part of it. `closeRequiresQualityApproval` stayed off. `WO-2026-0001` was not closed.

#### 4. Not yet implemented

- Visual confirmation of page breaks and table overflow on a multi-page sheet. The inspected sheets fit one page. See the print-completion section.
- A functions-emulator race between a pallet edit and the close transaction. The transaction re-reads the work order, settings, and pallets; the unit test covers an already completed order.

### Permission matrix

Hakim keys, from `utils/permissions.ts`. An explicit `false` wins. Absent view keys fall back to `quality.view`. Absent inspect keys, `quality.defects.record`, and `quality.scrap.manage` fall back to `quality.inspect`. Absent override, reopen, `quality.secondSort.manage`, and `quality.photos.manage` fall back to `quality.approve`. `quality.reports.export` falls back to `quality.print`. `quality.print` does not fall back to view and is not a Firestore read permission. Rules mention `quality.print` only on `quality_print_logs` create, beside a quality reader. Close uses `workOrders.edit`.

| Key | Allows | Does not allow |
|---|---|---|
| `quality.print` | The print button, together with the screen’s view key. With tenant membership, a print-log create | Pallet, sample, scrap, report, settings, filter, or photo reads by itself |
| `quality.reports.export` | Excel export; falls back to print | Underlying record reads |
| `quality.pallets.view` | Pallet reads, or `quality.view` when the key is absent | Print or close |
| `quality.photos.view` | Storage read, or `quality.view` when absent | Upload |
| `workOrders.edit` | Close through `closeWorkOrder`, and settings read | Pallet reads or a direct status write to `completed` once the new rules are deployed |

## Print completion — 2026-10-28

No Firestore rules, indexes, Storage rules, Hosting, or Cloud Functions were deployed for printing. No hourly sample, line pull, scrap row, override, or reopen was written. `WO-2026-0001` was not closed and `closeRequiresQualityApproval` stayed off.

Print policy: the button requires `quality.print` and the screen’s view key (`qualityRecordPrintAllowed`). List services reject a caller who has only `quality.print`. Rows are filtered to the active tenant before render. A second-sort photo uses the tokenized download URL already stored on the handover, and only when `quality.photos.view` is allowed. Otherwise the sheet says the photos stay in private storage. Printing does not create a public URL and does not write a print log.

Paper: the second-sort form is A5 landscape, 210 mm wide by 148 mm tall, with `@page { size: A5 landscape }`. Pallet AQL, reports, the flowchart, hourly samples, line pulls, and scrap use the tenant print template. The inspected pallet sheet from that template was A4 portrait with 10 mm margins. A 210 mm width is the landscape A5 width here, not a portrait A5 page and not proof of A4.

Missing source fields, left blank rather than invented: hourly samples and line pulls have no work order. Scrap stores `reasonId` and `reasonLabel`, not a reason code; the code is filled only when the loaded defect catalog has that id. A stopped period stores `lineId`; the printed line name comes from the line master, otherwise the stored id. The line-sample print button stays disabled when that day has no pulls, so a day that only has stopped-period rows is not printed.

| Print action | Paper | Status |
|---|---|---|
| Pallet AQL, `/quality/pallets` | Tenant template. Inspected sheet: A4 portrait | Implemented and tested. The iframe for pallet 1 showed `تقرير فحص بالته AQL`, `خط انتاج ١`, `WO-2026-0001`, lot ٧٠, sample ١٣, accept ١, reject ٢, `تم الفحص`, `مقبول`, inspector `سما منصور على حسن موسى`, and `FIN-SCRATCH`. Root `dir=rtl`. No buttons, inputs, or selects. |
| Second-sort sheet, `/quality/second-sort` | A5 landscape, 210×148 mm | Implemented and tested. The iframe showed the saved problem, quantity ١, discount ٠٪, paper label `A5 أفقي`, `@page { size: A5 landscape }`, root width `210mm`, min-height `148mm`, `dir=rtl`, two images, and no controls. The photograph pixels were not inspected in the system print dialog. |
| Quality report, `/quality/reports` | Tenant template | Implemented and tested. The iframe listed production ١٣٬٠٦٣, lot ٧٠, inspected ١٣, defects ١, and `لا توجد سجلات هالك` as separate figures, plus the pallet row and `FIN-SCRATCH`. `dir=rtl`. No controls. Excel was not downloaded. |
| Flowchart, `/quality/flowchart` | Tenant template | Implemented and tested. After `عرض المخطط`, the iframe contained the loaded production and lot figures and the note that they are not added together. `dir=rtl`. No controls. The ranking formula was not changed. |
| Hourly samples, `/quality/hourly-samples` | Tenant template | Implemented but visually unverified. The model test covers one real row, its defect line, and an empty list. On 2026-10-28 the button was present and disabled because the day has no samples. |
| Line sample pulls, `/quality/line-samples` | Tenant template | Implemented but visually unverified. The model test covers the result label and drops a blank period. On 2026-10-28 the button was present and disabled because the day has no pulls. |
| Scrap, `/quality/scrap` | Tenant template | Implemented but visually unverified. The model test covers the shared `scrapCauseShares` total and share. On 2026-10-28 the button was present and disabled because the day has no scrap rows. |
| Older IPQC, final, rework, and CAPA templates | Settings preview only | Not applicable to these live quality screens. `QualityReportPrint.tsx` stays unwired. |

`npx --yes tsx tests/quality-print.test.ts`, `npx --yes tsx tests/print-engine-host.test.ts`, `npx --yes tsx tests/quality-aql.test.ts`, and `npm run typecheck` were run for this print change. Functions code did not change, so functions typecheck was not rerun. Rules did not change, so the quality security emulator and the rules-contract suite were not rerun.

Page breaks, repeating headers on a second page, and clipping of a long defect description were not visually verified. The iframe CSS repeats `thead` and wraps cell text. Every inspected sheet fit one page.

## Quality staff — 2026-10-28

The staff screen is `/quality/staff` (دليل الجودة). It reuses `employees`, `users`, and `roles`. It does not create employees, logins, or a second permission store.

One assignment document per tenant and employee lives in `quality_workers_assignments` with id `{tenantId}__{employeeId}`. The screen selects an existing employee, an optional existing user, stations, lines, and active or inactive. It does not choose a quality role and it does not write `roles.permissions`. A leftover `responsibility` string on an older document is ignored and is not required. Linking a login uses the existing employee link and requires `employees.edit`. Empty station and line lists mean the assignment is not restricted. A new station can only use an unrestricted inspector. Deactivation sets `isActive` false and leaves the employee and past inspections in place.

Operation authority stays on the existing role screen (`RolesManagement`), using the quality keys already listed in `PERMISSION_GROUPS`. `quality.print` does not grant record reads or staff reads. `workOrders.edit` is not part of a quality assignment. There is no separate approval step beyond AQL completion and the existing override. Source dated inspector task types are not a second schedule.

Firestore rules now check the assignment document `{tenantId}__{employeeId}` on pallet, hourly-sample, and line-pull writes that set an inspector. The check requires the same tenant, an active assignment, an active employee, the employee-master name, and any stored line or station limit. Receiving a pallet without an inspector stays allowed. Override and reopen keep the stored inspector and do not require that assignment to still be active. A direct client write cannot choose an inspector who has no active assignment. These rules were included in the 2026-10-28 Firestore rules release. No inspection callable was added. `responsibility` is still ignored.

Locally tested: `tests/quality-staff.test.ts`, the rules contract, app and Functions typechecks, and `npm run test:quality-security`. The emulator denies a direct pallet or hourly write that names an inspector before an active assignment exists, denies a wrong line, a wrong station, a wrong employee name, a cross-tenant employee, and the same write after the assignment is stopped. A waiting pallet with no inspector, a matching active assignment, and the completed historical pallet still succeed. A `permissions` field and a self-granted role update are denied. The same rules file was released later the same day. No staff row was written on `sokany-eg`. `closeRequiresQualityApproval` stays off.

## Rules review before deployment — 2026-10-28

Defect lines under `quality_pallets`, `quality_hourly_samples`, and `quality_line_sample_pulls` now require `quality.defects.record` (or the existing legacy inspect fallback when that key is absent). The parent must exist and use the same tenant. A completed pallet or completed line pull rejects new defect creates and updates. Open records still accept them. Delete on an open parent uses the defect permission. Delete on a completed parent requires `quality.records.delete`. Reopen does not delete historical defects and does not require the inspector assignment to still be active. `tenantId` and `reasonId` cannot change on update. Historical defect reads stay on `pl_qualityRead`. The retired top-level `quality_defects` collection remains read-only.

Inspector checks read the assignment and employee once each. Defect delete checks the defect permission before the broader delete permission so an allowed delete does not have to evaluate the heavy chain. The emulator still prints `maximum of 1000 expressions` on some denied writes. Those denials are expected negative tests. Every allowed workflow in `tests/quality-security.rules.test.mjs` completed, including assigned inspections, open defect edits, override, reopen, notes, pause, settings, staff, and historical reads.

`npx --yes tsx tests/quality-rules-contract.test.ts`, `npm run test:quality-security`, `tests/quality-staff.test.ts`, `tests/quality-aql.test.ts`, `tests/quality-print.test.ts`, `npm run typecheck`, and `npm run typecheck:functions` passed. Nothing was deployed. `closeRequiresQualityApproval` stays off.

The composed `firestore.rules` is not a defect-only patch. It also contains the local work-order rule that rejects a client status change to `completed`, while `closeWorkOrder` is not deployed. A rules-only deploy would stop work-order closes. Do not deploy these rules until that function is deployed first, and do not turn the close policy on.

Prepared command at review time, later run as step 3 of the controlled deploy below:

`npx firebase-tools deploy --only firestore:rules --project sokany-production --non-interactive`

## Controlled deployment — 2026-10-28

Target: `sokany-production` only. Pre-deploy checks passed: `tests/work-order-close.test.ts`, `tests/quality-rules-contract.test.ts`, `tests/quality-staff.test.ts`, `tests/quality-aql.test.ts`, `tests/quality-print.test.ts`, `npm run test:quality-security` (exit 0; denied writes still log the 1,000-expression ceiling), `npm run typecheck`, and `npm run typecheck:functions`.

Exports in the deployed source: `closeWorkOrder` (`onCall`), `processProductionReportOnCreate` (`onDocumentCreated` on `production_reports/{reportId}`), `processProductionReportOnRetry` (`onDocumentUpdated` on the same path). The reviewed Hosting file `dist/assets/index-hZFYG3Ga.js` calls `httpsCallable(..., "closeWorkOrder")`.

Deployed, in order, each with a successful result:

1. `functions:closeWorkOrder` — created, us-central1, Node 22, 256 MiB.
2. `functions:processProductionReportOnCreate` and `functions:processProductionReportOnRetry` — updated, us-central1, Node 22, 512 MiB.
3. `firestore:rules` — compiled and released. Current ruleset `projects/sokany-production/rulesets/2215d864-2daf-46e0-9eef-8fcc8c57403b`, release `cloud.firestore` updated `2026-10-28T11:40:29.792482Z`. The released source contains `pl_workOrderUpdateKeepsCloseOnServer`, `pl_qualityAssignedInspector`, and `pl_qualityPalletDefectDelete`.
4. Hosting `sokany-production` — https://sokany-production.web.app serves `/assets/index-hZFYG3Ga.js`, and that live file contains the `closeWorkOrder` callable name.

Not deployed: `firestore.indexes.json`, `storage.rules` (storage release unchanged at `2026-10-28T08:43:16.603212Z`), and every other Cloud Function. The Hosting build was made after stashing the unrelated shell edits (`RouterRealtimeSubscriptions`, modal lazy loading, manufacturing route splitting, and the shell-performance notes/test). Those files were restored in the worktree after the build and are not in the released bundle. Quality dashboard waiting-pallet alerts, the scanner release check, and the client close refusal are in the bundle.

`closeRequiresQualityApproval` was read back unchecked on `/quality/settings` for `sokany-eg`. Save was not clicked. `WO-2026-0001` was not read for mutation and was not closed. No quality record was created or changed.

Safe checks after deploy:

- Unauthenticated POST to `closeWorkOrder` returned HTTP 401 and `يجب تسجيل الدخول`. No work order was named except a nonexistent verification id.
- `firebase functions:list` shows the three functions with the expected trigger types.
- The emulator, not a production write, is the evidence that a client cannot set `completed` and that notes and pause updates still pass.

Old clients: a tab that still has the previous bundle writes `work_orders.status = completed` directly. The new rules deny that write, so close fails until the browser loads `index-hZFYG3Ga.js`. `index.html` is sent with no-cache. With the policy off, `closeWorkOrder` and a quantity-reached production report can still complete an order when the other close checks pass. Turning the policy on would start rejecting closes that do not have an accepted pallet or a legacy approved status.

Rollback, if closes must return to the previous client write: restore the previous Hosting release, then the previous Firestore ruleset from before `2026-10-28T11:40:29Z`. Leave `closeWorkOrder` in place or delete it only after the old rules are restored. Deleting the callable while these rules stay released stops every close. Do not roll indexes or Storage back as part of this change; they were not released here.

Remaining blockers after the 2026-10-29 verification: an authorized second-tenant account; a dedicated non-operational work order for a direct `completed` denial and for notes and pause; a safe way to invoke the production-report handlers without creating a real report. `WO-2026-0001` must not be that target.

## Post-deployment verification — 2026-10-29

No production record was created or updated. `closeRequiresQualityApproval` was read unchecked and was not saved. `WO-2026-0001` was not sent to `closeWorkOrder` and was not updated. Full production verification is not claimed.

| Check | Environment and identity | Operation | Result | Data changed |
|---|---|---|---|---|
| Released bundle | Live `https://sokany-production.web.app`, no signed-in session | Loaded the public page | The page script is `/assets/index-hZFYG3Ga.js`. That live file contains `closeWorkOrder`. | No |
| Authenticated callable reachability | Localhost dev client, signed-in `sokany-eg` session, Firebase project `sokany-production`. This is not the released bundle. | `closeWorkOrder` with work order id `postdeploy-missing-20261029`, operator mode, zero hours | The deployed function returned `أمر الشغل غير موجود داخل الشركة.` It did not return success. That message is the missing-document path, which returns before the tenant and `workOrders.edit` checks and before any update. | No |
| Callable authentication | Live function, no Firebase user | POST `closeWorkOrder` | HTTP 401, `UNAUTHENTICATED`, `يجب تسجيل الدخول.` | No |
| Tenant membership and `workOrders.edit` | No second identity and no dedicated test work order | Not attempted | BLOCKED. A call against a real order can close it when stored hours are already positive and the policy is off. | No |
| Direct client `completed` | Production | Not attempted | BLOCKED. No approved test work order. Emulator evidence from the pre-deploy run of this ruleset: a closer update to `completed` and a client create with `completed` both failed. That is not a production write. | No |
| Notes and pause | Production | Not attempted | BLOCKED for the same missing test record. Emulator evidence: notes and `paused` updates on the emulator order succeeded. | No |
| Production-report handlers | Live function list | No report created | BLOCKED for invocation. `processProductionReportOnCreate` and `processProductionReportOnRetry` are still deployed. The reviewed source writes `producedQuantity` and, with the policy off, can still set `completed` when quantity is reached. That behavior was not executed in production. | No |
| Cross-tenant read | One signed-in tenant, `sokany-eg`. Production origin was logged out. | Not attempted | BLOCKED. No existing second-tenant session was available. | No |

## Safe-verification plan — 2026-10-29

No record was created. No work order, report, rule, function, index, or Storage setting was changed. The policy checkbox was not toggled. The localhost session was signed out, so the policy was not read from Firestore again. `WO-2026-0001` was not used.

`WorkOrder` has no test or exclusion field. `workOrderService.create` writes a normal tenant order, and `generateNextNumber` takes the next `WO-{year}` sequence. Active product lookups include `pending`, `in_progress`, and `paused`. `subscribeAll` returns every work order for the tenant. There is no staging project. A new `production_reports` document in `sokany-production` starts the deployed trigger, which writes attendance, may apply inventory, posts cost onto the linked order and plan, then writes `producedQuantity` and status. `packaging` and `component_waste` skip the progress update and still run the other steps. No approved workflow creates an order that those paths ignore.

The callable reaches tenant and `workOrders.edit` only after the work order document exists. A missing id returns `أمر الشغل غير موجود داخل الشركة` before `evaluateWorkOrderClose`. A super admin skips both checks. A failed decision throws before `transaction.update`. With the policy off, a real order whose stored hours are already above zero can be closed by an authorized caller, so a real order is not a safe probe.

Isolated handler test, not run and not production evidence: start the Functions and Firestore emulators with the deployed source, seed a fake tenant and a fake in-progress order, create a `production_reports` document whose `processingState` is `pending`, and read back `producedQuantity` and status. Repeat with the policy on and an unaccepted pallet, and confirm `producedQuantity` is written while status stays `in_progress`. Do not point that emulator at `sokany-production`.

| Check | Evidence | Result | Data changed |
|---|---|---|---|
| Safe non-operational work order | Production code and project layout. No such workflow. | BLOCKED | No |
| Tenant and `workOrders.edit` before mutation | Source order of `closeWorkOrder`. Not executed against an existing document. | BLOCKED | No |
| Direct client `status: completed` | No approved test document. Not sent to production. | BLOCKED | No |
| Notes and pause | No approved test document. Cleanup would restore the previous notes and status on that document only. | BLOCKED | No |
| Report handlers | Deployed names only. The isolated emulator test above was not run. | BLOCKED for production | No |
| Cross-tenant account | No second authorized session. Credentials were not guessed. | BLOCKED | No |
| Signed-in production bundle | No production login was provided. Credentials were not entered. | BLOCKED | No |

On 2026-10-29 the quality indexes, Firestore rules, and Storage rules already matched production and were not deployed again. Ruleset `2215d864-2daf-46e0-9eef-8fcc8c57403b` and storage ruleset `62bcf1f1-798d-4ad7-96b8-9a0b7e764489` hashed equal to the local files. The four tenant functions that still used the 2026-10-05 collection list were updated from commit `52ab396`: `getTenantFirestoreFootprint`, `exportTenantBackup`, `adminDeleteTenantCascade`, and `importTenantBackup`. They were not invoked. `closeWorkOrder` and both production-report handlers were already active from 2026-10-28 and were not redeployed.

On 2026-10-29 the current client was committed as `193b0640`, pushed to `origin/main`, and published to Hosting. The live page now serves `/assets/index-DYC11ybz.js`, which still calls `closeWorkOrder`. This release also includes the shell, modal, and manufacturing route changes that were left out of `index-hZFYG3Ga.js`. Firestore rules, indexes, Storage rules, and Cloud Functions were not deployed again. `closeRequiresQualityApproval` was not changed and `WO-2026-0001` was not used.

Prerequisites, all required before another production attempt:

1. A work order id that is not `WO-2026-0001`, with status other than `completed`, `actualWorkHours` of 0, and written approval that notes and pause may be changed and then restored. The product cannot exclude it from dashboards, the scanner, numbering, or report triggers.
2. A non-super-admin user in that order’s tenant whose role has `workOrders.edit` set to false.
3. An existing signed-in user from another tenant. Do not change that user’s permissions.
4. An authorized sign-in on `https://sokany-production.web.app` if the released bundle must be confirmed after login.
5. Permission to run the report-handler test only in the local emulator, never by creating a `production_reports` document in `sokany-production`.

## Security review

- High, fixed before deploy: an explicit `quality.defects.record: false` was still allowed by the inspect fallback. Rules now deny that explicit false and still allow a legacy inspect role that does not have the key.
- High, fixed before deploy: a work-order closer could be denied `quality_settings` because the quality permission chain hit the 1000-expression limit. Closer keys are evaluated first. The emulator closer can read settings and cannot read pallets.
- High, fixed before deploy: a missing Storage permission key threw and blocked the intended fallback. Explicit false still denies upload. A legacy approve role without the photo key can upload.
- Medium, residual after the 2026-10-29 check: the callable rejects a signed-out caller and a missing work order. Tenant membership, `workOrders.edit`, a direct `completed` denial, notes, pause, and the report handlers are not proven by a production write. A dedicated test work order and a second tenant account are still required. Do not use `WO-2026-0001`.
- Medium, residual: rules cannot prove defect-line counts equal `rejectedQuantity`. The service checks the sum.
- Medium, residual: unauthorized quality writes often fail closed at the expression limit. Do not add more permission branches without rerunning the security suite.
- Low, accepted: any quality reader in the same tenant can read saved filters. Cross-tenant read is denied. Another user cannot stamp `createdByUid` as themselves on create.

## Rollback

- Code rollback is the git revision before this change set.
- Do not delete Firestore quality documents as part of code rollback.
- Rules rollback is the previous ruleset in the Firebase console for `sokany-production`.
- The pilot pallet, filter, and second-sort handover carry `tenantId` `MNa4ceoo4E4tdxm8p3xY` and `moduleSource` `qms` where the collection uses that field. Removing them requires a separate approved data operation.
- Leave `closeRequiresQualityApproval` off until closers who are not quality readers are understood. It is off now.
