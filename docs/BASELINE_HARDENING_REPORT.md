# Baseline Hardening Report

**Date:** 2026-08-03  
**Baseline:** current worktree (uncommitted Inventory V2 / Operation Paths / Foundation harden)  
**App version:** 4.0.126

## Quality gates (pre-change)

| Gate | Result |
|------|--------|
| `npm run typecheck` | PASS |
| `npm run typecheck:functions` | PASS |
| `npm run arch:check:legacy-imports` | PASS |
| `npm run test:foundation` | PASS |
| `npm run test:inventory` | PASS (18 suites) |
| `npm run test:operations` | PASS (5 suites) |

## Worktree inventory (high level)

- Inventory V2 production floor / handover / department consumables (client + Cloud Functions)
- Operation path settings (Decision 008) — client enforcement present
- Warehouse bind (`users.inventoryWarehouseId`) in rules + UI
- HR approval source sync
- Large diffs in `store/useAppStore.ts`, `firestore.rules`, production/inventory pages

## Known P0 risks before hardening

1. Tenant admin can set `users.isSuperAdmin` via Firestore (privilege escalation)
2. `importTenantBackup` / client `full_reset` clears collections project-wide
3. `stock_*` writes require only active user + warehouse scope (no inventory permission)
4. Shared doc IDs: `hr_settings/global`, `labor_settings/default`, `hr_config_modules/{module}`
5. No React Error Boundary → white screens on render/chunk errors
6. Settings / operation paths partially client-only

## Functions build policy

- Source of truth: `functions/src/**/*.ts`
- Compile output: `functions/lib/**/*.js` via `npm --prefix functions run build`
- Do not hand-edit `functions/lib`; rebuild before deploy/tests that load compiled JS

## Next

Proceed Phase 1 (security/data) → Phase 2 (navigation) → remaining phases per plan.
