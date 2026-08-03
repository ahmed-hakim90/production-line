# Testing

Canonical English. Tests are Node scripts via `tsx` (and Firebase rules via emulator), not a single Jest/Vitest runner.

## Harness

| Kind | How |
|------|-----|
| Unit / domain | `npx --yes tsx tests/<name>.test.ts` (assert via Node `assert`) |
| Architecture | `npm run arch:check:legacy-imports` |
| Typecheck | `npm run typecheck`, `npm run typecheck:functions` |
| Firestore rules | `npm run test:rules` (compose rules + `firebase-tools emulators:exec`) |
| Foundation gate | `npm run test:foundation` → `tests/foundation-harden.test.ts` |
| Aggregate verify | `npm run arch:verify` = typecheck + legacy-imports + foundation |

Firebase Admin / ADC may be required for some scripts; rules tests use the Firestore emulator only.

## Named npm suites

| Script | Contents (high level) |
|--------|------------------------|
| `test:foundation` | Tenant stamp, usecase/cross-tenant guards |
| `test:inventory` | Routing, migration, production stock V2, department consumables, warehouse scope (client + server), period balance, etc. |
| `test:operations` | Tenant readiness, inventory analytics, cost health, asset depreciation, line efficiency |
| `test:manufacturing` | Manufacturing engines, material requirements export, waste options |
| `test:categories` | Category tree + migration |
| `test:rules` | Compose `firestore.rules` then run `tests/firestore.rules.test.mjs` |

Additional standalone files under `tests/` (settings contract, operation paths, navigation, HR, repair, …) are run directly with `tsx` when touching those areas.

## `test:all` (recommended composite)

There is **no** `npm run test:all` script in `package.json` today. For a full local gate before release, run:

```bash
npm run arch:verify
npm run typecheck:functions
npm run test:inventory
npm run test:operations
npm run test:manufacturing
npm run test:categories
npm run test:rules
```

Add targeted `npx tsx tests/<file>.test.ts` for files outside those suites (e.g. `system-settings-contract.test.ts`, `operation-path-settings.test.ts`, `tenant-backup-restore.test.ts`).

## `test:rules`

```bash
npm run test:rules
```

Expands to:

1. `npm run compose:firestore-rules` — build `firestore.rules` from head + fragment
2. Firestore emulator exec of `tests/firestore.rules.test.mjs`

Includes P0 cases such as tenant users unable to set `isSuperAdmin`. Requires network/tooling for `firebase-tools` / emulator download on first use.

## Related

- [deployment.md](./deployment.md) — compose/deploy rules
- [security-tenancy.md](./security-tenancy.md) — what rules tests protect
- [BASELINE_HARDENING_REPORT.md](./BASELINE_HARDENING_REPORT.md) — example gate results
