# ADR-002: Server-owned stock mutations (selected flows)

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Client-side ledger writes are easy to forge (warehouse, qty, cost, department). Inventory V2 production floor, report BOM consumption, packaging handover, and department consumable issues need authenticated server posting with tenant + permission checks.

Firestore rules now also require inventory ERP permissions for `stock_*` writes (not active-user-only), but high-risk workflows still need atomic multi-doc updates beyond what the client should orchestrate.

## Decision

Own these mutations in Cloud Functions (Admin SDK / trusted transaction logic), invoked as authenticated callables:

| Flow | Callable (examples) | Source |
|------|---------------------|--------|
| Production issue → floor | `issueProductionIssueStock` | `functions/src/productionIssueStock.ts` |
| Report inventory apply/reverse | `applyProductionReportInventory`, `reverseProductionReportInventory` | `functions/src/productionReportInventory.ts` |
| Packaging handover receipt | `confirmProductionHandoverReceipt` | `functions/src/productionHandover.ts` |
| Department consumable issue lifecycle | `createDepartmentConsumableIssue`, `issueDepartmentConsumableIssue`, `returnDepartmentConsumableIssue`, … | `functions/src/departmentConsumableIssues.ts` |

Client may create request/draft docs only where rules allow; posting stock is server-side. Deny forged department/cost fields from the browser.

## Consequences

- Offline-only stock posting is not supported for these flows.
- Functions `src` must stay the source of truth and stay aligned with client routing resolvers ([settings-contract.md](../settings-contract.md)).
- Manual stock movements / transfers can still use permitted client paths under rules + warehouse scope.

## Rejected

- UI-only deduction for department consumables or production floor consume.
- Trusting client-computed stock deltas inside rules without server orchestration for multi-leg posts.
