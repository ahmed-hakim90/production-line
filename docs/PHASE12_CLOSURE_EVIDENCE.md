# Phase 1+2 Closure Evidence

## Scope Lock Confirmation

- This execution stayed within Phase 1 + Phase 2 scope.
- No Phase 3 feature coding was started (BOM auto-consumption, FEFO batch issuing, payroll math engine, offline-first conflict handling, observability integrations were not implemented in this run).

## Sprint 1 Evidence

- Sprint 1 review file exists: `SPRINT1_REVIEW.md`.
- `useAppInitialization` confirms `Promise.all` usage.
- Domain stores were introduced and referenced in migration flow.

## Rules Hardening Evidence

- `firestore.rules` explicitly blocks client writes for required datasets:

### dashboard_stats

```rules
match /dashboard_stats/{tenantId}/{docId} {
  allow read: if isActiveUser() && currentUserDoc().data.tenantId == tenantId;
  allow write: if false;
}
```

### audit_logs

```rules
match /audit_logs/{docId} {
  allow read: if isActiveUser() && sameTenantOrLegacyRead();
  allow write: if false;
}

match /audit_logs/{docId}/{subPath=**} {
  allow read: if isActiveUser();
  allow write: if false;
}
```

### monthly_costs

```rules
match /monthly_costs/{docId} {
  allow read: if isActiveUser() && sameTenantOrLegacyRead();
  allow write: if false;
}
```

## Rules Unit Tests + CI Evidence

- Test file: `tests/firestore.rules.test.mjs`
  - Tenant isolation
  - Role restrictions
  - Repair branch restrictions
- CI workflow: `.github/workflows/firestore-rules-tests.yml`
  - Runs rules test through Firestore emulator before merge/deploy path.

## Local Execution Notes

- `npm run test:rules` initially failed due missing local install of `@firebase/rules-unit-testing`; dependency was aligned to a Firebase 12-compatible version and installed.
- Emulator execution command failed on this machine with:
  - `Could not spawn java -version`
- Blocking prerequisite:
  - Install Java (JRE/JDK) and ensure it is available on PATH, then rerun:
  - `npx firebase-tools emulators:exec --only firestore "npm run test:rules"`
