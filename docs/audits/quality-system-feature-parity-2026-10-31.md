# Quality system feature parity — 2026-10-31

Compared on 2026-10-31. Source is [sokany-quality/Quality-System](https://github.com/sokany-quality/Quality-System) `main` at `ebdd0caddb` (2026-10-31). The previous comparison used `8b2d7ed` (2026-10-24). Hakim evidence is `modules/quality` after the local alignment in this change.

Net source diff from `8b2d7ed` to `ebdd0cad`, excluding `node_modules`: `README.md`, `db/index.js` (+1058), `db/schema.js` (+179). `public/index.html` did not change in that range, so the carton, plastic, scrap-reason, and return screens were already in the 2026-10-24 UI. The 2026-10-31 commit is the persistence for those screens. The repository also contains `quality_system.db` and `quality_system_backup.db`. Those files were not imported.

Statuses: Implemented in Hakim and covered by a local test or the existing screen; Not yet implemented; Rejected.

| Source capability | Source evidence | Hakim | Status |
|---|---|---|---|
| Scrap reasons are a list separate from inspection defects, with add, rename, and delete | `scrap_reasons`, `getScrapReasons` | `/quality/scrap`, `quality_scrap_reasons` | Implemented locally. A saved scrap row keeps `reasonLabel`, so deleting a reason does not rewrite history. Rules and the name indexes are not deployed. |
| One product name for every period of an hourly scrap report | README item 8; hourly `scrap_reports.periods_json` | `/quality/scrap` hourly mode, `periods` on one scrap document | Implemented locally. The chosen line and product apply to every period. Not deployed. |
| Scrap dashboard totals for second-sort quantity, average discount, and reason frequency | README item 9 | `/quality/scrap` analysis mode | Implemented locally. Month range, cause, product, line, second-sort discount, and returns. Not deployed. |
| Sample analytics dashboard | `GET /api/quality-dashboard` | `/quality/dashboard` | Implemented locally. Month filter, pulls plus pallets plus hourly samples, minimum 30 samples, product and defect charts with search and sort, heatmap, comparison totals. Not deployed. |
| Report slices for waiting, rejected, defect reasons, and inspector totals, plus column selection | `generateReport`, report column checkboxes | `/quality/reports` | Implemented locally. Line and product reports use production-report quantity. Column choice applies to the preview, Excel, and CSV. No line-supervisor column and no second inspector master. |
| Fixed second-sort reasons, chosen on later handovers | `second_sort_reasons` | `/quality/second-sort`, `quality_second_sort_reasons` | Implemented locally. The reason fills an empty problem text and is stored beside it. Not deployed. |
| Return from second sort to first sort: date, product, quantity, notes, signatures, edit, delete, A5 print | `second_sort_returns_to_first_sort` | `/quality/second-sort-returns` | Implemented locally. Same `quality.secondSort` permissions. Not deployed. |
| Carton receipt board: manual note, supplier list, search, date filters, shipment recount, Excel import as one transaction | `carton_receipts`, `carton_suppliers` | `/quality/incoming/cartons` | Implemented locally. Import is one batch of at most 400 rows. Not deployed. |
| Plastic receipt board, separate from cartons: supplier, item, part, samples, decision, 14 default rejection reasons | `plastic_receipts` and the plastic catalogs | `/quality/incoming/plastic` | Implemented locally. Default reasons load on request. Excel import splits reasons on `\|`. Not deployed. |
| Flowchart period, sector, line, and product filters, with accept rate | flowchart presets and department filters | `/quality/flowchart` | Implemented locally. Presets stay inside 31 days. Sector uses the quality tag, not an HR department. |
| AQL level, notes, edit, and stop on a saved range | AQL settings table | `/quality/settings` | Implemented locally. Saving one active range replaces the standard Level II table. Notes are capped at 200 characters. The standard rows have no edit or stop action. |
| Hourly sample totals and end-of-day production match | hourly KPIs and daily production table | `/quality/hourly-samples` | Implemented locally. Totals follow the list filters. Production quantity comes from production reports and is not entered again on this screen. The estimated rate uses hourly defects against that quantity. |
| Hourly inspector summary by period and product | hourly inspector summary | `/quality/hourly-samples` | Implemented locally. The summary follows the list filters. An inspector total is the sum of that inspector's samples in the same period. |
| Hourly list shows shift, defect rate, and reason labels | hourly sample table | `/quality/hourly-samples` | Implemented locally. A rate above 5 percent is marked. Reason labels come from the saved defect lines. |
| Line-sample summary columns, period boards, saved stop reasons, and export | line sample summary | `/quality/summaries` pulls tab | Implemented locally. Day totals and one table per period. Excel and CSV export the same rows. Saved stop rows stay read-only. |
| Line-sample list filters and totals | line sample filters | `/quality/line-samples` | Implemented locally. The list filters by period, line, and inspection status without changing the entry form. Totals follow the visible rows. |
| Line-sample day totals by period, inspector, station, and line | line sample daily summary | `/quality/line-samples` | Implemented locally. The summary uses every pull of the selected day. A shared pull splits samples between the two inspectors, and defects stay with the primary inspector. |
| Wipe every carton or plastic receipt after a shared password | README item 12, delete-all dialogs | none | Rejected. A shared password is not an authorization check. A wipe, if it is ever required, needs the existing role permission and an audit record. |
| Import `quality_system.db` | files added on the source repository | none | Rejected for this pass. No reviewed factory import was requested. |

## What was adjusted in Hakim

- Scrap no longer picks its reason from the inspection defect catalog.
- Second-sort handover can store a reusable reason.
- Return reports are a separate screen, `/quality/second-sort-returns`, and print on the same A5 landscape sheet as handover.
- New collections are on the tenant footprint, client backup list, and backfill list: `quality_scrap_reasons`, `quality_second_sort_reasons`, `quality_second_sort_returns`.
- Firestore rules for those collections are in the fragment only. They were not deployed. The name lookup indexes were not deployed.

## Still outside Hakim

- Shared-password wipe of every carton or plastic receipt.
- Import of `quality_system.db`.
- A second master for lines, products, inspectors, or users.
- A live signed-in save. The new rules and indexes are not on `sokany-production`, so those writes will be denied until a reviewed deploy.

## Security Review

- Risk Level: Low until the rules are deployed. After deployment, catalog delete is available to anyone who can manage scrap or second sort, which matches the source screen and is wider than `quality.records.delete`.
- Vulnerabilities Found: The source wipe uses a shared password. That was not copied.
- Fixes Applied: New writes stay on the tenant quality rules. Names are limited to 120 characters. Return quantity must be an integer and notes are limited to 1000 characters.
- Remaining Risks: Uniqueness of a catalog name is checked in the client service. Two simultaneous creates can still store the same name. The new rules and indexes are not live.
