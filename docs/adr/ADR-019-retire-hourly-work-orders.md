# Retire the hourly work-order workflow

Date: 2026-09-28

The hourly work-order scenario is removed at the product owner's request. Work-order creation, lists, details in the existing drawer, permissions, and production-report services return to their behavior before the hourly planning implementation (commit `06a429b0`). Unrelated material-master and product-table improvements remain.

Removed scope includes hourly planning and execution, stops/resumes, cycle-specific quality templates and approvals, rework, packaging, planning/closing, task dashboards, callable functions, rules, types, lab configuration and seeds, scenario tests, screenshots, and scenario PDF documents. Existing production reports, inventory handovers, quality module, payroll hourly rates, and manufacturing cost calculations remain.

The owner subsequently authorized production deployment and cleanup. Hosting and Firestore rules were deployed to `sokany-production`; the six affected production-report functions were updated, and `mutateWorkOrderCycle` and `getWorkOrderCycleWorkspace` were deleted.

Production cleanup backed up 401 documents before a single conditional batch deleted 399 cycle-specific documents and updated four documents: hourly metadata was removed from two legacy orders, and four obsolete permission keys were removed from two roles. The deleted records comprise one V2 order, 382 hourly slots, seven audit entries, seven request receipts, one plan revision, and one line-state record. No cycle packaging stock transactions existed. The legacy order with a production report and its report were preserved. No stock balances were modified.

The private backup is stored outside the repository at `/Users/hakimo/.codex/backups/production-line-retirement-2026-09-28/` (`snapshot.json`, `roles.json`, `cleanup-writes.json`, `result.json`). All deletions and updates used Firestore update-time preconditions. Post-cleanup verification confirmed all 399 deleted documents were absent, 43 work orders remained with no V2/hourly metadata, and the linked legacy production report remained. The removed functions were absent, all six updated functions were ACTIVE, and production Hosting returned HTTP 200 with HTML matching the local build.

Validation: application and functions typechecks and builds pass; Firestore rules tests pass. All 267 discovered unit/contract test files pass using the repository test runner with the cached tsx executable (avoiding repeated npx resolution); the emulator-only suite was run separately. The CI theme-token check reports existing violations in unchanged `ProductionGateAnalytics.tsx` and `PrintEngineDocumentPreview.tsx`. Browser smoke checks render the RTL login page at mobile, tablet, laptop, and desktop sizes without browser errors. Authenticated work-order visual QA remains unverified because the browser session is signed out.
