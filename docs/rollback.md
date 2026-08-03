# Rollback notes

Canonical English. Prefer targeted Firebase rollbacks over rewriting history.

## Hosting

- Firebase Hosting keeps release history in the console / CLI.
- Roll back to a previous hosting version from Firebase Console → Hosting → Release history, or redeploy a known-good `dist/` from a git tag/commit:

```bash
git checkout <known-good-sha>
npm run build
firebase deploy --only hosting
```

- After rollback, operators may still hold stale chunks; `DynamicImportRecoveryScreen` + no-cache `index.html` / SW headers mitigate — ask users to hard-refresh if needed ([routing-and-navigation.md](./routing-and-navigation.md)).

## Firestore / Storage rules

- Rules are not versioned automatically like Hosting releases in the same UX; keep composed `firestore.rules` and `storage.rules` in git.
- Rollback:

```bash
git checkout <known-good-sha> -- firestore.rules storage.rules firestore/production-line.rules.fragment
# If fragments changed, recompose:
npm run compose:firestore-rules
firebase deploy --only firestore:rules,storage
```

- Re-run `npm run test:rules` on the rolled-back tree before deploy when possible.
- Indexes: removing an index that production queries need will break those queries — roll indexes forward carefully; prefer additive indexes.

## Cloud Functions

- Deploy is by codebase (`functions` → `lib` after build).
- Rollback options:
  1. Checkout known-good `functions/src`, `npm --prefix functions run build`, `firebase deploy --only functions`
  2. Or redeploy a previous CI artifact if your pipeline stores one
- Avoid leaving `functions/lib` out of sync with `src` after a partial rollback — always rebuild from `src`.
- Callable contract changes (stock posting, backup import) are breaking for old clients: coordinate hosting + functions rollback together when APIs changed.

## Data / backfills

- Backfills (`backfill-tenant-singleton-settings`, `backfillTenantId`, floor cutover) are generally **not** automatically reversible.
- Singleton copy is merge/skip-if-exists — rolling back app code does not delete tenant docs; that is usually fine.
- Stock / report inventory posts are ledger events — compensate with reverse callables or controlled adjustments; do not delete ledger history casually.

## Settings / operation paths

- Disabling an operation path is reversible by re-enabling in `system_settings/{tenantId}.operationPaths`.
- Report `operationPathSnapshot` fields remain historical.

## Checklist before declaring rollback done

1. Hosting version serves expected app version / changelog.
2. Functions build matches deployed behavior for critical callables.
3. Rules match the intended security posture (especially `isSuperAdmin`, stock perms, tenant restore).
4. Smoke: login, tenant home, one report read, one inventory read ([ONBOARDING.md](./ONBOARDING.md)).
