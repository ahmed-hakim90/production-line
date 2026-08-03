# Dependency rules (UI → usecase → service → Firebase)

Canonical English. Enforced lightly today; expand as domains migrate.

## Layer order

```
UI (pages / modals / components)
  → usecases (modules/*/usecases, shared/usecases)
    → services (modules/*/services)
      → Firebase client SDK / Cloud Functions callables
```

| Layer | Owns | Must not |
|-------|------|----------|
| **UI** | Render, forms, navigation, toast feedback, permission *visibility* | Firestore writes (`addDoc` / `setDoc` / `updateDoc` / `deleteDoc` / `writeBatch` / `runTransaction`); business authorization |
| **Usecase** | Workflow intent, tenant stamp, validation orchestration, events (`SystemEvents`) | Raw Firestore paths when a service already exists; UI concerns |
| **Service** | Collection access, queries, DTO mapping | Cross-domain workflow policy (prefer usecases); trusting client `tenantId` without overwrite |
| **Firebase / Functions** | Persistence, rules, server authorization, stock posting | Trusting client totals, roles, or stock deltas |

Security boundary remains **Firestore rules + Cloud Functions**. UI `can(...)` checks are UX only.

## Pages and modals: no direct Firestore writes

`scripts/check-legacy-imports.mjs` (via `npm run arch:check:legacy-imports`) blocks:

1. Deprecated root `services/*` imports for migrated domains.
2. Firestore write APIs in:
   - `modules/*/pages/**`
   - `components/modal-manager/**`

Allowlist is intentionally **empty**. Temporary exceptions require an active migration PR and a follow-up to remove them.

Reads from pages via services (or shared hooks) are allowed. Mutations go through usecases and/or module services called from the store / usecases.

## Store role

`store/useAppStore.ts` still orchestrates some multi-step production report pipelines (create / update / delete / import / reconcile). Those paths should shrink toward usecases over time — see `modules/production/usecases/REPORTS_EXTRACTION_NOTES.md`. New write paths should not add Firestore APIs to pages or global modals.

## Events and audit

Prefer emitting typed `SystemEvents` from usecases after successful persistence so the audit listener stays the single map for activity logs.

## Related

- [overview.md](./overview.md)
- [../settings-contract.md](../settings-contract.md)
- [../security-tenancy.md](../security-tenancy.md)
- Decision 005 / 008 in `MIGRATION_DECISIONS_LOG.md`
